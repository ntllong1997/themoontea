import SwiftUI

// The iPad's mirror of lib/menu/catalog.js. The menu's DATA (names, prices,
// choices, order, shown/hidden) is edited on the web at /menu and loaded by
// MenuStore; the built-in copy is DefaultMenu.swift. What stays in code is
// BEHAVIOUR — colours, prep flows, stations, conditional add-ons — keyed by
// category `key`, the string persisted as an order row's `type`.
//
// `OrderItemType` tolerates an unknown type, so an iPad on an older build
// still shows and prints orders for a category it has never seen.

// MARK: - Selection

/// What the operator has picked so far for one category.
struct MenuSelection: Equatable, Sendable {
    var options: [String: String] = [:]
    var addOns: [String: Bool] = [:]
}

// MARK: - Catalog types

/// One choice within an option group. `price` is non-zero only when the choice
/// itself carries the cost — sides, where a water is $1 and a soda is $2 under
/// one category. `ExpressibleByStringLiteral` keeps flat-priced groups written
/// as plain string arrays.
struct MenuOption: Identifiable, Hashable, Sendable, ExpressibleByStringLiteral {
    let value: String
    let price: Double

    init(_ value: String, price: Double = 0) {
        self.value = value
        self.price = price
    }

    init(stringLiteral value: String) { self.init(value) }

    var id: String { value }
}

struct MenuOptionGroup: Identifiable, Sendable {
    /// Where the chosen value lands on the cart line.
    enum Role: Sendable {
        /// Joined with the other `.name` groups to form the base name.
        case name
        /// Emitted as a modifier, so the line reads "Base (Value)".
        case modifier
    }

    let key: String
    let label: String
    let options: [MenuOption]
    let role: Role

    var id: String { key }

    func option(_ value: String?) -> MenuOption? {
        guard let value else { return nil }
        return options.first { $0.value == value }
    }
}

/// An optional extra. `appliesWhen` gates both whether the toggle is offered
/// and whether its price counts, so a stale toggle can never inflate the price
/// after the selection it depended on has changed.
struct MenuAddOn: Identifiable, Sendable {
    let key: String
    let price: Double
    let label: @Sendable (MenuSelection) -> String?
    let appliesWhen: @Sendable (MenuSelection) -> Bool

    var id: String { key }
}

/// An add-on resolved against a concrete selection.
struct ResolvedAddOn: Identifiable, Sendable {
    let key: String
    let price: Double
    let label: String

    var id: String { key }
}

struct MenuFlowState: Sendable {
    let next: String
    let badge: String
    let background: Color
    let foreground: Color
}

struct MenuFlow: Sendable {
    let initial: String
    let states: [String: MenuFlowState]

    /// Falls back to the initial state so an unrecognised status still renders.
    func state(_ name: String?) -> MenuFlowState {
        if let name, let state = states[name] { return state }
        // Every flow below defines its own initial state, so this is total.
        return states[initial]!
    }

    func next(after name: String?) -> String { state(name).next }
}

struct MenuStation: Sendable {
    let slug: String
    let title: String
}

struct MenuCategory: Identifiable, Sendable {
    enum Layout: Sendable {
        /// Each group is a row of choices — short option lists.
        case rows
        /// Groups sit side by side with choices stacked — long option lists.
        case columns
    }

    let key: String
    let label: String
    let orderable: Bool
    let price: Double
    let layout: Layout
    let optionGroups: [MenuOptionGroup]
    let addOns: [MenuAddOn]
    let flow: MenuFlow
    let station: MenuStation?

    var id: String { key }
    var type: OrderItemType { OrderItemType(rawValue: key) }
}

// MARK: - Flows

private let corndogRed = Color(red: 0.5, green: 0.0, blue: 0.0)
private let bobaBlue = Color(red: 0.05, green: 0.15, blue: 0.5)
private let neutralAmber = Color(red: 0.45, green: 0.30, blue: 0.0)

private let corndogFlow = MenuFlow(
    initial: "received",
    states: [
        "received": .init(next: "making", badge: "New",
                          background: Color.red.opacity(0.08), foreground: corndogRed),
        "making": .init(next: "ready", badge: "Making…",
                        background: Color.red.opacity(0.18), foreground: corndogRed),
        "ready": .init(next: "pickedup", badge: "Ready ✓",
                       background: Color.red.opacity(0.45), foreground: corndogRed),
        "pickedup": .init(next: "received", badge: "Picked Up ✓",
                          background: Color.red, foreground: .white),
    ]
)

private let bobaFlow = MenuFlow(
    initial: "new",
    states: [
        "new": .init(next: "ready", badge: "New",
                     background: Color.blue.opacity(0.18), foreground: bobaBlue),
        "ready": .init(next: "pickedup", badge: "Ready ✓",
                       background: Color.blue.opacity(0.45), foreground: bobaBlue),
        "pickedup": .init(next: "new", badge: "Picked Up ✓",
                          background: Color.blue, foreground: .white),
    ]
)

private let discountFlow = MenuFlow(
    initial: "applied",
    states: [
        "applied": .init(next: "applied", badge: "Coupon",
                         background: Color.green.opacity(0.10), foreground: .green),
    ]
)

