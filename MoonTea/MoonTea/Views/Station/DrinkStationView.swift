import SwiftUI

struct DrinkStationView: View {
    @State private var vm = OrderViewModel()

    var body: some View {
        ScrollView {
            HistorySectionView(vm: vm, filter: { $0.type == .boba }, showRevenueTotal: false, isStation: true)
                .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("🧋 Drink Station")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { vm.startPolling() }
        .onDisappear { vm.stopPolling() }
    }
}
