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
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(printer.savedName).font(.body)
                            if printer.isConnected {
                                Text(printer.savedTarget)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            } else {
                                Text("Not connected")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }
                        Spacer()
                        Image(systemName: "circle.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(printer.isConnected ? .green : .secondary)
                            .padding(.top, 4)
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
                            printer.save(dev)
                            stopScan()          // stop scanning once a printer is chosen
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(dev.name).foregroundStyle(.primary)
                                    Text("\(dev.port.label) · \(dev.target)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if printer.savedTarget == dev.target {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.green)
                                } else {
                                    Image(systemName: "chevron.right")
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
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
                printer.checkConnection()
            } else {
                startScan()
            }
        }
        .onDisappear { stopCountdown() }
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
