import Foundation

enum SupabaseError: Error, LocalizedError {
    case invalidURL
    case http(Int, String)
    case decoding(Error)
    case missingConfig

    var errorDescription: String? {
        switch self {
        case .invalidURL:        "Invalid Supabase URL."
        case .http(let s, let m): "HTTP \(s): \(m)"
        case .decoding(let e):   "Decoding failed: \(e.localizedDescription)"
        case .missingConfig:     "Set Supabase URL/anon key in Secrets.swift."
        }
    }
}

actor SupabaseService {
    static let shared = SupabaseService()

    private let session: URLSession
    private let baseURL: URL?
    private let anonKey: String

    private init() {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 15
        self.session = URLSession(configuration: cfg)
        self.baseURL = URL(string: Secrets.supabaseURL)
        self.anonKey = Secrets.supabaseAnonKey
    }

    private func makeRequest(
        path: String,
        method: String,
        query: [URLQueryItem] = [],
        body: Data? = nil,
        preferReturn: Bool = false
    ) throws -> URLRequest {
        guard let baseURL,
              !Secrets.supabaseURL.contains("YOUR-PROJECT-REF"),
              !anonKey.contains("YOUR-SUPABASE-ANON-KEY") else {
            throw SupabaseError.missingConfig
        }
        var comps = URLComponents(url: baseURL.appendingPathComponent(path),
                                  resolvingAgainstBaseURL: false)
        comps?.queryItems = query.isEmpty ? nil : query
        guard let url = comps?.url else { throw SupabaseError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if preferReturn {
            req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        }
        req.httpBody = body
        return req
    }

    private func run<T: Decodable>(_ req: URLRequest, as: T.Type) async throws -> T {
        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw SupabaseError.http(0, "no response") }
        guard (200..<300).contains(http.statusCode) else {
            throw SupabaseError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw SupabaseError.decoding(error) }
    }

    // MARK: - Orders

    /// One line-item row as the `orders` table expects it. Shared by
    /// `insertOrders` and `replaceOrderItems` so the column list lives in
    /// exactly one place.
    private struct InsertRow: Encodable {
        let orderNumber: Int
        let name: String
        let price: Double
        let type: String
        let timestamp: String
        let phone: String?
        let paymentMethod: String?
        let quantity: Int?

        init(_ order: Order) {
            orderNumber = order.orderNumber
            name = order.name
            price = order.price
            type = order.type.rawValue
            timestamp = order.timestamp
            phone = order.phone
            paymentMethod = order.paymentMethod
            quantity = order.quantity
        }
    }

    /// `[start, end)` bounds for today as ISO8601 strings.
    ///
    /// Every order query is day-scoped because `orderNumber` resets to 1 each
    /// day (see `nextOrderNumber()`), so a number alone never identifies a
    /// single order.
    private func todayBounds() -> (start: String, end: String) {
        let cal = Calendar.current
        let start = cal.startOfDay(for: Date())
        let end = cal.date(byAdding: .day, value: 1, to: start) ?? start
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return (iso.string(from: start), iso.string(from: end))
    }

    /// Returns today's orders grouped by orderNumber, newest order first.
    func todaysOrderGroups() async throws -> [OrderGroup] {
        let bounds = todayBounds()
        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "GET",
            query: [
                .init(name: "select", value: "*"),
                .init(name: "timestamp", value: "gte.\(bounds.start)"),
                .init(name: "timestamp", value: "lt.\(bounds.end)"),
                .init(name: "order", value: "orderNumber.desc,timestamp.asc"),
            ]
        )
        let rows = try await run(req, as: [Order].self)

        var buckets: [Int: [Order]] = [:]
        for row in rows { buckets[row.orderNumber, default: []].append(row) }
        return buckets.keys.sorted(by: >).map { key in
            OrderGroup(orderNumber: key, items: buckets[key] ?? [])
        }
    }

    /// Same grouping as `todaysOrderGroups()` but bounded to the newest
    /// `limit` order groups via the `recent_order_groups` Postgres function
    /// — groups (not raw rows) are limited, so a multi-item order is never
    /// split across the cutoff. Meant for frequent catch-up refreshes
    /// (safety poll, foreground return) where the full day's payload would
    /// otherwise grow unbounded through a shift; callers should merge the
    /// result into existing state rather than replace it, since older
    /// groups beyond the limit are intentionally omitted, not gone.
    func recentOrderGroups(limit: Int = 20) async throws -> [OrderGroup] {
        let bounds = todayBounds()
        struct Params: Encodable {
            let range_start: String
            let range_end: String
            let group_limit: Int
        }
        let body = try JSONEncoder().encode(Params(
            range_start: bounds.start,
            range_end: bounds.end,
            group_limit: limit
        ))
        let req = try makeRequest(path: "/rest/v1/rpc/recent_order_groups", method: "POST", body: body)
        let rows = try await run(req, as: [Order].self)

        var buckets: [Int: [Order]] = [:]
        for row in rows { buckets[row.orderNumber, default: []].append(row) }
        return buckets.keys.sorted(by: >).map { key in
            OrderGroup(orderNumber: key, items: buckets[key] ?? [])
        }
    }

    /// Fetch all orders (used by sales summary).
    func allOrders() async throws -> [Order] {
        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "GET",
            query: [
                .init(name: "select", value: "*"),
                .init(name: "order", value: "timestamp.desc"),
            ]
        )
        return try await run(req, as: [Order].self)
    }

    /// Atomically computes the next order number for today via the
    /// `next_order_number` Postgres function, which serializes concurrent
    /// callers (any device, web or app) behind an advisory lock scoped to
    /// the day — collisions are structurally impossible rather than
    /// avoided by retrying, and it's a single round trip instead of the
    /// old client-side read-check-retry loop's worst case of 10.
    func nextOrderNumber() async throws -> Int {
        let bounds = todayBounds()
        struct Params: Encodable {
            let range_start: String
            let range_end: String
        }
        let body = try JSONEncoder().encode(Params(
            range_start: bounds.start,
            range_end: bounds.end
        ))
        let req = try makeRequest(path: "/rest/v1/rpc/next_order_number", method: "POST", body: body)
        return try await run(req, as: Int.self)
    }

    /// Returns the server-confirmed rows (with their real `id`s) so callers can
    /// use them for optimistic local state that matches what Realtime will echo.
    func insertOrders(_ orders: [Order]) async throws -> [Order] {
        let payload = orders.map(InsertRow.init)
        let body = try JSONEncoder().encode(payload)
        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "POST",
            body: body,
            preferReturn: true
        )
        return try await run(req, as: [Order].self)
    }

    /// Returns the updated rows so callers can patch local state in place
    /// instead of re-fetching.
    ///
    /// `orderNumber` resets to 1 each day (see `nextOrderNumber()`), so it's
    /// only unique *within a day* — without the timestamp bounds this would
    /// match every past day's order sharing the same number too, both
    /// overwriting their phone number in the DB and, since callers merge the
    /// returned rows straight into `history`, briefly flooding today's order
    /// card with unrelated old items until the next full refresh corrects it.
    func updateOrderPhone(orderNumber: Int, phone: String?) async throws -> [Order] {
        struct Patch: Encodable { let phone: String? }
        let body = try JSONEncoder().encode(Patch(phone: (phone?.isEmpty == false) ? phone : nil))

        let bounds = todayBounds()
        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "PATCH",
            query: [
                .init(name: "orderNumber", value: "eq.\(orderNumber)"),
                .init(name: "timestamp", value: "gte.\(bounds.start)"),
                .init(name: "timestamp", value: "lt.\(bounds.end)"),
            ],
            body: body,
            preferReturn: true
        )
        return try await run(req, as: [Order].self)
    }

    /// Replaces every line-item row of `orderNumber` with `rows`, atomically,
    /// via the `replace_order_items` Postgres function.
    ///
    /// Editing a submitted order means changing which rows exist, not patching
    /// them in place — quantities map to row *counts* in this schema. Doing
    /// that as a client-side DELETE-then-INSERT would destroy a paid order
    /// outright if the app died between the two calls, so both happen inside a
    /// single transaction: either the whole edit lands or none of it does.
    ///
    /// The function is SECURITY DEFINER because RLS grants anon no DELETE on
    /// `orders`; that keeps the narrow "replace one order" capability without
    /// opening blanket deletes to every device holding the anon key.
    ///
    /// Returns the server-confirmed replacement rows, which carry fresh `id`s —
    /// callers must rebuild local state from these rather than assuming the old
    /// ids survived.
    func replaceOrderItems(orderNumber: Int, rows: [Order]) async throws -> [Order] {
        guard !rows.isEmpty else {
            throw SupabaseError.http(400, "Refusing to replace order #\(orderNumber) with no items.")
        }
        let bounds = todayBounds()
        struct Params: Encodable {
            let target_order_number: Int
            let range_start: String
            let range_end: String
            let new_rows: [InsertRow]
        }
        let body = try JSONEncoder().encode(Params(
            target_order_number: orderNumber,
            range_start: bounds.start,
            range_end: bounds.end,
            new_rows: rows.map(InsertRow.init)
        ))
        let req = try makeRequest(path: "/rest/v1/rpc/replace_order_items", method: "POST", body: body)
        return try await run(req, as: [Order].self)
    }

    // MARK: - Print jobs
    //
    // The web till enqueues a row per order; this device claims it, prints it,
    // and flips it to 'printed'. Lives here rather than in its own service
    // because `makeRequest`/`run` are file-private — one auth path, not two.

    private static let printJobsPath = "/rest/v1/print_jobs"

    private static func isoNow(_ date: Date = Date()) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return iso.string(from: date)
    }

    /// Oldest-first so receipts print in the order they were taken.
    func pendingPrintJobs(limit: Int = 20) async throws -> [PrintJobRow] {
        let req = try makeRequest(
            path: Self.printJobsPath,
            method: "GET",
            query: [
                URLQueryItem(name: "status", value: "eq.pending"),
                URLQueryItem(name: "order", value: "created_at.asc"),
                URLQueryItem(name: "limit", value: String(limit)),
            ]
        )
        return try await run(req, as: [PrintJobRow].self)
    }

    /// Claimed jobs whose owner went away mid-print, so they can be reset.
    func stalePrintJobs(olderThan cutoff: Date) async throws -> [PrintJobRow] {
        let req = try makeRequest(
            path: Self.printJobsPath,
            method: "GET",
            query: [
                URLQueryItem(name: "status", value: "eq.claimed"),
                URLQueryItem(name: "claimed_at", value: "lt.\(Self.isoNow(cutoff))"),
            ]
        )
        return try await run(req, as: [PrintJobRow].self)
    }

    /// Atomically takes ownership of a pending job.
    ///
    /// The `status=eq.pending` filter is the whole mechanism: PostgREST turns
    /// it into a conditional UPDATE, so exactly one device can win. An empty
    /// array back means another device claimed it first — not an error.
    ///
    /// - Returns: `true` if this device won the job.
    func claimPrintJob(id: String, deviceName: String) async throws -> Bool {
        struct Patch: Encodable {
            let status: String
            let claimed_by: String
            let claimed_at: String
        }
        let body = try JSONEncoder().encode(Patch(
            status: "claimed",
            claimed_by: deviceName.isEmpty ? "unknown" : deviceName,
            claimed_at: Self.isoNow()
        ))
        let req = try makeRequest(
            path: Self.printJobsPath,
            method: "PATCH",
            query: [
                URLQueryItem(name: "id", value: "eq.\(id)"),
                URLQueryItem(name: "status", value: "eq.pending"),
            ],
            body: body,
            preferReturn: true
        )
        return try await run(req, as: [PrintJobRow].self).isEmpty == false
    }

    /// Called only after the printer transport confirms. Marking at enqueue
    /// time would let an app reinstall drop a receipt the table calls printed.
    func markPrintJobPrinted(id: String) async throws {
        struct Patch: Encodable {
            let status: String
            let printed_at: String
            let last_error: String?
        }
        let body = try JSONEncoder().encode(Patch(
            status: "printed",
            printed_at: Self.isoNow(),
            last_error: nil
        ))
        let req = try makeRequest(
            path: Self.printJobsPath,
            method: "PATCH",
            query: [URLQueryItem(name: "id", value: "eq.\(id)")],
            body: body,
            preferReturn: true
        )
        _ = try await run(req, as: [PrintJobRow].self)
    }

    /// Releases a job back to the queue, or retires it once `attempts` hits
    /// the ceiling so one bad job cannot cycle forever.
    func releasePrintJob(id: String, attempts: Int, message: String?, retire: Bool) async throws {
        struct Patch: Encodable {
            let status: String
            let attempts: Int
            let last_error: String?
            let claimed_by: String?
            let claimed_at: String?
        }
        let body = try JSONEncoder().encode(Patch(
            status: retire ? "failed" : "pending",
            attempts: attempts,
            last_error: message,
            claimed_by: nil,
            claimed_at: nil
        ))
        let req = try makeRequest(
            path: Self.printJobsPath,
            method: "PATCH",
            query: [URLQueryItem(name: "id", value: "eq.\(id)")],
            body: body,
            preferReturn: true
        )
        _ = try await run(req, as: [PrintJobRow].self)
    }

    /// The line rows of one order, matched on the exact pair that identifies
    /// it. `orderNumber` alone repeats daily, so both halves are required.
    func orderRows(orderNumber: Int, timestamp: String) async throws -> [Order] {
        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "GET",
            query: [
                URLQueryItem(name: "orderNumber", value: "eq.\(orderNumber)"),
                URLQueryItem(name: "timestamp", value: "eq.\(timestamp)"),
            ]
        )
        return try await run(req, as: [Order].self)
    }
}
