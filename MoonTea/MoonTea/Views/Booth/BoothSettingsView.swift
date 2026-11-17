import SwiftUI

/// The booth link, from this phone's side: what it is doing now, and the one
/// button that undoes it.
///
/// A phone works on its own until staff choose otherwise here. From there it
/// can connect to a main phone picked from the ones nearby, or become the main
/// phone. Nothing connects by itself, and Disconnect is always one tap away.
/// Becoming the main phone is also the manual takeover when the old main
/// phone is gone: it carries on numbering from the highest number it has seen.
struct BoothSettingsView: View {
    @State private var confirming: Confirmation?
    @State private var phoneName = TillSettings.name
    @State private var nameDraft = ""
    @State private var isRenaming = false
    private let booth = BoothSync.shared
    private let counter = BoothCounter.shared

    private enum Confirmation: Identifiable {
        case becomeMain, stopBeingMain, disconnect

        var id: Self { self }
    }

    var body: some View {
        Form {
            switch booth.role {
            case .standalone:
                onItsOwnSection
                nearbySection
                becomeMainSection
            case .main:
                mainPhoneSection
            case .till:
                connectedSection
            }
            nameSection
        }
        .navigationTitle("Booth")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { booth.startLookingForBooths() }
        .onDisappear { booth.stopLookingForBooths() }
        .confirmationDialog(
            confirmTitle,
            isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
            titleVisibility: .visible,
            presenting: confirming
        ) { choice in
            switch choice {
            case .becomeMain:
                Button("Make this the main phone") { booth.host() }
            case .stopBeingMain:
                Button("Stop being the main phone", role: .destructive) { booth.leave() }
            case .disconnect:
                Button("Disconnect", role: .destructive) { booth.leave() }
            }
            Button("Cancel", role: .cancel) {}
        } message: { choice in
            Text(confirmMessage(choice))
        }
        .alert("Name this phone", isPresented: $isRenaming) {
            TextField("e.g. Till B", text: $nameDraft)
            Button("Save") {
                TillSettings.name = nameDraft
                phoneName = TillSettings.name
                booth.tillNameChanged()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The other phones see this name when they connect, and it is written in each ticket's payment history.")
        }
    }

    // MARK: - Working on its own

    private var onItsOwnSection: some View {
        Section {
            status(
                icon: "iphone",
                color: Theme.mutedText,
                title: "This phone works on its own",
                detail: "Ticket numbers and uploads use this phone's internet. It isn't connected to another phone."
            )
        }
    }

    private var nearbySection: some View {
        Section {
            if booth.nearbyBooths.isEmpty {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Looking for a main phone nearby…")
                        .foregroundStyle(Theme.mutedText)
                }
            } else {
                ForEach(booth.nearbyBooths) { nearby in
                    HStack {
                        Label(nearby.name, systemImage: "antenna.radiowaves.left.and.right")
                        Spacer()
                        Button("Connect") { booth.join(nearby) }
                            .buttonStyle(.borderedProminent)
                            .tint(.black)
                    }
                }
            }
        } header: {
            Text("Connect to a main phone")
        } footer: {
            Text("Once connected, this phone gets its ticket numbers from the main phone, which also prints and uploads its orders, so this phone needs no internet. If the main phone isn't listed: open Booth on it and make it the main phone, keep its app open, and have WiFi and Bluetooth on for both phones. This phone also needs Settings → MoonTea → Local Network turned on.")
        }
    }

    private var becomeMainSection: some View {
        Section {
            Button("Make this the main phone") { confirming = .becomeMain }
        } header: {
            Text("Or start a booth here")
        } footer: {
            Text("The main phone numbers every ticket in order, prints every receipt and uploads every phone's orders. It numbers the website's orders too. Keep it plugged in with the app open.")
        }
    }

    // MARK: - Main phone

