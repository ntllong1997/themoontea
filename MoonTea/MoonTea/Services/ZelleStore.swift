import Foundation

/// The shop's Zelle name and email/phone, entered once on this phone from
/// the payment page and used for the Zelle QR code.
@MainActor
@Observable
final class ZelleStore {
    static let shared = ZelleStore()

    private static let nameKey = "zelleName"
    private static let recipientKey = "zelleRecipient"

    private(set) var name: String
    private(set) var recipient: String

    /// The QR link, or nil until valid details are saved.
    var qrURL: String? { ZelleQR.url(name: name, recipient: recipient) }

    private init() {
        name = UserDefaults.standard.string(forKey: Self.nameKey) ?? ""
        recipient = UserDefaults.standard.string(forKey: Self.recipientKey) ?? ""
    }

    /// Saves the details. Returns what's wrong with them, or nil once saved.
    func save(name newName: String, recipient raw: String) -> String? {
        let cleanName = newName.trimmingCharacters(in: .whitespaces)
        guard !cleanName.isEmpty else { return "Enter the name Zelle shows for the shop." }
        guard let token = ZelleQR.recipient(raw) else {
            return "Enter the email or US phone number the shop gets Zelle on."
        }
        name = cleanName
        recipient = token
        UserDefaults.standard.set(cleanName, forKey: Self.nameKey)
        UserDefaults.standard.set(token, forKey: Self.recipientKey)
        return nil
    }
}
