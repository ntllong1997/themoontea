import SwiftUI

/// Corrections to a paid or cancelled ticket. Only its payment can change:
/// the method, back to unpaid, or a cancelled ticket restored. Items are never
/// edited after payment — mark unpaid, edit, then pay again. Every change is
/// logged on the ticket.
struct PaymentCorrectionSheet: View {
    @Bindable var vm: OrderViewModel
    let orderNumber: Int

    @Environment(\.dismiss) private var dismiss
    @State private var pending: Correction?

    private enum Correction: Identifiable, Equatable {
        case changeMethod(PaymentMethod)
        case markUnpaid
        case restore

        var id: String {
            switch self {
            case .changeMethod(let method): "method-\(method.rawValue)"
            case .markUnpaid:               "unpaid"
            case .restore:                  "restore"
            }
        }
    }

    private var ticket: OrderGroup? { vm.ticket(orderNumber) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let ticket {
                        summary(ticket)
                        if ticket.isChargedInApp { cardChargedWarning(ticket) }
                        actions(ticket)
                        log(ticket)
                    }
                }
                .padding(20)
            }
            .navigationTitle("Ticket #\(orderNumber)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .confirmationDialog(
            confirmTitle,
            isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }),
            titleVisibility: .visible,
            presenting: pending
        ) { correction in
            Button(confirmButton(correction)) { apply(correction) }
            Button("Keep as is", role: .cancel) {}
        } message: { _ in
            if ticket?.isChargedInApp == true {
                Text("The card was really charged. This doesn't refund it — refunds happen in Square Dashboard.")
            }
        }
    }

    // MARK: - Sections

    private func summary(_ ticket: OrderGroup) -> some View {
        HStack {
            TicketStatusPill(ticket: ticket)
            Spacer()
            Text("$\(ticket.total(taxRate: AppConstants.taxRate).fmt2)")
                .font(.system(size: 22, weight: .bold))
        }
    }

    private func cardChargedWarning(_ ticket: OrderGroup) -> some View {
        Label(
            "Charged on the card reader. Changing this ticket won't refund the card — do refunds in Square Dashboard.",
            systemImage: "exclamationmark.triangle.fill"
        )
        .font(.system(size: 13))
        .foregroundStyle(.orange)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    @ViewBuilder
    private func actions(_ ticket: OrderGroup) -> some View {
        switch ticket.status {
        case .paid:
            VStack(alignment: .leading, spacing: 8) {
                sectionTitle("CHANGE PAYMENT METHOD")
                HStack(spacing: 8) {
                    ForEach(PaymentMethod.allCases) { method in
                        methodButton(method, isCurrent: ticket.paymentMethod == method)
                    }
                }
            }
            actionButton("Mark as unpaid", icon: "arrow.uturn.backward") { pending = .markUnpaid }
        case .cancelled:
            actionButton("Restore ticket", icon: "arrow.uturn.backward") { pending = .restore }
        case .pending:
            EmptyView()
        }
    }

    private func methodButton(_ method: PaymentMethod, isCurrent: Bool) -> some View {
        Button { pending = .changeMethod(method) } label: {
            VStack(spacing: 4) {
                Image(systemName: isCurrent ? "checkmark.circle.fill" : method.icon)
                    .font(.system(size: 18))
                Text(method.displayName).font(.system(size: 12, weight: .medium))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(isCurrent ? Color.black : Color(.secondarySystemBackground))
            .foregroundStyle(isCurrent ? .white : Theme.strongText)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isCurrent)
    }

    private func actionButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.system(size: 15, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
        }
        .buttonStyle(.bordered)
        .tint(Theme.strongText)
    }

    private func log(_ ticket: OrderGroup) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionTitle("PAYMENT HISTORY")
            if ticket.paymentLog.isEmpty {
                Text("No changes recorded.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.mutedText)
            } else {
                ForEach(Array(ticket.paymentLog.enumerated()), id: \.offset) { _, entry in
                    Text(entry.displayText).font(.system(size: 13))
                }
            }
        }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .medium))
            .tracking(0.5)
            .foregroundStyle(Theme.mutedText)
    }

    // MARK: - Confirm + apply

    private var confirmTitle: String {
        switch pending {
        case .changeMethod(let method): "Change ticket #\(orderNumber) to \(method.displayName)?"
        case .markUnpaid:               "Mark ticket #\(orderNumber) as unpaid?"
        case .restore:                  "Restore ticket #\(orderNumber)?"
        case nil:                       ""
        }
    }

    private func confirmButton(_ correction: Correction) -> String {
        switch correction {
        case .changeMethod(let method): "Change to \(method.displayName)"
        case .markUnpaid:               "Mark unpaid"
        case .restore:                  "Restore as unpaid"
        }
    }

    private func apply(_ correction: Correction) {
        switch correction {
        case .changeMethod(let method): vm.changePaymentMethod(orderNumber: orderNumber, to: method)
        case .markUnpaid:               vm.markUnpaid(orderNumber: orderNumber)
        case .restore:                  vm.restoreTicket(orderNumber: orderNumber)
        }
        dismiss()
    }
}

/// "Unpaid" / "Paid · Cash" / "Cancelled", coloured by status. Shared by the
/// ticket cards, the stations and the correction page.
struct TicketStatusPill: View {
    let ticket: OrderGroup
    var isLarge = false

    var body: some View {
        Text(text)
            .font(.system(size: isLarge ? 14 : 11, weight: .bold))
            .padding(.horizontal, isLarge ? 12 : 8)
            .padding(.vertical, isLarge ? 6 : 3)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    private var text: String {
        ticket.status == .paid ? "Paid · \(ticket.paymentStateLabel)" : ticket.status.label
    }

    private var color: Color {
        switch ticket.status {
        case .pending:   .orange
        case .paid:      Theme.success
        case .cancelled: .gray
        }
    }
}
