import SwiftUI

@MainActor
@Observable
final class OrderViewModel {
    // Cart selection
    var cart: [CartItem] = []
    var phone: String = ""
    var paymentMethod: PaymentMethod = .cash
    var couponApplied: Bool = false

    // Boba builder
    var selectedDrink: String = ""
    var selectedBoba: String = ""
    var drinkCustomization: Bool = false

    // Corndog builder
    var selectedCorndogInside: String = ""
    var selectedCorndogOutside: String = ""
    var selectedCorndogDust: Bool = false

    // History
    var history: [OrderGroup] = []

    // Item state keyed by the item's stable row id
    var bobaStates: [Order.ID: BobaState] = [:]
    var corndogStates: [Order.ID: CorndogState] = [:]

    // Notify tracking + per-order phone overrides
    var notifiedOrders: Set<Int> = []
    var phoneOverrides: [Int: String] = [:]

    var sendError: String = ""
    var isSending: Bool = false
    var phoneError: String = ""

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

    var customizationLabel: String? {
        AppConstants.drinkCustomizations[selectedDrink]
    }

    // MARK: cart actions

    func addBoba() {
        guard !selectedDrink.isEmpty, !selectedBoba.isEmpty else { return }
        var name = "\(selectedDrink) (\(selectedBoba))"
        if drinkCustomization, let label = customizationLabel {
            name += " [\(label)]"
        }
        if let idx = cart.firstIndex(where: { $0.name == name }) {
            cart[idx].quantity += 1
        } else {
            cart.append(.init(name: name, price: AppConstants.bobaPrice, type: .boba, quantity: 1))
        }
        selectedDrink = ""
        selectedBoba = ""
        drinkCustomization = false
    }

    func addCorndog() {
        guard !selectedCorndogInside.isEmpty, !selectedCorndogOutside.isEmpty else { return }
        let dustApplies = selectedCorndogDust && selectedCorndogOutside == "Potato"
        let dustSuffix = dustApplies ? " + Hot Cheeto Dust" : ""
        let name = "\(selectedCorndogInside) \(selectedCorndogOutside)\(dustSuffix)"
        let price = AppConstants.corndogPrice + (dustApplies ? AppConstants.hotCheetoDustPrice : 0)
        if let idx = cart.firstIndex(where: { $0.name == name }) {
            cart[idx].quantity += 1
        } else {
            cart.append(.init(name: name, price: price, type: .corndog, quantity: 1))
        }
        selectedCorndogInside = ""
        selectedCorndogOutside = ""
        selectedCorndogDust = false
    }

    func changeQuantity(at index: Int, by delta: Int) {
        guard cart.indices.contains(index) else { return }
        cart[index].quantity += delta
        if cart[index].quantity <= 0 { cart.remove(at: index) }
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
        bobaStates.removeValue(forKey: id)
        corndogStates.removeValue(forKey: id)
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
            let inserted = try await SupabaseService.shared.insertOrders(rows)

            // Optimistically apply using the server-confirmed rows (real ids) —
            // other devices' postgres_changes echo of this same insert will
            // carry the same ids, so it'll just no-op when it arrives.
            mergeInsert(orderNumber: orderNumber, rows: inserted)
            cart.removeAll()
            phone = ""
            couponApplied = false
            paymentMethod = .cash

            // Best-effort print
            await tryPrint(orderNumber: orderNumber, items: inserted)
        } catch {
            sendError = (error as? LocalizedError)?.errorDescription ?? "Order failed to save."
        }
    }

    func reprint(orderNumber: Int) async {
        guard let group = history.first(where: { $0.orderNumber == orderNumber }) else { return }
        await tryPrint(orderNumber: orderNumber, items: group.items)
    }

    private func tryPrint(orderNumber: Int, items: [Order]) async {
        // Split: real items get grouped + summed; discount rows treated separately.
        let productItems = items.filter { $0.type != .discount }
        let discountRows = items.filter { $0.type == .discount }

        struct Bucket { let name: String; let price: Double; var qty: Int }
        var grouped: [String: Bucket] = [:]
        for item in productItems {
            if var b = grouped[item.name] {
                b.qty += 1
                grouped[item.name] = b
            } else {
                grouped[item.name] = .init(name: item.name, price: item.price, qty: 1)
            }
        }
        let lines = grouped.values
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
            orderNumber: orderNumber,
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

    func cycleItem(_ id: Order.ID) {
        guard let item = history.lazy.flatMap(\.items).first(where: { $0.id == id }) else { return }
        switch item.type {
        case .boba:
            bobaStates[id] = (bobaStates[id] ?? .new).next
        case .corndog:
            corndogStates[id] = (corndogStates[id] ?? .received).next
        case .discount:
            break
        }
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
