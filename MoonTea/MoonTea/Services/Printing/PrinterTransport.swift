import Foundation

/// Abstracts the physical link a receipt is sent over. `EpsonBluetoothTransport`
/// is the only implementation today (it actually handles both MFi Bluetooth and
/// TCP/IP via the Epos2 SDK's `target` string), but keeping this boundary lets a
/// future transport be swapped in without touching `PrintManager` or `EpsonPrinter`.
///
/// `async` methods bridge the SDK's own serial-dispatch-queue + delegate
/// callbacks into structured concurrency — the same continuation-based
/// bridging `EpsonPrinter.print(_:)` already does today, just relocated
/// behind this protocol rather than redesigned.
protocol PrinterTransport: AnyObject {
    var isConnected: Bool { get }

    /// Connects to `target` if not already connected to it.
    func connect(target: String, timeoutMs: Int) async -> Bool

    /// Drops the current connection, if any.
    func disconnect() async

    /// Builds and sends one receipt, suspending until the printer
    /// acknowledges (or the ack wait times out). Throws on any failure —
    /// connect, send, or ack.
    func send(_ payload: EpsonPrinter.ReceiptPayload, target: String) async throws

    func startDiscovery(onFound: @escaping @Sendable (EpsonPrinter.Discovered) -> Void)
    func stopDiscovery()
}
