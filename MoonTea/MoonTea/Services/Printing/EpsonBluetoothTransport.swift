import Foundation
@preconcurrency import libepos2

// The ePOS SDK is Objective-C; its NS_ENUM constants import to Swift as typed
// enums (Epos2PortType, Epos2Color, …), but the API takes Int32. These aliases
// keep the call-sites readable.
private let kSuccess       = Int32(EPOS2_SUCCESS.rawValue)
private let kTrue          = Int32(EPOS2_TRUE)
private let kPortAll       = Int32(EPOS2_PORTTYPE_ALL.rawValue)
private let kSeriesM30III  = Int32(EPOS2_TM_M30III.rawValue)
private let kLangEN        = Int32(EPOS2_LANG_EN.rawValue)
private let kErrConnect    = Int32(EPOS2_ERR_CONNECT.rawValue)
private let kErrTimeout    = Int32(EPOS2_ERR_TIMEOUT.rawValue)
private let kErrInUse      = Int32(EPOS2_ERR_IN_USE.rawValue)
private let kErrProcessing = Int32(EPOS2_ERR_PROCESSING.rawValue)
private let kErrDeviceBusy = Int32(EPOS2_ERR_DEVICE_BUSY.rawValue)

/// Owns the Epos2 SDK connection to a TM-m30III over either MFi Bluetooth or
/// TCP/IP, and nothing else — discovery, connect/reconnect, the keepalive
/// ping, and the reconnect watchdog. Receipt formatting (`ReceiptBuilder`) and
/// queueing/retry policy (`PrintManager`) live elsewhere; this class only
/// knows how to talk to the physical printer.
///
/// Connection/keepalive/watchdog logic below is moved near-verbatim from the
/// previous monolithic `EpsonPrinter` — it encodes fixes for several real
/// production incidents (see inline comments), so behavior is preserved
/// exactly rather than redesigned.
final class EpsonBluetoothTransport: NSObject, PrinterTransport {
    /// Fired (not necessarily on the main thread) whenever the connection
    /// state changes. The facade hops to `@MainActor` itself to update UI.
    var onConnectionChange: (@Sendable (Bool) -> Void)?
    /// Fired for connect/discovery failures, with a user-actionable message.
    var onError: (@Sendable (String) -> Void)?

    private let printQueue = DispatchQueue(label: "epson.print", qos: .userInitiated)

    // Reused across prints. The ePOS SDK manages connection threads against
    // shared internal state; allocating a fresh Epos2Printer per print let
    // one instance's teardown threads race the next instance's connect,
    // crashing after a couple of prints. Keeping one instance for the app's
    // lifetime and only connecting/disconnecting it avoids that race.
    private var printerInstance: Epos2Printer?

    // The target we're currently connected to, or nil if disconnected.
    // Staying connected between prints skips the ~1-3s reconnect handshake
    // on every order; we only reconnect when the link is gone or stale.
    private var connectedTarget: String?

    private var discoveryDelegate: DiscoveryDelegate?

