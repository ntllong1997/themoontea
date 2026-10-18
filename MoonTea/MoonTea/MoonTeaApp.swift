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
                // Also the first touch at launch, so orders left waiting from
                // an earlier session start uploading before any screen opens.
                OrderOutbox.shared.nudge()
                // Tickets load from launch, not only once the Orders screen
                // opens: the main phone serves them to the tills.
                TicketStore.shared.start()
                BoothSync.shared.resume()
                ActivityLog.shared.info(.app, "App opened")
                ActivityLog.shared.flush()
                SquareService.shared.handleAppDidBecomeActive()
                EpsonPrinter.shared.handleAppDidBecomeActive()
            case .background:
                ActivityLog.shared.info(.app, "App went to the background")
                // iOS drops the booth link in the background anyway.
                BoothSync.shared.stop()
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
