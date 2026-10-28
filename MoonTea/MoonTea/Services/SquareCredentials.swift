import Foundation

/// The Square credentials the SDK is initialized and authorized with.
///
/// Physical readers only work against production. Mock readers
/// (`MockReaderUI`) only work against Sandbox, so Debug builds can switch to
/// the Sandbox credentials from Reader Settings. The SDK is initialized once
/// per process, so a switch takes effect on the next launch.
struct SquareCredentials {
    let applicationID: String
    let locationID: String
    let accessToken: String

    var isConfigured: Bool {
        ![applicationID, locationID, accessToken].contains { $0.hasPrefix("YOUR-") }
    }

    static let production = SquareCredentials(
        applicationID: Secrets.squareApplicationID,
        locationID: Secrets.squareLocationID,
        accessToken: Secrets.squareAccessToken
    )

    static let sandbox = SquareCredentials(
        applicationID: Secrets.squareSandboxApplicationID,
        locationID: Secrets.squareSandboxLocationID,
        accessToken: Secrets.squareSandboxAccessToken
    )

    private static let useSandboxKey = "squareUseSandbox"

    /// Debug-only preference; Release builds always use production.
    static var prefersSandbox: Bool {
        get {
            #if DEBUG
            UserDefaults.standard.bool(forKey: useSandboxKey)
            #else
            false
            #endif
        }
        set { UserDefaults.standard.set(newValue, forKey: useSandboxKey) }
    }

    /// Credentials chosen at launch: Sandbox only when preferred and filled in.
    static let active: SquareCredentials =
        prefersSandbox && sandbox.isConfigured ? sandbox : production
}
