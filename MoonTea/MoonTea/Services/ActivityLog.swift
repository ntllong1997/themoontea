import Foundation
import os

/// Records what the app does — printer and card-reader connections, prints,
/// payments, orders, edits, station taps, app lifecycle — to the Supabase
/// `activity_log` table, where staff read it at /admin/logs on the website.
///
/// Every entry is written to a file on the device first and uploaded in small
/// batches a couple of seconds later, so logging never waits on the network
/// and nothing is lost offline or if the app is killed: unsent entries upload
/// on the next launch. Uploads retry with backoff until Supabase accepts them.
/// Each entry carries its own UUID, the table's primary key, so a retry after
/// a lost response can't double a row: the database refuses the repeat
/// (409), and the upload then goes one entry at a time, dropping the ones
/// already stored.
///
/// Entries also go to the unified log (subsystem "MoonTea", category = the
/// entry's category), so they show in Xcode's console and Console.app too.
///
/// Callable from any thread. Don't log phone numbers or other customer
/// details — the log is meant to be safe to read on any staff device.
// `nonisolated`: the project defaults new types to `@MainActor`, but this is
// called from the printer's background queue and other actors. All mutable
// state is confined to `queue`.
nonisolated final class ActivityLog: @unchecked Sendable {
    static let shared = ActivityLog()

    enum Level: String, Codable, Sendable {
        case debug, info, warning, error

        var osLogType: OSLogType {
            switch self {
            case .debug:   .debug
            case .info:    .info
            case .warning: .default
            case .error:   .error
            }
        }
    }

    /// Lowercase, so they satisfy the table's `category` check.
    enum Category: String, Codable, Sendable {
        case app, printer, reader, payment, order, station, sync
    }

    struct Entry: Codable, Sendable {
        let id: UUID
        let createdAt: String
        let source: String
        let deviceID: String
        let deviceName: String
        let appVersion: String
        let sessionID: UUID
        let location: Int
        let level: Level
        let category: Category
        let message: String
        /// Never nil: PostgREST rejects a batch unless every row has the same
        /// keys, and an optional would be left out of the JSON when empty.
        let details: [String: String]
    }

    // MARK: - Logging

    func debug(_ category: Category, _ message: String, _ details: [String: Any] = [:]) {
        log(.debug, category, message, details)
    }

    func info(_ category: Category, _ message: String, _ details: [String: Any] = [:]) {
        log(.info, category, message, details)
    }

    func warning(_ category: Category, _ message: String, _ details: [String: Any] = [:]) {
        log(.warning, category, message, details)
    }

    func error(_ category: Category, _ message: String, _ details: [String: Any] = [:]) {
        log(.error, category, message, details)
    }

    func log(_ level: Level, _ category: Category, _ message: String, _ details: [String: Any] = [:]) {
        // Stringify on the caller's thread, so nothing non-Sendable crosses
        // onto `queue`.
        let flat = details.mapValues { Self.describe($0) }
        let entry = Entry(
            id: UUID(),
            createdAt: Self.timestamp(Date()),
            source: "ios",
            deviceID: deviceID,
            deviceName: deviceName,
            appVersion: appVersion,
            sessionID: sessionID,
            location: AppConstants.locationID,
            level: level,
            category: category,
            message: String(message.prefix(500)),
            details: flat
        )

        let suffix = flat.sorted { $0.key < $1.key }.map { " \($0.key)=\($0.value)" }.joined()
        logger(for: category).log(level: level.osLogType, "\(message, privacy: .public)\(suffix, privacy: .public)")

        queue.async { self.append(entry) }
    }

    /// Uploads whatever is waiting now instead of after the usual short
    /// delay, and forgets any backoff. Called on app foreground/background.
    func flush() {
        queue.async {
            self.retryAttempt = 0
            self.uploadNext()
        }
    }

    // MARK: - Device identity

    /// A random ID made on first launch and kept, so one iPad's entries can
    /// be told apart from another's. (iOS no longer gives apps the device's
    /// user-facing name without a special entitlement.)
    private let deviceID: String
    /// Hardware model, e.g. "iPad13,18".
    private let deviceName: String
    private let appVersion: String
    /// New every launch, to tell one run of the app from the next.
    private let sessionID = UUID()

    private static let deviceIDKey = "activityLog.deviceID"

    // MARK: - Queue state (confined to `queue`)

    private let queue = DispatchQueue(label: "activity-log", qos: .utility)
    private var pending: [Entry] = []
    private var isUploading = false
    private var uploadScheduled = false
    private var retryAttempt = 0
    /// Drops to 1 after Supabase refuses a batch's content, to find and drop
    /// the offending entries (malformed, or already stored by an upload whose
    /// response was lost) without losing the good ones around them.
    private var batchLimit = ActivityLog.maxBatch
    private var droppedForSpace = 0

    private static let maxBatch = 200
    /// Oldest entries are dropped past this, so a device offline for days
    /// can't grow the file without bound.
    private static let maxPending = 5_000
    private static let batchDelay: TimeInterval = 2
    private static let retryBackoff: [TimeInterval] = [5, 15, 30, 60, 120]

    private var loggers: [Category: Logger] = [:]
    private let loggersLock = NSLock()

    private init() {
        let defaults = UserDefaults.standard
        if let saved = defaults.string(forKey: Self.deviceIDKey) {
            deviceID = saved
        } else {
            let made = UUID().uuidString.lowercased()
            defaults.set(made, forKey: Self.deviceIDKey)
            deviceID = made
        }
        deviceName = Self.hardwareModel()
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        appVersion = "\(version) (\(build))"

        queue.async {
            self.pending = Self.loadFromDisk()
            if !self.pending.isEmpty { self.scheduleUpload(after: Self.batchDelay) }
        }
    }

    private func logger(for category: Category) -> Logger {
        loggersLock.lock()
        defer { loggersLock.unlock() }
        if let existing = loggers[category] { return existing }
        let made = Logger(subsystem: "MoonTea", category: category.rawValue)
        loggers[category] = made
        return made
    }

    // MARK: - Buffering

    private func append(_ entry: Entry) {
        pending.append(entry)
        if pending.count > Self.maxPending {
            let overflow = pending.count - Self.maxPending
            pending.removeFirst(overflow)
            droppedForSpace += overflow
            saveToDisk()
        } else {
            appendToDisk(entry)
        }
        if !isUploading && retryAttempt == 0 {
            scheduleUpload(after: Self.batchDelay)
        }
    }

    private func scheduleUpload(after delay: TimeInterval) {
        guard !uploadScheduled else { return }
        uploadScheduled = true
        queue.asyncAfter(deadline: .now() + delay) {
            self.uploadScheduled = false
            self.uploadNext()
        }
    }

    // MARK: - Upload

    private func uploadNext() {
        guard !isUploading, !pending.isEmpty else { return }

        if droppedForSpace > 0 {
            // Say so in the log itself, so a gap isn't mistaken for quiet.
            let note = droppedForSpace
            droppedForSpace = 0
            log(.warning, .app, "Dropped oldest unsent log entries (device was offline too long)", ["count": note])
        }

        let batch = Array(pending.prefix(batchLimit))
        let body: Data
        do {
            body = try Self.encoder.encode(batch)
        } catch {
            // Can't happen with these types; drop the batch rather than wedge.
            remove(batch)
            return
        }

        isUploading = true
        Task {
            let failure: Error?
            do {
                try await SupabaseService.shared.insertActivityLogs(body)
                failure = nil
            } catch {
                failure = error
            }
            self.queue.async { self.finishUpload(batch, failure: failure) }
        }
    }

    private func finishUpload(_ batch: [Entry], failure: Error?) {
        isUploading = false

        guard let failure else {
            remove(batch)
            retryAttempt = 0
            if pending.isEmpty {
                batchLimit = Self.maxBatch
            } else {
                uploadNext()
            }
            return
        }

        // Postgres refused the content of an entry: malformed, or a repeat
        // of one already stored (an earlier upload went through but its
        // response was lost). Inserts are all or nothing, so retrying the
        // same batch would fail forever. Narrow it down to single entries
        // and drop just the refused ones. Anything else (offline, timeout,
        // server error, table not created yet) keeps every entry and tries
        // again later.
        if let supabaseError = failure as? SupabaseError,
           case .http(let status, let message) = supabaseError,
           Self.isRejectedContent(status: status, body: message) {
            if batch.count > 1 {
                batchLimit = 1
                uploadNext()
            } else {
                remove(batch)
                batchLimit = Self.maxBatch
                if status != 409 {
                    logger(for: .app).error("Activity log entry rejected by Supabase (\(status, privacy: .public)): \(message, privacy: .public)")
                }
                if !pending.isEmpty { uploadNext() }
            }
            return
        }

        let delay = Self.retryBackoff[min(retryAttempt, Self.retryBackoff.count - 1)]
        retryAttempt += 1
        // Not logged through `log(...)`: a failure to upload logs would only
        // add more entries waiting on the same broken upload.
        logger(for: .app).notice("Activity log upload failed, retrying in \(Int(delay), privacy: .public)s: \(failure.localizedDescription, privacy: .public)")
        scheduleUpload(after: delay)
    }

    private func remove(_ batch: [Entry]) {
        let sent = Set(batch.map(\.id))
        pending.removeAll { sent.contains($0.id) }
        saveToDisk()
    }

    // MARK: - Disk
    //
    // One JSON entry per line, so recording an entry is a cheap append
    // instead of rewriting the file. It's rewritten whole only after an
    // upload or when trimming — both small, since uploads keep it short.

    // Only ever used on `queue`.
    nonisolated(unsafe) private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()

    nonisolated(unsafe) private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    private static var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("activity-log-pending.jsonl")
    }

    private static func loadFromDisk() -> [Entry] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        // A line half-written when the app was killed fails to decode and is
        // skipped; the rest survive.
        let entries = data.split(separator: UInt8(ascii: "\n")).compactMap { line in
            try? decoder.decode(Entry.self, from: Data(line))
        }
        return Array(entries.suffix(maxPending))
    }

    private func appendToDisk(_ entry: Entry) {
        guard var line = try? Self.encoder.encode(entry) else { return }
        line.append(UInt8(ascii: "\n"))
        let url = Self.fileURL
        if let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            do {
                try handle.seekToEnd()
                try handle.write(contentsOf: line)
            } catch {
                saveToDisk()
            }
        } else {
            saveToDisk()
        }
    }

    private func saveToDisk() {
        let url = Self.fileURL
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        var data = Data()
        for entry in pending {
            guard let line = try? Self.encoder.encode(entry) else { continue }
            data.append(line)
            data.append(UInt8(ascii: "\n"))
        }
        try? data.write(to: url, options: .atomic)
    }

    // MARK: - Helpers

    private static func timestamp(_ date: Date) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return iso.string(from: date)
    }

    /// True when Postgres refused the rows themselves: a data exception
    /// (class 22, e.g. a value too long) or a constraint violation (class 23,
    /// e.g. a failed check, or 23505 for an id that's already stored). Other
    /// 400s — a missing column, say — are setup problems that would reject
    /// every entry, so those are kept and retried rather than dropped.
    private static func isRejectedContent(status: Int, body: String) -> Bool {
        guard status == 400 || status == 409 else { return false }
        return body.contains("\"code\":\"22") || body.contains("\"code\":\"23")
    }

    private static func describe(_ value: Any) -> String {
        let text: String
        switch value {
        case let string as String: text = string
        case let error as Error:   text = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        case let double as Double: text = String(format: "%.2f", double)
        default:                   text = String(describing: value)
        }
        return String(text.prefix(1_000))
    }

    private static func hardwareModel() -> String {
        var info = utsname()
        uname(&info)
        let model = withUnsafeBytes(of: &info.machine) { buffer in
            String(decoding: buffer.prefix(while: { $0 != 0 }), as: UTF8.self)
        }
        return model.isEmpty ? "unknown" : model
    }
}
