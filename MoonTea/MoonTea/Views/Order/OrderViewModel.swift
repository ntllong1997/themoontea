import SwiftUI

@MainActor
@Observable
final class OrderViewModel {
    // Cart selection
    var cart: [CartItem] = []
    var phone: String = ""
    var paymentMethod: PaymentMethod = .cash
    var couponApplied: Bool = false

    // Builder selection per orderable category, keyed by category key. Nothing
    // here names a corndog or a boba — MenuCatalog decides what can be built.
    var selections: [String: MenuSelection] = MenuCatalog.freshSelections()

    // History
    var history: [OrderGroup] = []

    // Per-unit prep status, keyed by the item's stable row id. The value names
    // a state in that item's own category flow.
    var itemStates: [Order.ID: String] = [:]

    // Notify tracking + per-order phone overrides
    var notifiedOrders: Set<Int> = []
    var phoneOverrides: [Int: String] = [:]

    var sendError: String = ""
    var isSending: Bool = false
    var phoneError: String = ""

    // Editing an already-submitted order. Kept in its own draft state rather
    // than reusing `cart` so an in-progress order at the counter is never
    // clobbered by opening a past order to correct it.
    var editingOrderNumber: Int?
    var editCart: [CartItem] = []
    var editPaymentMethod: PaymentMethod = .cash
    var editError: String = ""
    var isSavingEdit: Bool = false
    /// Discount rows carried through an edit untouched — the coupon is
    /// deliberately not editable here, but the rows still have to be
    /// re-inserted or the replace would drop them.
    private var editPreservedRows: [Order] = []
    private var editTimestamp: String = ""
    private var editPhone: String?

    private let realtime = SupabaseRealtime(channelName: "orders", table: "orders")
    private var safetyPollTask: Task<Void, Never>?
    private var foregroundObserver: (any NSObjectProtocol)?

    // MARK: cart math

    var cartSubtotal: Double { cart.reduce(0) { $0 + $1.lineTotal } }
    var discount: Double { couponApplied ? min(CouponConstants.fourOffAmount, cartSubtotal) : 0 }
    var subtotal: Double { max(0, cartSubtotal - discount) }
    var tax: Double { subtotal * AppConstants.taxRate }
    var total: Double { subtotal + tax }

