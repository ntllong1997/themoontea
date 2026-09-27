import Foundation

/// The editable half of the menu, exactly as stored in Supabase
/// `menu_config.config` and edited on the web at /menu. Mirrors
/// lib/menu/defaultMenu.js; the built-in copy is `MenuConfig.builtIn`
/// (DefaultMenu.swift).
///
/// The web editor normalises every menu before saving it (trimmed text, prices
/// rounded to the cent, `visible` always present), so decoding here is strict.
struct MenuConfig: Codable, Equatable {
    struct Option: Codable, Equatable {
        let value: String
        let price: Double
    }

    struct Group: Codable, Equatable {
        let key: String
        let label: String
        /// "name" (part of the item name) or "modifier" (printed in brackets).
        let role: String
        let options: [Option]
    }

    struct Category: Codable, Equatable {
        /// Persisted as each order row's `type`; never changes once created.
        let key: String
        let label: String
        let price: Double
        let visible: Bool
        let optionGroups: [Group]
    }

    let categories: [Category]
}

enum MenuConfigError: Error, LocalizedError {
    case invalid(String)

    var errorDescription: String? {
        switch self {
        case .invalid(let reason): "Saved menu is invalid: \(reason)"
        }
    }
}

extension MenuConfig {
    static let maxPrice: Double = 1000
    /// Keys the code owns (see `MenuCatalog.discountCategory`).
    static let reservedKeys: Set<String> = ["Discount"]
    private static let roles: Set<String> = ["name", "modifier"]

    /// Decodes the PostgREST body of `menu_config?id=eq.1&select=config`.
    /// Returns nil when no menu has been saved yet; throws when the row exists
    /// but cannot be trusted, so the caller keeps its previous menu.
    static func parseRow(_ data: Data) throws -> MenuConfig? {
        struct Row: Decodable { let config: MenuConfig }
        let rows: [Row]
        do {
            rows = try JSONDecoder().decode([Row].self, from: data)
        } catch {
            throw MenuConfigError.invalid(error.localizedDescription)
        }
        guard let config = rows.first?.config else { return nil }
        try config.validate()
        return config
    }

    /// The same invariants lib/menu/menuConfig.js enforces before a save. The
    /// till re-checks because the stored row is external data. (The receipt
    /// name collision check is the editor's job: a collision only merges two
    /// rows in the sales summary, it never mis-charges.)
    func validate() throws {
        guard !categories.isEmpty else { throw MenuConfigError.invalid("no items") }

        var keys = Set<String>()
        for category in categories {
            let name = category.label
            guard !category.key.isEmpty, !name.isEmpty else { throw MenuConfigError.invalid("an item has no name") }
            guard !Self.reservedKeys.contains(category.key) else { throw MenuConfigError.invalid("\"\(category.key)\" is reserved") }
            guard keys.insert(category.key).inserted else { throw MenuConfigError.invalid("two items share \"\(category.key)\"") }
            guard Self.isValidPrice(category.price) else { throw MenuConfigError.invalid("\(name) has a bad price") }
            try validateGroups(category.optionGroups, in: name)
        }
    }

    private func validateGroups(_ groups: [Group], in name: String) throws {
        var groupKeys = Set<String>()
        for group in groups {
            guard !group.key.isEmpty, groupKeys.insert(group.key).inserted else {
                throw MenuConfigError.invalid("\(name) has a duplicate choice group")
            }
            guard Self.roles.contains(group.role) else { throw MenuConfigError.invalid("\(name) › \(group.label) has a bad role") }
            guard !group.options.isEmpty else { throw MenuConfigError.invalid("\(name) › \(group.label) has no options") }

            var values = Set<String>()
            for option in group.options {
                guard !option.value.isEmpty, values.insert(option.value).inserted else {
                    throw MenuConfigError.invalid("\(name) › \(group.label) has a blank or repeated option")
                }
                guard Self.isValidPrice(option.price) else { throw MenuConfigError.invalid("\(option.value) has a bad price") }
            }
        }
    }

    /// Stable 32-bit hash over Unicode scalars — identical to `hashKey` in
    /// lib/menu/catalog.js, so both apps give a new item the same colour.
    static func hashKey(_ key: String) -> UInt32 {
        key.unicodeScalars.reduce(UInt32(0)) { $0 &* 31 &+ $1.value }
    }

    private static func isValidPrice(_ price: Double) -> Bool {
        price.isFinite && price >= 0 && price <= maxPrice
    }
}