    private var mainPhoneSection: some View {
        Section {
            status(
                icon: "antenna.radiowaves.left.and.right",
                color: Theme.success,
                title: "This is the main phone",
                detail: "Other phones can connect to “\(phoneName)” from their Booth screen."
            )
            row("Phones connected", booth.connectedTills.isEmpty ? "None" : booth.connectedTills.joined(separator: ", "))
            row("Last ticket number", counter.lastNumber > 0 ? "#\(counter.lastNumber)" : "None yet")
            row("Website orders", WebsiteNumberRequests.shared.isRegistered ? "Numbered here" : "Waiting for signal")
            Button("Stop being the main phone", role: .destructive) {
                // Nothing to warn about when no phone depends on this one.
                if booth.connectedTills.isEmpty { booth.leave() } else { confirming = .stopBeingMain }
            }
        } footer: {
            Text("This phone numbers every ticket in order: its own, the connected phones' and the website's. If it doesn't answer the website (no signal), the website numbers its orders from 1000.")
        }
    }

    // MARK: - Connected to a main phone

    @ViewBuilder
    private var connectedSection: some View {
        let name = mainPhoneLabel
        if booth.mainPhoneName != nil {
            Section {
                status(
                    icon: "link",
                    color: Theme.success,
                    title: "Connected to \(name)",
                    detail: "Ticket numbers come from \(name), which also prints and uploads this phone's orders. This phone needs no internet."
                )
                if !booth.pendingEntries.isEmpty {
                    row("Changes waiting for \(name)", "\(booth.pendingEntries.count)")
                }
                Button("Disconnect", role: .destructive) { confirming = .disconnect }
            } footer: {
                Text("After the app closes or the link drops, this phone comes back to \(name) by itself, until you disconnect.")
            }
        } else {
            Section {
                HStack(alignment: .top, spacing: 12) {
                    ProgressView()
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Looking for \(name)…").font(.system(size: 16, weight: .semibold))
                        Text("Orders can't be sent from this phone until it's connected.")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.mutedText)
                    }
                }
                .padding(.vertical, 4)
                if !booth.pendingEntries.isEmpty {
                    row("Changes waiting for \(name)", "\(booth.pendingEntries.count)")
                }
                // Already not working, so there is nothing to confirm.
                Button("Stop looking and work on my own") { booth.leave() }
            } footer: {
                Text("\(name) needs its app open and to still be the main phone. Both phones need WiFi and Bluetooth on, within about 30 feet, and this phone needs Settings → MoonTea → Local Network turned on. Working on your own uses this phone's internet instead; you can connect again here any time.")
            }
        }
    }

    /// The main phone this phone chose, by the name it shows now.
    private var mainPhoneLabel: String {
        let name = booth.mainPhoneName ?? booth.joinedBooth?.name ?? ""
        return name.isEmpty ? "the main phone" : name
    }

    // MARK: - This phone's name

    /// The name is how staff tell the phones apart when connecting, so it is
    /// set here as well as on the History tab.
    private var nameSection: some View {
        Section {
            HStack {
                Text("This phone's name")
                Spacer()
                Text(phoneName)
                    .foregroundStyle(phoneName == TillSettings.unnamed ? Color.orange : Theme.mutedText)
            }
            Button("Rename") {
                nameDraft = phoneName == TillSettings.unnamed ? "" : phoneName
                isRenaming = true
            }
        }
    }

    // MARK: - Confirmations

    private var confirmTitle: String {
        switch confirming {
        case .becomeMain:    "Make this the main phone?"
        case .stopBeingMain: "Stop being the main phone?"
        case .disconnect:    "Disconnect from \(mainPhoneLabel)?"
        case nil:            ""
        }
    }

    private func confirmMessage(_ choice: Confirmation) -> String {
        switch choice {
        case .becomeMain:
            return "Only one phone at the booth should be the main phone."
        case .stopBeingMain:
            let count = booth.connectedTills.count
            return "\(count) connected phone\(count == 1 ? "" : "s") will lose the main phone. Each can work on its own or connect to another main phone."
        case .disconnect:
            let waiting = booth.pendingEntries.count
            let own = "This phone will use its own internet for ticket numbers and uploads. If the main phone keeps taking orders with no signal, both can give out the same ticket number."
            guard waiting > 0 else { return own }
            return own + " \(waiting) change\(waiting == 1 ? "" : "s") \(mainPhoneLabel) hasn't confirmed will upload from this phone instead."
        }
    }

    // MARK: - Pieces

    private func status(icon: String, color: Color, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundStyle(color)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.system(size: 16, weight: .semibold))
                Text(detail)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.mutedText)
            }
        }
        .padding(.vertical, 4)
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(value).foregroundStyle(Theme.mutedText).multilineTextAlignment(.trailing)
        }
    }
}
