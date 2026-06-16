import SwiftUI

@main
struct MoonTeaApp: App {
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .active:     SquareService.shared.handleAppDidBecomeActive()
            case .background: SquareService.shared.handleAppDidBackground()
            default:          break
            }
        }
    }
}
