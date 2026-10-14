import SwiftUI

/// The payment page for one pending ticket. Staff tap the method the customer
/// used; there is no default. Card charges on this phone's reader; the other
/// three are taken elsewhere and only confirmed here.
struct PaymentSheet: View {
    @Bindable var vm: OrderViewModel
    let orderNumber: Int

    @Environment(\.dismiss) private var dismiss
    @Environment(AppRouter.self) private var router
    @State private var square = SquareService.shared
    @State private var confirming: PaymentChoice?
    @State private var isCharging = false
    @State private var chargeError = ""

    private var ticket: OrderGroup? { vm.ticket(orderNumber) }
    private var total: Double { ticket?.total(taxRate: AppConstants.taxRate) ?? 0 }
    private var readerReady: Bool { square.connectionState == .ready }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    amountDue
                    if let ticket, ticket.status != .pending {
                        notPendingNotice(ticket)
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
        .confirmationDialog(
            confirmTitle,
            isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
            titleVisibility: .visible,
            presenting: confirming
        ) { choice in
            Button("Paid by \(choice.title)") { confirm(choice) }
            Button("Not yet", role: .cancel) {}
        } message: { choice in
            Text(choice == .squareApp
                 ? "Charge $\(total.fmt2) in the Square app first, then confirm here."
                 : "Only confirm once you have the money.")
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
        let isEnabled = !isCharging && (!isReaderChoice || readerReady)
        return Button {
            if isReaderChoice {
                Task { await chargeOnReader() }
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
                    Text("No reader on this phone")
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
            if !readerReady {
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

    private func chargeOnReader() async {
        isCharging = true
        chargeError = ""
        // Warm the printer link while the card is processed, so the receipt
        // can print the moment the payment succeeds.
        EpsonPrinter.shared.checkConnection()
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
