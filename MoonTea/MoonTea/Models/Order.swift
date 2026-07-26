import Foundation

/// The category a line belongs to, matching a `MenuCatalog` entry's `key`.
///
/// Deliberately NOT a closed enum. The website and a newer iPad build can write
/// a category this build has never heard of; as an enum that made `Order`'s
/// decoder throw, which silently dropped the whole order — it never appeared in
/// history and never printed. As an open raw value the row still decodes, and
/// `MenuCatalog` falls back to the neutral flow for anything it cannot place.
struct OrderItemType: RawRepresentable, Codable, Hashable, Sendable {
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

struct Order: Codable, Hashable, Identifiable, Sendable {
    var id: UUID = UUID()
    var orderNumber: Int
    var name: String
    var price: Double
    var type: OrderItemType
    var timestamp: String
    var phone: String?
    var paymentMethod: String?
    var quantity: Int?

    enum CodingKeys: String, CodingKey {
        case id, orderNumber, name, price, type, timestamp, phone, paymentMethod, quantity
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
        quantity: Int? = nil
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

struct OrderGroup: Identifiable, Hashable, Sendable {
    let orderNumber: Int
    let items: [Order]
    var id: Int { orderNumber }

    var phone: String? { items.first?.phone }
    var subtotal: Double { items.reduce(0) { $0 + $1.price } }
    func total(taxRate: Double) -> Double { subtotal * (1 + taxRate) }
}
