import Foundation

/// The category a line belongs to, matching a `MenuCatalog` entry's `key`.
///
/// Deliberately NOT a closed enum. The website and a newer iPad build can write
/// a category this build has never heard of; as an enum that made `Order`'s
/// decoder throw, which silently dropped the whole order — it never appeared in
/// history and never printed. As an open raw value the row still decodes, and
/// `MenuCatalog` falls back to the neutral flow for anything it cannot place.
nonisolated struct OrderItemType: RawRepresentable, Codable, Hashable, Sendable {
    let rawValue: String

    init(rawValue: String) { self.rawValue = rawValue }

    init(from decoder: Decoder) throws {
        rawValue = try decoder.singleValueContainer().decode(String.self)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    static let boba = OrderItemType(rawValue: "Boba")
    static let corndog = OrderItemType(rawValue: "Corndog")
    static let discount = OrderItemType(rawValue: "Discount")
}

nonisolated struct Order: Codable, Hashable, Identifiable, Sendable {
    var id: UUID = UUID()
    var orderNumber: Int
    var name: String
    var price: Double
    var type: OrderItemType
    var timestamp: String
    var phone: String?
    var paymentMethod: String?
    var quantity: Int?
    /// Which shop the order was taken at. Only read back from the server; the
    /// value written is always `AppConstants.locationID`.
    var location: Int?
    /// The order's hidden id, made on the phone and shared by every row of the
    /// order. It is what makes a queued upload or edit safe to retry. Rows
    /// written by the website or before this column existed have none.
    var orderUUID: UUID?
    /// `OrderStatus` raw value. Absent on rows from before the column existed,
    /// which the database treats as paid.
    var status: String?
    var paidAt: String?
    var squarePaymentID: String?
    /// Every payment change made to the ticket, oldest first. Copied onto
    /// every row of the order, like `status`.
    var paymentLog: [PaymentLogEntry]?

    enum CodingKeys: String, CodingKey {
        case id, orderNumber, name, price, type, timestamp, phone, paymentMethod, quantity, location
        case orderUUID = "order_uuid"
        case status
        case paidAt = "paid_at"
        case squarePaymentID = "square_payment_id"
        case paymentLog = "payment_log"
    }

    init(
        id: UUID = UUID(),
        orderNumber: Int,
        name: String,
        price: Double,
        type: OrderItemType,
        timestamp: String,
        phone: String? = nil,
        paymentMethod: String? = nil,
        quantity: Int? = nil,
        orderUUID: UUID? = nil,
        status: OrderStatus? = nil,
        paidAt: String? = nil,
        squarePaymentID: String? = nil,
        paymentLog: [PaymentLogEntry]? = nil
    ) {
        self.id = id
        self.orderNumber = orderNumber
        self.name = name
        self.price = price
        self.type = type
        self.timestamp = timestamp
        self.phone = phone
        self.paymentMethod = paymentMethod
        self.quantity = quantity
        self.orderUUID = orderUUID
        self.status = status?.rawValue
        self.paidAt = paidAt
        self.squarePaymentID = squarePaymentID
        self.paymentLog = paymentLog
    }

    // PostgREST's REST responses send numerics as native JSON types and
    // timestamps as `T`-separated ISO8601, but Supabase Realtime's
    // postgres_changes payloads send the same columns as JSON *strings* and
    // timestamps space-separated ("2026-06-30 12:34:56.789" vs.
    // "2026-06-30T12:34:56.789Z"). This decoder tolerates both shapes so the
    // same `Order` type can decode rows from either source.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        orderNumber = try Self.lenientInt(c, .orderNumber)
        name = try c.decode(String.self, forKey: .name)
        price = try Self.lenientDouble(c, .price)
        type = try c.decode(OrderItemType.self, forKey: .type)
        let rawTimestamp = try c.decode(String.self, forKey: .timestamp)
        timestamp = rawTimestamp.replacingOccurrences(of: " ", with: "T")
        phone = try c.decodeIfPresent(String.self, forKey: .phone)
        paymentMethod = try c.decodeIfPresent(String.self, forKey: .paymentMethod)
        quantity = try c.decodeIfPresent(Int.self, forKey: .quantity)
        location = try? Self.lenientInt(c, .location)
        orderUUID = try? c.decodeIfPresent(UUID.self, forKey: .orderUUID)
        status = try c.decodeIfPresent(String.self, forKey: .status)
        paidAt = try c.decodeIfPresent(String.self, forKey: .paidAt)?.replacingOccurrences(of: " ", with: "T")
        squarePaymentID = try c.decodeIfPresent(String.self, forKey: .squarePaymentID)
        paymentLog = Self.lenientLog(c)
    }

    /// REST sends the jsonb column as an array; tolerate a JSON string too, and
    /// never let a malformed log drop the whole order.
    private static func lenientLog(_ c: KeyedDecodingContainer<CodingKeys>) -> [PaymentLogEntry]? {
        if let log = try? c.decodeIfPresent([PaymentLogEntry].self, forKey: .paymentLog) { return log }
        guard let text = try? c.decodeIfPresent(String.self, forKey: .paymentLog),
              let data = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode([PaymentLogEntry].self, from: data)
    }

    private static func lenientInt(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) throws -> Int {
        if let value = try? c.decode(Int.self, forKey: key) { return value }
        guard let s = try? c.decode(String.self, forKey: key), let value = Int(s) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: c, debugDescription: "Expected Int or numeric string")
        }
        return value
    }

    private static func lenientDouble(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) throws -> Double {
        if let value = try? c.decode(Double.self, forKey: key) { return value }
        guard let s = try? c.decode(String.self, forKey: key), let value = Double(s) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: c, debugDescription: "Expected Double or numeric string")
        }
        return value
    }
}

