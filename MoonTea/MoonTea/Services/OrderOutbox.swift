import Foundation
import Network
import Observation

/// One change to an order that still has to reach Supabase.
nonisolated struct OutboxEntry: Codable, Identifiable, Sendable {
    enum Operation: Codable, Sendable {
        /// A new order's rows.
        case insert(rows: [Order])
        /// An edit: the order's full new set of rows.
        case replace(rows: [Order])
        case updatePhone(phone: String?)
    }

    var id = UUID()
    let orderUUID: UUID
    let orderNumber: Int
    let operation: Operation
    var createdAt = Date()
}

/// The upload list: every new order, edit and phone change is saved here on
/// the phone first and uploaded in the background, so taking an order never
/// waits on the network.
///
/// Entries upload strictly in the order they were made — an order's insert
/// always lands before its edits. An entry is removed only once Supabase
/// confirms it; on any failure the same head entry is retried with backoff,
/// and sooner whenever the network comes back or the app returns to the
/// foreground. Every operation is safe to repeat (see `SupabaseService`), so a
/// retry after a timeout that had actually landed never doubles an order.
///
/// Nothing is ever dropped: an entry Supabase rejects outright stays at the
/// head, blocking the ones behind it, and `lastError` says why, so the problem
/// is visible instead of orders quietly going missing.
@MainActor
@Observable
final class OrderOutbox {
    static let shared = OrderOutbox()

    private(set) var entries: [OutboxEntry]
    /// Why the newest upload attempt failed; cleared by the next success.
    private(set) var lastError: String?

    @ObservationIgnored private var flushTask: Task<Void, Never>?
    @ObservationIgnored private var retryTask: Task<Void, Never>?
    @ObservationIgnored private var retryDelaySeconds: UInt64 = OrderOutbox.firstRetrySeconds
    private let pathMonitor = NWPathMonitor()

    private static let firstRetrySeconds: UInt64 = 2
    private static let maxRetrySeconds: UInt64 = 30

    private init() {
        entries = OrderOutboxStore.load()
        // Called on the monitor's own queue, never the main thread.
        pathMonitor.pathUpdateHandler = { @Sendable path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in OrderOutbox.shared.nudge() }
        }
        pathMonitor.start(queue: DispatchQueue(label: "MoonTea.OrderOutbox.path"))
        nudge()
    }

    /// Orders with at least one change still waiting to upload.
    var waitingOrderCount: Int { Set(entries.map(\.orderUUID)).count }

    /// Orders whose local copy is newer than Supabase's. Server rows for these
    /// must not overwrite what the phone shows until the upload lands.
    var waitingOrderUUIDs: Set<UUID> { Set(entries.map(\.orderUUID)) }

    func enqueue(_ entry: OutboxEntry) {
        entries.append(entry)
        OrderOutboxStore.save(entries)
        nudge()
    }

    /// Try uploading now: something changed that may have unblocked the queue
    /// (a new entry, the network coming back, the app returning to the
    /// foreground). Resets the backoff.
    func nudge() {
        retryTask?.cancel()
        retryTask = nil
        retryDelaySeconds = Self.firstRetrySeconds
        startFlush()
    }

    private func startFlush() {
        guard flushTask == nil, !entries.isEmpty else { return }
        flushTask = Task { [weak self] in
            await self?.flush()
            self?.flushTask = nil
        }
    }

    private func flush() async {
        while let entry = entries.first {
            do {
                try await Self.upload(entry)
            } catch {
                lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                print("[outbox] upload of order #\(entry.orderNumber) failed: \(error)")
                scheduleRetry()
                return
            }
            entries.removeAll { $0.id == entry.id }
            OrderOutboxStore.save(entries)
            lastError = nil
            retryDelaySeconds = Self.firstRetrySeconds
        }
    }

    private func scheduleRetry() {
        let delay = retryDelaySeconds
        retryDelaySeconds = min(retryDelaySeconds * 2, Self.maxRetrySeconds)
        retryTask?.cancel()
        retryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: delay * 1_000_000_000)
            guard !Task.isCancelled else { return }
            self?.startFlush()
        }
    }

    private nonisolated static func upload(_ entry: OutboxEntry) async throws {
        switch entry.operation {
        case .insert(let rows):
            try await SupabaseService.shared.uploadOrderRows(rows)
        case .replace(let rows):
            try await SupabaseService.shared.replaceOrderItems(orderUUID: entry.orderUUID, rows: rows)
        case .updatePhone(let phone):
            try await SupabaseService.shared.updateOrderPhone(orderUUID: entry.orderUUID, phone: phone)
        }
    }
}

/// JSON-file persistence for the upload list, so orders waiting to upload
/// survive the app being closed, crashing, or the phone restarting.
// `nonisolated`: the project defaults new types to `@MainActor` otherwise.
nonisolated enum OrderOutboxStore {
    private static let fileName = "pending-order-uploads.json"

    private static var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent(fileName)
    }

    static func load() -> [OutboxEntry] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        do {
            return try JSONDecoder().decode([OutboxEntry].self, from: data)
        } catch {
            // Never silently start empty over a file we couldn't read — that
            // would lose the orders in it. Keep the file aside for recovery.
            print("[outbox] could not read \(fileName): \(error)")
            let backup = fileURL.deletingPathExtension().appendingPathExtension("unreadable-\(Int(Date().timeIntervalSince1970)).json")
            try? FileManager.default.copyItem(at: fileURL, to: backup)
            return []
        }
    }

    static func save(_ entries: [OutboxEntry]) {
        let dir = fileURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        guard let data = try? JSONEncoder().encode(entries) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
