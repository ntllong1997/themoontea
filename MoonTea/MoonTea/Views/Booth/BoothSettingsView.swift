import SwiftUI

/// Sets what this phone does at a booth: standalone, main phone, or till.
/// Switching a till to main is also the manual takeover when the main phone
/// is gone: it carries on numbering from the highest number it has seen.
struct BoothSettingsView: View {
    @State private var role = TillSettings.role
    @State private var pendingRole: BoothRole?
    private let booth = BoothSync.shared
    private let counter = BoothCounter.shared

    var body: some View {
        Form {
            Section {
                ForEach(BoothRole.allCases) { option in
                    Button { choose(option) } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: role == option ? "largecircle.fill.circle" : "circle")
                                .foregroundStyle(role == option ? Theme.strongText : Theme.mutedText)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(option.title).font(.system(size: 16, weight: .semibold))
                                Text(option.explanation)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.mutedText)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
            } header: {
                Text("This phone")
            } footer: {
                Text("This till's name (\(TillSettings.name)) is set on the Tickets tab.")
            }

            statusSection
        }
        .navigationTitle("Booth")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(
            "Make this phone \(pendingRole?.title.lowercased() ?? "")?",
            isPresented: Binding(get: { pendingRole != nil }, set: { if !$0 { pendingRole = nil } }),
            titleVisibility: .visible,
            presenting: pendingRole
        ) { option in
            Button("Make this the \(option.title.lowercased())") { apply(option) }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("Only one phone at the booth should be the main phone.")
        }
    }

    @ViewBuilder
    private var statusSection: some View {
        switch role {
        case .standalone:
            EmptyView()
        case .main:
            Section("Status") {
                row("Tills connected", booth.connectedTills.isEmpty ? "None" : booth.connectedTills.joined(separator: ", "))
                row("Last ticket number", counter.lastNumber > 0 ? "#\(counter.lastNumber)" : "None yet")
                Text("This phone numbers every ticket at the booth, in order. Don't take orders on the website while it's the main phone.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.mutedText)
            }
        case .till:
            Section("Status") {
                row("Main phone", booth.mainPhoneName ?? "Not connected")
                row("Waiting for the main phone", "\(booth.pendingEntries.count)")
            }
        }
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(value).foregroundStyle(Theme.mutedText).multilineTextAlignment(.trailing)
        }
    }

    /// Becoming the main phone is confirmed; the other changes are not risky.
    private func choose(_ option: BoothRole) {
        guard option != role else { return }
        if option == .main {
            pendingRole = option
        } else {
            apply(option)
        }
    }

    private func apply(_ option: BoothRole) {
        TillSettings.role = option
        role = option
        TicketStore.shared.start()
        BoothSync.shared.start()
        ActivityLog.shared.info(.sync, "Booth role changed", ["role": option.rawValue])
    }
}
