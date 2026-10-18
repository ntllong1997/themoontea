import Foundation

/// Which tickets already got their receipt today, so the main phone prints
/// each ticket once — whether it was sent here, from a till or from the
/// website — and never reprints the day after a relaunch. Kept free of I/O
/// so it can be tested on its own.
nonisolated struct PrintedTickets: Codable, Equatable, Sendable {
    let day: String
    private(set) var orderUUIDs: Set<UUID> = []

    init(day: String) { self.day = day }

    func contains(_ orderUUID: UUID) -> Bool { orderUUIDs.contains(orderUUID) }

    /// True the first time a ticket is marked.
    mutating func mark(_ orderUUID: UUID) -> Bool { orderUUIDs.insert(orderUUID).inserted }

    /// A new ticket that should get its receipt: unpaid, made with a hidden
    /// id (this app or a website pre-order), and not printed yet. Paid tickets
    /// from before this rule were already handed out.
    func needsReceipt(_ ticket: OrderGroup) -> Bool {
        guard ticket.status == .pending, let orderUUID = ticket.orderUUID else { return false }
        return !contains(orderUUID)
    }
}
