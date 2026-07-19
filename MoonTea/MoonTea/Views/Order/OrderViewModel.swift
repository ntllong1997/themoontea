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

    // Item state keyed by the unit's stable id ("<orderID>-<line>-<unit>").
    // Line items are stored collapsed with a quantity, so status is tracked
    // per expanded unit rather than per row.
    var bobaStates: [OrderUnit.ID: BobaState] = [:]
    var corndogStates: [OrderUnit.ID: CorndogState] = [:]

    // Notify tracking + per-order phone overrides, keyed by order code.
    var notifiedOrders: Set<String> = []
    var phoneOverrides: [String: String] = [:]

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

    // Totals are stored on the row now, so revenue is a plain sum rather than
    // a client-side re-derivation from line items.
    var totalRevenueToday: Double {
        history.reduce(0) { $0 + $1.total }
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
                for group in groups { mergeOrder(group) }
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

    /// Upserts a whole order by `id`. One row is one order now, so INSERT and
    /// UPDATE collapse into the same operation — there is no longer a
    /// partially-arrived order to reconcile item by item.
    private func mergeOrder(_ order: OrderGroup) {
        if let idx = history.firstIndex(where: { $0.id == order.id }) {
            history[idx] = order
        } else {
            // Keep newest-first, matching the server's created_at.desc order.
            let insertAt = history.firstIndex(where: { $0.createdAt < order.createdAt }) ?? history.count
            history.insert(order, at: insertAt)
        }
    }

    private func mergeDelete(id: OrderGroup.ID) {
        guard let idx = history.firstIndex(where: { $0.id == id }) else { return }
        for unit in history[idx].units {
            bobaStates.removeValue(forKey: unit.id)
            corndogStates.removeValue(forKey: unit.id)
        }
        history.remove(at: idx)
    }

    private func applyPostgresChange(type: String, record: [String: Any]?, oldRecord: [String: Any]?) {
        switch type {
        case "INSERT", "UPDATE":
            guard let record, let order = Self.decodeOrder(record) else { return }
            mergeOrder(order)
        case "DELETE":
            guard let oldRecord, let idString = oldRecord["id"] as? String, let id = UUID(uuidString: idString) else { return }
            mergeDelete(id: id)
        default:
            break
        }
    }

    private static func decodeOrder(_ dict: [String: Any]) -> OrderGroup? {
        guard let data = try? JSONSerialization.data(withJSONObject: dict) else { return nil }
        do {
            return try JSONDecoder().decode(OrderGroup.self, from: data)
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
            let orderCode = try await SupabaseService.shared.nextOrderCode()
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let phoneClean = phone.trimmingCharacters(in: .whitespaces)
            let phoneValue: String? = phoneClean.isEmpty ? nil : phoneClean

            // Cart lines map straight onto `items` — the quantity stays on the
            // line instead of being exploded into one row per unit.
            var items = cart.map {
                OrderItem(name: $0.name, unitPrice: $0.price, quantity: $0.quantity, type: $0.type)
            }
            if couponApplied && cartSubtotal > 0 {
                // A negative-priced line, so the stored subtotal/total and the
                // printed receipt stay consistent with each other.
                items.append(OrderItem(
                    name: CouponConstants.fourOffLabel,
                    unitPrice: -discount,
                    quantity: 1,
                    type: .discount
                ))
            }

            // Read the cart-derived totals before the cart is cleared below.
            let draft = OrderGroup(
                source: OrderSource.pos,
                orderNumber: orderCode,
                createdAt: iso.string(from: Date()),
                customerPhone: phoneValue,
                items: items,
                subtotal: subtotal,
                tax: tax,
                total: total,
                paymentMethod: paymentMethod.rawValue,
                printStatus: PrintStatus.printed
            )
            let inserted = try await SupabaseService.shared.insertOrder(draft)

            // Optimistically apply the server-confirmed row (real id) — other
            // devices' postgres_changes echo of this same insert carries the
            // same id, so it just no-ops when it arrives.
            mergeOrder(inserted)
            cart.removeAll()
            phone = ""
            couponApplied = false
            paymentMethod = .cash

            // Best-effort print
            await tryPrint(inserted)
        } catch {
            sendError = (error as? LocalizedError)?.errorDescription ?? "Order failed to save."
        }
    }

    func reprint(orderNumber: String) async {
        guard let group = history.first(where: { $0.orderNumber == orderNumber }) else { return }
        await tryPrint(group)
    }

    private func tryPrint(_ order: OrderGroup) async {
        // Line items already carry their quantity, so the old client-side
        // grouping pass (which existed only to re-collapse the exploded rows)
        // is gone.
        let productItems = order.items.filter { $0.type != .discount }
        let discountItems = order.items.filter { $0.type == .discount }

        let lines = productItems
            .sorted { $0.displayName < $1.displayName }
            .map {
                EpsonPrinter.ReceiptPayload.LineItem(
                    name: $0.displayName,
                    qty: $0.quantity,
                    price: $0.unitPrice
                )
            }

        let cartSubtotal = productItems.reduce(0) { $0 + $1.lineTotal }
        let discountAmount = -discountItems.reduce(0) { $0 + $1.lineTotal } // stored negative → positive amount
        // Totals come off the row so the receipt always matches what was saved.
        let adjustedSubtotal = order.subtotal
        let tax = order.tax
        let total = order.total

        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US")
        df.dateFormat = "MMM d, yyyy h:mm a"

        let url = CashAppStore.shared.activeURL
        let tag = url.replacingOccurrences(of: "https://cash.app/", with: "")

        let methodLabel = order.paymentMethod ?? PaymentMethod.cash.rawValue

        let payload = EpsonPrinter.ReceiptPayload(
            orderNumber: order.orderNumber,
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

        await EpsonPrinter.shared.print(payload)
    }

    // MARK: state machines

    func cycleItem(_ id: OrderUnit.ID) {
        guard let unit = history.lazy.flatMap(\.units).first(where: { $0.id == id }) else { return }
        switch unit.type {
        case .boba:
            bobaStates[id] = (bobaStates[id] ?? .new).next
        case .corndog:
            corndogStates[id] = (corndogStates[id] ?? .received).next
        case .discount:
            break
        }
    }

    // MARK: phone editing

    func phone(for orderNumber: String) -> String {
        if let override = phoneOverrides[orderNumber] { return override }
        return history.first(where: { $0.orderNumber == orderNumber })?.phone ?? ""
    }

    func savePhone(orderNumber: String, phone: String) async {
        phoneError = ""
        phoneOverrides[orderNumber] = phone  // optimistic: show immediately
        do {
            // Patch history directly from the PATCH's returned rows — other
            // devices' postgres_changes echo of this same update will apply
            // the same values again, harmlessly (last-write-wins, idempotent).
            let updated = try await SupabaseService.shared.updateOrderPhone(orderNumber: orderNumber, phone: phone)
            for row in updated { mergeOrder(row) }
            phoneOverrides.removeValue(forKey: orderNumber)
        } catch {
            // Keep the optimistic override so the phone stays visible this session.
            // The alert tells the user it wasn't persisted to the database.
            phoneError = "Couldn't save phone number. Check your connection and try again."
            print("[order] update phone failed: \(error)")
        }
    }

    func markNotified(_ orderNumber: String) {
        notifiedOrders.insert(orderNumber)
    }

    func smsBody(for orderNumber: String) -> String {
        guard let group = history.first(where: { $0.orderNumber == orderNumber }) else { return "" }
        let list = group.units.filter { $0.type != .discount }.map { "• \($0.displayName)" }.joined(separator: "\n")
        return "🌙 The Moon Tea\nOrder #\(orderNumber) is ready for pickup! 🎉\n\n\(list)\n\nSee you soon! 🧡"
    }
}
