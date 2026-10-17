import Foundation

/// Ticket payment actions: pay, cancel, and corrections to a paid ticket.
///
/// Each one writes the ticket's whole payment state through the upload list —
/// on this phone at once, to Supabase when there's signal — and appends a line
/// to the ticket's payment log ("Cash → Card, Till B, 2:14 PM"). Only tickets
/// with a hidden id can be changed: this app's, and the website's pre-orders
/// (sent as pending by staff who take orders but not payment). Tickets saved
/// before the id existed have none and stay as they are.
extension OrderViewModel {
    func ticket(_ orderNumber: Int) -> OrderGroup? {
        history.first { $0.orderNumber == orderNumber }
    }

    /// Marks a pending ticket paid. The receipt already printed when it was
    /// sent; staff hand it over now. `squarePaymentID` is
    /// set only for a card charged on this phone's reader; any id from an
    /// earlier charge that was marked unpaid is replaced, so only this payment
    /// decides the "card was really charged" warning.
    func pay(orderNumber: Int, method: PaymentMethod, squarePaymentID: String? = nil) async {
        guard let group = ticket(orderNumber), group.status == .pending else { return }
        applyPayment(
            to: group,
            status: .paid,
            method: method,
            paidAt: Self.nowTimestamp(),
            squarePaymentID: squarePaymentID
        )
        if lastSentOrderNumber == orderNumber { lastSentOrderNumber = nil }
    }

    /// For walk-aways. The ticket is kept and its number stays used.
    func cancelTicket(orderNumber: Int) {
        guard let group = ticket(orderNumber), group.status == .pending else { return }
        applyPayment(to: group, status: .cancelled, method: nil, paidAt: nil, squarePaymentID: group.squarePaymentID)
        if lastSentOrderNumber == orderNumber { lastSentOrderNumber = nil }
    }

    /// Paid → pending, so its items can be edited and payment taken again.
    func markUnpaid(orderNumber: Int) {
        guard let group = ticket(orderNumber), group.status == .paid else { return }
        applyPayment(to: group, status: .pending, method: nil, paidAt: nil, squarePaymentID: group.squarePaymentID)
    }

    /// Cancelled → pending.
    func restoreTicket(orderNumber: Int) {
        guard let group = ticket(orderNumber), group.status == .cancelled else { return }
        applyPayment(to: group, status: .pending, method: nil, paidAt: nil, squarePaymentID: group.squarePaymentID)
    }

    /// Fixes the method on a paid ticket. The paid time is kept.
    func changePaymentMethod(orderNumber: Int, to method: PaymentMethod) {
        guard let group = ticket(orderNumber), group.status == .paid, group.paymentMethod != method else { return }
        applyPayment(
            to: group,
            status: .paid,
            method: method,
            paidAt: group.items.first?.paidAt,
            squarePaymentID: group.squarePaymentID
        )
    }

    private func applyPayment(
        to group: OrderGroup,
        status: OrderStatus,
        method: PaymentMethod?,
        paidAt: String?,
        squarePaymentID: String?
    ) {
        guard let orderUUID = group.orderUUID else { return }
        let newLabel = status == .paid ? (method?.displayName ?? status.label) : status.label
        let entry = PaymentLogEntry(
            at: Self.nowTimestamp(),
            till: TillSettings.name,
            from: group.paymentStateLabel,
            to: newLabel
        )
        let change = PaymentChange(
            status: status,
            paymentMethod: method?.rawValue,
            paidAt: paidAt,
            squarePaymentID: squarePaymentID,
            paymentLog: group.paymentLog + [entry]
        )
        TicketStore.shared.submit(OutboxEntry(
            orderUUID: orderUUID,
            orderNumber: group.orderNumber,
            operation: .updatePayment(change: change)
        ))
        ActivityLog.shared.info(.payment, "Ticket payment changed", [
            "order": group.orderNumber, "from": entry.from, "to": entry.to,
            "total": group.total(taxRate: AppConstants.taxRate),
        ])
    }
}

extension PaymentLogEntry {
    /// "Cash → Card, Till B, 2:14 PM"
    var displayText: String {
        "\(from) → \(to), \(till), \(Self.timeText(at))"
    }

    private static func timeText(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return iso }
        return date.formatted(date: .omitted, time: .shortened)
    }
}