/// The New -> Picked Up flow used by counter items that need no prep tracking.
private func twoStepFlow(_ accent: Color, text: Color) -> MenuFlow {
    MenuFlow(
        initial: "new",
        states: [
            "new": .init(next: "pickedup", badge: "New",
                         background: accent.opacity(0.18), foreground: text),
            "pickedup": .init(next: "new", badge: "Picked Up ✓",
                              background: accent, foreground: .white),
        ]
    )
}

/// The neutral fallback for a unit with no type at all.
let simpleMenuFlow = twoStepFlow(.orange, text: neutralAmber)

private let cookieFlow = twoStepFlow(.orange, text: neutralAmber)
private let lemonadeFlow = twoStepFlow(.yellow, text: Color(red: 0.40, green: 0.33, blue: 0.0))
private let eggRollFlow = twoStepFlow(.purple, text: Color(red: 0.30, green: 0.10, blue: 0.45))
private let sideFlow = twoStepFlow(.pink, text: Color(red: 0.45, green: 0.10, blue: 0.28))
private let spiroPapaFlow = twoStepFlow(.brown, text: Color(red: 0.35, green: 0.20, blue: 0.08))

private func hex(_ value: UInt32) -> Color {
    Color(red: Double((value >> 16) & 0xFF) / 255,
          green: Double((value >> 8) & 0xFF) / 255,
          blue: Double(value & 0xFF) / 255)
}

/// Spare colours for categories created in the web menu editor. Same order as
/// EXTRA_FLOWS in lib/menu/catalog.js (Tailwind 600 / 900), and picked by the
/// same hash, so a new item is the same colour on every till.
private let extraFlows: [MenuFlow] = [
    twoStepFlow(hex(0x65A30D), text: hex(0x365314)), // lime
    twoStepFlow(hex(0x0D9488), text: hex(0x134E4A)), // teal
    twoStepFlow(hex(0x4F46E5), text: hex(0x312E81)), // indigo
    twoStepFlow(hex(0xC026D3), text: hex(0x701A75)), // fuchsia
    twoStepFlow(hex(0xE11D48), text: hex(0x881337)), // rose
    twoStepFlow(hex(0x0284C7), text: hex(0x0C4A6E)), // sky
    twoStepFlow(hex(0x059669), text: hex(0x064E3B)), // emerald
    twoStepFlow(hex(0x7C3AED), text: hex(0x4C1D95)), // violet
]

/// Drinks that offer a "hold the other flavour" tweak, and what to call it.
private let drinkCustomizations: [String: String] = [
    "Matcha Strawberry": "Only Matcha",
    "Golden Taro": "Only Taro",
]

// MARK: - Behaviour

/// The half of a category that is code rather than editable data, keyed by
/// category key. Mirrors CATEGORY_BEHAVIOURS in lib/menu/catalog.js. A
/// category created in the editor has no entry and gets the defaults.
///
/// An add-on's condition names an option value, so renaming that option on
/// /menu quietly stops offering the add-on — it never charges wrongly.
private struct CategoryBehaviour {
    var layout: MenuCategory.Layout = .rows
    var addOns: [MenuAddOn] = []
    var flow: MenuFlow?
    var station: MenuStation?
}

private let categoryBehaviours: [String: CategoryBehaviour] = [
    "Corndog": CategoryBehaviour(
        addOns: [
            .init(key: "dust",
                  price: 1.0,
                  label: { _ in "Hot Cheeto Dust" },
                  appliesWhen: { $0.options["outside"] == "Potato" }),
        ],
        flow: corndogFlow,
        station: .init(slug: "corndog", title: "🌭 Corndog Station")
    ),
    "Boba": CategoryBehaviour(
        layout: .columns,
        addOns: [
            .init(key: "customization",
                  price: 0,
                  label: { drinkCustomizations[$0.options["drink"] ?? ""] },
                  appliesWhen: { drinkCustomizations[$0.options["drink"] ?? ""] != nil }),
        ],
        flow: bobaFlow,
        station: .init(slug: "drink", title: "🧋 Drink Station")
    ),
    "Cookie": CategoryBehaviour(flow: cookieFlow),
    "Lemonade": CategoryBehaviour(flow: lemonadeFlow),
    "Egg Roll": CategoryBehaviour(flow: eggRollFlow),
    "Spiro Papa": CategoryBehaviour(flow: spiroPapaFlow),
    "Side": CategoryBehaviour(flow: sideFlow),
]

// MARK: - Menu

/// A menu ready to render: editable config joined with code behaviour. A
/// hidden category stays in `categories` so history and the summary still
/// label its old orders; it only drops out of `orderable`.
struct Menu {
    let categories: [MenuCategory]
    let orderable: [MenuCategory]
    private let byKey: [String: MenuCategory]

