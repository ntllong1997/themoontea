import Foundation

/// The main phone's ticket counter, kept free of I/O so it can be tested on
/// its own. Strictly in order: each new order gets the next number after the
/// highest one known today, with nothing reserved ahead and nothing skipped.
nonisolated struct BoothCounterState: Codable, Equatable, Sendable {
    let day: String
    /// The highest number this phone has handed out today.
    private(set) var lastGiven = 0
    /// Which number each order got, so a till asking twice gets the same one.
    private(set) var given: [UUID: Int] = [:]

    init(day: String) { self.day = day }

    /// `highestSeen` is the highest ticket number on the phone's ticket list:
    /// website pre-orders, another main phone's tickets after a takeover.
    mutating func take(for orderUUID: UUID, highestSeen: Int) -> Int {
        if let number = given[orderUUID] { return number }
        let number = max(lastGiven, highestSeen) + 1
        lastGiven = number
        given[orderUUID] = number
        return number
    }
}
