import CoreImage.CIFilterBuiltins
import SwiftUI

/// The payment page for one pending ticket. Staff tap the method the customer
/// used; there is no default. Card charges on this phone's reader; the others
/// are taken elsewhere and only confirmed here. Cash App first shows a QR code
/// the customer scans to open Cash App with the amount filled in.
/// Square app opens Square POS with the amount filled in; when Square switches
/// back with a successful charge the ticket is marked paid by itself.
struct PaymentSheet: View {
    @Bindable var vm: OrderViewModel
    let orderNumber: Int

    @Environment(\.dismiss) private var dismiss
    @Environment(AppRouter.self) private var router
    @State private var square = SquareService.shared
    @State private var squareLink = SquarePOSLink.shared
    @State private var confirming: PaymentChoice?
    @State private var isShowingCashAppCode = false
    @State private var isWaitingForSquareApp = false
    @State private var isShowingZelleCode = false
    @State private var isCharging = false
    @State private var chargeError = ""
    /// The error came from the Square app hand-off, so the reader's settings
    /// link would point staff the wrong way.
    @State private var isSquareAppError = false

    private var ticket: OrderGroup? { vm.ticket(orderNumber) }
    private var total: Double { ticket?.total(taxRate: AppConstants.taxRate) ?? 0 }
    private var readerReady: Bool { square.connectionState == .ready }
    /// The reader refreshes its secure connection to Square every few
    /// minutes; a charge started meanwhile waits a few seconds for it. The
    /// same goes while the app is retrying or restarting a reader that
    /// dropped off.
    private var readerReconnecting: Bool {
        square.connectionState == .connecting || square.isRecoveringReader
    }
    /// This phone's reader dropped off and neither Square nor the app is
    /// bringing it back. Opening Square's reader screen is what's left, so
    /// Card does that instead of going grey.
    private var readerNeedsConnecting: Bool {
        square.connectionState == .disconnected && square.hasPairedReader && !square.isRecoveringReader
    }
    private var readerHint: String {
        if readerReconnecting { return "Reader reconnecting…" }
        if readerNeedsConnecting { return "Tap to connect the reader" }
        return "No reader on this phone"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    amountDue
                    if let ticket, ticket.status != .pending {
                        notPendingNotice(ticket)
                        // e.g. a card charged after another phone settled it.
                        if !chargeError.isEmpty { errorText }
                    } else if isWaitingForSquareApp {
                        squareAppHandoff
                    } else if isShowingCashAppCode {
                        cashAppCode
                    } else if isShowingZelleCode {
                        ZellePaymentView(
                            total: total,
                            orderNumber: orderNumber,
                            onPaid: { confirm(.zelle) },
                            onBack: { isShowingZelleCode = false }
                        )
                    } else {
                        choices
                        if !chargeError.isEmpty { errorText }
                    }
                }
                .padding(24)
            }
            .navigationTitle("Pay ticket #\(orderNumber)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }.disabled(isCharging)
                }
            }
        }
        .interactiveDismissDisabled(isCharging)
        .onChange(of: squareLink.lastOutcome) { _, outcome in
            guard let outcome, outcome.orderNumber == orderNumber else { return }
            finishSquareApp(outcome.result)
        }
        .confirmationDialog(
            confirmTitle,
            isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
            titleVisibility: .visible,
            presenting: confirming
        ) { choice in
            Button("Paid by \(choice.title)") { confirm(choice) }
            Button("Not yet", role: .cancel) {}
        } message: { choice in
            Text("Only confirm once you have the money.")
        }
    }

    // MARK: - Sections

    private var amountDue: some View {
        VStack(spacing: 4) {
            Text("AMOUNT DUE")
                .font(.system(size: 11, weight: .medium))
                .tracking(1)
                .foregroundStyle(.secondary)
            Text("$\(total.fmt2)")
                .font(.system(size: 50, weight: .bold))
            if let ticket {
                Text(itemSummary(ticket))
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.mutedText)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var choices: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach(PaymentChoice.allCases) { choice in
                choiceButton(choice)
            }
        }
    }

    private func choiceButton(_ choice: PaymentChoice) -> some View {
        let isReaderChoice = choice == .cardReader
        let isEnabled = !isCharging
            && (!isReaderChoice || readerReady || readerReconnecting || readerNeedsConnecting)
        return Button {
            if isReaderChoice && readerNeedsConnecting {
                square.presentReaderSettings()
            } else if isReaderChoice {
                Task { await chargeOnReader() }
            } else if choice == .squareApp {
                Task { await openSquareApp() }
            } else if choice == .cashApp {
                isShowingCashAppCode = true
            } else if choice == .zelle {
                isShowingZelleCode = true
            } else {
                confirming = choice
            }
        } label: {
            VStack(spacing: 8) {
                if isReaderChoice && isCharging {
                    ProgressView()
                } else {
                    Image(systemName: choice.icon).font(.system(size: 26))
                }
                Text(choice.title).font(.system(size: 16, weight: .semibold))
                if isReaderChoice && !readerReady {
                    Text(readerHint)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.mutedText)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 104)
            .background(Color(.secondarySystemBackground))
            .foregroundStyle(isEnabled ? Theme.strongText : Theme.mutedText)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Theme.cardBorder, lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }

    /// The Cash App step: a QR code for this ticket's amount, then confirm.
    /// Showing the code is the "are you sure" step, so there is no second ask.
    private var cashAppCode: some View {
        let url = CashAppStore.shared.payURL(amount: total)
        return VStack(spacing: 14) {
            Text("Scan to pay with Cash App")
                .font(.system(size: 16, weight: .semibold))
            if let code = Self.qrCode(url) {
                Image(uiImage: code)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 230, height: 230)
                    .padding(12)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Theme.cardBorder, lineWidth: 0.5)
                    )
                    .accessibilityLabel("Cash App QR code for $\(total.fmt2)")
            }
            Text("\(CashAppStore.displayTag(CashAppStore.shared.activeURL)) · $\(total.fmt2)")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.green)
            Text("The amount is filled in. Ask them to type “ticket #\(orderNumber)” as the note. Only confirm once you see the payment.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.mutedText)
                .multilineTextAlignment(.center)
            Button {
                confirm(.cashApp)
            } label: {
                Text("Paid by Cash App")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(.black)
            Button("Not yet") { isShowingCashAppCode = false }
                .font(.system(size: 15, weight: .semibold))
        }
        .frame(maxWidth: .infinity)
    }

    /// Waiting on Square POS. A successful charge confirms the ticket by
    /// itself; the manual button covers Square not switching back.
    private var squareAppHandoff: some View {
        VStack(spacing: 14) {
            Image(systemName: PaymentChoice.squareApp.icon).font(.system(size: 30))
            Text("Finish the charge in Square")
                .font(.system(size: 16, weight: .semibold))
            Text("$\(total.fmt2) · \(paymentNote)")
                .font(.system(size: 15, weight: .medium))
            Text("This ticket is marked paid when Square switches back. If it doesn't, confirm only once Square shows the payment.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.mutedText)
                .multilineTextAlignment(.center)
            if !chargeError.isEmpty { errorText }
            Button {
                Task { await openSquareApp() }
            } label: {
                Text("Open Square again")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(.black)
            Button("Paid by Square app") { confirm(.squareApp) }
                .font(.system(size: 15, weight: .semibold))
            Button("Not yet") {
                isWaitingForSquareApp = false
                chargeError = ""
            }
            .font(.system(size: 15, weight: .semibold))
        }
        .frame(maxWidth: .infinity)
    }

    /// Also draws the Zelle code (ZellePaymentView).
    static func qrCode(_ text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let image = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: image)
    }

    private func notPendingNotice(_ ticket: OrderGroup) -> some View {
        VStack(spacing: 12) {
            Text(ticket.status == .paid
                 ? "Already paid by \(ticket.paymentStateLabel)."
                 : "This ticket was cancelled.")
                .font(.system(size: 15, weight: .medium))
            Button("Done") { dismiss() }
                .buttonStyle(.borderedProminent)
                .tint(.black)
        }
    }

    private var errorText: some View {
        VStack(spacing: 8) {
            Text(chargeError)
                .font(.system(size: 13))
                .foregroundStyle(.red)
                .multilineTextAlignment(.center)
            if !readerReady && !isSquareAppError {
                Button("Reader settings") {
                    dismiss()
                    router.push(.reader)
                }
                .font(.system(size: 13, weight: .semibold))
            }
        }
    }

    // MARK: - Actions

    private var confirmTitle: String {
        guard let confirming else { return "" }
        return "Ticket #\(orderNumber): $\(total.fmt2) by \(confirming.title)?"
    }

    private func confirm(_ choice: PaymentChoice) {
        Task {
            await vm.pay(orderNumber: orderNumber, method: choice.method)
            dismiss()
        }
    }

    /// What the customer's Cash App payment and the Square sale are noted with.
    private var paymentNote: String { SquarePOSRequest.note(orderNumber: orderNumber) }

    private func openSquareApp() async {
        showSquareAppError("")
        if let problem = await squareLink.open(orderNumber: orderNumber, amountCents: Int((total * 100).rounded())) {
            showSquareAppError(problem)
            return
        }
        isWaitingForSquareApp = true
    }

    /// `SquarePOSLink` has already recorded the payment; this only closes the
    /// sheet or says what went wrong.
    private func finishSquareApp(_ result: SquarePOSLink.Result) {
        switch result {
        case .recorded:
            dismiss()
        case .alreadySettled(let state):
            // Another phone settled the ticket while Square was open.
            showSquareAppError("Square charged the card, but this ticket was already \(state). Check the ticket and refund in Square Dashboard if needed.")
        case .failed(let message):
            isWaitingForSquareApp = false
            showSquareAppError(message)
        }
    }

    private func showSquareAppError(_ message: String) {
        chargeError = message
        isSquareAppError = true
    }

    private func chargeOnReader() async {
        isCharging = true
        chargeError = ""
        isSquareAppError = false
        let result = await square.charge(amountCents: Int((total * 100).rounded()))
        isCharging = false
        switch result {
        case .success(let transactionID):
            guard ticket?.status == .pending else {
                // Another phone settled the ticket while the card was in.
                chargeError = "The card was charged, but this ticket was already \(ticket?.paymentStateLabel.lowercased() ?? "changed"). Check the ticket and refund in Square Dashboard if needed."
                return
            }
            await vm.pay(orderNumber: orderNumber, method: .card, squarePaymentID: transactionID)
            dismiss()
        case .cancelled:
            break
        case .failure(let message):
            chargeError = message
        }
    }

    private func itemSummary(_ ticket: OrderGroup) -> String {
        OrderViewModel.collapseToLineItems(ticket.items.filter { $0.type != .discount })
            .map { $0.qty > 1 ? "\($0.name) ×\($0.qty)" : $0.name }
            .joined(separator: " · ")
    }
}
