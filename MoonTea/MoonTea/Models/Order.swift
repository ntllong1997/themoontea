import Foundation

enum OrderItemType: String, Codable, Sendable {
    case boba = "Boba"
    case corndog = "Corndog"
    case discount = "Discount"
}

// PostgREST's REST responses send numerics as native JSON numbers, but
// Supabase Realtime's postgres_changes payloads send the same columns as JSON
// *strings* (and timestamps space-separated: "2026-06-30 12:34:56.789" vs.
// "2026-06-30T12:34:56.789Z"). These helpers tolerate both shapes so the same
// types decode rows from either source.
private enum Lenient {
    static func double<K>(_ c: KeyedDecodingContainer<K>, _ key: K, default def: Double? = nil) throws -> Double {
        if let value = try? c.decode(Double.self, forKey: key) { return value }
        if let s = try? c.decode(String.self, forKey: key), let value = Double(s) { return value }
        if let def { return def }
        throw DecodingError.dataCorruptedError(forKey: key, in: c, debugDescription: "Expected Double or numeric string")
    }

    static func int<K>(_ c: KeyedDecodingContainer<K>, _ key: K, default def: Int) -> Int {
        if let value = try? c.decode(Int.self, forKey: key) { return value }
        if let s = try? c.decode(String.self, forKey: key), let value = Int(s) { return value }
        return def
    }
}

/// One element of the `items` jsonb array — a cart line, not a physical unit.
/// `quantity` collapses identical units into a single entry.
struct OrderItem: Codable, Hashable, Sendable {
    var name: String
    var modifiers: [String]
    var unitPrice: Double
    var quantity: Int
    var type: OrderItemType

    enum CodingKeys: String, CodingKey {
        case name, modifiers, quantity, type
        case unitPrice = "unit_price"
    }

    init(name: String, modifiers: [String] = [], unitPrice: Double, quantity: Int, type: OrderItemType) {
        self.name = name
        self.modifiers = modifiers
        self.unitPrice = unitPrice
        self.quantity = quantity
        self.type = type
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decode(String.self, forKey: .name)
        modifiers = (try? c.decode([String].self, forKey: .modifiers)) ?? []
        unitPrice = try Lenient.double(c, .unitPrice, default: 0)
        quantity = Lenient.int(c, .quantity, default: 1)
        // `type` is written by this app and the website, but it is not part of
        // the shared contract in supabase_schema.sql — default rather than
        // fail if some other writer omits it.
        type = (try? c.decode(OrderItemType.self, forKey: .type)) ?? .boba
    }

    /// "Taro Milk Tea" + ["Tapioca"] -> "Taro Milk Tea (Tapioca)".
    var displayName: String {
        modifiers.isEmpty ? name : "\(name) (\(modifiers.joined(separator: ", ")))"
    }

    var lineTotal: Double { unitPrice * Double(quantity) }
}

/// One physical unit of an order line. The station screens track make-status
/// per unit, so a quantity-2 line becomes two of these, each with a stable id.
struct OrderUnit: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let displayName: String
    let price: Double
    let type: OrderItemType
    let lineIndex: Int
    let unitIndex: Int
}

/// One row of `public.orders` — a whole order.
///
/// Named `OrderGroup` because that is what it represents to the UI: the group
/// of items a customer checked out together. Under the old schema that group
/// had to be assembled client-side from many rows; now it is one row.
struct OrderGroup: Codable, Identifiable, Hashable, Sendable {
    var id: UUID
    var source: String
    var orderNumber: String
    var createdAt: String
    var customerName: String?
    var customerPhone: String?
    var items: [OrderItem]
    var subtotal: Double
    var tax: Double
    var total: Double
    var paymentMethod: String?
    var notes: String?
    var printStatus: String

    enum CodingKeys: String, CodingKey {
        case id, source, items, subtotal, tax, total, notes
        case orderNumber = "order_number"
        case createdAt = "created_at"
        case customerName = "customer_name"
        case customerPhone = "customer_phone"
        case paymentMethod = "payment_method"
        case printStatus = "print_status"
    }

    init(
        id: UUID = UUID(),
        source: String = OrderSource.pos,
        orderNumber: String,
        createdAt: String,
        customerName: String? = nil,
        customerPhone: String? = nil,
        items: [OrderItem],
        subtotal: Double,
        tax: Double,
        total: Double,
        paymentMethod: String? = nil,
        notes: String? = nil,
        printStatus: String = PrintStatus.printed
    ) {
        self.id = id
        self.source = source
        self.orderNumber = orderNumber
        self.createdAt = createdAt
        self.customerName = customerName
        self.customerPhone = customerPhone
        self.items = items
        self.subtotal = subtotal
        self.tax = tax
        self.total = total
        self.paymentMethod = paymentMethod
        self.notes = notes
        self.printStatus = printStatus
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        source = (try? c.decode(String.self, forKey: .source)) ?? OrderSource.pos
        orderNumber = try c.decode(String.self, forKey: .orderNumber)
        let rawCreatedAt = (try? c.decode(String.self, forKey: .createdAt)) ?? ""
        createdAt = rawCreatedAt.replacingOccurrences(of: " ", with: "T")
        customerName = try c.decodeIfPresent(String.self, forKey: .customerName)
        customerPhone = try c.decodeIfPresent(String.self, forKey: .customerPhone)
        items = (try? c.decode([OrderItem].self, forKey: .items)) ?? []
        subtotal = try Lenient.double(c, .subtotal, default: 0)
        tax = try Lenient.double(c, .tax, default: 0)
        total = try Lenient.double(c, .total, default: 0)
        paymentMethod = try c.decodeIfPresent(String.self, forKey: .paymentMethod)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        printStatus = (try? c.decode(String.self, forKey: .printStatus)) ?? PrintStatus.printed
    }

    var phone: String? { customerPhone }

    /// Line items expanded to one entry per physical unit, in cart order.
    var units: [OrderUnit] {
        items.enumerated().flatMap { lineIndex, item in
            (0..<max(item.quantity, 1)).map { unitIndex in
                OrderUnit(
                    id: "\(id.uuidString)-\(lineIndex)-\(unitIndex)",
                    name: item.name,
                    displayName: item.displayName,
                    price: item.unitPrice,
                    type: item.type,
                    lineIndex: lineIndex,
                    unitIndex: unitIndex
                )
            }
        }
    }
}

enum OrderSource {
    static let online = "online"
    static let pos = "pos"
}

enum PrintStatus {
    static let pending = "pending"
    static let printed = "printed"
}
