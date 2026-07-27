import Foundation
@preconcurrency import libepos2

private let kFalse   = Int32(EPOS2_FALSE)
private let kTrue    = Int32(EPOS2_TRUE)
private let kAlignLeft   = Int32(EPOS2_ALIGN_LEFT.rawValue)
private let kAlignCenter = Int32(EPOS2_ALIGN_CENTER.rawValue)
private let kColor1  = Int32(EPOS2_COLOR_1.rawValue)
private let kSymbolQRModel2 = Int32(EPOS2_SYMBOL_QRCODE_MODEL_2.rawValue)
private let kLevelM  = Int32(EPOS2_LEVEL_M.rawValue)
private let kCutFeed = Int32(EPOS2_CUT_FEED.rawValue)

/// Pure ESC/POS layout: given a receipt payload, writes the corresponding
/// buffered commands onto an already-connected `Epos2Printer`. Knows nothing
/// about Bluetooth/TCP or connection state — that's `EpsonBluetoothTransport`'s
/// job. Moved verbatim from `EpsonPrinter.buildReceipt` (no layout changes).
enum ReceiptBuilder {
    static func build(on printer: Epos2Printer, payload: EpsonPrinter.ReceiptPayload) {
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
            printer.addText(formatItem(label: label, priceStr: priceStr, width: W))
        }
        printer.addText(divider)

        // Totals
        printer.addText(pad("Subtotal", String(format: "$%.2f", payload.cartSubtotal), width: W) + "\n")
        if payload.discountAmount > 0 {
            printer.addText(pad("Coupon", String(format: "-$%.2f", payload.discountAmount), width: W) + "\n")
            printer.addText(pad("Adjusted Subtotal", String(format: "$%.2f", payload.subtotal), width: W) + "\n")
        }
        printer.addText(pad("Tax (8.25%)", String(format: "$%.2f", payload.tax), width: W) + "\n")
        printer.addText(divider)
        printer.addTextStyle(kFalse, ul: kFalse, em: kTrue, color: kColor1)
        printer.addText(pad("TOTAL", String(format: "$%.2f", payload.total), width: W) + "\n")
        printer.addTextStyle(kFalse, ul: kFalse, em: kFalse, color: kColor1)

        // Payment method
        printer.addText(pad("Paid", payload.paymentMethod, width: W) + "\n")

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
}
