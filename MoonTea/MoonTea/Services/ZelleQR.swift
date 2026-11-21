import Foundation

/// Zelle's payment QR code, like the one a bank app shows under "My QR code".
/// Scanned from Zelle inside the customer's bank app, it fills in who to pay;
/// Zelle has no way to fill in the amount. Same format as the website's
/// lib/orders/zelle.js. Pure, so it is tested on its own
/// (MoonTea/Tests/ZelleQRTests.swift).
nonisolated enum ZelleQR {
    private static let prefix = "https://enroll.zellepay.com/qr-codes?data="
    private static let usPhoneDigits = 10
    private static let emailPattern = #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#
    private static let phonePattern = #"^[\d\s()+.-]+$"#

    /// The email or US phone Zelle pays, normalized the way Zelle stores it,
    /// or nil when it's neither.
    static func recipient(_ raw: String) -> String? {
        let text = raw.trimmingCharacters(in: .whitespaces)
        if text.range(of: emailPattern, options: .regularExpression) != nil { return text.lowercased() }
        guard text.range(of: phonePattern, options: .regularExpression) != nil else { return nil }
        let digits = text.filter(\.isNumber)
        let national = digits.count == usPhoneDigits + 1 && digits.hasPrefix("1") ? String(digits.dropFirst()) : digits
        return national.count == usPhoneDigits ? national : nil
    }

    /// The link inside the Zelle QR, or nil without a name and valid recipient.
    static func url(name: String, recipient raw: String) -> String? {
        let cleanName = name.trimmingCharacters(in: .whitespaces).uppercased()
        guard !cleanName.isEmpty, let token = recipient(raw) else { return nil }
        let payload = ["name": cleanName, "token": token, "action": "payment"]
        // Pretty-printed with sorted keys is byte-for-byte what bank apps
        // put in their own Zelle codes; Bank of America rejected a compact one.
        guard let json = try? JSONSerialization.data(
            withJSONObject: payload,
            options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        ) else { return nil }
        return prefix + json.base64EncodedString()
    }
}
