import Foundation

struct CartItem: Identifiable, Hashable {
    let id = UUID()
    var name: String
    var price: Double
    var type: OrderItemType
    var quantity: Int

    var lineTotal: Double { price * Double(quantity) }
}
