import UIKit

/// Hands a ticket's charge to the Square POS app and records Square's reply
/// when it switches back — here, not in the payment sheet, so a card Square
/// charged is never left on an unpaid ticket because the sheet was closed or
/// iOS restarted the app meanwhile. The sheet watches `lastOutcome` only to
/// close itself or show what went wrong.
@MainActor
@Observable
final class SquarePOSLink {
    static let shared = SquarePOSLink()

    enum Result: Equatable {
        case recorded
        /// Square charged, but the ticket was already settled (e.g. "paid by cash").
        case alreadySettled(String)
        case failed(String)
    }

    struct Outcome: Equatable {
        let id = UUID()
        let orderNumber: Int
        let result: Result
    }

    private(set) var lastOutcome: Outcome?

    private static let pendingKey = "squarePOSPendingTickets"
    /// Right after a cold launch tickets are still loading; wait up to ~30s.
    private static let recordAttempts = 20
    private static let recordRetryDelay: Duration = .milliseconds(1500)

    /// Request id (`state`) → ticket, for hand-offs still waiting on Square.
    /// Saved, so a reply that relaunches the app is still recognized.
    @ObservationIgnored private var pendingTickets: [String: Int] {
        didSet { UserDefaults.standard.set(pendingTickets, forKey: Self.pendingKey) }
    }
    /// Records payments the same way the payment sheet does.
    @ObservationIgnored private let payments = OrderViewModel()

    private init() {
        pendingTickets = UserDefaults.standard.dictionary(forKey: Self.pendingKey) as? [String: Int] ?? [:]
    }

    /// Opens Square POS ready to charge the ticket. Returns what went wrong,
    /// or nil once Square is open.
    func open(orderNumber: Int, amountCents: Int) async -> String? {
        let state = UUID().uuidString
        guard let url = SquarePOSRequest.paymentURL(
            amountCents: amountCents,
            note: SquarePOSRequest.note(orderNumber: orderNumber),
            state: state,
            clientID: Secrets.squareApplicationID
        ) else {
            ActivityLog.shared.error(.payment, "Square POS hand-off not built", ["ticket": orderNumber, "cents": amountCents])
            return "Couldn't open Square for this amount. Check the Square app ID in Secrets.swift."
        }
        guard await UIApplication.shared.open(url) else {
            ActivityLog.shared.warning(.payment, "Square POS not installed", ["ticket": orderNumber])
            return "Square POS isn't installed on this phone. Install “Square Point of Sale” from the App Store."
        }
        // Hand-offs for tickets that are settled (or from another day) can't
        // be recorded any more, so they're dropped as new ones are added.
        var stillPending = pendingTickets.filter { payments.ticket($0.value)?.status == .pending }
        stillPending[state] = orderNumber
        pendingTickets = stillPending
        ActivityLog.shared.info(.payment, "Opened Square POS", ["ticket": orderNumber, "cents": amountCents])
        return nil
    }

    /// Takes Square's reply. Returns false for URLs that aren't one, or a
    /// reply to a hand-off this app didn't make.
    @discardableResult
    func handle(_ url: URL) -> Bool {
        guard let response = SquarePOSRequest.response(from: url) else { return false }
        guard let state = response.state, let orderNumber = pendingTickets[state] else {
            ActivityLog.shared.warning(.payment, "Square POS reply for an unknown hand-off")
            return false
        }
        pendingTickets = pendingTickets.filter { $0.key != state }
        switch response {
        case .paid(let transactionID, _):
            ActivityLog.shared.info(.payment, "Square POS charged", ["ticket": orderNumber, "transaction": transactionID])
            Task { await record(orderNumber: orderNumber, transactionID: transactionID) }
        case .failed(let code, _):
            ActivityLog.shared.warning(.payment, "Square POS did not charge", ["ticket": orderNumber, "code": code])
            lastOutcome = Outcome(orderNumber: orderNumber, result: .failed(SquarePOSRequest.message(forErrorCode: code)))
        }
        return true
    }

    /// Marks the ticket paid by card with Square's transaction id, waiting
    /// for it to load if the app has only just started.
    private func record(orderNumber: Int, transactionID: String) async {
        for _ in 0..<Self.recordAttempts {
            if let ticket = payments.ticket(orderNumber) {
                guard ticket.status == .pending else {
                    ActivityLog.shared.error(.payment, "Square POS charged a ticket that was already settled", [
                        "ticket": orderNumber, "transaction": transactionID, "state": ticket.paymentStateLabel,
                    ])
                    lastOutcome = Outcome(orderNumber: orderNumber, result: .alreadySettled(ticket.paymentStateLabel.lowercased()))
                    return
                }
                await payments.pay(orderNumber: orderNumber, method: .card, squarePaymentID: transactionID)
                lastOutcome = Outcome(orderNumber: orderNumber, result: .recorded)
                return
            }
            try? await Task.sleep(for: Self.recordRetryDelay)
        }
        ActivityLog.shared.error(.payment, "Square POS charge not recorded: ticket not found", [
            "ticket": orderNumber, "transaction": transactionID,
        ])
        lastOutcome = Outcome(
            orderNumber: orderNumber,
            result: .failed("Square charged the card, but ticket #\(orderNumber) didn't load. Mark it paid by Square app by hand.")
        )
    }
}
