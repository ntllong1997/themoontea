import Foundation

@MainActor
@Observable
final class SquareService: NSObject {
    static let shared = SquareService()

    enum ConnectionState: Equatable {
        case notConfigured, unauthorized, disconnected, connecting, ready
    }

    enum ChargeResult {
        case success(transactionID: String)
        case cancelled
        case failure(String)
    }

    var connectionState: ConnectionState = .notConfigured
    var connectedReaderName: String = ""
    var lastError: String = ""
    var isConfigured: Bool { false }

    private override init() { super.init() }

    static func configure() {}
    func authorize() async {}
    func presentReaderSettings() {}
    func setReaderReady(_ ready: Bool, name: String = "") {}

    func charge(amountCents: Int) async -> ChargeResult {
        .failure("Square reader not available.")
    }
}
