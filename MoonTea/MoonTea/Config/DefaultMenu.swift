import Foundation

// The menu built into the iPad app: used until a saved menu loads, and when
// none can be loaded and nothing is cached. Must match DEFAULT_MENU_CONFIG in
// lib/menu/defaultMenu.js exactly — prices here are what a brand-new, offline
// iPad charges.

private func free(_ values: String...) -> [MenuConfig.Option] {
    values.map { MenuConfig.Option(value: $0, price: 0) }
}

extension MenuConfig {
    static let builtIn = MenuConfig(categories: [
        Category(
            key: "Corndog", label: "Corndog", price: 8.0, visible: true,
            optionGroups: [
                Group(key: "inside", label: "Inside", role: "name", options: free("Cheese", "Half-Half")),
                Group(key: "outside", label: "Outside", role: "name", options: free("Potato", "Hot Cheeto", "Original")),
            ]
        ),
        Category(
            key: "Boba", label: "Boba", price: 8.0, visible: true,
            optionGroups: [
                Group(key: "drink", label: "Drink", role: "name", options: free(
                    "Brown Sugar",
                    "Matcha Brown Sugar",
                    "Golden Taro",
                    "Korean Strawberry",
                    "Tropical",
                    "Strawberry",
                    "Cafe",
                    "Matcha Strawberry"
                )),
                Group(key: "boba", label: "Boba", role: "modifier",
                      options: free("Tapioca", "Mango Popping", "Strawberry Popping", "Nothing")),
            ]
        ),
        // The pack carries the price, so the category itself is $0.
        Category(
            key: "Cookie", label: "Cookie", price: 0, visible: true,
            optionGroups: [
                Group(key: "pack", label: "Pack", role: "modifier", options: [
                    Option(value: "1 for $5", price: 5.0),
                    Option(value: "3 for $14", price: 14.0),
                    Option(value: "5 for $23", price: 23.0),
                ]),
            ]
        ),
        Category(
            key: "Lemonade", label: "Lemonade", price: 7.0, visible: true,
            optionGroups: [
                Group(key: "base", label: "Flavor", role: "modifier", options: free("Tea", "Soda")),
            ]
        ),
        Category(key: "Egg Roll", label: "Egg Roll", price: 7.0, visible: true, optionGroups: []),
        Category(key: "Spiro Papa", label: "Spiro Papa", price: 6.0, visible: true, optionGroups: []),
        Category(
            key: "Side", label: "Side", price: 0, visible: true,
            optionGroups: [
                Group(key: "item", label: "Side", role: "modifier", options: [
                    Option(value: "Water", price: 1.0),
                    Option(value: "Soda", price: 2.0),
                    Option(value: "Flan", price: 5.0),
                ]),
            ]
        ),
    ])
}
