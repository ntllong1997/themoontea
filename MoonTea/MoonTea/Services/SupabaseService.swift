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
    //
    // `public.orders` holds ONE ROW PER ORDER, with line items collapsed into
    // an `items` jsonb array. Column names are snake_case and are spelled out
    // literally in the query filters below — they are NOT run through any
    // camelCase conversion, so they must match the DB exactly.

    private static func dayBounds() -> (start: String, end: String) {
        let cal = Calendar.current
        let start = cal.startOfDay(for: Date())
        let end = cal.date(byAdding: .day, value: 1, to: start) ?? start
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return (iso.string(from: start), iso.string(from: end))
    }

    /// Today's orders, newest first.
    func todaysOrderGroups() async throws -> [OrderGroup] {
        let day = Self.dayBounds()
        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "GET",
            query: [
                .init(name: "select", value: "*"),
                .init(name: "created_at", value: "gte.\(day.start)"),
                .init(name: "created_at", value: "lt.\(day.end)"),
                .init(name: "order", value: "created_at.desc"),
            ]
        )
        return try await run(req, as: [OrderGroup].self)
    }

    /// Same as `todaysOrderGroups()` but bounded to the newest `limit` orders,
    /// for frequent catch-up refreshes (safety poll, foreground return) where
    /// the full day's payload would otherwise grow unbounded through a shift.
    ///
    /// A plain `limit` is now correct: one row *is* one order, so limiting
    /// rows can no longer split a multi-item order across the cutoff — which
    /// is exactly what the old `recent_order_groups` RPC existed to prevent.
    /// Callers should still merge rather than replace, since orders older than
    /// the limit are intentionally omitted, not gone.
    func recentOrderGroups(limit: Int = 20) async throws -> [OrderGroup] {
        let day = Self.dayBounds()
        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "GET",
            query: [
                .init(name: "select", value: "*"),
                .init(name: "created_at", value: "gte.\(day.start)"),
                .init(name: "created_at", value: "lt.\(day.end)"),
                .init(name: "order", value: "created_at.desc"),
                .init(name: "limit", value: String(limit)),
            ]
        )
        return try await run(req, as: [OrderGroup].self)
    }

    /// Fetch all orders (used by sales summary).
    func allOrders() async throws -> [OrderGroup] {
        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "GET",
            query: [
                .init(name: "select", value: "*"),
                .init(name: "order", value: "created_at.desc"),
            ]
        )
        return try await run(req, as: [OrderGroup].self)
    }

    /// Reserves the next human-facing order code ("P-1043") via the
    /// `next_order_code` Postgres function. It is backed by one global
    /// sequence, so nextval() hands every caller — this app or the website —
    /// a distinct value atomically, in a single round trip. Collisions are
    /// structurally impossible rather than avoided by retrying.
    func nextOrderCode(prefix: String = "P") async throws -> String {
        struct Params: Encodable { let prefix: String }
        let body = try JSONEncoder().encode(Params(prefix: prefix))
        let req = try makeRequest(path: "/rest/v1/rpc/next_order_code", method: "POST", body: body)
        return try await run(req, as: String.self)
    }

    /// Inserts one order and returns the server-confirmed row (with its real
    /// `id`) so callers can seed optimistic local state that matches what
    /// Realtime will echo back.
    ///
    /// In-store orders are stored as source='pos', print_status='printed' —
    /// they were already printed at the till, so they must never enter the
    /// pending auto-print queue.
    func insertOrder(_ order: OrderGroup) async throws -> OrderGroup {
        struct InsertRow: Encodable {
            let source: String
            let order_number: String
            let customer_name: String?
            let customer_phone: String?
            let items: [OrderItem]
            let subtotal: Double
            let tax: Double
            let total: Double
            let payment_method: String?
            let notes: String?
            let print_status: String
        }
        let payload = InsertRow(
            source: order.source,
            order_number: order.orderNumber,
            customer_name: order.customerName,
            customer_phone: order.customerPhone,
            items: order.items,
            subtotal: order.subtotal,
            tax: order.tax,
            total: order.total,
            payment_method: order.paymentMethod,
            notes: order.notes,
            print_status: order.printStatus
        )
        let body = try JSONEncoder().encode([payload])
        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "POST",
            body: body,
            preferReturn: true
        )
        let rows = try await run(req, as: [OrderGroup].self)
        guard let row = rows.first else {
            throw SupabaseError.http(0, "insert returned no rows")
        }
        return row
    }

    /// Returns the updated row so callers can patch local state in place
    /// instead of re-fetching.
    ///
    /// `order_number` now comes from a global sequence and never repeats, so
    /// this no longer needs the day bounds the old daily-reset numbering
    /// required to avoid matching past days' orders that shared a number.
    func updateOrderPhone(orderNumber: String, phone: String?) async throws -> [OrderGroup] {
        struct Patch: Encodable { let customer_phone: String? }
        let body = try JSONEncoder().encode(
            Patch(customer_phone: (phone?.isEmpty == false) ? phone : nil)
        )

        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "PATCH",
            query: [.init(name: "order_number", value: "eq.\(orderNumber)")],
            body: body,
            preferReturn: true
        )
        return try await run(req, as: [OrderGroup].self)
    }
}
