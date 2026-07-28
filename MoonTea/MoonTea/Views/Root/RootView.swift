import SwiftUI

enum AppRoute: Hashable {
    case order
    case corndogStation
    case drinkStation
    case summary
    case cashapp
    case printer
    case reader
}

@MainActor
@Observable
final class AppRouter {
    var path = NavigationPath()
    func push(_ route: AppRoute) { path.append(route) }
    func reset() { path = NavigationPath() }
}

struct RootView: View {
    @State private var router = AppRouter()

    var body: some View {
        NavigationStack(path: $router.path) {
            VendorView()
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .order:           OrderView()
                    case .corndogStation:  CorndogStationView()
                    case .drinkStation:    DrinkStationView()
                    case .summary:         SummaryView()
                    case .cashapp:         CashAppView()
                    case .printer:         PrinterSettingsView()
                    case .reader:          ReaderSettingsView()
                    }
                }
        }
        .environment(router)
        .task { SquareService.configure() }
    }
}

#Preview { RootView() }
