import SwiftUI

struct PrinterSettingsView: View {
    @State private var printer = EpsonPrinter.shared
    @State private var manualIP: String = ""
    @State private var scanSecondsLeft: Int = 0
    @State private var countdownTask: Task<Void, Never>?
    @FocusState private var manualIPFocused: Bool

    var body: some View {
        Form {
            // ── Selected printer ──────────────────────────────────────
            Section("Selected printer") {
                if printer.hasSavedPrinter {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(printer.savedName).font(.body)
                            selectedPrinterStatusLine
                        }
                        Spacer()
                        selectedPrinterAccessory
                    }
                    Button("Forget this printer", role: .destructive) {
                        printer.clearSaved()
                    }
                } else {
                    Text("No printer selected — use Scan or enter an IP below.")
                        .foregroundStyle(.secondary)
                        .font(.footnote)
                }
                if !printer.lastError.isEmpty {
                    Text(printer.lastError)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }

            // ── Scan / direct connect ──────────────────────────────────
            Section {
                // Scan button / scanning indicator
                if printer.status == .scanning {
                    HStack {
                        ProgressView()
                        Text(scanSecondsLeft > 0 ? "Scanning… (\(scanSecondsLeft)s)" : "Scanning…")
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("Stop") { stopScan() }
                            .foregroundStyle(.red)
                    }
                } else {
                    Button(printer.discovered.isEmpty ? "Scan for printers" : "Scan again") {
                        startScan()
                    }
                }

                // Direct IP / TCP entry — skip scanning entirely
                HStack(spacing: 8) {
                    Image(systemName: "network")
                        .foregroundStyle(.secondary)
                    TextField("IP address  (e.g. 172.16.10.11)", text: $manualIP)
                        .keyboardType(.decimalPad)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .focused($manualIPFocused)
                        .submitLabel(.done)
                        .onSubmit { connectManual() }
                    Button("Connect") { connectManual() }
                        .disabled(manualIP.trimmingCharacters(in: .whitespaces).isEmpty)
                        .font(.system(size: 14, weight: .semibold))
                }
            } header: {
                Text("Connect")
            } footer: {
                Text("Enter the printer's IP to connect directly over Wi-Fi/LAN without scanning.")
            }

            // ── Discovered devices ─────────────────────────────────────
            Section(printer.discovered.isEmpty
                    ? "Discovered devices"
                    : "Discovered (\(printer.discovered.count))") {
                if printer.discovered.isEmpty {
                    Text("None yet. Make sure the printer is on the same Wi-Fi, or paired via iOS Bluetooth Settings.")
                        .foregroundStyle(.secondary)
                        .font(.footnote)
                } else {
                    ForEach(printer.discovered) { dev in
                        Button {
                            stopCountdown()     // save() stops the scan itself
                            printer.save(dev)   // persists and connects immediately
                        } label: {
                            discoveredRow(dev)
                        }
                        .disabled(printer.status == .connecting)
                    }
                }
            }

            Section {
                Text("Supports Bluetooth (MFi) and Wi-Fi/LAN. For pop-ups, enable iPhone Personal Hotspot and let the printer auto-join, then scan or enter its IP directly.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Printer")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("OK") { manualIPFocused = false }
            }
        }
        .onAppear {
            if printer.hasSavedPrinter {
                // Visible connect (spinner + error feedback) rather than the
                // silent background probe — if the printer is unreachable the
                // user finds out here, with a hint, not at the next print.
                printer.connectSaved()
            } else {
                startScan()
            }
        }
        .onDisappear { stopCountdown() }
    }

    // MARK: - Selected printer subviews

    @ViewBuilder
    private var selectedPrinterStatusLine: some View {
        if printer.status == .connecting {
            Text("Connecting…")
                .font(.caption)
                .foregroundStyle(.secondary)
        } else if printer.isConnected {
            Text("Connected · \(printer.savedTarget)")
                .font(.caption)
                .foregroundStyle(.green)
        } else {
            Text("Not connected")
                .font(.caption)
                .foregroundStyle(.orange)
        }
    }

    @ViewBuilder
    private var selectedPrinterAccessory: some View {
        if printer.status == .connecting {
            ProgressView()
        } else if printer.isConnected {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
        } else {
            // Manual retry so a dropped link can be fixed right here instead
            // of waiting for the 30s background watchdog.
            Button("Connect") { printer.connectSaved() }
                .buttonStyle(.borderless)
                .font(.system(size: 14, weight: .semibold))
        }
    }

    private func discoveredRow(_ dev: EpsonPrinter.Discovered) -> some View {
        HStack(spacing: 10) {
            Image(systemName: Self.portIcon(dev.port))
                .foregroundStyle(.secondary)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(dev.name).foregroundStyle(.primary)
                Text("\(dev.port.label) · \(dev.target)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if printer.savedTarget == dev.target {
                if printer.status == .connecting {
                    ProgressView()
                } else if printer.isConnected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                } else {
                    Image(systemName: "exclamationmark.circle")
                        .foregroundStyle(.orange)
                }
            } else {
                Image(systemName: "chevron.right")
                    .foregroundStyle(.secondary)
            }
        }
    }

    private static func portIcon(_ port: EpsonPrinter.PortKind) -> String {
        switch port {
        case .bluetooth, .ble: "dot.radiowaves.left.and.right"
        case .tcp:             "wifi"
        case .usb:             "cable.connector"
        case .unknown:         "printer"
        }
    }

    // MARK: - Helpers

    private func startScan() {
        printer.startScan()
        scanSecondsLeft = 12
        startCountdown()
    }

    private func stopScan() {
        printer.stopScan()
        stopCountdown()
    }

    private func startCountdown() {
        stopCountdown()
        countdownTask = Task { @MainActor in
            var remaining = 12
            while remaining > 0 && !Task.isCancelled {
                scanSecondsLeft = remaining
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                remaining -= 1
            }
            if !Task.isCancelled { scanSecondsLeft = 0 }
        }
    }

    private func stopCountdown() {
        countdownTask?.cancel()
        countdownTask = nil
        scanSecondsLeft = 0
    }

    private func connectManual() {
        let ip = manualIP.trimmingCharacters(in: .whitespaces)
        guard !ip.isEmpty else { return }
        let target = "TCP:\(ip)"
        printer.save(EpsonPrinter.Discovered(target: target, name: "Printer @ \(ip)", port: .tcp))
        manualIP = ""
        manualIPFocused = false
    }
}
