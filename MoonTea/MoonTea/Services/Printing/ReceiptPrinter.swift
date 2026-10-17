import Foundation

/// Prints a ticket's receipt on this phone's Epson.
///
/// The receipt prints when the ticket is sent, before payment: staff keep it
/// and hand it over once the customer has paid. So an unpaid ticket's receipt
/// shows no payment line. On a booth, the main phone is the print hub: it
/// prints every new ticket, including the tills' and the website's.
@MainActor
enum ReceiptPrinter {
    private static let printedKey = "printedTickets"
    /// Rows of a website order arrive one by one; wait for the rest.
    private static let settleSeconds: UInt64 = 2

    private static var printed: PrintedTickets = {
        let saved = UserDefaults.standard.data(forKey: printedKey)
            .flatMap { try? JSONDecoder().decode(PrintedTickets.self, from: $0) }
        return saved?.day == today() ? saved! : PrintedTickets(day: today())
    }()

    /// The receipt for a ticket just sent from this phone.
    static func printNewTicket(_ ticket: OrderGroup) async {
        if let orderUUID = ticket.orderUUID { markPrinted(orderUUID) }
        await printReceipt(for: ticket)
    }

    /// Main phone: prints a ticket that appeared from a till or the website,
    /// once, after its rows have had a moment to arrive.
    static func printIfNew(orderNumber: Int) {
        guard let ticket = TicketStore.shared.history.first(where: { $0.orderNumber == orderNumber }),
              currentPrinted().needsReceipt(ticket) else { return }
        Task {
            try? await Task.sleep(nanoseconds: settleSeconds * 1_000_000_000)
            guard let settled = TicketStore.shared.history.first(where: { $0.orderNumber == orderNumber }),
                  currentPrinted().needsReceipt(settled), let orderUUID = settled.orderUUID,
                  markPrinted(orderUUID) else { return }
            ActivityLog.shared.info(.printer, "Printing receipt for a ticket from another device", ["order": orderNumber])
            await printReceipt(for: settled)
        }
    }

    /// Any time, e.g. the reprint button.
    static func printReceipt(for ticket: OrderGroup) async {
        await EpsonPrinter.shared.print(payload(for: ticket))
    }

    static func payload(for ticket: OrderGroup) -> EpsonPrinter.ReceiptPayload {
        let items = ticket.items
        // Split: real items get grouped + summed; discount rows treated separately.
        let productItems = items.filter { $0.type != .discount }
        let discountRows = items.filter { $0.type == .discount }

        let lines = OrderViewModel.collapseToLineItems(productItems)
            .sorted { $0.name < $1.name }
            .map { EpsonPrinter.ReceiptPayload.LineItem(name: $0.name, qty: $0.qty, price: $0.price) }

        let cartSubtotal = productItems.reduce(0) { $0 + $1.price }
        let discountAmount = -discountRows.reduce(0) { $0 + $1.price }   // stored negative → positive amount
        let adjustedSubtotal = max(0, cartSubtotal - discountAmount)
        let tax = adjustedSubtotal * AppConstants.taxRate

        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US")
        df.dateFormat = "MMM d, yyyy h:mm a"

        let url = CashAppStore.shared.activeURL
        let tag = url.replacingOccurrences(of: "https://cash.app/", with: "")

        return EpsonPrinter.ReceiptPayload(
            orderNumber: String(ticket.orderNumber),
            lines: lines,
            cartSubtotal: cartSubtotal,
            discountAmount: discountAmount,
            subtotal: adjustedSubtotal,
            tax: tax,
            total: adjustedSubtotal + tax,
            // Only a paid ticket (a reprint) names how it was paid.
            paymentMethod: ticket.status == .paid ? ticket.paymentStateLabel : nil,
            dateString: df.string(from: Date()),
            cashappURL: url,
            cashTag: tag
        )
    }

    @discardableResult
    private static func markPrinted(_ orderUUID: UUID) -> Bool {
        var current = currentPrinted()
        let isNew = current.mark(orderUUID)
        printed = current
        if let data = try? JSONEncoder().encode(current) {
            UserDefaults.standard.set(data, forKey: printedKey)
        }
        return isNew
    }

    private static func currentPrinted() -> PrintedTickets {
        if printed.day != today() { printed = PrintedTickets(day: today()) }
        return printed
    }

    private static func today() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}
