import Foundation
import UIKit
@preconcurrency import libepos2

private let kPortTCP         = Int32(EPOS2_PORTTYPE_TCP.rawValue)
private let kPortBluetooth   = Int32(EPOS2_PORTTYPE_BLUETOOTH.rawValue)
private let kPortUSB         = Int32(EPOS2_PORTTYPE_USB.rawValue)
private let kPortBluetoothLE = Int32(EPOS2_PORTTYPE_BLUETOOTH_LE.rawValue)

/// Thin `@MainActor` facade the rest of the app talks to. Owns UI-observable
/// state (connection status, discovered devices, errors) and the saved
/// printer selection (UserDefaults), and delegates the actual work to
/// `EpsonBluetoothTransport` (physical connection) and `PrintManager`
/// (durable FIFO print queue). No other type should touch the Bluetooth/Epos2
/// SDK directly — that boundary is what makes a future transport swap
/// possible without touching this file's callers.
@MainActor
@Observable
final class EpsonPrinter: NSObject {
    static let shared = EpsonPrinter()

    enum Status: String, Sendable {
        case idle, scanning, connecting, printing, error
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

    struct Discovered: Identifiable, Hashable, Sendable {
        let target: String          // ePOS connection string, e.g. "TCP:192.168.0.5"
        let name: String
        let port: PortKind
        var id: String { target }
    }

    var status: Status = .idle
    var isConnected: Bool = false
    var discovered: [Discovered] = []
    var lastError: String = ""
    /// Receipts waiting to print (queued because the printer was unreachable
    /// or busy). Surfaced so staff can tell "still printing" from "lost".
    var pendingPrintCount: Int = 0

    private let savedTargetKey = "epsonTarget"
    private let savedNameKey   = "epsonName"

    var savedTarget: String {
        UserDefaults.standard.string(forKey: savedTargetKey) ?? ""
    }
    var savedName: String {
        UserDefaults.standard.string(forKey: savedNameKey) ?? ""
    }
    var hasSavedPrinter: Bool { !savedTarget.isEmpty }

    @ObservationIgnored private let transport = EpsonBluetoothTransport()
    @ObservationIgnored private var printManager: PrintManager!

    @ObservationIgnored private var discoveryAutoStopTask: Task<Void, Never>?

    override init() {
        super.init()
        printManager = PrintManager(
            transport: transport,
            targetProvider: { [weak self] in
                let target = self?.savedTarget ?? ""
                return target.isEmpty ? nil : target
            }
        )
        transport.savedTargetProvider = { [weak self] in
            let target = self?.savedTarget ?? ""
            return target.isEmpty ? nil : target
        }
        transport.onConnectionChange = { connected in
            Task { @MainActor [weak self] in self?.isConnected = connected }
        }
        transport.onError = { message in
            Task { @MainActor [weak self] in self?.lastError = message }
        }
        if hasSavedPrinter {
            Task { [weak self] in await self?.printManager.resume() }
        }
        Task { [weak self] in await self?.refreshPendingCount() }
    }

    private func refreshPendingCount() async {
        pendingPrintCount = await printManager.pendingCount
    }

    // MARK: - Connection

    /// Silent background probe: checks the saved printer is reachable and
    /// updates `isConnected`. Uses a short 5-second timeout so the settings
    /// screen responds quickly. For user-initiated connects (which should
    /// show progress and report failures), use `connectSaved()` instead.
    func checkConnection() {
        guard hasSavedPrinter else {
            isConnected = false
            return
        }
        let target = savedTarget
        Task { [weak self] in
            _ = await self?.transport.connect(target: target, timeoutMs: 5_000)
        }
    }

    /// User-initiated connect to the saved printer. Unlike `checkConnection()`
    /// this drives `status` through `.connecting` so the UI can show a
    /// spinner, and reports failures in `lastError` via the transport's error
    /// callback.
    func connectSaved() {
        guard hasSavedPrinter else { return }
        // Don't interrupt an in-flight scan or print job.
        guard status == .idle || status == .error else { return }

        let target = savedTarget
        status = .connecting
        lastError = ""
        Task { [weak self] in
            guard let self else { return }
            let success = await transport.connect(target: target, timeoutMs: 15_000)
            if status == .connecting { status = .idle }
            if success { await printManager.resume() }
        }
    }

    // MARK: - Discovery

    func startScan() {
        stopScan()
        discovered.removeAll()
        lastError = ""
        status = .scanning

        transport.startDiscovery { device in
            Task { @MainActor [weak self] in
                guard let self else { return }
                if !self.discovered.contains(device) { self.discovered.append(device) }
            }
        }

        // Auto-stop after 12 seconds.
        discoveryAutoStopTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 12_000_000_000)
            await MainActor.run {
                guard let self else { return }
                if self.status == .scanning { self.stopScan() }
            }
        }
    }

    func stopScan() {
        transport.stopDiscovery()
        discoveryAutoStopTask?.cancel()
        discoveryAutoStopTask = nil
        if status == .scanning { status = .idle }
    }

    // MARK: - Selection persistence

    func save(_ device: Discovered) {
        if status == .scanning { stopScan() }  // choosing a printer ends the scan
        UserDefaults.standard.set(device.target, forKey: savedTargetKey)
        UserDefaults.standard.set(device.name, forKey: savedNameKey)
        // Connect right away so selecting a printer gives immediate feedback
        // instead of silently waiting for the next print or watchdog probe.
        connectSaved()
    }

    func clearSaved() {
        UserDefaults.standard.removeObject(forKey: savedTargetKey)
        UserDefaults.standard.removeObject(forKey: savedNameKey)
        lastError = ""
        // Release the now-unused connection so it doesn't sit open in the background.
        Task { [weak self] in await self?.transport.disconnect() }
    }

    // MARK: - Printing

    // `nonisolated` because this crosses into `PrintManager`'s background
    // actor — without it, Swift infers `@MainActor` isolation onto nested
    // types from their enclosing type, which would make `PrintJob`'s init
    // and `PrintQueueStore`'s load/save implicitly main-actor-isolated too.
    nonisolated struct ReceiptPayload: Codable, Sendable {
        let orderNumber: String
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

        nonisolated struct LineItem: Codable, Sendable {
            let name: String
            let qty: Int
            let price: Double
        }
    }

    /// Enqueues a receipt and returns immediately — printing happens in the
    /// background via `PrintManager`, with its own retry/backoff, so this
    /// never blocks checkout on a slow or disconnected printer.
    func print(_ payload: ReceiptPayload) async {
        await printManager.enqueue(orderNumber: payload.orderNumber, payload: payload)
        await refreshPendingCount()
    }

    /// Forwards `PrintManager`'s post-send callback, whose queue is private to
    /// this type. `PrintBridge` uses it to mark a Supabase job printed only
    /// once the receipt is genuinely on paper.
    func setPrintedHandler(_ handler: (@Sendable (String) async -> Void)?) async {
        await printManager.setOnPrinted(handler)
    }
}
