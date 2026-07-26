import SwiftUI

// Renders the whole order panel from MenuCatalog. There is no per-category
// markup here — a new category appears automatically once it is added to
// `MenuCatalog.categories` with `orderable: true`.

struct OrderPanelView: View {
    @Bindable var vm: OrderViewModel

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 24) {
                Text("Order Panel")
                    .font(.system(size: 20, weight: .bold))

                ForEach(MenuCatalog.orderable) { category in
                    categorySection(category)
                }
            }
        }
    }

    // MARK: Category

    @ViewBuilder
    private func categorySection(_ category: MenuCategory) -> some View {
        let selection = vm.selection(for: category)
        // Only add-ons whose condition currently holds are offered — and the
        // same check gates their price, so what is shown is what is charged.
        let addOns = MenuCatalog.activeAddOns(category, selection)

        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("\(category.label) — $\(String(format: "%.2f", category.price))")

            if category.layout == .columns {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(category.optionGroups) { group in
                        VStack(alignment: .leading, spacing: 6) {
                            label(group.label)
                            ForEach(group.options, id: \.self) { option in
                                optionButton(category, group, option, selection, compact: true)
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            } else {
                ForEach(category.optionGroups) { group in
                    label(group.label)
                    HStack(spacing: 8) {
                        ForEach(group.options, id: \.self) { option in
                            optionButton(category, group, option, selection, compact: false)
                        }
                    }
                }
            }

            if !addOns.isEmpty {
                label("Extras")
                ForEach(addOns) { addOn in
                    let isOn = vm.isAddOnOn(category, key: addOn.key)
                    let suffix = addOn.price > 0 ? " +$\(String(format: "%.2f", addOn.price))" : ""
                    SelectButton(text: (isOn ? "✓ \(addOn.label)" : addOn.label) + suffix,
                                 selected: isOn,
                                 compact: true) {
                        vm.toggleAddOn(category, key: addOn.key)
                    }
                }
            }

            Button { vm.add(category) } label: {
                Text("+ Add \(category.label)")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .tint(.black)
            .disabled(!vm.canAdd(category))
        }
    }

    private func optionButton(
        _ category: MenuCategory,
        _ group: MenuOptionGroup,
        _ option: String,
        _ selection: MenuSelection,
        compact: Bool
    ) -> some View {
        SelectButton(text: option,
                     selected: selection.options[group.key] == option,
                     compact: compact) {
            vm.select(category, group: group.key, option: option)
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
