import SwiftUI

struct OrderView: View {
    @State private var vm = OrderViewModel()
    @State private var tab: Tab = .order
    @Environment(AppRouter.self) private var router

    enum Tab: Hashable { case order, history }

    var body: some View {
        VStack(spacing: 0) {
            tabBar

            if tab == .order {
                ScrollView {
                    VStack(spacing: 16) {
                        OrderPanelView(vm: vm)
                        CartView(vm: vm)
                    }
                    .padding(16)
                }
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        stationLinks
                        HistorySectionView(vm: vm, filter: { _ in true })
                    }
                    .padding(16)
                }
            }
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Orders")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            vm.startPolling()
        }
        .onDisappear {
            vm.stopPolling()
        }
    }

    private var tabBar: some View {
        HStack(spacing: 0) {
            tabButton("Order", .order)
            tabButton("History", .history)
        }
        .background(Theme.cardBackground)
        .overlay(alignment: .bottom) {
            Rectangle().frame(height: 0.5).foregroundStyle(Theme.cardBorder)
        }
    }

    private func tabButton(_ title: String, _ value: Tab) -> some View {
        let isActive = tab == value
        return Button { tab = value } label: {
            VStack(spacing: 0) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(isActive ? Theme.strongText : Theme.mutedText)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity)
                Rectangle()
                    .frame(height: 2)
                    .foregroundStyle(isActive ? Theme.strongText : .clear)
            }
        }
        .buttonStyle(.plain)
    }

    private var stationLinks: some View {
        HStack {
            Text("Stations").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.mutedText)
            Spacer()
            Button { router.push(.corndogStation) } label: {
                Text("🌭 Corndog")
                    .font(.system(size: 12, weight: .medium))
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Color.red.opacity(0.12))
                    .foregroundStyle(.red)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            Button { router.push(.drinkStation) } label: {
                Text("🧋 Drink")
                    .font(.system(size: 12, weight: .medium))
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Color.blue.opacity(0.12))
                    .foregroundStyle(.blue)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 4)
    }
}
