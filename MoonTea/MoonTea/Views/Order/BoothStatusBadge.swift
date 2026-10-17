import SwiftUI

/// One line saying how this phone is linked to the booth. Hidden on a
/// standalone phone. A till without its main phone can't send orders, so that
/// case is loud.
struct BoothStatusBadge: View {
    private let booth = BoothSync.shared
    private let pool = NumberPool.shared

    var body: some View {
        switch TillSettings.role {
        case .standalone:
            EmptyView()
        case .main:
            line(
                icon: "antenna.radiowaves.left.and.right",
                color: pool.isUsingOfflineNumbers ? .orange : Theme.success,
                title: tillsText,
                detail: pool.isUsingOfflineNumbers
                    ? "No numbers reserved from the internet: website pre-orders may repeat a number until the signal is back."
                    : nil
            )
        case .till:
            if let main = booth.mainPhoneName {
                line(icon: "link", color: Theme.success, title: "Connected to main phone: \(main)", detail: unsentText)
            } else {
                line(
                    icon: "link.badge.plus",
                    color: .red,
                    title: "Main phone not connected",
                    detail: "Orders can't be sent until it is. Keep the main phone's app open, with WiFi and Bluetooth on, nearby."
                )
            }
        }
    }

    private var tillsText: String {
        switch booth.connectedTills.count {
        case 0:  "Main phone · no tills connected"
        case 1:  "Main phone · 1 till: \(booth.connectedTills[0])"
        default: "Main phone · \(booth.connectedTills.count) tills: \(booth.connectedTills.joined(separator: ", "))"
        }
    }

    private var unsentText: String? {
        let count = booth.pendingEntries.count
        return count == 0 ? nil : "\(count) change\(count == 1 ? "" : "s") waiting for the main phone"
    }

    private func line(icon: String, color: Color, title: String, detail: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: icon).foregroundStyle(color)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.strongText)
                if let detail {
                    Text(detail)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.mutedText)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.1))
        .accessibilityElement(children: .combine)
    }
}
