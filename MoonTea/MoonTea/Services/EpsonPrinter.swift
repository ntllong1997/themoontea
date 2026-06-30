import Foundation
import UIKit
import libepos2

// The ePOS SDK is Objective-C; its NS_ENUM constants import to Swift as typed
// enums (Epos2PortType, Epos2Color, …), but the API takes Int32. These aliases
// keep the call-sites readable.
private let kSuccess           = Int32(EPOS2_SUCCESS.rawValue)
private let kTrue              = Int32(EPOS2_TRUE)
private let kFalse             = Int32(EPOS2_FALSE)
private let kPortAll           = Int32(EPOS2_PORTTYPE_ALL.rawValue)
private let kPortTCP           = Int32(EPOS2_PORTTYPE_TCP.rawValue)
private let kPortBluetooth     = Int32(EPOS2_PORTTYPE_BLUETOOTH.rawValue)
private let kPortUSB           = Int32(EPOS2_PORTTYPE_USB.rawValue)
private let kPortBluetoothLE   = Int32(EPOS2_PORTTYPE_BLUETOOTH_LE.rawValue)
private let kSeriesM30III      = Int32(EPOS2_TM_M30III.rawValue)
private let kLangEN            = Int32(EPOS2_LANG_EN.rawValue)
private let kAlignLeft         = Int32(EPOS2_ALIGN_LEFT.rawValue)
private let kAlignCenter       = Int32(EPOS2_ALIGN_CENTER.rawValue)
private let kColor1            = Int32(EPOS2_COLOR_1.rawValue)
private let kSymbolQRModel2    = Int32(EPOS2_SYMBOL_QRCODE_MODEL_2.rawValue)
private let kLevelM            = Int32(EPOS2_LEVEL_M.rawValue)
private let kCutFeed           = Int32(EPOS2_CUT_FEED.rawValue)

/// Wraps the Epson ePOS SDK to discover and print to a TM-m30III over either
/// MFi Bluetooth or TCP/IP. The saved printer's `target` string is persisted in
/// UserDefaults so the next print just opens a connection without rescanning.
@MainActor
@Observable
final class EpsonPrinter: NSObject {
    static let shared = EpsonPrinter()

    enum Status: String, Sendable {
        case idle, scanning, printing, error
    }

    enum PortKind: String, Sendable {
        case bluetooth, tcp, usb, ble, unknown

        init(deviceType: Int32) {
            switch deviceType {
            case kPortTCP:         self = .tcp
            case kPortBluetooth:   self = .bluetooth
            case kPortUSB:         self = .usb
            case kPortBluetoothLE: self = .ble
            default:               self = .unknown
            }
        }

        var label: String {
            switch self {
            case .bluetooth: "Bluetooth"
            case .tcp:       "Wi-Fi / LAN"
            case .usb:       "USB"
            case .ble:       "Bluetooth LE"
            case .unknown:   "Unknown"
            }
        }
    }

    struct Discovered: Identifiable, Hashable {
        let target: String          // ePOS connection string, e.g. "TCP:192.168.0.5"
        let name: String
        let port: PortKind
        var id: String { target }
    }

    var status: Status = .idle
    var isConnected: Bool = false {
        didSet {
            guard isConnected != oldValue else { return }
            isConnected ? stopReconnectWatchdog() : startReconnectWatchdog()
        }
    }
    var discovered: [Discovered] = []
    var lastError: String = ""

    private let savedTargetKey = "epsonTarget"
    private let savedNameKey   = "epsonName"

    var savedTarget: String {
        UserDefaults.standard.string(forKey: savedTargetKey) ?? ""
    }
    var savedName: String {
        UserDefaults.standard.string(forKey: savedNameKey) ?? ""
    }
    var hasSavedPrinter: Bool { !savedTarget.isEmpty }

    private var discoveryDelegate: DiscoveryDelegate?
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

    // The Epson TM-m30III has a ~2-hour Bluetooth idle timeout in firmware.
    // Pinging every 60 minutes keeps the MFi session alive between prints.
    private var keepaliveTimer: Timer?
    private static let keepaliveInterval: TimeInterval = 60 * 60

    // Retries the saved printer in the background while it's known to be
    // unreachable, so a dropped link recovers on its own instead of waiting
    // for the next order's print (and losing that receipt) to notice.
    private var reconnectWatchdog: Timer?
    private static let reconnectWatchdogInterval: TimeInterval = 30

    private func obtainPrinter() -> Epos2Printer? {
        if let existing = printerInstance { return existing }
        let created = Epos2Printer(printerSeries: kSeriesM30III, lang: kLangEN)
        printerInstance = created
        return created
    }

