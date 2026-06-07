import SwiftUI

struct CartView: View {
    @Bindable var vm: OrderViewModel
    @Environment(AppRouter.self) private var router
    @State private var printer = EpsonPrinter.shared
    @FocusState private var phoneFieldFocused: Bool

    private var phoneIsValid: Bool {
        let digits = vm.phone.filter(\.isNumber).count
        return digits == 0 || digits == 10
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
                paymentPicker

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
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("OK") { phoneFieldFocused = false }
            }
        }
    }

    // MARK: - Send button

    private var sendButton: some View {
        Button {
            Task { await vm.sendOrder() }
        } label: {
            if vm.isSending {
                ProgressView().tint(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            } else {
                Text("Send Order")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
        }
        .buttonStyle(.borderedProminent)
        .tint(.black)
        .disabled(vm.cart.isEmpty || vm.isSending || !phoneIsValid)
    }

    // MARK: - Cart rows

    private func cartRow(idx: Int, item: CartItem) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).font(.system(size: 14, weight: .medium))
                Text("$\(item.price.fmt2) × \(item.quantity) = $\(item.lineTotal.fmt2)")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.mutedText)
            }
            Spacer()
            HStack(spacing: 4) {
                stepperButton("−") { vm.changeQuantity(at: idx, by: -1) }
                stepperButton("+") { vm.changeQuantity(at: idx, by: 1) }
                Button { vm.changeQuantity(at: idx, by: -item.quantity) } label: {
                    Text("✕")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(width: 40, height: 40)
                        .foregroundStyle(.white)
                        .background(Color.red)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 6)
        .overlay(alignment: .bottom) {
            Rectangle().frame(height: 0.5).foregroundStyle(Theme.cardBorder)
        }
    }

    private func stepperButton(_ text: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text)
                .font(.system(size: 16, weight: .semibold))
                .frame(width: 40, height: 40)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(Theme.cardBorder, lineWidth: 0.5)
                )
        }
        .buttonStyle(.plain)
        .foregroundStyle(Theme.strongText)
    }

    // MARK: - Controls

    private var totalsRows: some View {
        VStack(spacing: 4) {
            row("Subtotal", "$\(vm.cartSubtotal.fmt2)")
            if vm.couponApplied && vm.discount > 0 {
                row("Coupon", "-$\(vm.discount.fmt2)", muted: true)
                row("Adjusted Subtotal", "$\(vm.subtotal.fmt2)")
            }
            row("Tax (\(Int(AppConstants.taxRate * 100))%)", "$\(vm.tax.fmt2)", muted: true)
            row("Total", "$\(vm.total.fmt2)", bold: true)
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

    private var paymentPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("PAYMENT")
                .font(.system(size: 11, weight: .medium))
                .tracking(0.5)
                .foregroundStyle(Theme.mutedText)
            HStack(spacing: 6) {
                ForEach(PaymentMethod.allCases) { method in
                    let active = vm.paymentMethod == method
                    Button { vm.paymentMethod = method } label: {
                        VStack(spacing: 4) {
                            Image(systemName: method.icon).font(.system(size: 18))
                            Text(method.displayName).font(.system(size: 12, weight: .medium))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(active ? Color.black : Color(.secondarySystemBackground))
                        .foregroundStyle(active ? .white : Theme.strongText)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(Theme.cardBorder, lineWidth: active ? 0 : 0.5)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
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
        case .scanning: return "Scanning…"
        case .printing: return "Printing…"
        case .error:    return "Error"
        case .idle:     return printer.hasSavedPrinter ? printer.savedName : "Not set up"
        }
    }

    private var printerStatusColor: Color {
        switch printer.status {
        case .scanning, .printing: .orange
        case .error:               .red
        case .idle:                printer.hasSavedPrinter ? .green : Theme.mutedText
        }
    }

    private func row(_ left: String, _ right: String, muted: Bool = false, bold: Bool = false) -> some View {
        HStack {
            Text(left)
            Spacer()
            Text(right)
        }
        .font(.system(size: bold ? 16 : 14, weight: bold ? .bold : .regular))
        .foregroundStyle(muted ? Theme.mutedText : Theme.strongText)
    }
}

// MARK: -

extension Double {
    var fmt2: String { String(format: "%.2f", self) }
}
