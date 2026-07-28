import SwiftUI

struct CorndogStationView: View {
    @State private var vm = OrderViewModel()

    var body: some View {
        ScrollView {
            HistorySectionView(vm: vm, filter: { $0.type == .corndog }, showRevenueTotal: false, isStation: true)
                .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("🌭 Corndog Station")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { vm.startPolling() }
        .onDisappear { vm.stopPolling() }
    }
}
