import SwiftUI

// The iPad's mirror of lib/menu/catalog.js. Adding a category means adding one
// entry to `MenuCatalog.categories` here AND one to the web catalog — the two
// must agree on `key`, which is the string persisted as an order row's `type`.
//
// Ship this side FIRST when adding a category. `OrderItemType` tolerates an
// unknown type, so an older iPad will still show and print a new category's
// orders (on the neutral flow) rather than dropping them.

// MARK: - Selection

/// What the operator has picked so far for one category.
struct MenuSelection: Equatable, Sendable {
    var options: [String: String] = [:]
    var addOns: [String: Bool] = [:]
}

// MARK: - Catalog types

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
    let options: [String]
    let role: Role

    var id: String { key }
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

/// The neutral default, and what an unknown category falls back to. Give a new
/// category its own colours instead if you want it distinguishable in history.
let simpleMenuFlow = twoStepFlow(.orange, text: neutralAmber)

private let cookieFlow = twoStepFlow(.orange, text: neutralAmber)
private let lemonadeFlow = twoStepFlow(.yellow, text: Color(red: 0.40, green: 0.33, blue: 0.0))
private let eggRollFlow = twoStepFlow(.purple, text: Color(red: 0.30, green: 0.10, blue: 0.45))

/// Drinks that offer a "hold the other flavour" tweak, and what to call it.
private let drinkCustomizations: [String: String] = [
    "Matcha Strawberry": "Only Matcha",
    "Golden Taro": "Only Taro",
]

// MARK: - Catalog

enum MenuCatalog {
    static let categories: [MenuCategory] = [
        MenuCategory(
            key: "Corndog",
            label: "Corndog",
            orderable: true,
            price: 8.0,
            layout: .rows,
            optionGroups: [
                .init(key: "inside", label: "Inside",
                      options: ["Cheese", "Half-Half"], role: .name),
                .init(key: "outside", label: "Outside",
                      options: ["Potato", "Hot Cheeto", "Original"], role: .name),
            ],
            addOns: [
                .init(key: "dust",
                      price: 1.0,
                      label: { _ in "Hot Cheeto Dust" },
                      appliesWhen: { $0.options["outside"] == "Potato" }),
            ],
            flow: corndogFlow,
            station: .init(slug: "corndog", title: "🌭 Corndog Station")
        ),
        MenuCategory(
            key: "Boba",
            label: "Boba",
            orderable: true,
            price: 8.0,
            layout: .columns,
            optionGroups: [
                .init(key: "drink", label: "Drink",
                      options: [
                          "Brown Sugar",
                          "Matcha Brown Sugar",
                          "Golden Taro",
                          "Korean Strawberry",
                          "Tropical",
                          "Strawberry",
                          "Cafe",
                          "Matcha Strawberry",
                      ],
                      role: .name),
                .init(key: "boba", label: "Boba",
                      options: ["Tapioca", "Mango Popping", "Strawberry Popping", "Nothing"],
                      role: .modifier),
            ],
            addOns: [
                .init(key: "customization",
                      price: 0,
                      label: { drinkCustomizations[$0.options["drink"] ?? ""] },
                      appliesWhen: { drinkCustomizations[$0.options["drink"] ?? ""] != nil }),
            ],
            flow: bobaFlow,
            station: .init(slug: "drink", title: "🧋 Drink Station")
        ),
        // Cookie, Lemonade and Egg Roll put their flavour in a MODIFIER group,
        // not a name group, so a line reads "Cookie (Matcha Strawberry)".
        // Naming them by flavour alone would collide with the boba of the same
        // name, and the sales summary groups by name.
        MenuCategory(
            key: "Cookie",
            label: "Cookie",
            orderable: true,
            price: 5.0,
            layout: .columns,
            optionGroups: [
                .init(key: "flavor", label: "Flavor",
                      options: [
                          "Matcha Strawberry",
                          "Nutella Banana",
                          "Red Velvet",
                          "Taro Ube",
                          "Oreo 2.0",
                          "Biscoff",
                      ],
                      role: .modifier),
            ],
            addOns: [],
            flow: cookieFlow,
            station: nil
        ),
        MenuCategory(
            key: "Lemonade",
            label: "Lemonade",
            orderable: true,
            price: 7.0,
            layout: .rows,
            optionGroups: [
                .init(key: "base", label: "Flavor",
                      options: ["Tea", "Soda"], role: .modifier),
            ],
            addOns: [],
            flow: lemonadeFlow,
            station: nil
        ),
        // No option groups at all: a fixed 4-piece portion. `isComplete` is
        // vacuously true for an empty group list, so it can be added straight
        // away, and the line name falls back to the category label.
        MenuCategory(
            key: "Egg Roll",
            label: "Egg Roll",
            orderable: true,
            price: 7.0,
            layout: .rows,
            optionGroups: [],
            addOns: [],
            flow: eggRollFlow,
            station: nil
        ),
        // Coupon lines written by the till. Shown in history and the summary,
        // but never orderable from the panel.
        MenuCategory(
            key: "Discount",
            label: "Discount",
            orderable: false,
            price: 0,
            layout: .rows,
            optionGroups: [],
            addOns: [],
            flow: discountFlow,
            station: nil
        ),
    ]

    static let orderable: [MenuCategory] = categories.filter(\.orderable)
    static let stations: [MenuCategory] = categories.filter { $0.station != nil }

    private static let byKey: [String: MenuCategory] = Dictionary(
        uniqueKeysWithValues: categories.map { ($0.key, $0) }
    )

    static func category(for type: OrderItemType) -> MenuCategory? { byKey[type.rawValue] }

    static func category(slug: String) -> MenuCategory? {
        categories.first { $0.station?.slug == slug }
    }

    /// The flow to render a unit with, tolerating a type this build predates.
    static func flow(for type: OrderItemType) -> MenuFlow {
        category(for: type)?.flow ?? simpleMenuFlow
    }

    /// A blank selection per orderable category — the builder's starting state.
    static func freshSelections() -> [String: MenuSelection] {
        Dictionary(uniqueKeysWithValues: orderable.map { ($0.key, MenuSelection()) })
    }

    // MARK: Selection -> cart item

    static func isComplete(_ category: MenuCategory, _ selection: MenuSelection) -> Bool {
        category.optionGroups.allSatisfy { group in
            !(selection.options[group.key] ?? "").isEmpty
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

        // A category with no name-role groups (a flavour-only cookie, a plain
        // egg roll) is named after itself, so its flavour reads as
        // "Cookie (Biscoff)" rather than colliding with a same-named item in
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

        let modifiers = optionModifiers + checked.map(\.label)
        let name = modifiers.isEmpty ? base : "\(base) (\(modifiers.joined(separator: ", ")))"
        let price = category.price + checked.reduce(0) { $0 + $1.price }

        return CartItem(name: name, price: price, type: category.type, quantity: 1)
    }
}
