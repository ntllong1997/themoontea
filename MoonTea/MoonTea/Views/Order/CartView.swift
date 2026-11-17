import SwiftUI

struct CartView: View {
    @Bindable var vm: OrderViewModel
    @Environment(AppRouter.self) private var router
    @State private var printer = EpsonPrinter.shared
    @State private var payTarget: PayTarget?
    @FocusState private var phoneFieldFocused: Bool

    private var phoneIsValid: Bool {
        let digits = vm.phone.filter(\.isNumber).count
        return digits == 0 || digits == 10
    }

    private struct PayTarget: Identifiable {
        let orderNumber: Int
        var id: Int { orderNumber }
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("Cart").font(.system(size: 20, weight: .bold))

                VStack(alignment: .leading, spacing: 4) {
                    Text("CUSTOMER PHONE")
                        .font(.system(size: 11, weight: .medium))
                        .tracking(0.5)
                        .foregroundStyle(Theme.mutedText)
                    TextField("(555) 000-0000", text: $vm.phone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                        .focused($phoneFieldFocused)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    if !phoneIsValid {
                        Text("Phone must be 10 digits")
                            .font(.system(size: 11))
                            .foregroundStyle(.red)
                    }
                }

                if vm.cart.isEmpty {
                    Text("No items added yet.")
                        .foregroundStyle(Theme.mutedText)
                        .font(.system(size: 14))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                } else {
                    ForEach(Array(vm.cart.enumerated()), id: \.element.id) { idx, item in
                        cartRow(idx: idx, item: item)
                    }
                }

                couponToggle

                Divider().padding(.vertical, 4)

                totalsRows
                printerRow

                if !vm.sendError.isEmpty {
                    Text(vm.sendError)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity)
                }

                sendButton
                sentBanner
            }
        }
        .sheet(item: $payTarget) { target in
            PaymentSheet(vm: vm, orderNumber: target.orderNumber)
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("OK") { phoneFieldFocused = false }
            }
        }
    }

    // MARK: - Send button

    /// Sends the ticket to the stations as pending and opens its payment page
    /// while the receipt prints. Closing it leaves the ticket unpaid, payable
    /// later from "Pay now" below or the Tickets tab.
    private var sendButton: some View {
        Button {
            Task {
                guard let number = await vm.sendOrder() else { return }
                payTarget = PayTarget(orderNumber: number)
            }
        } label: {
            Group {
                if vm.isSending {
                    ProgressView().tint(.white)
                } else {
                    Text("Send to kitchen")
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
        }
        .buttonStyle(.borderedProminent)
        .tint(.black)
        .disabled(vm.cart.isEmpty || vm.isSending || !phoneIsValid)
    }

    /// Shortcut to pay the ticket just sent, while it is still unpaid.
    @ViewBuilder
    private var sentBanner: some View {
        if let number = vm.lastSentOrderNumber, let ticket = vm.ticket(number), ticket.status == .pending {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.success)
                Text("Ticket #\(number) sent").font(.system(size: 14, weight: .semibold))
                Spacer()
                Button("Pay now") { payTarget = PayTarget(orderNumber: number) }
                    .font(.system(size: 14, weight: .semibold))
                    .buttonStyle(.bordered)
            }
            .padding(10)
            .background(Theme.success.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    // MARK: - Cart rows

    private func cartRow(idx: Int, item: CartItem) -> some View {
        CartLineItemRow(
            item: item,
            onDecrement: { vm.changeQuantity(at: idx, by: -1) },
            onIncrement: { vm.changeQuantity(at: idx, by: 1) },
            onRemove:    { vm.changeQuantity(at: idx, by: -item.quantity) }
        )
    }

    // MARK: - Controls

    private var totalsRows: some View {
        VStack(spacing: 4) {
            TotalsRow(left: "Subtotal", right: "$\(vm.cartSubtotal.fmt2)")
            if vm.couponApplied && vm.discount > 0 {
                TotalsRow(left: "Coupon", right: "-$\(vm.discount.fmt2)", muted: true)
                TotalsRow(left: "Adjusted Subtotal", right: "$\(vm.subtotal.fmt2)")
            }
            TotalsRow(left: "Tax (\(Int(AppConstants.taxRate * 100))%)", right: "$\(vm.tax.fmt2)", muted: true)
            TotalsRow(left: "Total", right: "$\(vm.total.fmt2)", bold: true)
        }
    }

    private var couponToggle: some View {
        Toggle(isOn: $vm.couponApplied) {
            HStack(spacing: 6) {
                Image(systemName: "ticket").foregroundStyle(.green)
                Text("Apply $4 OFF coupon").font(.system(size: 14, weight: .medium))
            }
        }
        .tint(.green)
        .padding(.vertical, 4)
    }

    private var printerRow: some View {
        Button { router.push(.printer) } label: {
            HStack {
                Image(systemName: "printer")
                Text("Printer")
                Spacer()
                Text(printerStatusText).foregroundStyle(printerStatusColor)
                Image(systemName: "chevron.right")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.mutedText)
            }
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Theme.strongText)
            .padding(.vertical, 8)
            .padding(.horizontal, 4)
        }
        .buttonStyle(.plain)
    }

    private var printerStatusText: String {
        switch printer.status {
        case .scanning:   return "Scanning…"
        case .connecting: return "Connecting…"
        case .printing:   return "Printing…"
        case .error:      return "Error"
        case .idle:       return printer.hasSavedPrinter ? printer.savedName : "Not set up"
        }
    }

    private var printerStatusColor: Color {
        switch printer.status {
        case .scanning, .connecting, .printing: .orange
        case .error:                            .red
        case .idle:                             printer.hasSavedPrinter ? .green : Theme.mutedText
        }
    }

}

// MARK: -

extension Double {
    var fmt2: String { String(format: "%.2f", self) }
}
