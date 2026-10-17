import SwiftUI

/// Today's tickets, shared by every screen on this phone.
///
/// Where they come from depends on the phone's `BoothRole`:
/// - standalone and main: Supabase (a full fetch, Realtime, and a 20s safety
///   poll), with this phone's not-yet-uploaded changes laid on top;
/// - till: the main phone, over the booth link (`BoothSync`), with this
///   phone's not-yet-received changes laid on top. A till never reads
///   Supabase: the main phone's copy is newer than Supabase's.
///
/// Every change made on this phone goes through `submit(_:)`, which saves it
/// before anything else (upload list, or the till's send list) and shows it at
/// once.
@MainActor
@Observable
final class TicketStore {
    static let shared = TicketStore()

    private(set) var history: [OrderGroup] = []

    /// Called with every ticket whose rows changed (rows empty: it's gone), so
    /// the main phone can pass the change on to the tills.
    @ObservationIgnored var onTicketChanged: ((Int, [Order]) -> Void)?
    /// Called after the whole day was reloaded, so the main phone can resend it.
    @ObservationIgnored var onHistoryReplaced: (() -> Void)?

    @ObservationIgnored private let realtime = SupabaseRealtime(channelName: "orders", table: "orders")
    @ObservationIgnored private var safetyPollTask: Task<Void, Never>?
    @ObservationIgnored private var foregroundObserver: (any NSObjectProtocol)?
    @ObservationIgnored private var isSupabaseSyncOn = false

    private init() {}

    /// Starts (or stops) reading Supabase for the current role. Safe to call
    /// again, e.g. after the role changes.
    func start() {
        if TillSettings.role == .till {
            stopSupabaseSync()
        } else {
            startSupabaseSync()
        }
    }

    // MARK: - Changes made on this phone

    /// Saves a change, then shows it. On a till the main phone takes it from
    /// here (and uploads it); otherwise it goes on this phone's upload list.
    func submit(_ entry: OutboxEntry) {
        if TillSettings.role == .till {
            BoothSync.shared.sendToMain(entry)
        } else {
            OrderOutbox.shared.enqueue(entry)
        }
        apply(entry)
    }

    /// Lays one change over the tickets shown.
    func apply(_ entry: OutboxEntry) {
        switch entry.operation {
        case .insert(let rows), .replace(let rows):
            replaceGroup(orderNumber: entry.orderNumber, with: rows)
        case .updatePhone(let phone):
            setPhone(phone, onOrder: entry.orderNumber)
        case .updatePayment(let change):
            setPayment(change, onOrder: entry.orderNumber)
        case .updatePrepState(let rowID, let state):
            setPrepState(state, onRow: rowID, ofOrder: entry.orderNumber)
        }
    }

    /// Changes this phone made that Supabase (or, on a till, the main phone)
    /// doesn't have yet. Their tickets' local copies are newer.
    private var unconfirmedEntries: [OutboxEntry] {
        TillSettings.role == .till ? BoothSync.shared.pendingEntries : OrderOutbox.shared.entries
    }

    private var unconfirmedOrderUUIDs: Set<UUID> { Set(unconfirmedEntries.map(\.orderUUID)) }

    private func applyUnconfirmed(onlyOrder orderNumber: Int? = nil) {
        for entry in unconfirmedEntries where orderNumber == nil || entry.orderNumber == orderNumber {
            apply(entry)
        }
    }

    // MARK: - Tickets from the main phone (till only)

    /// The main phone's whole day, sent when the link (re)connects.
    func replaceAll(with rows: [Order]) {
        history = Self.grouped(rows)
        applyUnconfirmed()
    }

    /// One ticket as the main phone now has it.
    func replaceTicket(orderNumber: Int, rows: [Order]) {
        if rows.isEmpty {
            history.removeAll { $0.orderNumber == orderNumber }
        } else {
            replaceGroup(orderNumber: orderNumber, with: rows)
        }
        applyUnconfirmed(onlyOrder: orderNumber)
    }

