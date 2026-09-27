import Foundation
import Observation

/// The menu this iPad sells from, kept in step with the one edited on the web
/// at /menu. Views read `MenuStore.shared.menu`; Observation re-renders them
/// when a refresh brings a changed menu.
///
/// Launch uses this iPad's cached menu straight away when it has one, so an
/// offline till is usable at once; with no cache it waits for the first fetch
/// (`isLoaded`) before letting staff tap, so a fresh install never sells at
/// the built-in prices by accident. After that it re-checks every minute and
/// whenever the app returns to the foreground.
@MainActor
@Observable
final class MenuStore {
    static let shared = MenuStore()

    private(set) var menu: Menu
    private(set) var source: MenuSource
    /// False only until the first menu is known — cached or fetched.
    private(set) var isLoaded: Bool

    private var config: MenuConfig
    private var refreshTask: Task<Void, Never>?

    private static let cacheKey = "moontea.menuConfig.v1"
    private static let refreshInterval: Duration = .seconds(60)

    private init() {
        let cached = MenuResolution.validCache(UserDefaults.standard.data(forKey: Self.cacheKey))
        let starting = cached ?? .builtIn
        config = starting
        source = cached == nil ? .builtIn : .cached
        isLoaded = cached != nil
        menu = Menu(config: starting)
    }

    /// Starts the once-a-minute refresh loop. Safe to call more than once.
    func start() {
        guard refreshTask == nil else { return }
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: Self.refreshInterval)
            }
        }
    }

    func refresh() async {
        let fetched: Result<Data, Error>
        do {
            fetched = .success(try await SupabaseService.shared.fetchMenuConfigData())
        } catch {
            fetched = .failure(error)
        }

        let resolution = MenuResolution.resolve(
            fetched: fetched,
            cached: UserDefaults.standard.data(forKey: Self.cacheKey)
        )
        if let failure = resolution.failure {
            print("[MenuStore] saved menu unavailable, using \(resolution.source): \(failure)")
        }
        if let toCache = resolution.toCache {
            do {
                UserDefaults.standard.set(try JSONEncoder().encode(toCache), forKey: Self.cacheKey)
            } catch {
                print("[MenuStore] could not cache menu: \(error)")
            }
        }

        isLoaded = true
        // Skip the rebuild when nothing changed, so a quiet refresh does not
        // re-render every panel once a minute.
        guard resolution.config != config || resolution.source != source else { return }
        config = resolution.config
        source = resolution.source
        menu = Menu(config: resolution.config)
    }
}
