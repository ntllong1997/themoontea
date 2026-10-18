import SwiftUI

// Renders the whole order panel from MenuCatalog. There is no per-category
// markup here — a new category appears automatically once it is added to
// `MenuCatalog.categories` with `orderable: true`.

struct OrderPanelView: View {
    @Bindable var vm: OrderViewModel
    /// Category keys folded shut, comma-separated. Remembered on this phone,
    /// so staff can keep only the categories they sell open.
    @AppStorage("collapsedMenuCategories") private var collapsedKeys = ""

    private var collapsed: Set<String> {
        Set(collapsedKeys.split(separator: ",").map(String.init))
    }

    private func toggleCollapsed(_ key: String) {
        var keys = collapsed
        if keys.contains(key) { keys.remove(key) } else { keys.insert(key) }
        collapsedKeys = keys.sorted().joined(separator: ",")
    }

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
            sectionHeader(category)

            if !collapsed.contains(category.key) {
                categoryBody(category, selection: selection, addOns: addOns)
            }
        }
    }

    @ViewBuilder
    private func categoryBody(_ category: MenuCategory, selection: MenuSelection, addOns: [ResolvedAddOn]) -> some View {
        if category.layout == .columns {
            HStack(alignment: .top, spacing: 12) {
                ForEach(category.optionGroups) { group in
                    VStack(alignment: .leading, spacing: 6) {
                        label(group.label)
                        ForEach(group.options) { option in
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
                    ForEach(group.options) { option in
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

    private func optionButton(
        _ category: MenuCategory,
        _ group: MenuOptionGroup,
        _ option: MenuOption,
        _ selection: MenuSelection,
        compact: Bool
    ) -> some View {
        // Sides price the option, not the category, so the cost has to be
        // visible on the button itself.
        let text = option.price > 0
            ? "\(option.value) \(String(format: "$%.2f", option.price))"
            : option.value

        return SelectButton(text: text,
                            selected: selection.options[group.key] == option.value,
                            compact: compact) {
            vm.select(category, group: group.key, option: option.value)
        }
    }

    // MARK: Helpers

    /// Tap to fold the category shut or open it again.
    private func sectionHeader(_ category: MenuCategory) -> some View {
        let isCollapsed = collapsed.contains(category.key)
        return Button {
            withAnimation(.easeInOut(duration: 0.2)) { toggleCollapsed(category.key) }
        } label: {
            HStack {
                Text("\(category.label) — \(MenuCatalog.priceLabel(for: category))")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.blue)
                Spacer()
                Image(systemName: isCollapsed ? "chevron.down" : "chevron.up")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.mutedText)
            }
            .padding(.bottom, 4)
            .contentShape(Rectangle())
            .overlay(alignment: .bottom) {
                Rectangle().frame(height: 0.5).foregroundStyle(Theme.cardBorder)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(category.label), \(isCollapsed ? "collapsed" : "expanded")")
        .accessibilityHint(isCollapsed ? "Shows this category" : "Hides this category")
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
