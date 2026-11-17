import SwiftUI

struct ReaderSettingsView: View {
    @State private var square = SquareService.shared

    var body: some View {
        Form {
            statusSection
            actionsSection
            setupSection
        }
        .navigationTitle("Card Reader")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Status

    private var statusSection: some View {
        Section("Reader status") {
            HStack(spacing: 12) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 10, height: 10)
                VStack(alignment: .leading, spacing: 2) {
                    Text(statusTitle)
                        .font(.body)
                    Text(statusSubtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 2)

            if !square.connectedReaderName.isEmpty {
                LabeledContent("Reader", value: square.connectedReaderName)
            }

            if !square.readerUnavailableReason.isEmpty {
                Text(square.readerUnavailableReason)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            if !square.lastError.isEmpty {
                Text(square.lastError)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    // MARK: - Actions

    private var actionsSection: some View {
        Section {
            switch square.connectionState {
            case .notConfigured:
                Text("Add your Square credentials to Secrets.swift, then rebuild.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

            case .unauthorized:
                Button("Authorize with Square") {
                    Task { await square.authorize() }
                }

            case .disconnected, .connecting:
                Button("Connect / Pair Reader") {
                    square.presentReaderSettings()
                }
                restartButton

            case .ready:
                Button("Reader Settings") {
                    square.presentReaderSettings()
                }
                restartButton
                Button("Disconnect reader", role: .destructive) {
                    square.disconnectReaders()
                }
            }
        } footer: {
            if square.canRestartReader {
                Text("Restart reader switches the reader off and on from here; it then reconnects by itself. The app does the same on its own when the reader loses its connection to Square and Square won't take a retry.")
            }
        }
    }

    /// Only for a reader that can be restarted from the app.
    @ViewBuilder
    private var restartButton: some View {
        if square.canRestartReader {
            Button("Restart reader") {
                square.restartReaders()
            }
        }
    }

    // MARK: - Setup guide

    private var setupSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Text("Square SDK setup checklist")
                    .font(.footnote)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                step("1", "Create a Square developer app at developer.squareup.com")
                step("2", "Copy Application ID and Location ID into Secrets.swift")
                step("3", "In Xcode: File → Add Package Dependencies → paste\nhttps://github.com/square/mobile-payments-sdk-ios")
                step("4", "Add SquareMobilePaymentsSDK to the MoonTea target")
                step("5", "Uncomment the SDK lines in SquareService.swift")
                step("6", "Rebuild — the reader will connect via Bluetooth LE")
            }
            .padding(.vertical, 4)
        }
    }

    private func step(_ n: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(n)
                .font(.system(size: 11, weight: .bold))
                .padding(4)
                .background(Theme.brand.opacity(0.15))
                .foregroundStyle(Theme.brand)
                .clipShape(Circle())
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Helpers

    private var statusColor: Color {
        switch square.connectionState {
        case .notConfigured:  .gray
        case .unauthorized:   .orange
        case .disconnected:   .red
        case .connecting:     .yellow
        case .ready:          .green
        }
    }

    private var statusTitle: String {
        switch square.connectionState {
        case .notConfigured:  "Not configured"
        case .unauthorized:   "Not authorized"
        case .disconnected:   "No reader connected"
        case .connecting:     "Connecting…"
        case .ready:          "Ready — \(square.connectedReaderName)"
        }
    }

    private var statusSubtitle: String {
        switch square.connectionState {
        case .notConfigured:  "Fill in Square credentials in Secrets.swift"
        case .unauthorized:   "Tap Authorize to link your Square account"
        case .disconnected:   "Tap Connect to pair your Square contactless reader"
        case .connecting:     "Searching for reader via Bluetooth…"
        case .ready:          "Contactless and chip payments enabled"
        }
    }
}
