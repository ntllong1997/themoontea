import SwiftUI

/// Reopens an already-submitted order so a mis-rung item or payment method can
/// be corrected without ringing a second order (which would burn an order
/// number and double-count revenue).
///
/// Saving replaces every row of the order in one transaction, so the order
/// number and its position in the day are preserved but the rows themselves are
/// new — station progress for the order restarts. The coupon is intentionally
/// not editable here; its discount rows ride through untouched.
struct EditOrderSheet: View {
    @Bindable var vm: OrderViewModel
    let orderNumber: Int

    @Environment(\.dismiss) private var dismiss
    @State private var showSaveConfirmation = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    OrderPanelView(vm: vm)
                    itemsCard
                }
                .padding(.vertical, 8)
            }
            .navigationTitle("Edit Order #\(orderNumber)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        vm.cancelEdit()
                        dismiss()
                    }
                }
            }
        }
        .interactiveDismissDisabled(vm.isSavingEdit)
        .confirmationDialog(
            "Replace order #\(orderNumber)?",
            isPresented: $showSaveConfirmation,
            titleVisibility: .visible
        ) {
            Button("Save Changes", role: .destructive) {
                Task {
                    await vm.saveEdit()
                    if vm.editError.isEmpty { dismiss() }
                }
            }
            Button("Keep Editing", role: .cancel) {}
        } message: {
            Text("This rewrites the order in the database and resets its station progress.")
        }
    }

    // MARK: - Items

    private var itemsCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("Items").font(.system(size: 20, weight: .bold))

                if vm.editCart.isEmpty {
                    Text("An order can't be emptied — add an item or cancel.")
                        .foregroundStyle(.red)
                        .font(.system(size: 13))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                } else {
                    ForEach(Array(vm.editCart.enumerated()), id: \.element.id) { idx, item in
                        CartLineItemRow(
                            item: item,
                            onDecrement: { vm.changeEditQuantity(at: idx, by: -1) },
                            onIncrement: { vm.changeEditQuantity(at: idx, by: 1) },
                            onRemove:    { vm.changeEditQuantity(at: idx, by: -item.quantity) }
                        )
                    }
                }

                PaymentMethodPicker(selection: $vm.editPaymentMethod)

                Divider().padding(.vertical, 4)

                totals

                if !vm.editError.isEmpty {
                    Text(vm.editError)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity)
                }

                saveButton
            }
        }
    }

    private var totals: some View {
        VStack(spacing: 4) {
            TotalsRow(left: "Subtotal", right: "$\(vm.editCartSubtotal.fmt2)")
            if vm.editDiscount > 0 {
                TotalsRow(left: "Coupon", right: "-$\(vm.editDiscount.fmt2)", muted: true)
                TotalsRow(left: "Adjusted Subtotal", right: "$\(vm.editSubtotal.fmt2)")
            }
            TotalsRow(left: "Tax (\(Int(AppConstants.taxRate * 100))%)", right: "$\(vm.editTax.fmt2)", muted: true)
            TotalsRow(left: "Total", right: "$\(vm.editTotal.fmt2)", bold: true)
        }
    }

    private var saveButton: some View {
        Button {
            showSaveConfirmation = true
        } label: {
            if vm.isSavingEdit {
                ProgressView().tint(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            } else {
                Text("Save Changes")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
        }
        .buttonStyle(.borderedProminent)
        .tint(.black)
        .disabled(vm.editCart.isEmpty || vm.isSavingEdit)
    }
}
