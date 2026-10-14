import Foundation

/// This phone's name as other staff see it in a ticket's payment log
/// ("Cash → Card, Till B, 2:14 PM"). Set once per phone on the Tickets tab.
enum TillSettings {
    private static let nameKey = "tillName"
    static let unnamed = "Unnamed till"

    static var name: String {
        get {
            let saved = UserDefaults.standard.string(forKey: nameKey)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return saved.isEmpty ? unnamed : saved
        }
        set {
            UserDefaults.standard.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: nameKey)
        }
    }
}
