import SwiftUI

struct CartView: View {
    @Bindable var vm: OrderViewModel
    @Environment(AppRouter.self) private var router
    @State private var printer = EpsonPrinter.shared
    @State private var showPaymentSheet = false
    @State private var square = SquareService.shared
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
        .sheet(isPresented: $showPaymentSheet) {
            PaymentConfirmationSheet(vm: vm, isPresented: $showPaymentSheet)
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("OK") { phoneFieldFocused = false }
            }
        }
    }

    // MARK: - Send button

    private var readerReady: Bool { square.connectionState == .ready }

    private var sendButton: some View {
        VStack(spacing: 6) {
            Button {
                if vm.paymentMethod == .card && readerReady {
                    showPaymentSheet = true
                } else {
                    Task { await vm.sendOrder() }
                }
            } label: {
                if vm.isSending {
                    ProgressView().tint(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                } else {
                    HStack(spacing: 8) {
                        Text("Send Order")
                        if vm.paymentMethod == .card && readerReady {
                            Image(systemName: "wave.3.right.circle.fill")
                                .font(.system(size: 13))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.black)
            .disabled(vm.cart.isEmpty || vm.isSending || !phoneIsValid)

            if vm.paymentMethod == .card && !readerReady {
                Text("No reader connected — order will be recorded without charging")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.mutedText)
                    .multilineTextAlignment(.center)
            }
        }
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

// MARK: - Card payment sheet

private struct PaymentConfirmationSheet: View {
    @Bindable var vm: OrderViewModel
    @Binding var isPresented: Bool
    @State private var square = SquareService.shared
    @State private var isCharging = false
    @State private var chargeError: String = ""
    @Environment(AppRouter.self) private var router

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    cardIcon
                    amountDisplay
                    readerStatusRow
                    if !chargeError.isEmpty { errorRow }
                    actionButton
                }
                .padding(28)
            }
            .navigationTitle("Card Payment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isPresented = false }
                        .disabled(isCharging)
                }
            }
        }
    }

    // MARK: - Subviews

    private var cardIcon: some View {
        Image(systemName: square.connectionState == .ready ? "creditcard.fill" : "creditcard.trianglebadge.exclamationmark")
            .font(.system(size: 64))
            .foregroundStyle(square.connectionState == .ready ? Color.blue.opacity(0.85) : Color.orange)
            .symbolEffect(.pulse, isActive: isCharging)
    }

    private var amountDisplay: some View {
        VStack(spacing: 4) {
            Text("AMOUNT DUE")
                .font(.system(size: 11, weight: .medium))
                .tracking(1)
                .foregroundStyle(.secondary)
            Text("$\(vm.total.fmt2)")
                .font(.system(size: 54, weight: .bold))
        }
    }

    private var readerStatusRow: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(readerStatusColor)
                .frame(width: 8, height: 8)
            Text(readerStatusText)
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
            Spacer()
            if square.connectionState != .ready {
                Button("Set up") {
                    isPresented = false
                    router.push(.reader)
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.blue)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var errorRow: some View {
        Text(chargeError)
            .font(.system(size: 13))
            .foregroundStyle(.red)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 8)
    }

    // MARK: - Action button

    @ViewBuilder
    private var actionButton: some View {
        if square.connectionState == .ready {
            Button {
                Task { await charge() }
            } label: {
                Group {
                    if isCharging {
                        ProgressView().tint(.white)
                    } else {
                        HStack(spacing: 8) {
                            Image(systemName: "wave.3.right.circle.fill")
                            Text("Tap / Insert Card")
                                .fontWeight(.semibold)
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .foregroundStyle(.white)
                .background(Color.black)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(isCharging)
        } else {
            Button {
                isPresented = false
                router.push(.reader)
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.right.circle.fill")
                    Text("Open Reader Settings")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .foregroundStyle(.white)
                .background(Color.orange)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Charge

    private func charge() async {
        isCharging = true
        chargeError = ""
        let amountCents = Int((vm.total * 100).rounded())
        let result = await square.charge(amountCents: amountCents)
        isCharging = false
        switch result {
        case .success:
            isPresented = false
            await vm.sendOrder()
        case .cancelled:
            break   // sheet stays open, customer can retry
        case .failure(let msg):
            chargeError = msg
        }
    }

    // MARK: - Helpers

    private var readerStatusColor: Color {
        switch square.connectionState {
        case .ready:         .green
        case .connecting:    .yellow
        case .disconnected:  .red
        case .unauthorized, .notConfigured: .orange
        }
    }

    private var readerStatusText: String {
        switch square.connectionState {
        case .notConfigured:  "Square not configured"
        case .unauthorized:   "Square not authorized"
        case .disconnected:   "No reader connected"
        case .connecting:     "Connecting to reader…"
        case .ready:          "Reader ready"
        }
    }
}

// MARK: -

extension Double {
    var fmt2: String { String(format: "%.2f", self) }
}
