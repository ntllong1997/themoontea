import Foundation

/// The main phone's ticket bookkeeping, kept free of I/O so it can be tested
/// on its own. Numbers only ever go up: each new one is after the highest the
/// phone has handed out or seen today, below `fallbackStart`.
nonisolated struct BoothCounterState: Codable, Equatable, Sendable {
    /// Where the website's own sequence starts when the main phone doesn't
    /// answer (1000, 1001…). The phone's numbers stay below it and ignore it.
    static let fallbackStart = 1000

    let day: String
    /// The highest number this phone has handed out today.
    private(set) var lastGiven = 0
    /// Which number each order got, so a till asking twice gets the same one.
    private(set) var given: [UUID: Int] = [:]

    init(day: String) { self.day = day }

    func number(for orderUUID: UUID) -> Int? { given[orderUUID] }

    /// The next number: after the highest handed out here or on the ticket
    /// list (website pre-orders, an old main phone's tickets after a
    /// takeover), ignoring the website's 1000+ sequence.
    func next(seen highestSeen: Int) -> Int {
        let seen = highestSeen < Self.fallbackStart ? highestSeen : 0
        return max(lastGiven, seen) + 1
    }

    /// Records the number an order got.
    mutating func record(_ number: Int, for orderUUID: UUID) {
        lastGiven = max(lastGiven, number)
        given[orderUUID] = number
    }
}
