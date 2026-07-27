import Foundation

enum PaymentMethod: String, CaseIterable, Codable, Identifiable, Sendable {
    case cash = "Cash"
    case cashApp = "CashApp"
    case card = "Card"

    var id: String { rawValue }
    var displayName: String { rawValue }

    var icon: String {
        switch self {
        case .cash:    "banknote"
        case .cashApp: "dollarsign.circle"
        case .card:    "creditcard"
        }
    }
}

enum CouponConstants {
    /// Fixed $4 off, applied before tax.
    static let fourOffAmount: Double = 4.0
    static let fourOffLabel: String = "$4 OFF Coupon"
}
