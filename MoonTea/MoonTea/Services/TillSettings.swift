import Foundation

/// What this phone does at a booth (docs/offline-event-plan.md, step 4).
nonisolated enum BoothRole: String, CaseIterable, Identifiable, Sendable {
    /// No booth link: numbers come from Supabase and this phone uploads its
    /// own orders. The normal shop setup, and the default.
    case standalone
    /// The owner's phone: hands out ticket numbers, receives every other
    /// phone's orders, uploads them all, and tells every phone about changes.
    case main
    /// Gets its numbers from the main phone and sends it every change, phone
    /// to phone. Needs no signal of its own.
    case till

    var id: String { rawValue }

    var title: String {
        switch self {
        case .standalone: "Standalone"
        case .main:       "Main phone"
        case .till:       "Till"
        }
    }

    var explanation: String {
        switch self {
        case .standalone: "Uses the internet for ticket numbers and uploads its own orders. For a normal day at the shop."
        case .main:       "Hands out every ticket number in order, receives the other phones' orders and uploads them all. Keep it plugged in with the app open. Website orders are fine while it has signal, not while it hasn't."
        case .till:       "Connects to the main phone directly (WiFi and Bluetooth on, no internet needed). Can't send orders while the main phone isn't connected."
        }
    }
}

/// Per-phone booth settings, saved on the phone.
enum TillSettings {
    private static let nameKey = "tillName"
    private static let roleKey = "boothRole"
    static let unnamed = "Unnamed till"

    /// This phone's name as other staff see it in a ticket's payment log
    /// ("Cash → Card, Till B, 2:14 PM") and on the main phone's list of tills.
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

    static var role: BoothRole {
        get { UserDefaults.standard.string(forKey: roleKey).flatMap(BoothRole.init(rawValue:)) ?? .standalone }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: roleKey) }
    }
}