    private let stateLock = NSLock()
    private var _isConnected = false
    /// Thread-safe; callers on any thread (e.g. `PrintManager`) may read this.
    var isConnected: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return _isConnected
    }

    // Must only be called on the main thread — every call site below already
    // wraps it in `DispatchQueue.main.async`, mirroring the original
    // `isConnected` `didSet` (which only ever fired on main for the same reason).
    private func setConnected(_ value: Bool) {
        let changed: Bool
        stateLock.lock()
        changed = _isConnected != value
        _isConnected = value
        stateLock.unlock()
        guard changed else { return }
        value ? stopReconnectWatchdog() : startReconnectWatchdog()
        onConnectionChange?(value)
    }

    // The Epson TM-m30III has a ~2-hour Bluetooth idle timeout in firmware.
    // Pinging every 60 minutes keeps the MFi session alive between prints.
    private var keepaliveTimer: Timer?
    private static let keepaliveInterval: TimeInterval = 60 * 60

    // Retries the saved printer in the background while it's known to be
    // unreachable, so a dropped link recovers on its own instead of waiting
    // for the next order's print (and losing that receipt) to notice.
    private var reconnectWatchdog: Timer?
    private static let reconnectWatchdogInterval: TimeInterval = 30

    // Epson's SDK guidance is explicit: don't connect/disconnect in quick
    // succession — reconnecting immediately after a teardown can leave the
    // Bluetooth/MFi session wedged so the retry fails too. Give the
    // transport a moment to fully release before the first probe.
    private static let reconnectCooldown: TimeInterval = 3

    /// Supplies the currently-saved printer target, if any — the watchdog
    /// asks this instead of owning persistence itself (that stays in the
    /// `EpsonPrinter` facade, alongside the rest of UserDefaults-backed state).
    var savedTargetProvider: (() -> String?)?

    private func obtainPrinter() -> Epos2Printer? {
        if let existing = printerInstance { return existing }
        let created = Epos2Printer(printerSeries: kSeriesM30III, lang: kLangEN)
        printerInstance = created
        return created
    }

    /// Single connect path shared by printing, the background probe, and
    /// user-initiated connects. Runs on `printQueue`. Reuses the existing
    /// link when it's still alive, otherwise tears it down and reconnects.
    /// Returns EPOS2_SUCCESS or the SDK failure code, and keeps
    /// `isConnected` / keepalive in sync either way — a failed reconnect
    /// used to leave `isConnected` stuck on its last value, so the settings
    /// screen showed "connected" while prints silently failed.
    private func openConnection(_ printer: Epos2Printer, target: String, timeout: Int) -> Int32 {
        if connectedTarget == target, printer.getStatus()?.connection == kTrue {
            DispatchQueue.main.async { self.setConnected(true) }
            return kSuccess
        }

        // Link dropped or we're switching printers — reconnect from scratch.
        if connectedTarget != nil {
            printer.disconnect()
            connectedTarget = nil
        }

        let code = printer.connect(target, timeout: timeout)
        if code == kSuccess {
            connectedTarget = target
            DispatchQueue.main.async {
                self.setConnected(true)
                self.startKeepalive()
            }
        } else {
            DispatchQueue.main.async { self.setConnected(false) }
        }
        return code
    }

    /// Connects `printer` to `target` if it isn't already connected to it.
    /// Returns false if a connection attempt fails.
    private func ensureConnected(_ printer: Epos2Printer, target: String) -> Bool {
        openConnection(printer, target: target, timeout: 15_000) == kSuccess
    }

    /// Drops the cached connection so the next print reconnects from scratch.
    private func disconnectPrinter(_ printer: Epos2Printer) {
        printer.disconnect()
        connectedTarget = nil
        DispatchQueue.main.async {
            self.setConnected(false)
            self.stopKeepalive()
        }
    }

    // MARK: - Keepalive
    //
    // `Timer.scheduledTimer(withTimeInterval:repeats:block:)` only registers
    // the timer on the run loop's `.default` mode. iOS suspends `.default`
    // timers while the run loop is in `.tracking` mode — i.e. while anyone is
    // scrolling or dragging anywhere on screen. On a POS UI that's touched
    // constantly, that silently starved this timer for the exact hours-long
    // stretch it exists to cover, so the printer rode the firmware's real
    // idle timeout instead of ever being pinged. Adding it to `.common`
    // keeps it firing regardless of UI tracking.

    private func startKeepalive() {
        keepaliveTimer?.invalidate()
        let timer = Timer(timeInterval: Self.keepaliveInterval, repeats: true) { [weak self] _ in
            self?.pingConnection()
        }
        RunLoop.main.add(timer, forMode: .common)
        keepaliveTimer = timer
    }

    private func stopKeepalive() {
        keepaliveTimer?.invalidate()
        keepaliveTimer = nil
    }

    private func pingConnection() {
        guard let printer = printerInstance, connectedTarget != nil else { return }
        printQueue.async { [weak self] in
            guard let self else { return }
            let s = printer.getStatus()
            if s?.connection != kTrue {
                DispatchQueue.main.async {
                    self.connectedTarget = nil
                    self.setConnected(false)
                }
            }
        }
    }

    // MARK: - Proactive reconnect
    //
    // Without this, a dropped link only got retried when the next order
    // happened to print — which both delayed recovery and lost that order's
    // receipt on the failed attempt. Once connection is lost for a saved
    // printer, keep probing in the background until it's back.

    private func startReconnectWatchdog() {
        guard reconnectWatchdog == nil, let target = savedTargetProvider?(), !target.isEmpty else { return }
        let timer = Timer(timeInterval: Self.reconnectWatchdogInterval, repeats: true) { [weak self] _ in
            self?.probeSavedTarget()
        }
        RunLoop.main.add(timer, forMode: .common)
        reconnectWatchdog = timer
        // Probe soon rather than waiting a full interval, but not instantly —
        // see reconnectCooldown.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.reconnectCooldown) { [weak self] in
            self?.probeSavedTarget()
        }
    }

    private func stopReconnectWatchdog() {
        reconnectWatchdog?.invalidate()
        reconnectWatchdog = nil
    }

    private func probeSavedTarget() {
        guard let target = savedTargetProvider?(), !target.isEmpty else { return }
        printQueue.async { [weak self] in
            guard let self, let printer = self.obtainPrinter() else { return }
            _ = self.openConnection(printer, target: target, timeout: 5_000)
        }
    }

    // MARK: - PrinterTransport

    func connect(target: String, timeoutMs: Int) async -> Bool {
        await withCheckedContinuation { cont in
            printQueue.async { [weak self] in
                guard let self, let printer = self.obtainPrinter() else {
                    cont.resume(returning: false)
                    return
                }
                let code = self.openConnection(printer, target: target, timeout: timeoutMs)
                if code != kSuccess {
                    self.onError?(Self.connectFailureMessage(code: code, target: target))
                }
                cont.resume(returning: code == kSuccess)
            }
        }
    }

    func disconnect() async {
        await withCheckedContinuation { cont in
            printQueue.async { [weak self] in
                guard let self, let printer = self.printerInstance, self.connectedTarget != nil else {
                    cont.resume()
                    return
                }
                self.disconnectPrinter(printer)
                cont.resume()
            }
        }
    }

    func send(_ payload: EpsonPrinter.ReceiptPayload, target: String) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            printQueue.async {
                guard let printer = self.obtainPrinter() else {
                    cont.resume(throwing: Self.epsonError(0, "Failed to allocate printer."))
                    return
                }

                // Clear any leftover commands before composing this receipt.
                printer.clearCommandBuffer()

                guard self.ensureConnected(printer, target: target) else {
                    printer.clearCommandBuffer()
                    cont.resume(throwing: Self.epsonError(0, "Could not connect to printer."))
                    return
                }

                ReceiptBuilder.build(on: printer, payload: payload)

                // Set up a receive delegate so we can wait for the printer to
                // acknowledge the job. The connection stays open afterwards —
                // we only disconnect on error so the next print can reconnect
                // from a clean slate.
                let waiter = ReceiveWaiter()
                printer.setReceiveEventDelegate(waiter)

                let sendCode = printer.sendData(15_000)
                if sendCode != kSuccess {
                    printer.setReceiveEventDelegate(nil)
                    printer.clearCommandBuffer()
                    self.disconnectPrinter(printer)
                    cont.resume(throwing: Self.epsonError(sendCode, "Print failed."))
                    return
                }

                // Block this dispatch queue until the printer acks or 20s timeout.
                let ackCode = waiter.wait(timeout: 20)

                printer.setReceiveEventDelegate(nil)
                printer.clearCommandBuffer()

                if ackCode == kSuccess {
                    cont.resume()
                } else if ackCode == nil {
                    // The completion ack can lag behind the actual print over
                    // Bluetooth (cutting the paper takes time, the link is
                    // slower than TCP). The SDK docs warn that disconnecting
                    // before the completion event arrives can leave the
                    // transport wedged, breaking the *next* connect attempt —
                    // exactly the "printed once, then can't reconnect"
                    // symptom this caused. Only tear down if the link is
                    // actually dead; otherwise the receipt likely printed and
                    // the connection is still good for the next order.
                    if printer.getStatus()?.connection == kTrue {
                        cont.resume(throwing: Self.epsonError(-1, "Printer did not confirm the print in time — please check the receipt."))
                    } else {
                        self.disconnectPrinter(printer)
                        cont.resume(throwing: Self.epsonError(-1, "Printer did not respond in time."))
                    }
                } else {
                    self.disconnectPrinter(printer)
                    cont.resume(throwing: Self.epsonError(ackCode!, "Print acknowledged with error."))
                }
            }
        }
    }

    // MARK: - Discovery

    func startDiscovery(onFound: @escaping @Sendable (EpsonPrinter.Discovered) -> Void) {
        stopDiscovery()

        let opt = Epos2FilterOption()
        opt.portType = kPortAll
        // EPOS2_PARAM_UNSPECIFIED leaves model/type wildcard so we see everything.

        let delegate = DiscoveryDelegate { info in
            let target = info.target ?? ""
            guard !target.isEmpty else { return }
            let name = info.deviceName ?? target
            let port = EpsonPrinter.PortKind(deviceType: Int32(info.deviceType))
            onFound(EpsonPrinter.Discovered(target: target, name: name, port: port))
        }
        discoveryDelegate = delegate

        let res = Epos2Discovery.start(opt, delegate: delegate)
        if res != kSuccess {
            onError?("Discovery failed (code \(res)).")
        }
    }

    func stopDiscovery() {
        Epos2Discovery.stop()
        discoveryDelegate = nil
    }

    // MARK: - Errors

    /// Turns an SDK connect failure into something the user can act on.
    private static func connectFailureMessage(code: Int32, target: String) -> String {
        let isBluetooth = target.hasPrefix("BT:") || target.hasPrefix("BLE:")
        switch code {
        case kErrInUse, kErrDeviceBusy, kErrProcessing:
            return "Printer is busy — wait a few seconds and try again."
        case kErrConnect, kErrTimeout:
            return isBluetooth
                ? "Couldn't reach the printer over Bluetooth. Check it's powered on and paired in iOS Settings → Bluetooth, then try again."
                : "Couldn't reach the printer. Check it's powered on and on the same network."
        default:
            return "Connection failed (code \(code)). Try power-cycling the printer."
        }
    }

    private static func epsonError(_ code: Int32, _ message: String) -> NSError {
        NSError(domain: "EpsonPrinter", code: Int(code), userInfo: [
            NSLocalizedDescriptionKey: "\(message) (code \(code))"
        ])
    }
}

