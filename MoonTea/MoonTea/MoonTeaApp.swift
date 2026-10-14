import SwiftUI

@main
struct MoonTeaApp: App {
    @Environment(\.scenePhase) private var scenePhase

    init() {
        ActivityLog.shared.info(.app, "App launched")
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .active:
                ActivityLog.shared.info(.app, "App opened")
                ActivityLog.shared.flush()
                SquareService.shared.handleAppDidBecomeActive()
                EpsonPrinter.shared.handleAppDidBecomeActive()
            case .background:
                ActivityLog.shared.info(.app, "App went to the background")
                SquareService.shared.handleAppDidBackground()
                EpsonPrinter.shared.handleAppDidBackground()
                // Try to get the latest entries up before iOS suspends us;
                // anything that misses the window uploads on the next launch.
                ActivityLog.shared.flush()
            default:
                break
            }
        }
    }
}
