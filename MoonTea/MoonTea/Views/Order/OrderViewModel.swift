import SwiftUI

@MainActor
@Observable
final class OrderViewModel {
    // Cart selection
    var cart: [CartItem] = []
    var phone: String = ""
    var couponApplied: Bool = false

    // Builder selection per orderable category, keyed by category key. Nothing
    // here names a corndog or a boba — MenuCatalog decides what can be built.
    var selections: [String: MenuSelection] = MenuCatalog.freshSelections()

    /// Today's tickets, shared by every screen (see `TicketStore`).
    var history: [OrderGroup] { TicketStore.shared.history }

    // Notify tracking + per-order phone overrides
    var notifiedOrders: Set<Int> = []
    var phoneOverrides: [Int: String] = [:]

    var sendError: String = ""
    var isSending: Bool = false
    /// The ticket this phone sent last, for the counter's "Pay now" shortcut.
    var lastSentOrderNumber: Int?
    var phoneError: String = ""

    // Editing an already-submitted order. Kept in its own draft state rather
    // than reusing `cart` so an in-progress order at the counter is never
    // clobbered by opening a past order to correct it.
    var editingOrderNumber: Int?
    var editCart: [CartItem] = []
    var editError: String = ""
    var isSavingEdit: Bool = false
    /// Discount rows carried through an edit untouched — the coupon is
    /// deliberately not editable here, but the rows still have to be
    /// re-inserted or the replace would drop them.
    private var editPreservedRows: [Order] = []
    private var editTimestamp: String = ""
    private var editPhone: String?

    // MARK: cart math

    var cartSubtotal: Double { cart.reduce(0) { $0 + $1.lineTotal } }
    var discount: Double { couponApplied ? min(CouponConstants.fourOffAmount, cartSubtotal) : 0 }
    var subtotal: Double { max(0, cartSubtotal - discount) }
    var tax: Double { subtotal * AppConstants.taxRate }
    var total: Double { subtotal + tax }

    /// Paid tickets only: a pending ticket isn't money yet, a cancelled one never was.
    var totalRevenueToday: Double {
        history.filter { $0.status == .paid }.reduce(0) { $0 + $1.total(taxRate: AppConstants.taxRate) }
    }

    // MARK: builder

    func selection(for category: MenuCategory) -> MenuSelection {
        selections[category.key] ?? MenuSelection()
    }

    func select(_ category: MenuCategory, group: String, option: String) {
        var updated = selection(for: category)
        updated.options[group] = option
        selections[category.key] = updated
    }

    func toggleAddOn(_ category: MenuCategory, key: String) {
        var updated = selection(for: category)
        updated.addOns[key] = !(updated.addOns[key] ?? false)
        selections[category.key] = updated
    }

    func isAddOnOn(_ category: MenuCategory, key: String) -> Bool {
        selection(for: category).addOns[key] ?? false
    }

    func canAdd(_ category: MenuCategory) -> Bool {
        MenuCatalog.isComplete(category, selection(for: category))
    }

    /// Builds the line through the catalog, which drops any add-on whose
    /// condition no longer holds — so a stale toggle is never charged.
    func add(_ category: MenuCategory) {
        guard let item = MenuCatalog.cartItem(category, selection(for: category)) else { return }
        addItem(item)
        selections[category.key] = MenuSelection()
    }

    // MARK: cart actions

    /// Routes to the edit draft when an order is open for editing, so the same
    /// builders serve both the counter and the edit sheet.
    private func addItem(_ item: CartItem) {
        if editingOrderNumber != nil {
            if let idx = editCart.firstIndex(where: { $0.name == item.name }) {
                editCart[idx].quantity += 1
            } else {
                editCart.append(item)
            }
        } else {
            if let idx = cart.firstIndex(where: { $0.name == item.name }) {
                cart[idx].quantity += 1
            } else {
                cart.append(item)
            }
        }
    }

    func changeQuantity(at index: Int, by delta: Int) {
        guard cart.indices.contains(index) else { return }
        cart[index].quantity += delta
        if cart[index].quantity <= 0 { cart.remove(at: index) }
    }

