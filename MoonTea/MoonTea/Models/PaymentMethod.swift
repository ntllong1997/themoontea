import Foundation

/// What `orders.paymentMethod` stores. The web summary buckets these raw
/// values, so a card taken in the Square app and one taken on the reader are
/// both `Card` — `square_payment_id` is what tells the reader's apart.
nonisolated enum PaymentMethod: String, CaseIterable, Codable, Identifiable, Sendable {
    case cash = "Cash"
    case cashApp = "CashApp"
    case card = "Card"
    case zelle = "Zelle"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .cash:    "Cash"
        case .cashApp: "Cash App"
        case .card:    "Card"
        case .zelle:   "Zelle"
        }
    }

    var icon: String {
        switch self {
        case .cash:    "banknote"
        case .cashApp: "dollarsign.circle"
        case .card:    "creditcard"
        case .zelle:   "building.columns"
        }
    }
}

/// The buttons on the payment page. Two of them are cards: one charged here on
/// the reader, one charged by staff in the Square app and only confirmed here.
/// Cash App shows the customer a QR code for the amount before it's confirmed.
enum PaymentChoice: CaseIterable, Identifiable {
    case cardReader, squareApp, cash, cashApp, zelle

    var id: Self { self }

    var method: PaymentMethod {
        switch self {
        case .cardReader, .squareApp: .card
        case .cash:                   .cash
        case .cashApp:                .cashApp
        case .zelle:                  .zelle
        }
    }

    var title: String {
        switch self {
        case .cardReader: "Card"
        case .squareApp:  "Square app"
        case .cash:       "Cash"
        case .cashApp:    "Cash App"
        case .zelle:      "Zelle"
        }
    }

    var icon: String {
        switch self {
        case .cardReader: "wave.3.right.circle"
        case .squareApp:  "square.grid.2x2"
        case .cash:       "banknote"
        case .cashApp:    "dollarsign.circle"
        case .zelle:      "building.columns"
        }
    }
}

/// A ticket's whole payment state after a change. Sent as one PATCH of every
/// row of the order, so repeating it gives the same result.
nonisolated struct PaymentChange: Codable, Hashable, Sendable {
    let status: OrderStatus
    let paymentMethod: String?
    let paidAt: String?
    let squarePaymentID: String?
    let paymentLog: [PaymentLogEntry]
}

enum CouponConstants {
    /// Fixed $4 off, applied before tax.
    static let fourOffAmount: Double = 4.0
    static let fourOffLabel: String = "$4 OFF Coupon"
}
