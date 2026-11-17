import Foundation

/// What this phone does at a booth (docs/offline-event-plan.md, step 4).
///
/// Staff never pick a role by name. The Booth screen offers what each one
/// means: work on its own (the default), be the main phone, or connect to a
/// main phone chosen from the ones nearby — and the way back from each.
nonisolated enum BoothRole: String, CaseIterable, Identifiable, Sendable {
    /// No booth link: numbers come from Supabase and this phone uploads its
    /// own orders. The normal shop setup, and the default.
    case standalone
    /// The owner's phone: hands out ticket numbers, receives every other
    /// phone's orders, uploads them all, and tells every phone about changes.
    case main
    /// Connected to a main phone it chose: gets its numbers from it and sends
    /// it every change, phone to phone. Needs no signal of its own.
    case till

    var id: String { rawValue }
}

/// A main phone found nearby, as the Booth screen lists it.
nonisolated struct NearbyBooth: Identifiable, Hashable, Sendable {
    /// The main phone's own id, which stays the same when it is renamed.
    let id: String
    /// The name its staff gave it.
    let name: String
}

/// Per-phone booth settings, saved on the phone.
enum TillSettings {
    private static let nameKey = "tillName"
    private static let roleKey = "boothRole"
    private static let joinedBoothIDKey = "boothJoinedID"
    private static let joinedBoothNameKey = "boothJoinedName"
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

    /// A phone is a till only while it has a main phone it chose. One saved
    /// as a till before that (when a till joined whichever main phone it
    /// found) works on its own until someone connects it by hand.
    static var role: BoothRole {
        get {
            let saved = UserDefaults.standard.string(forKey: roleKey).flatMap(BoothRole.init(rawValue:)) ?? .standalone
            return saved == .till && joinedBooth == nil ? .standalone : saved
        }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: roleKey) }
    }

    /// The main phone this phone chose to connect to, kept so it comes back
    /// to the same one after the app closes or the link drops. Nil unless the
    /// phone is a till.
    static var joinedBooth: NearbyBooth? {
        get {
            guard let id = UserDefaults.standard.string(forKey: joinedBoothIDKey), !id.isEmpty else { return nil }
            return NearbyBooth(id: id, name: UserDefaults.standard.string(forKey: joinedBoothNameKey) ?? "")
        }
        set {
            UserDefaults.standard.set(newValue?.id, forKey: joinedBoothIDKey)
            UserDefaults.standard.set(newValue?.name, forKey: joinedBoothNameKey)
        }
    }
}