    func changeEditQuantity(at index: Int, by delta: Int) {
        guard editCart.indices.contains(index) else { return }
        editCart[index].quantity += delta
        if editCart[index].quantity <= 0 { editCart.remove(at: index) }
    }

    private func clearBuilderSelections() {
        selections = MenuCatalog.freshSelections()
    }

    // MARK: send order

    /// Sends the cart to the kitchen as a pending ticket, and prints its
    /// receipt for staff to hand over once it's paid on the payment page.
    /// Returns the ticket's number, or nil if nothing was sent.
    @discardableResult
    func sendOrder() async -> Int? {
        guard !cart.isEmpty else { return nil }
        isSending = true
        sendError = ""
        defer { isSending = false }

        // The order number is the only step that still needs the network.
        // Everything after it is local: the order is saved on the phone and
        // uploaded in the background, so a weak signal can no longer lose it.
        let orderUUID = UUID()
        let orderNumber: Int
        do {
            orderNumber = try await TicketNumbers.next(for: orderUUID)
        } catch {
            sendError = "Couldn't get a ticket number, so this order was NOT sent. Check the connection and send it again. "
                + ((error as? LocalizedError)?.errorDescription ?? "")
            ActivityLog.shared.error(.order, "Couldn't get a ticket number", ["error": error, "total": total])
            return nil
        }

        let timestamp = Self.nowTimestamp()
        let phoneClean = phone.trimmingCharacters(in: .whitespaces)
        let phoneValue: String? = phoneClean.isEmpty ? nil : phoneClean

        func row(name: String, price: Double, type: OrderItemType) -> Order {
            Order(
                orderNumber: orderNumber,
                name: name,
                price: price,
                type: type,
                timestamp: timestamp,
                phone: phoneValue,
                orderUUID: orderUUID,
                status: .pending,
                paymentLog: []
            )
        }
        var rows: [Order] = []
        for item in cart {
            for _ in 0..<item.quantity {
                rows.append(row(name: item.name, price: item.price, type: item.type))
            }
        }
        if couponApplied && cartSubtotal > 0 {
            rows.append(row(name: CouponConstants.fourOffLabel, price: -discount, type: .discount))
        }

        // Saved on the phone before anything else, so it survives the app
        // closing. Every row's id is made here and kept through the upload, so
        // Realtime's echo of it (here and on other devices) dedups by id.
        TicketStore.shared.submit(OutboxEntry(
            orderUUID: orderUUID,
            orderNumber: orderNumber,
            operation: .insert(rows: rows)
        ))
        lastSentOrderNumber = orderNumber
        // The receipt prints now and waits with staff until payment. A till
        // has no printer: the main phone prints the ticket when it arrives.
        if TillSettings.role != .till, let ticket = history.first(where: { $0.orderNumber == orderNumber }) {
            EpsonPrinter.shared.checkConnection()
            Task { await ReceiptPrinter.printNewTicket(ticket) }
        }
        ActivityLog.shared.info(.order, "Order sent", [
            "order": orderNumber,
            "items": cart.reduce(0) { $0 + $1.quantity },
            "total": total,
            "status": OrderStatus.pending.rawValue,
            "coupon": couponApplied ? "yes" : "no",
            "phone": phoneValue == nil ? "no" : "yes",
        ])
        cart.removeAll()
        phone = ""
        couponApplied = false
        return orderNumber
    }

