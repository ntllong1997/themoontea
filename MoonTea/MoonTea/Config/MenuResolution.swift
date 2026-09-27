import Foundation

/// Where the menu an iPad is selling from came from.
enum MenuSource: Equatable {
    /// The menu saved on /menu, fetched just now.
    case saved
    /// The last saved menu this iPad saw — it could not reach the saved one.
    case cached
    /// The menu built into the app.
    case builtIn
}

/// Which menu to sell from, given a fetch result and this device's cache.
/// Pure, so it can be tested without a network; mirrors lib/menu/loadMenu.js:
///   1. a valid saved menu        -> use it, and remember it on this device
///   2. no menu saved yet         -> the built-in menu
///   3. fetch failed / invalid    -> the last valid cached menu, else built-in
/// A till with flaky signal keeps the prices it last knew instead of jumping
/// back to the ones the app shipped with.
struct MenuResolution {
    let config: MenuConfig
    let source: MenuSource
    /// A freshly fetched menu to remember on this device, if any.
    let toCache: MenuConfig?
    /// Why the saved menu was not used, for logging.
    let failure: String?

    static func resolve(fetched: Result<Data, Error>, cached: Data?) -> MenuResolution {
        let failure: String
        switch fetched {
        case .success(let data):
            do {
                guard let saved = try MenuConfig.parseRow(data) else {
                    return MenuResolution(config: .builtIn, source: .builtIn, toCache: nil, failure: nil)
                }
                return MenuResolution(config: saved, source: .saved, toCache: saved, failure: nil)
            } catch {
                failure = error.localizedDescription
            }
        case .failure(let error):
            failure = error.localizedDescription
        }

        if let cached = validCache(cached) {
            return MenuResolution(config: cached, source: .cached, toCache: nil, failure: failure)
        }
        return MenuResolution(config: .builtIn, source: .builtIn, toCache: nil, failure: failure)
    }

    /// The cached menu, if one exists and still passes validation.
    static func validCache(_ data: Data?) -> MenuConfig? {
        guard let data, let config = try? JSONDecoder().decode(MenuConfig.self, from: data) else { return nil }
        do {
            try config.validate()
            return config
        } catch {
            return nil
        }
    }
}