    /// Connects `printer` to `target` if it isn't already connected to it.
    /// Returns false if a connection attempt fails.
    private func ensureConnected(_ printer: Epos2Printer, target: String) -> Bool {
        if connectedTarget == target {
            let status = printer.getStatus()
            if status?.connection == kTrue { return true }
            // Link dropped (printer off / out of range) — fall through to reconnect.
            connectedTarget = nil
        }

        if connectedTarget != nil {
            printer.disconnect()
            connectedTarget = nil
        }

        let code = printer.connect(target, timeout: 15_000)
        guard code == kSuccess else {
            // Without this, a failed reconnect left `isConnected` stuck on its
            // last value — the settings screen kept showing "connected" while
            // prints silently failed, and the reconnect watchdog (driven off
            // `isConnected` going false) never engaged.
            DispatchQueue.main.async { self.isConnected = false }
            return false
        }
        connectedTarget = target
        DispatchQueue.main.async {
            self.isConnected = true
            self.startKeepalive()
        }
        return true
    }

    /// Drops the cached connection so the next print reconnects from scratch.
    private func disconnectPrinter(_ printer: Epos2Printer) {
        printer.disconnect()
        connectedTarget = nil
        DispatchQueue.main.async {
            self.isConnected = false
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
                    self.isConnected = false
                }
            }
        }
    }

    // MARK: - Proactive reconnect
    //
    // Without this, a dropped link only got retried when the next order
    // happened to print — which both delayed recovery and lost that order's
    // receipt on the failed attempt. Once `isConnected` goes false for a
    // saved printer, keep probing in the background until it's back.

    private func startReconnectWatchdog() {
        guard reconnectWatchdog == nil, hasSavedPrinter else { return }
        let timer = Timer(timeInterval: Self.reconnectWatchdogInterval, repeats: true) { [weak self] _ in
            self?.checkConnection()
        }
        RunLoop.main.add(timer, forMode: .common)
        reconnectWatchdog = timer
        checkConnection()  // try immediately rather than waiting a full interval
    }

    private func stopReconnectWatchdog() {
        reconnectWatchdog?.invalidate()
        reconnectWatchdog = nil
    }

    // MARK: - Connection probe

    /// Probes whether the saved printer is reachable and updates `isConnected`.
    /// Uses a short 5-second timeout so the settings screen responds quickly.
    func checkConnection() {
        guard hasSavedPrinter else {
            isConnected = false
            return
        }
        let target = savedTarget
        printQueue.async { [weak self] in
            guard let self, let printer = self.obtainPrinter() else { return }
            if self.connectedTarget == target {
                let s = printer.getStatus()
                if s?.connection == kTrue { return }  // still good
                self.connectedTarget = nil
                DispatchQueue.main.async { self.isConnected = false }
            }
            let code = printer.connect(target, timeout: 5_000)
            if code == kSuccess {
                self.connectedTarget = target
                DispatchQueue.main.async {
                    self.isConnected = true
                    self.startKeepalive()
                }
            } else {
                DispatchQueue.main.async { self.isConnected = false }
            }
        }
    }

    // MARK: - Discovery

    func startScan() {
        stopScan()
        discovered.removeAll()
        lastError = ""
        status = .scanning

        let opt = Epos2FilterOption()
        opt.portType = kPortAll
        // EPOS2_PARAM_UNSPECIFIED leaves model/type wildcard so we see everything.

        let delegate = DiscoveryDelegate { [weak self] info in
            Task { @MainActor in self?.handle(info: info) }
        }
        discoveryDelegate = delegate

        let res = Epos2Discovery.start(opt, delegate: delegate)
        if res != kSuccess {
            status = .error
            lastError = "Discovery failed (code \(res))."
        } else {
            // Auto-stop after 12 seconds
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 12_000_000_000)
                await MainActor.run {
                    guard let self else { return }
                    if self.status == .scanning { self.stopScan() }
                }
            }
        }
    }

    func stopScan() {
        Epos2Discovery.stop()
        discoveryDelegate = nil
        if status == .scanning { status = .idle }
    }

    private func handle(info: Epos2DeviceInfo) {
        let target = info.target ?? ""
        guard !target.isEmpty else { return }
        let name = info.deviceName ?? target
        let port = PortKind(deviceType: Int32(info.deviceType))
        let entry = Discovered(target: target, name: name, port: port)
        if !discovered.contains(entry) { discovered.append(entry) }
    }

    // MARK: - Selection persistence

    func save(_ device: Discovered) {
        UserDefaults.standard.set(device.target, forKey: savedTargetKey)
        UserDefaults.standard.set(device.name, forKey: savedNameKey)
    }

    func clearSaved() {
        UserDefaults.standard.removeObject(forKey: savedTargetKey)
        UserDefaults.standard.removeObject(forKey: savedNameKey)
        stopReconnectWatchdog()

        // Release the now-unused connection so it doesn't sit open in the background.
        if let printer = printerInstance, connectedTarget != nil {
            printQueue.async { self.disconnectPrinter(printer) }
        }
    }

    // MARK: - Printing

    struct ReceiptPayload: Sendable {
        let orderNumber: Int
        let lines: [LineItem]
        let cartSubtotal: Double
        let discountAmount: Double
        let subtotal: Double
        let tax: Double
        let total: Double
        let paymentMethod: String
        let dateString: String
        let cashappURL: String
        let cashTag: String

        struct LineItem: Sendable {
            let name: String
            let qty: Int
            let price: Double
        }
    }

    func print(_ payload: ReceiptPayload) async throws {
        let target = savedTarget
        guard !target.isEmpty else {
            throw NSError(domain: "EpsonPrinter", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "No printer selected — open Printer settings and scan."
            ])
        }
        status = .printing
        defer { status = .idle }

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

                self.buildReceipt(on: printer, payload: payload)

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
                    self.disconnectPrinter(printer)
                    cont.resume(throwing: Self.epsonError(-1, "Printer did not respond in time."))
                } else {
                    self.disconnectPrinter(printer)
                    cont.resume(throwing: Self.epsonError(ackCode!, "Print acknowledged with error."))
                }
            }
        }
    }

    // MARK: - Receipt layout

    private func buildReceipt(on printer: Epos2Printer, payload: ReceiptPayload) {
        let W = 48
        let divider = String(repeating: "-", count: W) + "\n"

        // Header — centred, double size, bold
        printer.addTextAlign(kAlignCenter)
        printer.addTextSize(2, height: 2)
        printer.addTextStyle(kFalse, ul: kFalse, em: kTrue, color: kColor1)
        printer.addText("The Moon Tea\n")
        printer.addTextSize(1, height: 1)
        printer.addTextStyle(kFalse, ul: kFalse, em: kFalse, color: kColor1)
        printer.addText(payload.dateString + "\n")

        // Order number — left, double size, bold
        printer.addTextAlign(kAlignLeft)
        printer.addText("\n")
        printer.addTextSize(2, height: 2)
        printer.addTextStyle(kFalse, ul: kFalse, em: kTrue, color: kColor1)
        printer.addText("Order #\(payload.orderNumber)\n")
        printer.addTextSize(1, height: 1)
        printer.addTextStyle(kFalse, ul: kFalse, em: kFalse, color: kColor1)
        printer.addText("\n")
        printer.addText(divider)

        // Items
        for line in payload.lines {
            let label = line.qty > 1 ? "\(line.name) x\(line.qty)" : line.name
            let priceStr = String(format: "$%.2f", line.price * Double(line.qty))
            printer.addText(Self.formatItem(label: label, priceStr: priceStr, width: W))
        }
        printer.addText(divider)

        // Totals
        printer.addText(Self.pad("Subtotal", String(format: "$%.2f", payload.cartSubtotal), width: W) + "\n")
        if payload.discountAmount > 0 {
            printer.addText(Self.pad("Coupon", String(format: "-$%.2f", payload.discountAmount), width: W) + "\n")
            printer.addText(Self.pad("Adjusted Subtotal", String(format: "$%.2f", payload.subtotal), width: W) + "\n")
        }
        printer.addText(Self.pad("Tax (8.25%)", String(format: "$%.2f", payload.tax), width: W) + "\n")
        printer.addText(divider)
        printer.addTextStyle(kFalse, ul: kFalse, em: kTrue, color: kColor1)
        printer.addText(Self.pad("TOTAL", String(format: "$%.2f", payload.total), width: W) + "\n")
        printer.addTextStyle(kFalse, ul: kFalse, em: kFalse, color: kColor1)

        // Payment method
        printer.addText(Self.pad("Paid", payload.paymentMethod, width: W) + "\n")

        // Footer
        printer.addFeedLine(1)
        printer.addTextAlign(kAlignCenter)
        printer.addText("Please show this when\nyou pick up.\n")
        printer.addFeedLine(1)

        printer.addTextStyle(kFalse, ul: kFalse, em: kTrue, color: kColor1)
        printer.addText("Pay with CashApp\n")
        printer.addTextStyle(kFalse, ul: kFalse, em: kFalse, color: kColor1)

        printer.addSymbol(
            payload.cashappURL,
            type: kSymbolQRModel2,
            level: kLevelM,
            width: 6,
            height: 6,
            size: 0
        )
        printer.addText(payload.cashTag + "\n")
        printer.addFeedLine(2)
        printer.addCut(kCutFeed)
    }

    private static func pad(_ left: String, _ right: String, width: Int) -> String {
        let gap = max(1, width - left.count - right.count)
        return left + String(repeating: " ", count: gap) + right
    }

    private static func formatItem(label: String, priceStr: String, width: Int) -> String {
        if label.count + 1 + priceStr.count <= width {
            return pad(label, priceStr, width: width) + "\n"
        }
        let words = label.split(separator: " ").map(String.init)
        var lines: [String] = []
        var current = ""
        for word in words {
            let candidate = current.isEmpty ? word : "\(current) \(word)"
            if candidate.count <= width { current = candidate }
            else {
                if !current.isEmpty { lines.append(current) }
                current = word
            }
        }
        if current.count + 1 + priceStr.count <= width {
            lines.append(pad(current, priceStr, width: width))
        } else {
            lines.append(current)
            lines.append(String(repeating: " ", count: width - priceStr.count) + priceStr)
        }
        return lines.joined(separator: "\n") + "\n"
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
private final class ReceiveWaiter: NSObject, Epos2PtrReceiveDelegate {
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