    /// Every row shown, for the main phone's snapshot to a till.
    var allRows: [Order] { history.flatMap(\.items) }

    var highestOrderNumber: Int { history.map(\.orderNumber).max() ?? 0 }

    static func grouped(_ rows: [Order]) -> [OrderGroup] {
        var buckets: [Int: [Order]] = [:]
        for row in rows { buckets[row.orderNumber, default: []].append(row) }
        return buckets.keys.sorted(by: >).map { OrderGroup(orderNumber: $0, items: buckets[$0] ?? []) }
    }

    // MARK: - Supabase sync (standalone and main)

    private func startSupabaseSync() {
        guard !isSupabaseSyncOn else { return }
        isSupabaseSyncOn = true
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

    private func stopSupabaseSync() {
        guard isSupabaseSyncOn else { return }
        isSupabaseSyncOn = false
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
    /// every 20s. Uses the bounded recent-groups fetch, not a full-day refetch.
    private func startSafetyPoll() {
        safetyPollTask?.cancel()
        safetyPollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                await self?.refreshRecentHistory()
            }
        }
    }

    // refreshHistory() fetches *all* of today's orders and replaces `history`
    // wholesale: the initial load and catching up after a websocket (re)join.
    // Coalesced: a request that arrives mid-fetch folds into a follow-up.
    @ObservationIgnored private var isRefreshingHistory = false
    @ObservationIgnored private var historyRefreshRequested = false

    /// Whether the last order fetch failed. Logged only when it flips, so a
    /// phone that's offline for an hour adds two entries rather than one per
    /// 20s safety poll.
    @ObservationIgnored private var isOrderSyncFailing = false

