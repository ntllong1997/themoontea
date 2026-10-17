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

    /// For writes whose response body is not needed (`return=minimal`).
    private func runNoContent(_ req: URLRequest) async throws {
        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw SupabaseError.http(0, "no response") }
        guard (200..<300).contains(http.statusCode) else {
            throw SupabaseError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
    }

    // MARK: - Orders

    /// One line-item row as the `orders` table expects it. Shared by
    /// `uploadOrderRows` and both `replaceOrderItems` so the column list lives in
    /// exactly one place.
    ///
    /// Every key is always written, `null` included: PostgREST takes a bulk
    /// insert's columns from its rows, so rows of one order must agree on
    /// their keys. `status` is never null — the column is NOT NULL, and a row
    /// with none predates it and was paid.
    private struct InsertRow: Encodable {
        let id: UUID
        let orderNumber: Int
        let name: String
        let price: Double
        let type: String
        let timestamp: String
        let phone: String?
        let paymentMethod: String?
        let quantity: Int?
        let location = AppConstants.locationID
        let orderUUID: UUID?
        let status: String
        let paidAt: String?
        let squarePaymentID: String?
        let paymentLog: [PaymentLogEntry]

        init(_ order: Order) {
            id = order.id
            orderNumber = order.orderNumber
            name = order.name
            price = order.price
            type = order.type.rawValue
            timestamp = order.timestamp
            phone = order.phone
            paymentMethod = order.paymentMethod
            quantity = order.quantity
            orderUUID = order.orderUUID
            status = order.status ?? OrderStatus.paid.rawValue
            paidAt = order.paidAt
            squarePaymentID = order.squarePaymentID
            paymentLog = order.paymentLog ?? []
        }

        enum CodingKeys: String, CodingKey {
            case id, orderNumber, name, price, type, timestamp, phone, paymentMethod, quantity, location
            case orderUUID = "order_uuid"
            case status
            case paidAt = "paid_at"
            case squarePaymentID = "square_payment_id"
            case paymentLog = "payment_log"
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(id, forKey: .id)
            try c.encode(orderNumber, forKey: .orderNumber)
            try c.encode(name, forKey: .name)
            try c.encode(price, forKey: .price)
            try c.encode(type, forKey: .type)
            try c.encode(timestamp, forKey: .timestamp)
            try c.encode(phone, forKey: .phone)
            try c.encode(paymentMethod, forKey: .paymentMethod)
            try c.encode(quantity, forKey: .quantity)
            try c.encode(location, forKey: .location)
            try c.encode(orderUUID, forKey: .orderUUID)
            try c.encode(status, forKey: .status)
            try c.encode(paidAt, forKey: .paidAt)
            try c.encode(squarePaymentID, forKey: .squarePaymentID)
            try c.encode(paymentLog, forKey: .paymentLog)
        }
    }

    /// `[start, end)` bounds for today as ISO8601 strings.
    ///
    /// Every order query is day-scoped because `orderNumber` resets to 1 each
    /// day (see `nextOrderNumber()`), so a number alone never identifies a
    /// single order. It restarts per location too, so queries are also scoped
    /// to `AppConstants.locationID` (see `locationFilter`).
    private func todayBounds() -> (start: String, end: String) {
        let cal = Calendar.current
        let start = cal.startOfDay(for: Date())
        let end = cal.date(byAdding: .day, value: 1, to: start) ?? start
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return (iso.string(from: start), iso.string(from: end))
    }

    private let locationFilter = URLQueryItem(name: "location", value: "eq.\(AppConstants.locationID)")

    /// Returns today's orders grouped by orderNumber, newest order first.
    func todaysOrderGroups() async throws -> [OrderGroup] {
        let bounds = todayBounds()
        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "GET",
            query: [
                .init(name: "select", value: "*"),
                locationFilter,
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
            let p_location: Int
        }
        let body = try JSONEncoder().encode(Params(
            range_start: bounds.start,
            range_end: bounds.end,
            group_limit: limit,
            p_location: AppConstants.locationID
        ))
        let req = try makeRequest(path: "/rest/v1/rpc/recent_order_groups", method: "POST", body: body)
        let rows = try await run(req, as: [Order].self)

        var buckets: [Int: [Order]] = [:]
        for row in rows { buckets[row.orderNumber, default: []].append(row) }
        return buckets.keys.sorted(by: >).map { key in
            OrderGroup(orderNumber: key, items: buckets[key] ?? [])
        }
    }

    /// Fetch all of this location's paid orders (used by sales summary). A
    /// pending ticket hasn't been paid yet and a cancelled one never was.
    func allOrders() async throws -> [Order] {
        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "GET",
            query: [
                .init(name: "select", value: "*"),
                locationFilter,
                .init(name: "status", value: "eq.\(OrderStatus.paid.rawValue)"),
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
            let p_location: Int
        }
        let body = try JSONEncoder().encode(Params(
            range_start: bounds.start,
            range_end: bounds.end,
            p_location: AppConstants.locationID
        ))
        let req = try makeRequest(path: "/rest/v1/rpc/next_order_number", method: "POST", body: body)
        return try await run(req, as: Int.self)
    }

    // MARK: - Main phone ↔ website numbering

    /// Marks this phone as the one numbering this location's tickets, website
    /// orders included. Replaces any other phone's row (a takeover).
    func registerMainPhone(deviceID: String, deviceName: String) async throws {
        struct Row: Encodable {
            let location: Int
            let device_id: String
            let device_name: String
            let last_seen: String
        }
        let now = ISO8601DateFormatter().string(from: Date())
        let body = try JSONEncoder().encode([Row(location: AppConstants.locationID, device_id: deviceID, device_name: deviceName, last_seen: now)])
        var req = try makeRequest(
            path: "/rest/v1/booth_main_phone",
            method: "POST",
            query: [.init(name: "on_conflict", value: "location")],
            body: body
        )
        req.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        try await runNoContent(req)
    }

    /// Removes this phone's registration only — never one a phone that took
    /// over since has written.
    func unregisterMainPhone(deviceID: String) async throws {
        var req = try makeRequest(
            path: "/rest/v1/booth_main_phone",
            method: "DELETE",
            query: [locationFilter, .init(name: "device_id", value: "eq.\(deviceID)")]
        )
        req.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        try await runNoContent(req)
    }

    /// Website orders waiting for the main phone to number them, oldest first.
    func unansweredNumberRequests() async throws -> [UUID] {
        struct Row: Decodable { let order_uuid: UUID }
        let since = ISO8601DateFormatter().string(from: Date().addingTimeInterval(-Self.numberRequestMaxAge))
        let req = try makeRequest(
            path: "/rest/v1/ticket_number_requests",
            method: "GET",
            query: [
                .init(name: "select", value: "order_uuid"),
                locationFilter,
                .init(name: "order_number", value: "is.null"),
                .init(name: "abandoned", value: "is.false"),
                .init(name: "requested_at", value: "gte.\(since)"),
                .init(name: "order", value: "requested_at.asc"),
            ]
        )
        return try await run(req, as: [Row].self).map(\.order_uuid)
    }

    /// A website gives up well within this; older requests are left alone.
    private static let numberRequestMaxAge: TimeInterval = 60

    /// True if the request was still open and now has `number`.
    func answerNumberRequest(orderUUID: UUID, number: Int, device: String) async throws -> Bool {
        struct Params: Encodable {
            let p_order_uuid: UUID
            let p_number: Int
            let p_device: String
        }
        let body = try JSONEncoder().encode(Params(p_order_uuid: orderUUID, p_number: number, p_device: device))
        let req = try makeRequest(path: "/rest/v1/rpc/answer_ticket_number_request", method: "POST", body: body)
        return try await run(req, as: Bool.self)
    }

    /// Uploads one order's rows. Safe to call again with the same rows: each
    /// row's `id` is made on the phone, so a retry after a timeout that had in
    /// fact landed hits the primary key and is skipped instead of doubling the
    /// order. Called only by `OrderOutbox`.
    func uploadOrderRows(_ orders: [Order]) async throws {
        let body = try JSONEncoder().encode(orders.map(InsertRow.init))
        var req = try makeRequest(
            path: "/rest/v1/orders",
            method: "POST",
            query: [.init(name: "on_conflict", value: "id")],
            body: body
        )
        req.setValue("resolution=ignore-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        try await runNoContent(req)
    }

    /// Replaces every row of one order, found by its hidden `orderUUID`, via
    /// `replace_order_items_by_uuid`. Safe to repeat — the rows carry their own
    /// ids — so a queued edit can be retried until it lands. Called only by `OrderOutbox`.
    func replaceOrderItems(orderUUID: UUID, rows: [Order]) async throws {
        guard !rows.isEmpty else {
            throw SupabaseError.http(400, "Refusing to replace an order with no items.")
        }
        struct Params: Encodable {
            let target_order_uuid: UUID
            let new_rows: [InsertRow]
        }
        let body = try JSONEncoder().encode(Params(target_order_uuid: orderUUID, new_rows: rows.map(InsertRow.init)))
        var req = try makeRequest(path: "/rest/v1/rpc/replace_order_items_by_uuid", method: "POST", body: body)
        req.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        try await runNoContent(req)
    }

    /// Sets the phone on every row of one order, found by its hidden
    /// `orderUUID`, so it needs no day bounds and is safe to repeat. Called
    /// only by `OrderOutbox`.
    func updateOrderPhone(orderUUID: UUID, phone: String?) async throws {
        struct Patch: Encodable { let phone: String? }
        let body = try JSONEncoder().encode(Patch(phone: (phone?.isEmpty == false) ? phone : nil))
        var req = try makeRequest(
            path: "/rest/v1/orders",
            method: "PATCH",
            query: [.init(name: "order_uuid", value: "eq.\(orderUUID.uuidString)")],
            body: body
        )
        req.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        try await runNoContent(req)
    }

    /// Sets a ticket's whole payment state on every row of one order, found by
    /// its hidden `orderUUID`. Every field is written, nulls included, so the
    /// PATCH is safe to repeat. Called only by `OrderOutbox`.
    func updateOrderPayment(orderUUID: UUID, change: PaymentChange) async throws {
        struct Patch: Encodable {
            let change: PaymentChange
            enum CodingKeys: String, CodingKey {
                case status, paymentMethod
                case paidAt = "paid_at"
                case squarePaymentID = "square_payment_id"
                case paymentLog = "payment_log"
            }
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(change.status.rawValue, forKey: .status)
                try c.encode(change.paymentMethod, forKey: .paymentMethod)
                try c.encode(change.paidAt, forKey: .paidAt)
                try c.encode(change.squarePaymentID, forKey: .squarePaymentID)
                try c.encode(change.paymentLog, forKey: .paymentLog)
            }
        }
        let body = try JSONEncoder().encode(Patch(change: change))
        var req = try makeRequest(
            path: "/rest/v1/orders",
            method: "PATCH",
            query: [.init(name: "order_uuid", value: "eq.\(orderUUID.uuidString)")],
            body: body
        )
        req.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        try await runNoContent(req)
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
                locationFilter,
                .init(name: "timestamp", value: "gte.\(bounds.start)"),
                .init(name: "timestamp", value: "lt.\(bounds.end)"),
            ],
            body: body,
            preferReturn: true
        )
        return try await run(req, as: [Order].self)
    }
    // MARK: - Activity log

    /// Inserts a JSON array of `activity_log` rows (encoded by `ActivityLog`),
    /// all or nothing.
    ///
    /// `return=minimal` because anon may insert into the table but not read
    /// it back. That's also why this can't ask PostgREST to skip duplicate
    /// ids (`resolution=ignore-duplicates`): Postgres checks the read policy
    /// for `ON CONFLICT (id)`. A re-sent row fails with 409 instead, which
    /// `ActivityLog` handles.
    func insertActivityLogs(_ body: Data) async throws {
        var req = try makeRequest(path: "/rest/v1/activity_log", method: "POST", body: body)
        req.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw SupabaseError.http(0, "no response") }
        guard (200..<300).contains(http.statusCode) else {
            throw SupabaseError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
    }
}
