import SwiftUI

struct SummaryView: View {
    @State private var allOrders: [Order] = []
    @State private var dateFilter: DateFilter = .today
    @State private var typeFilter: TypeFilter = .all
    @State private var loadError: Bool = false
    @State private var isLoading: Bool = true

    enum DateFilter: String, CaseIterable, Identifiable {
        case today = "Today"
        case week = "This Week"
        case all = "All Time"
        var id: Self { self }
    }

    enum TypeFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case boba = "Boba"
        case corndog = "Corndog"
        var id: Self { self }
    }

    private var filteredItems: [Order] {
        let cal = Calendar.current
        let now = Date()
        let weekAgo = cal.date(byAdding: .day, value: -6, to: cal.startOfDay(for: now)) ?? now
        return allOrders.filter { item in
            // If we can't parse the timestamp, keep the item visible only for
            // "All Time" — better to show suspicious data than hide it silently.
            let parsed = TimestampParser.parse(item.timestamp)
            let matchDate: Bool = switch dateFilter {
            case .all:   true
            case .today: parsed.map { cal.isDateInToday($0) } ?? false
            case .week:  parsed.map { $0 >= weekAgo } ?? false
            }
            // Discount rows are kept only for the "All" type filter (the only
            // place we can attribute them accurately — they're applied at the
            // order level, not per item).
            let matchType: Bool = switch typeFilter {
            case .all:     true
            case .boba:    item.type == .boba
            case .corndog: item.type == .corndog
            }
            return matchDate && matchType
        }
    }

    private struct Summary: Hashable {
        let name: String
        let count: Int
        let revenue: Double
    }

    private var itemSummary: [Summary] {
        var buckets: [String: (count: Int, revenue: Double)] = [:]
        for item in filteredItems where item.type != .discount {
            var entry = buckets[item.name] ?? (0, 0)
            entry.count += 1
            entry.revenue += item.price * (1 + AppConstants.taxRate)
            buckets[item.name] = entry
        }
        return buckets
            .map { Summary(name: $0.key, count: $0.value.count, revenue: $0.value.revenue) }
            .sorted { $0.count > $1.count }
    }

    private var totalItems: Int { filteredItems.filter { $0.type != .discount }.count }
    private var totalRevenue: Double {
        // Discounts (stored as negative-priced rows) reduce the total naturally.
        filteredItems.reduce(0) { $0 + $1.price * (1 + AppConstants.taxRate) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        pillGroup(DateFilter.allCases, selection: $dateFilter) { $0.rawValue }
                        pillGroup(TypeFilter.allCases, selection: $typeFilter) { $0.rawValue }
                    }
                }
                Card {
                    VStack(spacing: 0) {
                        if isLoading {
                            ProgressView().padding(20)
                        } else if loadError {
                            Text("Could not load data — check your connection.")
                                .foregroundStyle(.red).font(.system(size: 14))
                                .padding(.vertical, 20)
                        } else if itemSummary.isEmpty {
                            Text("No orders for this period.")
                                .foregroundStyle(Theme.mutedText).font(.system(size: 14))
                                .padding(.vertical, 20)
                        } else {
                            tableHeader
                            ForEach(itemSummary, id: \.name) { row in
                                summaryRow(row)
                            }
                        }
                        Divider().padding(.top, 8)
                        HStack {
                            Text("Total: \(totalItems) item\(totalItems == 1 ? "" : "s")")
                                .font(.system(size: 16, weight: .bold))
                            Spacer()
                            Text("$\(totalRevenue.fmt2)")
                                .font(.system(size: 16, weight: .bold))
                        }
                        .padding(.top, 8)
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Sales Summary")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            allOrders = try await SupabaseService.shared.allOrders()
            loadError = false
        } catch {
            loadError = true
        }
    }

    private func pillGroup<Item: Hashable & Identifiable>(
        _ items: [Item],
        selection: Binding<Item>,
        title: @escaping (Item) -> String
    ) -> some View {
        HStack(spacing: 6) {
            ForEach(items) { item in
                let active = selection.wrappedValue == item
                Button { selection.wrappedValue = item } label: {
                    Text(title(item))
                        .font(.system(size: 13, weight: .medium))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(active ? Color.black : Color(.secondarySystemBackground))
                        .foregroundStyle(active ? .white : Theme.mutedText)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var tableHeader: some View {
        HStack {
            Text("Item").frame(maxWidth: .infinity, alignment: .leading)
            Text("Qty").frame(width: 50, alignment: .trailing)
            Text("Revenue").frame(width: 80, alignment: .trailing)
        }
        .font(.system(size: 11, weight: .medium))
        .tracking(0.5)
        .foregroundStyle(Theme.mutedText)
        .padding(.bottom, 6)
        .overlay(alignment: .bottom) {
            Rectangle().frame(height: 0.5).foregroundStyle(Theme.cardBorder)
        }
    }

    private func summaryRow(_ row: Summary) -> some View {
        HStack {
            Text(row.name).frame(maxWidth: .infinity, alignment: .leading)
            Text("\(row.count)")
                .font(.system(size: 14, weight: .semibold))
                .frame(width: 50, alignment: .trailing)
            Text("$\(row.revenue.fmt2)")
                .foregroundStyle(Theme.mutedText)
                .frame(width: 80, alignment: .trailing)
        }
        .font(.system(size: 14))
        .padding(.vertical, 6)
        .overlay(alignment: .bottom) {
            Rectangle().frame(height: 0.5).foregroundStyle(Theme.cardBorder)
        }
    }
}
