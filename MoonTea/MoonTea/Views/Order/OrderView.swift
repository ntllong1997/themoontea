import SwiftUI

struct OrderView: View {
    @State private var vm = OrderViewModel()
    @State private var tab: Tab = .order
    @State private var ticketFilter: TicketFilter = .all
    @State private var tillName = TillSettings.name
    @State private var tillNameDraft = ""
    @State private var isRenamingTill = false
    @Environment(AppRouter.self) private var router

    enum Tab: Hashable { case order, tickets }

    enum TicketFilter: CaseIterable, Hashable {
        case all, pending, paid, cancelled

        var title: String {
            switch self {
            case .all:       "All"
            case .pending:   "Pending"
            case .paid:      "Paid"
            case .cancelled: "Cancelled"
            }
        }

        func matches(_ status: OrderStatus) -> Bool {
            switch self {
            case .all:       true
            case .pending:   status == .pending
            case .paid:      status == .paid
            case .cancelled: status == .cancelled
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            UploadStatusBadge()
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
                        tillRow
                        filterPicker
                        HistorySectionView(vm: vm, filter: { [ticketFilter] in ticketFilter.matches($0.orderStatus) })
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
        .alert("Name this till", isPresented: $isRenamingTill) {
            TextField("e.g. Till B", text: $tillNameDraft)
            Button("Save") {
                TillSettings.name = tillNameDraft
                tillName = TillSettings.name
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
        Picker("Show", selection: $ticketFilter) {
            ForEach(TicketFilter.allCases, id: \.self) { filter in
                Text(filterTitle(filter)).tag(filter)
            }
        }
        .pickerStyle(.segmented)
    }

    private func filterTitle(_ filter: TicketFilter) -> String {
        guard filter != .all else { return filter.title }
        let count = vm.history.filter { filter.matches($0.status) }.count
        return count == 0 ? filter.title : "\(filter.title) \(count)"
    }

    private var tabBar: some View {
        HStack(spacing: 0) {
            tabButton("Order", .order)
            tabButton("Tickets", .tickets)
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