    init(config: MenuConfig) {
        let built = config.categories.map { MenuCatalog.category(from: $0) } + [MenuCatalog.discountCategory]
        categories = built
        orderable = built.filter(\.orderable)
        byKey = Dictionary(built.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
    }

    func category(for type: OrderItemType) -> MenuCategory? { byKey[type.rawValue] }
}

// MARK: - Catalog

enum MenuCatalog {
    /// Coupon lines written by the till. Shown in history and the summary,
    /// never orderable and never editable, so every menu appends it.
    static let discountCategory = MenuCategory(
        key: "Discount",
        label: "Discount",
        orderable: false,
        price: 0,
        layout: .rows,
        optionGroups: [],
        addOns: [],
        flow: discountFlow,
        station: nil
    )

    static func category(from config: MenuConfig.Category) -> MenuCategory {
        let behaviour = categoryBehaviours[config.key] ?? CategoryBehaviour()
        return MenuCategory(
            key: config.key,
            label: config.label,
            orderable: config.visible,
            price: config.price,
            layout: behaviour.layout,
            optionGroups: config.optionGroups.map { group in
                MenuOptionGroup(
                    key: group.key,
                    label: group.label,
                    options: group.options.map { MenuOption($0.value, price: $0.price) },
                    role: group.role == "name" ? .name : .modifier
                )
            },
            addOns: behaviour.addOns,
            flow: flow(forKey: config.key),
            station: behaviour.station
        )
    }

    /// A category's prep flow from its key alone, so history can colour any
    /// row — including one whose category is hidden or unknown to this build.
    static func flow(forKey key: String) -> MenuFlow {
        if key == discountCategory.key { return discountFlow }
        if let builtIn = categoryBehaviours[key]?.flow { return builtIn }
        guard !key.isEmpty else { return simpleMenuFlow }
        return extraFlows[Int(MenuConfig.hashKey(key) % UInt32(extraFlows.count))]
    }

    /// The flow to render a unit with, tolerating a type this build predates.
    static func flow(for type: OrderItemType) -> MenuFlow {
        flow(forKey: type.rawValue)
    }

    // MARK: Selection -> cart item

    /// True once every group holds a value that is still on the menu, so a
    /// selection made before a menu edit cannot slip in a removed option.
    static func isComplete(_ category: MenuCategory, _ selection: MenuSelection) -> Bool {
        category.optionGroups.allSatisfy { group in
            group.option(selection.options[group.key]) != nil
        }
    }

    /// The add-ons currently offered, each with its label resolved for this
    /// selection. An add-on whose condition is false is neither shown nor charged.
    static func activeAddOns(_ category: MenuCategory, _ selection: MenuSelection) -> [ResolvedAddOn] {
        category.addOns.compactMap { addOn in
            guard addOn.appliesWhen(selection), let label = addOn.label(selection) else { return nil }
            return ResolvedAddOn(key: addOn.key, price: addOn.price, label: label)
        }
    }

    /// Selection -> the cart line, named identically to the website
    /// ("Base (Mod1, Mod2)") so a receipt printed here and the web history agree.
    /// Returns nil while the selection is incomplete or the category is not orderable.
    static func cartItem(_ category: MenuCategory, _ selection: MenuSelection) -> CartItem? {
        guard category.orderable, isComplete(category, selection) else { return nil }

        // A category with no name-role groups (a pack-only cookie, a plain
        // egg roll) is named after itself, so its choice reads as
        // "Cookie (3 for $14)" rather than colliding with a same-named item in
        // another category.
        let nameGroups = category.optionGroups.filter { $0.role == .name }
        let base = nameGroups.isEmpty
            ? category.label
            : nameGroups.compactMap { selection.options[$0.key] }.joined(separator: " ")

        let optionModifiers = category.optionGroups
            .filter { $0.role == .modifier }
            .compactMap { selection.options[$0.key] }

        let checked = activeAddOns(category, selection)
            .filter { selection.addOns[$0.key] == true }

        // A chosen option can carry its own price; for a flat-priced category
        // every option adds 0.
        let optionsTotal = category.optionGroups.reduce(0.0) { sum, group in
            sum + (group.option(selection.options[group.key])?.price ?? 0)
        }
        let addOnsTotal = checked.reduce(0.0) { $0 + $1.price }

        let modifiers = optionModifiers + checked.map(\.label)
        let name = modifiers.isEmpty ? base : "\(base) (\(modifiers.joined(separator: ", ")))"

        return CartItem(
            name: name,
            price: category.price + optionsTotal + addOnsTotal,
            type: category.type,
            quantity: 1
        )
    }

    /// What to show in the panel header. A category whose options carry their
    /// own prices shows the range they span rather than a misleading $0.00.
    static func priceLabel(for category: MenuCategory) -> String {
        func money(_ value: Double) -> String { String(format: "$%.2f", value) }

        // An option group is required, so its cheapest option is the floor.
        let bounds = category.optionGroups.reduce((min: category.price, max: category.price)) {
            acc, group in
            guard !group.options.isEmpty else { return acc }
            let prices = group.options.map(\.price)
            return (acc.min + (prices.min() ?? 0), acc.max + (prices.max() ?? 0))
        }

        return bounds.min == bounds.max
            ? money(bounds.min)
            : "\(money(bounds.min)) – \(money(bounds.max))"
    }
}
