import Foundation
import Network

/// Which network the phone is on, kept current so the activity log can say
/// what the internet was doing when the card reader or an upload failed.
///
/// On 2026-11-14 the main phone lost its connection or timed out on about one
/// order load in fifty, and every card-reader connection failure that day was
/// Square reporting it couldn't reach its servers. The log couldn't say
/// whether the phone was on Wi-Fi, a hotspot or cellular, or changing over.
final class NetworkStatus {
    static let shared = NetworkStatus()

    /// "wifi", "wifi hotspot", "cellular", "wired", "other" or "none", with
    /// ", low data mode" added when that is on. "unknown" until the first
    /// report arrives just after launch.
    private(set) var summary = "unknown"

    private let monitor = NWPathMonitor()
    private var isStarted = false

    private init() {}

    func start() {
        guard !isStarted else { return }
        isStarted = true
        monitor.pathUpdateHandler = { path in
            let summary = NetworkStatus.describe(path)
            Task { @MainActor in NetworkStatus.shared.update(to: summary) }
        }
        // Reports arrive on the main queue: there are only a handful a day.
        monitor.start(queue: .main)
    }

    private func update(to new: String) {
        guard new != summary else { return }
        ActivityLog.shared.info(.app, "Network changed", ["to": new, "was": summary])
        summary = new
    }

    private nonisolated static func describe(_ path: NWPath) -> String {
        guard path.status == .satisfied else { return "none" }
        var text: String
        if path.usesInterfaceType(.wifi) {
            // An "expensive" Wi-Fi network is another phone's hotspot.
            text = path.isExpensive ? "wifi hotspot" : "wifi"
        } else if path.usesInterfaceType(.cellular) {
            text = "cellular"
        } else if path.usesInterfaceType(.wiredEthernet) {
            text = "wired"
        } else {
            text = "other"
        }
        if path.isConstrained { text += ", low data mode" }
        return text
    }
}
