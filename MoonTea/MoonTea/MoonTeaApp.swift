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
            case .active:
                // Also the first touch at launch, so orders left waiting from
                // an earlier session start uploading before any screen opens.
                OrderOutbox.shared.nudge()
                SquareService.shared.handleAppDidBecomeActive()
                EpsonPrinter.shared.handleAppDidBecomeActive()
            case .background:
                SquareService.shared.handleAppDidBackground()
                EpsonPrinter.shared.handleAppDidBackground()
            default:
                break
            }
        }
    }
}
