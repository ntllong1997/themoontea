import SwiftUI

struct OrderView: View {
    @State private var vm = OrderViewModel()
    @State private var tab: Tab = .order
    @State private var historyFilter: HistoryFilter = .all
    @State private var tillName = TillSettings.name
    @State private var tillNameDraft = ""
    @State private var isRenamingTill = false
    @Environment(AppRouter.self) private var router

    /// Order: build and send. Tickets: unpaid tickets waiting to be paid —
    /// the work list. History: the day's record of paid and cancelled tickets.
    enum Tab: Hashable { case order, tickets, history }

    enum HistoryFilter: CaseIterable, Hashable {
        case all, paid, cancelled

        var title: String {
            switch self {
            case .all:       "All"
            case .paid:      "Paid"
            case .cancelled: "Cancelled"
            }
        }

        /// History never shows unpaid tickets; they're on the Tickets tab.
        func matches(_ status: OrderStatus) -> Bool {
            switch self {
            case .all:       status != .pending
            case .paid:      status == .paid
            case .cancelled: status == .cancelled
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            tabBar

            switch tab {
            case .order:
                ScrollView {
                    VStack(spacing: 16) {
                        OrderPanelView(vm: vm)
                        CartView(vm: vm)
                    }
                    .padding(16)
                }
            case .tickets:
                ScrollView {
                    VStack(spacing: 12) {
                        stationLinks
                        HistorySectionView(
                            vm: vm,
                            filter: { $0.orderStatus == .pending },
                            showRevenueTotal: false,
                            emptyText: "No unpaid tickets."
                        )
                    }
                    .padding(16)
                }
            case .history:
                ScrollView {
                    VStack(spacing: 12) {
                        tillRow
                        filterPicker
                        HistorySectionView(
                            vm: vm,
                            filter: { [historyFilter] in historyFilter.matches($0.orderStatus) },
                            emptyText: "No paid or cancelled tickets yet."
                        )
                    }
                    .padding(16)
                }
            }
        }
        // Status lines sit at the bottom, out of the way of the tabs.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                BoothStatusBadge()
                UploadStatusBadge()
            }
            .overlay(alignment: .top) {
                Rectangle().frame(height: 0.5).foregroundStyle(Theme.cardBorder)
            }
        }
        // A ticket just sent: show it on the work list.
        .onChange(of: vm.lastSentOrderNumber) { _, number in
            if number != nil { tab = .tickets }
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Orders")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Name this till", isPresented: $isRenamingTill) {
            TextField("e.g. Till B", text: $tillNameDraft)
            Button("Save") {
                TillSettings.name = tillNameDraft
                tillName = TillSettings.name
                BoothSync.shared.tillNameChanged()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Shown in each ticket's payment history, so staff can see which phone made a change.")
        }
    }

    private var tillRow: some View {
        HStack {
            Text("This till: \(tillName)")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(tillName == TillSettings.unnamed ? Color.orange : Theme.mutedText)
            Spacer()
            Button("Rename") {
                tillNameDraft = tillName == TillSettings.unnamed ? "" : tillName
                isRenamingTill = true
            }
            .font(.system(size: 12, weight: .semibold))
        }
        .padding(.horizontal, 4)
    }

    private var filterPicker: some View {
        Picker("Show", selection: $historyFilter) {
            ForEach(HistoryFilter.allCases, id: \.self) { filter in
                Text(filterTitle(filter)).tag(filter)
            }
        }
        .pickerStyle(.segmented)
    }

    private func filterTitle(_ filter: HistoryFilter) -> String {
        guard filter != .all else { return filter.title }
        let count = vm.history.filter { filter.matches($0.status) }.count
        return count == 0 ? filter.title : "\(filter.title) \(count)"
    }

    private var tabBar: some View {
        HStack(spacing: 0) {
            tabButton("Order", .order)
            tabButton(ticketsTabTitle, .tickets)
            tabButton("History", .history)
        }
        .background(Theme.cardBackground)
        .overlay(alignment: .bottom) {
            Rectangle().frame(height: 0.5).foregroundStyle(Theme.cardBorder)
        }
    }

    /// "Tickets 3" while three are waiting to be paid.
    private var ticketsTabTitle: String {
        let count = vm.history.filter { $0.status == .pending }.count
        return count == 0 ? "Tickets" : "Tickets \(count)"
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
