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
                guard let printer = Epos2Printer(printerSeries: kSeriesM30III, lang: kLangEN) else {
                    cont.resume(throwing: Self.epsonError(0, "Failed to allocate printer."))
                    return
                }

                // Clear any leftover commands before composing this receipt.
                printer.clearCommandBuffer()

                let connectCode = printer.connect(target, timeout: 15_000)
                guard connectCode == kSuccess else {
                    printer.clearCommandBuffer()
                    cont.resume(throwing: Self.epsonError(connectCode, "Could not connect to printer."))
                    return
                }

                self.buildReceipt(on: printer, payload: payload)

                // Set up a receive delegate so we can wait for the printer to
                // acknowledge the job before disconnecting. Disconnecting too
                // early leaves the printer in a state where the next connect
                // hangs — that's the "works first few times then stops" bug.
                let waiter = ReceiveWaiter()
                printer.setReceiveEventDelegate(waiter)

                let sendCode = printer.sendData(15_000)
                if sendCode != kSuccess {
                    printer.setReceiveEventDelegate(nil)
                    printer.disconnect()
                    printer.clearCommandBuffer()
                    cont.resume(throwing: Self.epsonError(sendCode, "Print failed."))
                    return
                }

                // Block this dispatch queue until the printer acks or 20s timeout.
                let ackCode = waiter.wait(timeout: 20)

                printer.setReceiveEventDelegate(nil)
                printer.disconnect()
                printer.clearCommandBuffer()

                // Small grace window for iOS / Bluetooth to fully release the
                // EA session before the next print attempts to connect.
                Thread.sleep(forTimeInterval: 0.4)

                if ackCode == kSuccess {
                    cont.resume()
                } else if ackCode == nil {
                    cont.resume(throwing: Self.epsonError(-1, "Printer did not respond in time."))
                } else {
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
