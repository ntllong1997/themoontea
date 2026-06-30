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

    // Item state per (order, item index)
    var bobaStates: [ItemKey: BobaState] = [:]
    var corndogStates: [ItemKey: CorndogState] = [:]

    // Notify tracking + per-order phone overrides
    var notifiedOrders: Set<Int> = []
    var phoneOverrides: [Int: String] = [:]

    var sendError: String = ""
    var isSending: Bool = false
    var phoneError: String = ""

    private let realtime = SupabaseRealtime(channelName: "orders")
    private var safetyPollTask: Task<Void, Never>?

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

    /// Initial fetch + subscribe to broadcast pings on the `orders` channel.
    func startPolling() {
        Task { await refreshHistory() }
        Task { [weak self] in
            guard let self else { return }
            await self.realtime.subscribe { [weak self] in
                Task { @MainActor in await self?.refreshHistory() }
            }
        }
        startSafetyPoll()
    }

    func stopPolling() {
        Task { [realtime] in await realtime.unsubscribe() }
        safetyPollTask?.cancel()
        safetyPollTask = nil
    }

    /// Belt-and-suspenders: if the websocket silently drops we still refresh
    /// once a minute. Realtime hits give us sub-second freshness in the common case.
    private func startSafetyPoll() {
        safetyPollTask?.cancel()
        safetyPollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                await self?.refreshHistory()
            }
        }
    }

    func refreshHistory() async {
        do {
            let groups = try await SupabaseService.shared.todaysOrderGroups()
            self.history = groups
        } catch {
            print("[order] refresh failed: \(error)")
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
            try await SupabaseService.shared.insertOrders(rows)

            // Optimistically prepend to history
            history.insert(OrderGroup(orderNumber: orderNumber, items: rows), at: 0)
            cart.removeAll()
            phone = ""
            couponApplied = false
            paymentMethod = .cash

            // Tell other devices to refresh
            Task { [realtime] in await realtime.broadcastChange() }

            // Best-effort print
            await tryPrint(orderNumber: orderNumber, items: rows)
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

    func cycleItem(orderNumber: Int, index: Int) {
        guard let group = history.first(where: { $0.orderNumber == orderNumber }),
              group.items.indices.contains(index) else { return }
        let key = ItemKey(orderNumber: orderNumber, itemIndex: index)
        switch group.items[index].type {
        case .boba:
            bobaStates[key] = (bobaStates[key] ?? .new).next
        case .corndog:
            corndogStates[key] = (corndogStates[key] ?? .received).next
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
            try await SupabaseService.shared.updateOrderPhone(orderNumber: orderNumber, phone: phone)
            // Refresh so history carries the new phone from DB, then drop the override.
            await refreshHistory()
            phoneOverrides.removeValue(forKey: orderNumber)
            Task { [realtime] in await realtime.broadcastChange() }
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