    private func noteOrderSync(error: Error?) {
        if let error {
            guard !isOrderSyncFailing else { return }
            isOrderSyncFailing = true
            ActivityLog.shared.warning(.sync, "Couldn't load orders from Supabase", ["error": error])
        } else if isOrderSyncFailing {
            isOrderSyncFailing = false
            ActivityLog.shared.info(.sync, "Loading orders from Supabase works again")
        }
    }

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
                // The role may have changed to till while the fetch ran.
                guard isSupabaseSyncOn else { return }
                history = groups
                applyUnconfirmed()
                onHistoryReplaced?()
                noteOrderSync(error: nil)
            } catch {
                print("[order] refresh failed: \(error)")
                noteOrderSync(error: error)
            }
        } while historyRefreshRequested
    }

    /// Bounded catch-up for the safety poll and foreground return. Merges
    /// rather than replaces, since older groups are omitted, not gone.
    @ObservationIgnored private var isRefreshingRecent = false
    @ObservationIgnored private var recentRefreshRequested = false
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
                guard isSupabaseSyncOn else { return }
                let waiting = unconfirmedOrderUUIDs
                for group in groups where !Self.isWaiting(group.orderUUID, in: waiting) {
                    for item in group.items { mergeUpdate(item) }
                }
                noteOrderSync(error: nil)
            } catch {
                print("[order] recent refresh failed: \(error)")
                noteOrderSync(error: error)
            }
        } while recentRefreshRequested
    }

    private func applyPostgresChange(type: String, record: [String: Any]?, oldRecord: [String: Any]?) {
        guard isSupabaseSyncOn else { return }
        switch type {
        case "INSERT":
            guard let record, let order = Self.decodeOrder(record), Self.isThisLocation(order),
                  !Self.isWaiting(order.orderUUID, in: unconfirmedOrderUUIDs) else { return }
            mergeInsert(orderNumber: order.orderNumber, rows: [order])
        case "UPDATE":
            guard let record, let order = Self.decodeOrder(record), Self.isThisLocation(order),
                  !Self.isWaiting(order.orderUUID, in: unconfirmedOrderUUIDs) else { return }
            mergeUpdate(order)
        case "DELETE":
            guard let oldRecord, let idString = oldRecord["id"] as? String, let id = UUID(uuidString: idString) else { return }
            mergeDelete(id: id)
        default:
            break
        }
    }

    /// The realtime channel carries every location's rows, and other locations
    /// reuse the same order numbers. A row without a location is Location 1's.
    private static func isThisLocation(_ order: Order) -> Bool {
        (order.location ?? 1) == AppConstants.locationID
    }

    private static func isWaiting(_ orderUUID: UUID?, in waiting: Set<UUID>) -> Bool {
        guard let orderUUID else { return false }
        return waiting.contains(orderUUID)
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

    // MARK: - Row merges
    //
    // Shared by Realtime, refreshes and this phone's own changes. Deduped by
    // row `id`, so whichever copy of a change arrives second is a no-op.

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
        changed(orderNumber)
    }

    func mergeUpdate(_ order: Order) {
        guard let groupIdx = history.firstIndex(where: { $0.orderNumber == order.orderNumber }),
              let itemIdx = history[groupIdx].items.firstIndex(where: { $0.id == order.id }) else {
            // We missed the INSERT somehow — heal by inserting instead.
            mergeInsert(orderNumber: order.orderNumber, rows: [order])
            return
        }
        guard history[groupIdx].items[itemIdx] != order else { return }
        var items = history[groupIdx].items
        items[itemIdx] = order
        history[groupIdx] = OrderGroup(orderNumber: order.orderNumber, items: items)
        changed(order.orderNumber)
    }

    private func mergeDelete(id: Order.ID) {
        guard let groupIdx = history.firstIndex(where: { $0.items.contains(where: { $0.id == id }) }) else { return }
        let orderNumber = history[groupIdx].orderNumber
        var items = history[groupIdx].items
        items.removeAll { $0.id == id }
        if items.isEmpty {
            history.remove(at: groupIdx)
        } else {
            history[groupIdx] = OrderGroup(orderNumber: orderNumber, items: items)
        }
        changed(orderNumber)
    }

    /// Swaps a ticket's rows wholesale (or adds the ticket).
    private func replaceGroup(orderNumber: Int, with rows: [Order]) {
        guard let idx = history.firstIndex(where: { $0.orderNumber == orderNumber }) else {
            mergeInsert(orderNumber: orderNumber, rows: rows)
            return
        }
        guard history[idx].items != rows else { return }
        history[idx] = OrderGroup(orderNumber: orderNumber, items: rows)
        changed(orderNumber)
    }

    /// Writes a ticket's payment state onto every row of it. Row ids are kept,
    /// so the stations' progress on the ticket survives being paid.
    private func setPayment(_ change: PaymentChange, onOrder orderNumber: Int) {
        guard let idx = history.firstIndex(where: { $0.orderNumber == orderNumber }) else { return }
        let rows = history[idx].items.map { row -> Order in
            var row = row
            row.status = change.status.rawValue
            row.paymentMethod = change.paymentMethod
            row.paidAt = change.paidAt
            row.squarePaymentID = change.squarePaymentID
            row.paymentLog = change.paymentLog
            return row
        }
        replaceGroup(orderNumber: orderNumber, with: rows)
    }

    private func setPrepState(_ state: String?, onRow rowID: UUID, ofOrder orderNumber: Int) {
        guard let idx = history.firstIndex(where: { $0.orderNumber == orderNumber }) else { return }
        let rows = history[idx].items.map { row -> Order in
            guard row.id == rowID else { return row }
            var row = row
            row.prepState = state
            return row
        }
        replaceGroup(orderNumber: orderNumber, with: rows)
    }

    private func setPhone(_ phone: String?, onOrder orderNumber: Int) {
        guard let idx = history.firstIndex(where: { $0.orderNumber == orderNumber }) else { return }
        let rows = history[idx].items.map { row -> Order in
            var row = row
            row.phone = phone
            return row
        }
        replaceGroup(orderNumber: orderNumber, with: rows)
    }

    private func changed(_ orderNumber: Int) {
        guard let onTicketChanged else { return }
        onTicketChanged(orderNumber, history.first { $0.orderNumber == orderNumber }?.items ?? [])
    }
}
