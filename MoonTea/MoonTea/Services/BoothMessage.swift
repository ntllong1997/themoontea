import Foundation

/// What the main phone and the tills say to each other over the booth link.
/// JSON-encoded; MultipeerConnectivity's reliable mode keeps each peer's
/// messages in order.
nonisolated enum BoothMessage: Codable, Sendable {
    // Till → main
    /// Sent on connecting, so the main phone can list the till by name.
    case hello(tillName: String)
    /// A number for a new order. Asking again for the same order gets the
    /// same number.
    case numberRequest(orderUUID: UUID)
    /// One change made on the till. The till keeps it until `received`.
    case change(OutboxEntry)

    // Main → till
    case number(orderUUID: UUID, number: Int)
    /// "Got it": the change is saved on the main phone, which uploads it now.
    case received(entryID: UUID)
    /// Every ticket of the day, sent when a till connects.
    case snapshot(rows: [Order])
    /// One ticket as the main phone now has it; no rows means it's gone.
    case ticket(orderNumber: Int, rows: [Order])

    func encoded() throws -> Data { try JSONEncoder().encode(self) }

    static func decode(_ data: Data) throws -> BoothMessage {
        try JSONDecoder().decode(BoothMessage.self, from: data)
    }
}

/// The till's list of changes the main phone hasn't confirmed yet, saved so it
/// survives the app closing. Kept free of networking so it can be tested.
nonisolated struct TillSendList: Codable, Equatable, Sendable {
    private(set) var entries: [OutboxEntry] = []

    mutating func add(_ entry: OutboxEntry) {
        guard !entries.contains(where: { $0.id == entry.id }) else { return }
        entries.append(entry)
    }

    mutating func confirm(_ entryID: UUID) {
        entries.removeAll { $0.id == entryID }
    }
}

nonisolated extension OutboxEntry: Equatable {
    static func == (lhs: OutboxEntry, rhs: OutboxEntry) -> Bool { lhs.id == rhs.id }
}

/// The main phone's record of which till changes it already took, so a till
/// resending after a dropped link can't apply an old change twice (and over a
/// newer one). Kept per day.
nonisolated struct ReceivedChanges: Codable, Equatable, Sendable {
    let day: String
    private(set) var ids: Set<UUID> = []

    init(day: String) { self.day = day }

    /// True the first time an id is seen.
    mutating func markNew(_ id: UUID) -> Bool { ids.insert(id).inserted }
}