    static func nowTimestamp() -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return iso.string(from: Date())
    }

    /// A till has no printer: the main phone prints it.
    func reprint(orderNumber: Int) async {
        guard let group = history.first(where: { $0.orderNumber == orderNumber }) else { return }
        ActivityLog.shared.info(.order, "Reprint requested", ["order": orderNumber])
        if TillSettings.role == .till {
            BoothSync.shared.requestPrint(orderNumber: orderNumber)
        } else {
            await ReceiptPrinter.printReceipt(for: group)
        }
    }

    // MARK: edit a submitted order

    var isEditing: Bool { editingOrderNumber != nil }

    /// The coupon isn't editable mid-edit, so the discount is read off the
    /// preserved rows (stored negative) rather than the `couponApplied` flag.
    var editDiscount: Double { -editPreservedRows.reduce(0) { $0 + $1.price } }
    var editCartSubtotal: Double { editCart.reduce(0) { $0 + $1.lineTotal } }
    var editSubtotal: Double { max(0, editCartSubtotal - editDiscount) }
    var editTax: Double { editSubtotal * AppConstants.taxRate }
    var editTotal: Double { editSubtotal + editTax }

    /// Collapses one-row-per-unit rows back into line items with quantities —
    /// the inverse of the expansion in `sendOrder()`. Grouped on name + price +
    /// type so two same-named items at different prices never merge.
    /// First-seen order is preserved so the sheet doesn't reshuffle as it's edited.
    static func collapseToLineItems(_ rows: [Order]) -> [(name: String, price: Double, type: OrderItemType, qty: Int)] {
        var keyOrder: [String] = []
        var buckets: [String: (name: String, price: Double, type: OrderItemType, qty: Int)] = [:]
        for row in rows {
            let key = "\(row.name)|\(row.price)|\(row.type.rawValue)"
            if var bucket = buckets[key] {
                bucket.qty += 1
                buckets[key] = bucket
            } else {
                buckets[key] = (row.name, row.price, row.type, 1)
                keyOrder.append(key)
            }
        }
        return keyOrder.compactMap { buckets[$0] }
    }

    /// Only pending tickets: a paid ticket's items are never edited — mark it
    /// unpaid, edit, and take payment again.
    func beginEdit(orderNumber: Int) {
        guard let group = history.first(where: { $0.orderNumber == orderNumber }),
              group.status == .pending, group.orderUUID != nil else { return }
        editError = ""
        editPreservedRows = group.items.filter { $0.type == .discount }
        editTimestamp = group.items.first?.timestamp ?? ""
        editPhone = group.items.first?.phone
        editCart = Self.collapseToLineItems(group.items.filter { $0.type != .discount })
            .map { CartItem(name: $0.name, price: $0.price, type: $0.type, quantity: $0.qty) }
        clearBuilderSelections()
        editingOrderNumber = orderNumber
        ActivityLog.shared.info(.order, "Started editing order", ["order": orderNumber])
    }

    func cancelEdit() {
        if let editingOrderNumber {
            ActivityLog.shared.info(.order, "Cancelled editing order", ["order": editingOrderNumber])
        }
        endEdit()
    }

    private func endEdit() {
        editingOrderNumber = nil
        editCart = []
        editPreservedRows = []
        editTimestamp = ""
        editPhone = nil
        editError = ""
        clearBuilderSelections()
    }

    /// Rewrites the ticket's rows through the upload list: saved here at once,
    /// uploaded when there's signal, and always behind the ticket's own upload.
    /// The original timestamp is reused so the ticket keeps its place in the day.
    func saveEdit() async {
        guard let orderNumber = editingOrderNumber, !editCart.isEmpty,
              let original = history.first(where: { $0.orderNumber == orderNumber })?.items.first,
              let orderUUID = original.orderUUID else { return }
        isSavingEdit = true
        editError = ""
        defer { isSavingEdit = false }

        // The ticket's id and payment state ride through the edit unchanged.
        func row(name: String, price: Double, type: OrderItemType, quantity: Int?) -> Order {
            Order(
                orderNumber: orderNumber,
                name: name,
                price: price,
                type: type,
                timestamp: editTimestamp,
                phone: editPhone,
                paymentMethod: original.paymentMethod,
                quantity: quantity,
                orderUUID: orderUUID,
                status: original.orderStatus,
                paidAt: original.paidAt,
                squarePaymentID: original.squarePaymentID,
                paymentLog: original.paymentLog
            )
        }
        var rows: [Order] = []
        for item in editCart {
            for _ in 0..<item.quantity {
                rows.append(row(name: item.name, price: item.price, type: item.type, quantity: nil))
            }
        }
        // Carry the discount rows through untouched.
        for preserved in editPreservedRows {
            rows.append(row(name: preserved.name, price: preserved.price, type: preserved.type, quantity: preserved.quantity))
        }

        let previousCount = history.first(where: { $0.orderNumber == orderNumber })?.items.count ?? 0
        TicketStore.shared.submit(OutboxEntry(
            orderUUID: orderUUID,
            orderNumber: orderNumber,
            operation: .replace(rows: rows)
        ))
        ActivityLog.shared.info(.order, "Order edited", [
            "order": orderNumber,
            "itemsBefore": previousCount,
            "itemsAfter": rows.count,
            "total": editTotal,
        ])
        endEdit()
    }

    // MARK: state machines

    /// Advances a unit through its own category's cycle. A type this build does
    /// not recognise advances on the catalog's neutral flow rather than being
    /// ignored, and a Discount's single state makes the tap a no-op.
    ///
    /// The stage is kept on this phone only (`PrepProgress`), shared by all
    /// its screens: the stations, Tickets and History show the same progress.
    func cycleItem(_ id: Order.ID) {
        guard let item = history.lazy.flatMap(\.items).first(where: { $0.id == id }) else { return }
        let previous = PrepProgress.shared.stage(of: id)
        let next = MenuCatalog.flow(for: item.type).next(after: previous)
        PrepProgress.shared.setStage(next, of: id)
        ActivityLog.shared.info(.station, "Item status changed", [
            "order": item.orderNumber, "item": item.name, "from": previous ?? "new", "to": next,
        ])
    }

    // MARK: phone editing

    func phone(for orderNumber: Int) -> String {
        if let override = phoneOverrides[orderNumber] { return override }
        return history.first(where: { $0.orderNumber == orderNumber })?.phone ?? ""
    }

    func savePhone(orderNumber: Int, phone: String) async {
        phoneError = ""
        // Orders with a hidden id: saved here at once, uploaded when there's
        // signal (and always after the order's own upload).
        if let orderUUID = history.first(where: { $0.orderNumber == orderNumber })?.orderUUID {
            let value: String? = phone.isEmpty ? nil : phone
            TicketStore.shared.submit(OutboxEntry(
                orderUUID: orderUUID,
                orderNumber: orderNumber,
                operation: .updatePhone(phone: value)
            ))
            phoneOverrides.removeValue(forKey: orderNumber)
            return
        }

        phoneOverrides[orderNumber] = phone  // optimistic: show immediately
        do {
            // Patch history directly from the PATCH's returned rows — other
            // devices' postgres_changes echo of this same update will apply
            // the same values again, harmlessly (last-write-wins, idempotent).
            let updated = try await SupabaseService.shared.updateOrderPhone(orderNumber: orderNumber, phone: phone)
            for row in updated { TicketStore.shared.mergeUpdate(row) }
            phoneOverrides.removeValue(forKey: orderNumber)
            // Never the number itself — the log is readable on any staff device.
            ActivityLog.shared.info(.order, phone.isEmpty ? "Phone number removed" : "Phone number saved", ["order": orderNumber])
        } catch {
            ActivityLog.shared.warning(.order, "Phone number failed to save", ["order": orderNumber, "error": error])
            // Keep the optimistic override so the phone stays visible this session.
            // The alert tells the user it wasn't persisted to the database.
            phoneError = "Couldn't save phone number. Check your connection and try again."
            print("[order] update phone failed: \(error)")
        }
    }

    func markNotified(_ orderNumber: Int) {
        notifiedOrders.insert(orderNumber)
    }

    func smsBody(for orderNumber: Int) -> String {
        guard let group = history.first(where: { $0.orderNumber == orderNumber }) else { return "" }
        let list = group.items.filter { $0.type != .discount }.map { "• \($0.name)" }.joined(separator: "\n")
        return "🌙 The Moon Tea\nOrder #\(orderNumber) is ready for pickup! 🎉\n\n\(list)\n\nSee you soon! 🧡"
    }
}
