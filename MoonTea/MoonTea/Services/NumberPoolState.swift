import Foundation

/// The pool's bookkeeping, kept free of I/O so it can be tested on its own.
nonisolated struct NumberPoolState: Codable, Equatable, Sendable {
    let day: String
    /// Numbers Supabase gave out to this phone and not used yet, smallest first.
    private(set) var reserved: [Int] = []
    /// The highest number this phone has handed out today.
    private(set) var lastGiven = 0
    /// Which number each order got, so a till asking twice gets the same one.
    private(set) var given: [UUID: Int] = [:]
    private(set) var isUsingOfflineNumbers = false

    init(day: String) { self.day = day }

    mutating func take(for orderUUID: UUID, highestSeen: Int) -> Int {
        if let number = given[orderUUID] { return number }
        let number: Int
        if reserved.isEmpty {
            number = max(lastGiven, highestSeen) + 1
            isUsingOfflineNumbers = true
        } else {
            number = reserved.removeFirst()
            isUsingOfflineNumbers = false
        }
        lastGiven = max(lastGiven, number)
        given[orderUUID] = number
        return number
    }

    /// Ignores a number at or below one already handed out: after offline
    /// numbers, Supabase's counter can be behind until those orders upload.
    mutating func addReserved(_ number: Int) {
        guard number > lastGiven, !reserved.contains(number) else { return }
        reserved.append(number)
        reserved.sort()
    }
}
