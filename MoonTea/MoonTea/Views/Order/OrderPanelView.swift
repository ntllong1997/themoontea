import SwiftUI

struct OrderPanelView: View {
    @Bindable var vm: OrderViewModel

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 24) {
                Text("Order Panel")
                    .font(.system(size: 20, weight: .bold))

                corndogSection
                bobaSection
            }
        }
    }

    // MARK: Corndog

    private var corndogSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Corndog — $8.00")

            label("Inside")
            HStack(spacing: 8) {
                ForEach(AppConstants.corndogInsideOptions, id: \.self) { opt in
                    SelectButton(text: opt,
                                 selected: vm.selectedCorndogInside == opt) {
                        vm.selectedCorndogInside = opt
                    }
                }
            }

            label("Outside")
            HStack(spacing: 8) {
                ForEach(AppConstants.corndogOutsideOptions, id: \.self) { opt in
                    SelectButton(text: opt,
                                 selected: vm.selectedCorndogOutside == opt) {
                        vm.selectedCorndogOutside = opt
                    }
                }
            }

            if vm.selectedCorndogOutside == "Potato" {
                Toggle(isOn: $vm.selectedCorndogDust) {
                    Text("+ Hot Cheeto Dust")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.red)
                }
                .tint(.red)
            }

            Button(action: vm.addCorndog) {
                Text("+ Add Corndog")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .tint(.black)
            .disabled(vm.selectedCorndogInside.isEmpty || vm.selectedCorndogOutside.isEmpty)
        }
    }

    // MARK: Boba

    private var bobaSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Boba — $8.00")

            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    label("Drink")
                    ForEach(AppConstants.drinkOptions, id: \.self) { drink in
                        SelectButton(text: drink,
                                     selected: vm.selectedDrink == drink,
                                     compact: true) {
                            vm.selectedDrink = drink
                        }
                    }
                }
                .frame(maxWidth: .infinity)

                VStack(alignment: .leading, spacing: 6) {
                    label("Boba")
                    ForEach(AppConstants.bobaOptions, id: \.self) { boba in
                        SelectButton(text: boba,
                                     selected: vm.selectedBoba == boba,
                                     compact: true) {
                            vm.selectedBoba = boba
                        }
                    }
                }
                .frame(maxWidth: .infinity)
            }

            if let custom = vm.customizationLabel {
                label("Customization")
                SelectButton(text: vm.drinkCustomization ? "✓ \(custom)" : custom,
                             selected: vm.drinkCustomization,
                             compact: true) {
                    vm.drinkCustomization.toggle()
                }
            }

            Button(action: vm.addBoba) {
                Text("+ Add Boba")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .tint(.black)
            .disabled(vm.selectedDrink.isEmpty || vm.selectedBoba.isEmpty)
        }
    }

    // MARK: Helpers

    private func sectionHeader(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(Color.blue)
            .padding(.bottom, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .bottom) {
                Rectangle().frame(height: 0.5).foregroundStyle(Theme.cardBorder)
            }
    }

    private func label(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .medium))
            .tracking(0.5)
            .foregroundStyle(Theme.mutedText)
    }
}

private struct SelectButton: View {
    let text: String
    let selected: Bool
    var compact: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.system(size: compact ? 13 : 14, weight: .medium))
                .frame(maxWidth: .infinity)
                .padding(.vertical, compact ? 7 : 9)
                .padding(.horizontal, 8)
                .background(selected ? Color.black : Color(.secondarySystemBackground))
                .foregroundStyle(selected ? .white : Theme.strongText)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(Theme.cardBorder, lineWidth: selected ? 0 : 0.5)
                )
        }
        .buttonStyle(.plain)
    }
}
