import Foundation

/// The main phone's ticket bookkeeping, kept free of I/O so it can be tested
/// on its own. Numbers only ever go up: each new one is after the highest the
/// phone has handed out or seen today.
nonisolated struct BoothCounterState: Codable, Equatable, Sendable {
    let day: String
    /// The highest number this phone has handed out today.
    private(set) var lastGiven = 0
    /// Which number each order got, so a till asking twice gets the same one.
    private(set) var given: [UUID: Int] = [:]

    init(day: String) { self.day = day }

    func number(for orderUUID: UUID) -> Int? { given[orderUUID] }

    /// The highest number known: handed out here, or on the ticket list
    /// (website orders, an old main phone's tickets after a takeover).
    func highest(seen highestSeen: Int) -> Int { max(lastGiven, highestSeen) }

    /// Records the number an order got — from Supabase with signal, or the
    /// next one after `highest(seen:)` without.
    mutating func record(_ number: Int, for orderUUID: UUID) {
        lastGiven = max(lastGiven, number)
        given[orderUUID] = number
    }
}