/// A ticket's payment state — the `orders.status` column.
nonisolated enum OrderStatus: String, Codable, Sendable {
    /// Sent to the kitchen, not paid yet.
    case pending
    case paid
    /// The customer left before paying. The number stays used.
    case cancelled

    /// How the ticket card and payment log name the state.
    var label: String {
        switch self {
        case .pending:   "Unpaid"
        case .paid:      "Paid"
        case .cancelled: "Cancelled"
        }
    }
}

nonisolated extension Order {
    /// Rows without a status predate the column and were paid when saved.
    var orderStatus: OrderStatus { status.flatMap(OrderStatus.init(rawValue:)) ?? .paid }
}

/// One payment change on a ticket, shown as "Cash → Card, Till B, 2:14 PM".
nonisolated struct PaymentLogEntry: Codable, Hashable, Sendable {
    /// ISO8601 time of the change.
    let at: String
    /// The name of the till that made it (`TillSettings.name`).
    let till: String
    /// Payment state before and after: "Unpaid", "Cancelled" or a method label.
    let from: String
    let to: String
}

nonisolated struct OrderGroup: Identifiable, Hashable, Sendable {
    let orderNumber: Int
    let items: [Order]
    var id: Int { orderNumber }

    var phone: String? { items.first?.phone }
    var orderUUID: UUID? { items.first?.orderUUID }
    /// Rows without a status predate the column and were paid when saved.
    var status: OrderStatus { items.first?.orderStatus ?? .paid }
    var paymentMethod: PaymentMethod? { items.first?.paymentMethod.flatMap(PaymentMethod.init(rawValue:)) }
    var squarePaymentID: String? { items.first?.squarePaymentID }
    var paymentLog: [PaymentLogEntry] { items.first?.paymentLog ?? [] }
    /// Charged through the reader in this app, so the money really moved in
    /// Square and correcting it here does not refund it.
    var isChargedInApp: Bool { status == .paid && paymentMethod == .card && squarePaymentID != nil }

    /// The ticket's payment state as the log and the ticket card show it.
    var paymentStateLabel: String {
        guard status == .paid else { return status.label }
        return paymentMethod?.displayName ?? items.first?.paymentMethod ?? status.label
    }
    var subtotal: Double { items.reduce(0) { $0 + $1.price } }
    func total(taxRate: Double) -> Double { subtotal * (1 + taxRate) }
}
