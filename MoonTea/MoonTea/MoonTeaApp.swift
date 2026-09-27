import SwiftUI

@main
struct MoonTeaApp: App {
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .task { MenuStore.shared.start() }
        }
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .active:
                SquareService.shared.handleAppDidBecomeActive()
                // Pick up a menu edited while the iPad was asleep right away.
                Task { await MenuStore.shared.refresh() }
            case .background: SquareService.shared.handleAppDidBackground()
            default:          break
            }
        }
    }
}
