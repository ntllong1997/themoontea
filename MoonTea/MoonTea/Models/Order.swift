import Foundation

enum OrderItemType: String, Codable, Sendable {
    case boba = "Boba"
    case corndog = "Corndog"
    case discount = "Discount"
}

struct Order: Codable, Hashable, Identifiable, Sendable {
    var orderNumber: Int
    var name: String
    var price: Double
    var type: OrderItemType
    var timestamp: String
    var phone: String?
    var paymentMethod: String?
    var quantity: Int?

    var id: String { "\(orderNumber)-\(name)-\(timestamp)" }
}

struct OrderGroup: Identifiable, Hashable, Sendable {
    let orderNumber: Int
    let items: [Order]
    var id: Int { orderNumber }

    var phone: String? { items.first?.phone }
    var subtotal: Double { items.reduce(0) { $0 + $1.price } }
    func total(taxRate: Double) -> Double { subtotal * (1 + taxRate) }
}