// Delegate is its own NSObject so it can be retained while discovery is running.
private final class DiscoveryDelegate: NSObject, Epos2DiscoveryDelegate {
    private let onFound: @Sendable (Epos2DeviceInfo) -> Void
    init(_ onFound: @escaping @Sendable (Epos2DeviceInfo) -> Void) { self.onFound = onFound }
    func onDiscovery(_ deviceInfo: Epos2DeviceInfo!) {
        guard let info = deviceInfo else { return }
        onFound(info)
    }
}

// Bridges the SDK's `onPtrReceive` callback into a blocking wait on the print
// queue. The SDK retains the delegate via setReceiveEventDelegate, so this
// instance stays alive until we clear the delegate after the print finishes.
// `nonisolated`: the SDK invokes this delegate from its own background
// thread; the project defaults new types to `@MainActor` otherwise.
private nonisolated final class ReceiveWaiter: NSObject, Epos2PtrReceiveDelegate {
    private let semaphore = DispatchSemaphore(value: 0)
    private var resultCode: Int32?

    func onPtrReceive(_ printerObj: Epos2Printer!,
                      code: Int32,
                      status: Epos2PrinterStatusInfo!,
                      printJobId: String!) {
        resultCode = code
        semaphore.signal()
    }

    /// Returns the SDK code, or nil if the wait timed out.
    func wait(timeout: TimeInterval) -> Int32? {
        let result = semaphore.wait(timeout: .now() + timeout)
        return result == .success ? resultCode : nil
    }
}