    var totalRevenueToday: Double {
        history.reduce(0) { $0 + $1.total(taxRate: AppConstants.taxRate) }
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

    // MARK: history (realtime)

    /// Initial fetch + subscribe to postgres_changes on the `orders` table.
    func startPolling() {
        Task { await refreshHistory() }
        Task { [weak self] in
            guard let self else { return }
            await self.realtime.subscribe(
                onChange: { [weak self] type, record, oldRecord in
                    Task { @MainActor in self?.applyPostgresChange(type: type, record: record, oldRecord: oldRecord) }
                },
                onJoin: { [weak self] in
                    // postgres_changes doesn't replay events missed while
                    // disconnected, so every (re)join needs a fresh snapshot.
                    Task { @MainActor in await self?.refreshHistory() }
                }
            )
        }
        startSafetyPoll()
        startForegroundRefresh()
    }

    func stopPolling() {
        Task { [realtime] in await realtime.unsubscribe() }
        safetyPollTask?.cancel()
        safetyPollTask = nil
        if let foregroundObserver {
            NotificationCenter.default.removeObserver(foregroundObserver)
        }
        foregroundObserver = nil
    }

    /// iOS suspends the app (and kills the websocket) whenever the device
    /// locks or the app leaves the foreground. On return, don't wait for the
    /// dead socket to time out — force a reconnect check and re-fetch now.
    private func startForegroundRefresh() {
        if let foregroundObserver {
            NotificationCenter.default.removeObserver(foregroundObserver)
        }
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                await self.realtime.nudge()
                await self.refreshRecentHistory()
            }
        }
    }

    /// Belt-and-suspenders: if the websocket silently drops we still refresh
    /// every 20s (the web app polls at 3s; realtime hits give us sub-second
    /// freshness in the common case, so this only bounds the worst case).
    /// Uses the bounded recent-groups fetch, not a full-day refetch — a
    /// dropped-connection gap is almost always about the most recent
    /// activity, so there's no need to re-pull the whole day every 20s.
    private func startSafetyPoll() {
        safetyPollTask?.cancel()
        safetyPollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                await self?.refreshRecentHistory()
            }
        }
    }

    // refreshHistory() fetches *all* of today's orders and replaces
    // `history` wholesale. It's now only used for the initial load and
    // catching up after a websocket (re)join, where an unpredictable gap
    // means anything could have been missed — day-to-day changes are
    // applied incrementally via applyPostgresChange() below. Still
    // coalesced: if two full refreshes land close together, only one fetch
    // runs and any request that arrives mid-fetch folds into a follow-up.
    private var isRefreshingHistory = false
    private var historyRefreshRequested = false

    func refreshHistory() async {
        guard !isRefreshingHistory else {
            historyRefreshRequested = true
            return
        }
        isRefreshingHistory = true
        defer { isRefreshingHistory = false }
        repeat {
            historyRefreshRequested = false
            do {
                let groups = try await SupabaseService.shared.todaysOrderGroups()
                self.history = groups
            } catch {
                print("[order] refresh failed: \(error)")
            }
        } while historyRefreshRequested
    }

    /// Bounded catch-up used by the frequent safety poll and foreground
    /// return, where a full-day refetch would be wasteful — those gaps are
    /// almost always about the most recent activity. Merges into `history`
    /// rather than replacing it (via the same per-row merge helpers the
    /// websocket handler uses), since groups older than the limit are
    /// intentionally omitted from the response, not actually gone.
    private var isRefreshingRecent = false
    private var recentRefreshRequested = false
    private static let recentHistoryLimit = 20

    func refreshRecentHistory() async {
        guard !isRefreshingRecent else {
            recentRefreshRequested = true
            return
        }
        isRefreshingRecent = true
        defer { isRefreshingRecent = false }
        repeat {
            recentRefreshRequested = false
            do {
                let groups = try await SupabaseService.shared.recentOrderGroups(limit: Self.recentHistoryLimit)
                for group in groups {
                    for item in group.items { mergeUpdate(item) }
                }
            } catch {
                print("[order] recent refresh failed: \(error)")
            }
        } while recentRefreshRequested
    }

    // MARK: incremental sync (postgres_changes)
    //
    // Shared by both the websocket handler and our own writes (sendOrder /
    // savePhone), since whether the REST response or the websocket echo of
    // our own write lands first is non-deterministic — both paths call the
    // same merge functions, deduped by `id`, so whichever arrives second is
    // just a no-op.

    private func mergeInsert(orderNumber: Int, rows: [Order]) {
        guard !rows.isEmpty else { return }
        if let idx = history.firstIndex(where: { $0.orderNumber == orderNumber }) {
            let existingIDs = Set(history[idx].items.map(\.id))
            let newItems = rows.filter { !existingIDs.contains($0.id) }
            guard !newItems.isEmpty else { return }
            history[idx] = OrderGroup(orderNumber: orderNumber, items: history[idx].items + newItems)
        } else {
            let insertAt = history.firstIndex(where: { $0.orderNumber < orderNumber }) ?? history.count
            history.insert(OrderGroup(orderNumber: orderNumber, items: rows), at: insertAt)
        }
    }

    private func mergeUpdate(_ order: Order) {
        guard let groupIdx = history.firstIndex(where: { $0.orderNumber == order.orderNumber }),
              let itemIdx = history[groupIdx].items.firstIndex(where: { $0.id == order.id }) else {
            // We missed the INSERT somehow — heal by inserting instead.
            mergeInsert(orderNumber: order.orderNumber, rows: [order])
            return
        }
        var items = history[groupIdx].items
        items[itemIdx] = order
        history[groupIdx] = OrderGroup(orderNumber: order.orderNumber, items: items)
    }

    private func mergeDelete(id: Order.ID) {
        guard let groupIdx = history.firstIndex(where: { $0.items.contains(where: { $0.id == id }) }) else { return }
        var items = history[groupIdx].items
        items.removeAll { $0.id == id }
        itemStates.removeValue(forKey: id)
        if items.isEmpty {
            history.remove(at: groupIdx)
        } else {
            history[groupIdx] = OrderGroup(orderNumber: history[groupIdx].orderNumber, items: items)
        }
    }

    private func applyPostgresChange(type: String, record: [String: Any]?, oldRecord: [String: Any]?) {
        switch type {
        case "INSERT":
            guard let record, let order = Self.decodeOrder(record) else { return }
            mergeInsert(orderNumber: order.orderNumber, rows: [order])
        case "UPDATE":
            guard let record, let order = Self.decodeOrder(record) else { return }
            mergeUpdate(order)
        case "DELETE":
            guard let oldRecord, let idString = oldRecord["id"] as? String, let id = UUID(uuidString: idString) else { return }
            mergeDelete(id: id)
        default:
            break
        }
    }

    private static func decodeOrder(_ dict: [String: Any]) -> Order? {
        guard let data = try? JSONSerialization.data(withJSONObject: dict) else { return nil }
        do {
            return try JSONDecoder().decode(Order.self, from: data)
        } catch {
            print("[realtime] decode failed: \(error)")
            return nil
        }
    }

    // MARK: send order

    func sendOrder() async {
        guard !cart.isEmpty else { return }
        isSending = true
        sendError = ""
        defer { isSending = false }

        // The customer has already paid, so the receipt is what we optimise
        // for. Warm the printer link now, in parallel with the order-number
        // round trip below, so a reconnect handshake (if the link went idle)
        // overlaps the network call instead of adding to the time-to-print.
        EpsonPrinter.shared.checkConnection()

        do {
            let orderNumber = try await SupabaseService.shared.nextOrderNumber()
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let timestamp = iso.string(from: Date())
            let phoneClean = phone.trimmingCharacters(in: .whitespaces)
            let phoneValue: String? = phoneClean.isEmpty ? nil : phoneClean

            let methodStr = paymentMethod.rawValue
            var rows: [Order] = []
            for item in cart {
                for _ in 0..<item.quantity {
                    rows.append(.init(
                        orderNumber: orderNumber,
                        name: item.name,
                        price: item.price,
                        type: item.type,
                        timestamp: timestamp,
                        phone: phoneValue,
                        paymentMethod: methodStr,
                        quantity: nil
                    ))
                }
            }
            if couponApplied && cartSubtotal > 0 {
                rows.append(.init(
                    orderNumber: orderNumber,
                    name: CouponConstants.fourOffLabel,
                    price: -discount,
                    type: .discount,
                    timestamp: timestamp,
                    phone: phoneValue,
                    paymentMethod: methodStr,
                    quantity: nil
                ))
            }

            // Print straight from the local rows, before persisting. The
            // receipt needs only the order number and the line items — never
            // the DB write — so enqueuing it here takes the entire insert round
            // trip off the critical path between payment and paper. `tryPrint`
            // only queues (it returns instantly); the actual printing runs in
            // the background, concurrently with the insert below.
            await tryPrint(orderNumber: orderNumber, items: rows)

            let inserted = try await SupabaseService.shared.insertOrders(rows)

            // Merge with the server-confirmed rows (real ids), not the local
            // ones: other devices' postgres_changes echo of this insert carries
            // those same server ids, so the merge dedups instead of duplicating
            // the order. (Merging the local rows here would leave the echo
            // unmatched and double the order in history.)
            mergeInsert(orderNumber: orderNumber, rows: inserted)
            cart.removeAll()
            phone = ""
            couponApplied = false
            paymentMethod = .cash
        } catch {
            // If the failure came after the receipt was queued, the customer
            // still gets their receipt; the message says the save is what
            // failed so staff know to re-ring rather than assume nothing
            // happened.
            sendError = (error as? LocalizedError)?.errorDescription ?? "Order failed to save."
        }
    }

    func reprint(orderNumber: Int) async {
        guard let group = history.first(where: { $0.orderNumber == orderNumber }) else { return }
        await tryPrint(orderNumber: orderNumber, items: group.items)
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

    func beginEdit(orderNumber: Int) {
        guard let group = history.first(where: { $0.orderNumber == orderNumber }) else { return }
        editError = ""
        editPreservedRows = group.items.filter { $0.type == .discount }
        editTimestamp = group.items.first?.timestamp ?? ""
        editPhone = group.items.first?.phone
        editPaymentMethod = PaymentMethod(rawValue: group.items.first?.paymentMethod ?? "") ?? .cash
        editCart = Self.collapseToLineItems(group.items.filter { $0.type != .discount })
            .map { CartItem(name: $0.name, price: $0.price, type: $0.type, quantity: $0.qty) }
        clearBuilderSelections()
        editingOrderNumber = orderNumber
    }

    func cancelEdit() {
        editingOrderNumber = nil
        editCart = []
        editPreservedRows = []
        editTimestamp = ""
        editPhone = nil
        editError = ""
        clearBuilderSelections()
    }

    /// Rewrites the order's rows in one transaction. The original timestamp is
    /// reused so the edited order keeps its place in the day's ordering and
    /// stays inside the day bounds the replace is scoped to.
    func saveEdit() async {
        guard let orderNumber = editingOrderNumber, !editCart.isEmpty else { return }
        isSavingEdit = true
        editError = ""
        defer { isSavingEdit = false }

        let methodStr = editPaymentMethod.rawValue
        var rows: [Order] = []
        for item in editCart {
            for _ in 0..<item.quantity {
                rows.append(.init(
                    orderNumber: orderNumber,
                    name: item.name,
                    price: item.price,
                    type: item.type,
                    timestamp: editTimestamp,
                    phone: editPhone,
                    paymentMethod: methodStr,
                    quantity: nil
                ))
            }
        }
        // Carry the discount rows through, re-stamped with the (possibly
        // changed) payment method so the whole order stays internally consistent.
        for row in editPreservedRows {
            rows.append(.init(
                orderNumber: orderNumber,
                name: row.name,
                price: row.price,
                type: row.type,
                timestamp: editTimestamp,
                phone: editPhone,
                paymentMethod: methodStr,
                quantity: row.quantity
            ))
        }

        do {
            let replaced = try await SupabaseService.shared.replaceOrderItems(orderNumber: orderNumber, rows: rows)
            replaceGroup(orderNumber: orderNumber, with: replaced)
            cancelEdit()
        } catch {
            editError = (error as? LocalizedError)?.errorDescription ?? "Couldn't save changes."
            print("[order] edit save failed: \(error)")
        }
    }

    /// Swaps a group's rows wholesale. The replacement rows carry fresh ids, so
    /// the old ids' station state is dropped rather than left to leak — the
    /// order's progress restarts, which is the accepted cost of a full replace.
    /// Realtime's DELETE/INSERT echo of this same write is a no-op afterwards:
    /// the old ids are already gone and the new ones already present.
    private func replaceGroup(orderNumber: Int, with rows: [Order]) {
        guard let idx = history.firstIndex(where: { $0.orderNumber == orderNumber }) else {
            mergeInsert(orderNumber: orderNumber, rows: rows)
            return
        }
        for old in history[idx].items {
            itemStates.removeValue(forKey: old.id)
        }
        history[idx] = OrderGroup(orderNumber: orderNumber, items: rows)
    }

    private func tryPrint(orderNumber: Int, items: [Order]) async {
        // Split: real items get grouped + summed; discount rows treated separately.
        let productItems = items.filter { $0.type != .discount }
        let discountRows = items.filter { $0.type == .discount }

        let lines = Self.collapseToLineItems(productItems)
            .sorted { $0.name < $1.name }
            .map { EpsonPrinter.ReceiptPayload.LineItem(name: $0.name, qty: $0.qty, price: $0.price) }

        let cartSubtotal = productItems.reduce(0) { $0 + $1.price }
        let discountAmount = -discountRows.reduce(0) { $0 + $1.price }   // stored negative → positive amount
        let adjustedSubtotal = max(0, cartSubtotal - discountAmount)
        let tax = adjustedSubtotal * AppConstants.taxRate
        let total = adjustedSubtotal + tax

        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US")
        df.dateFormat = "MMM d, yyyy h:mm a"

        let url = CashAppStore.shared.activeURL
        let tag = url.replacingOccurrences(of: "https://cash.app/", with: "")

        let methodLabel = items.first?.paymentMethod ?? PaymentMethod.cash.rawValue

        let payload = EpsonPrinter.ReceiptPayload(
            orderNumber: String(orderNumber),
            lines: lines,
            cartSubtotal: cartSubtotal,
            discountAmount: discountAmount,
            subtotal: adjustedSubtotal,
            tax: tax,
            total: total,
            paymentMethod: methodLabel,
            dateString: df.string(from: Date()),
            cashappURL: url,
            cashTag: tag
        )

        do { try await EpsonPrinter.shared.print(payload) }
        catch { print("[print] \(error.localizedDescription)") }
    }

    // MARK: state machines

    /// Advances a unit through its own category's cycle. A type this build does
    /// not recognise advances on the catalog's neutral flow rather than being
    /// ignored, and a Discount's single state makes the tap a no-op.
    func cycleItem(_ id: Order.ID) {
        guard let item = history.lazy.flatMap(\.items).first(where: { $0.id == id }) else { return }
        itemStates[id] = MenuCatalog.flow(for: item.type).next(after: itemStates[id])
    }

    // MARK: phone editing

    func phone(for orderNumber: Int) -> String {
        if let override = phoneOverrides[orderNumber] { return override }
        return history.first(where: { $0.orderNumber == orderNumber })?.phone ?? ""
    }

    func savePhone(orderNumber: Int, phone: String) async {
        phoneError = ""
        phoneOverrides[orderNumber] = phone  // optimistic: show immediately
        do {
            // Patch history directly from the PATCH's returned rows — other
            // devices' postgres_changes echo of this same update will apply
            // the same values again, harmlessly (last-write-wins, idempotent).
            let updated = try await SupabaseService.shared.updateOrderPhone(orderNumber: orderNumber, phone: phone)
            for row in updated { mergeUpdate(row) }
            phoneOverrides.removeValue(forKey: orderNumber)
        } catch {
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
