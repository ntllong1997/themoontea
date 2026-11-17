import SwiftUI

/// One line saying how this phone is linked to the booth; tapping it opens
/// the Booth screen. Hidden on a phone working on its own. A phone that lost
/// the main phone it connected to can't send orders, so that case is loud and
/// carries its own way out: work on its own.
struct BoothStatusBadge: View {
    @Environment(AppRouter.self) private var router
    @State private var isConfirmingLeave = false
    private let booth = BoothSync.shared
    private let counter = BoothCounter.shared

    var body: some View {
        switch booth.role {
        case .standalone:
            EmptyView()
        case .main:
            boothLink {
                line(
                    icon: "antenna.radiowaves.left.and.right",
                    color: canNumber ? Theme.success : .orange,
                    title: tillsText,
                    detail: !canNumber
                        ? "Today's tickets haven't loaded yet, so new orders can't get a number. Needs signal for a moment."
                        : numberingText
                )
            }
        case .till:
            if let main = booth.mainPhoneName {
                boothLink {
                    line(icon: "link", color: Theme.success, title: "Connected to main phone: \(main)", detail: unsentText)
                }
            } else {
                notConnected
            }
        }
    }

    /// The till's main phone is away. Waiting needs nothing from staff; the
    /// button is for when they would rather not wait.
    private var notConnected: some View {
        let name = mainPhoneLabel
        return VStack(alignment: .leading, spacing: 8) {
            boothLink {
                line(
                    icon: "link.badge.plus",
                    color: .red,
                    title: "Not connected to \(name)",
                    detail: "Orders can't be sent until it reconnects. Keep \(name)'s app open, with WiFi and Bluetooth on, nearby — or work on your own with this phone's internet.",
                    isFilled: false
                )
            }
            Button("Work on my own") { isConfirmingLeave = true }
                .font(.system(size: 13, weight: .semibold))
                .buttonStyle(.bordered)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.red.opacity(0.1))
        .confirmationDialog(
            "Disconnect from \(name)?",
            isPresented: $isConfirmingLeave,
            titleVisibility: .visible
        ) {
            Button("Work on my own") { booth.leave() }
            Button("Keep waiting", role: .cancel) {}
        } message: {
            Text("This phone will use its own internet for ticket numbers and uploads. If the main phone keeps taking orders with no signal, both can give out the same ticket number. You can connect again from Booth any time.")
        }
    }

    private var canNumber: Bool { counter.lastNumber > 0 || TicketStore.shared.hasLoadedToday }

    private var mainPhoneLabel: String {
        let name = booth.joinedBooth?.name ?? ""
        return name.isEmpty ? "the main phone" : name
    }

    /// Last number, and whether website orders are numbered here too.
    private var numberingText: String {
        let last = counter.lastNumber > 0 ? "Last ticket #\(counter.lastNumber). " : ""
        return last + (WebsiteNumberRequests.shared.isRegistered
            ? "Numbering website orders too."
            : "Not numbering website orders yet (needs signal); the website uses #1000+ meanwhile.")
    }

    private var tillsText: String {
        switch booth.connectedTills.count {
        case 0:  "Main phone · no phones connected"
        case 1:  "Main phone · 1 phone: \(booth.connectedTills[0])"
        default: "Main phone · \(booth.connectedTills.count) phones: \(booth.connectedTills.joined(separator: ", "))"
        }
    }

    private var unsentText: String? {
        let count = booth.pendingEntries.count
        return count == 0 ? nil : "\(count) change\(count == 1 ? "" : "s") waiting for the main phone"
    }

    /// The status line as a button to the Booth screen, where connecting and
    /// disconnecting live.
    private func boothLink(@ViewBuilder _ label: () -> some View) -> some View {
        let content = label()
        return Button { router.push(.booth) } label: { content }
            .buttonStyle(.plain)
            .accessibilityHint("Opens Booth")
    }

    /// `isFilled` is off when the line sits inside a larger tinted block.
    private func line(icon: String, color: Color, title: String, detail: String?, isFilled: Bool = true) -> some View {
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
                        .multilineTextAlignment(.leading)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.mutedText)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isFilled ? color.opacity(0.1) : Color.clear)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
