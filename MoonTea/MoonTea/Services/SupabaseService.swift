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

    /// Returns today's orders grouped by orderNumber, newest order first.
    func todaysOrderGroups() async throws -> [OrderGroup] {
        let cal = Calendar.current
        let start = cal.startOfDay(for: Date())
        let end = cal.date(byAdding: .day, value: 1, to: start) ?? start
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "GET",
            query: [
                .init(name: "select", value: "*"),
                .init(name: "timestamp", value: "gte.\(iso.string(from: start))"),
                .init(name: "timestamp", value: "lt.\(iso.string(from: end))"),
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

    /// Picks the next order number for today, retrying on collision.
    func nextOrderNumber() async throws -> Int {
        let cal = Calendar.current
        let start = cal.startOfDay(for: Date())
        let end = cal.date(byAdding: .day, value: 1, to: start) ?? start
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        for attempt in 0..<5 {
            let latestReq = try makeRequest(
                path: "/rest/v1/orders",
                method: "GET",
                query: [
                    .init(name: "select", value: "orderNumber"),
                    .init(name: "timestamp", value: "gte.\(iso.string(from: start))"),
                    .init(name: "timestamp", value: "lt.\(iso.string(from: end))"),
                    .init(name: "order", value: "orderNumber.desc"),
                    .init(name: "limit", value: "1"),
                ]
            )
            struct Row: Decodable { let orderNumber: Int }
            let rows = try await run(latestReq, as: [Row].self)
            let candidate = (rows.first?.orderNumber ?? 0) + 1 + attempt

            let checkReq = try makeRequest(
                path: "/rest/v1/orders",
                method: "GET",
                query: [
                    .init(name: "select", value: "orderNumber"),
                    .init(name: "timestamp", value: "gte.\(iso.string(from: start))"),
                    .init(name: "timestamp", value: "lt.\(iso.string(from: end))"),
                    .init(name: "orderNumber", value: "eq.\(candidate)"),
                    .init(name: "limit", value: "1"),
                ]
            )
            let existing = try await run(checkReq, as: [Row].self)
            if existing.isEmpty { return candidate }
        }
        return Int(Date().timeIntervalSince1970)
    }

    /// Returns the server-confirmed rows (with their real `id`s) so callers can
    /// use them for optimistic local state that matches what Realtime will echo.
    func insertOrders(_ orders: [Order]) async throws -> [Order] {
        struct InsertRow: Encodable {
            let orderNumber: Int
            let name: String
            let price: Double
            let type: String
            let timestamp: String
            let phone: String?
            let paymentMethod: String?
        }
        let payload = orders.map {
            InsertRow(
                orderNumber: $0.orderNumber,
                name: $0.name,
                price: $0.price,
                type: $0.type.rawValue,
                timestamp: $0.timestamp,
                phone: $0.phone,
                paymentMethod: $0.paymentMethod
            )
        }
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

        let cal = Calendar.current
        let start = cal.startOfDay(for: Date())
        let end = cal.date(byAdding: .day, value: 1, to: start) ?? start
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let req = try makeRequest(
            path: "/rest/v1/orders",
            method: "PATCH",
            query: [
                .init(name: "orderNumber", value: "eq.\(orderNumber)"),
                .init(name: "timestamp", value: "gte.\(iso.string(from: start))"),
                .init(name: "timestamp", value: "lt.\(iso.string(from: end))"),
            ],
            body: body,
            preferReturn: true
        )
        return try await run(req, as: [Order].self)
    }
}
