import SwiftUI
import MessageUI

struct HistorySectionView: View {
    @Bindable var vm: OrderViewModel
    let filter: (OrderUnit) -> Bool
    var showRevenueTotal: Bool = true
    /// Station mode: large rows optimised for at-a-glance reading from 60cm away.
    var isStation: Bool = false

    @State private var editingPhoneOrder: String?
    @State private var draftPhone: String = ""
    @State private var smsTarget: SMSTarget?
    @FocusState private var phoneEditorFocused: Bool

    private var draftPhoneIsValid: Bool {
        let digits = draftPhone.filter(\.isNumber).count
        return digits == 0 || digits == 10
    }

    private struct SMSTarget: Identifiable {
        let orderNumber: String
        let phone: String
        let body: String
        var id: String { orderNumber }
    }

    // Line items are stored collapsed with a quantity, so filter over the
    // expanded units — each physical drink still gets its own row and status.
    private var filteredGroups: [(group: OrderGroup, items: [OrderUnit])] {
        vm.history.compactMap { group in
            let items = group.units.filter(filter)
            return items.isEmpty ? nil : (group, items)
        }
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: isStation ? 16 : 12) {
                if filteredGroups.isEmpty {
                    Text("No orders yet.")
                        .foregroundStyle(Theme.mutedText)
                        .font(.system(size: 14))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 30)
                } else {
                    ForEach(filteredGroups, id: \.group.orderNumber) { entry in
                        orderCard(group: entry.group, items: entry.items)
                    }
                }

                if showRevenueTotal {
                    Divider().padding(.top, 4)
                    HStack {
                        Text("Total Revenue").font(.system(size: 16, weight: .bold))
                        Spacer()
                        Text("$\(vm.totalRevenueToday.fmt2)").font(.system(size: 16, weight: .bold))
                    }
                }
            }
        }
        .sheet(item: $smsTarget) { target in
            if MessageComposer.canSend {
                MessageComposer(recipient: target.phone, body: target.body) { _ in
                    vm.markNotified(target.orderNumber)
                    smsTarget = nil
                }
                .ignoresSafeArea()
            } else {
                VStack(spacing: 12) {
                    Text("This device can't send SMS.")
                        .font(.headline)
                    Button("Close") { smsTarget = nil }
                }
                .padding()
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("OK") { phoneEditorFocused = false }
            }
        }
        .alert("Save Failed", isPresented: Binding(
            get: { !vm.phoneError.isEmpty },
            set: { if !$0 { vm.phoneError = "" } }
        )) {
            Button("OK") { vm.phoneError = "" }
        } message: {
            Text(vm.phoneError)
        }
    }

    // MARK: - Order card

    private func orderCard(group: OrderGroup, items: [OrderUnit]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            orderCardHeader(group: group)

            VStack(spacing: isStation ? 6 : 4) {
                ForEach(items, id: \.id) { item in
                    itemRow(item: item)
                }
            }
            .padding(isStation ? 10 : 8)
        }
        .background(Theme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Theme.cardBorder, lineWidth: 0.5)
        )
    }

    @ViewBuilder
    private func orderCardHeader(group: OrderGroup) -> some View {
        if isStation {
            // Station: order number is the loudest element on the card
            HStack(spacing: 8) {
                Text("#\(group.orderNumber)")
                    .font(.system(size: 22, weight: .bold))
                Spacer(minLength: 4)
                actionButton(group: group)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color(.secondarySystemBackground))
        } else {
            HStack(spacing: 8) {
                Text("Order #\(group.orderNumber)")
                    .font(.system(size: 14, weight: .semibold))

                phoneEditor(orderNumber: group.orderNumber)

                Spacer(minLength: 4)

                actionButton(group: group)

                Text("$\(group.total.fmt2)")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.mutedText)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemBackground))
        }
    }

    // MARK: - Item row

    private func itemRow(item: OrderUnit) -> some View {
        let (bg, fg, badge): (Color, Color, String) = {
            switch item.type {
            case .boba:
                let s = vm.bobaStates[item.id] ?? .new
                return (s.background, s.foreground, s.badge)
            case .corndog:
                let s = vm.corndogStates[item.id] ?? .received
                return (s.background, s.foreground, s.badge)
            case .discount:
                return (Color.green.opacity(0.10), .green, "Coupon")
            }
        }()

        return Button {
            vm.cycleItem(item.id)
        } label: {
            if isStation {
                stationItemLabel(item: item, bg: bg, fg: fg, badge: badge)
            } else {
                historyItemLabel(item: item, bg: bg, fg: fg, badge: badge)
            }
        }
        .buttonStyle(.plain)
    }

    private func historyItemLabel(item: OrderUnit, bg: Color, fg: Color, badge: String) -> some View {
        HStack {
            Text(item.displayName).font(.system(size: 14))
            Spacer()
            Text("$\(item.price.fmt2)")
                .font(.system(size: 13))
                .foregroundStyle(fg.opacity(0.7))
            Text(badge)
                .font(.system(size: 11, weight: .semibold))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(bg)
        .foregroundStyle(fg)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private func stationItemLabel(item: OrderUnit, bg: Color, fg: Color, badge: String) -> some View {
        HStack(spacing: 12) {
            // Status badge on the LEFT — first thing the eye lands on
            Text(badge)
                .font(.system(size: 14, weight: .bold))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(fg.opacity(0.16))
                .foregroundStyle(fg)
                .clipShape(Capsule())

            Text(item.displayName)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(fg)
                .lineLimit(2)

            Spacer()

            Image(systemName: "chevron.right.circle")
                .font(.system(size: 18))
                .foregroundStyle(fg.opacity(0.35))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .frame(minHeight: 56)
        .background(bg)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // MARK: - Phone editor

    @ViewBuilder
    private func phoneEditor(orderNumber: String) -> some View {
        if editingPhoneOrder == orderNumber {
            TextField("phone", text: $draftPhone)
                .keyboardType(.phonePad)
                .font(.system(size: 12))
                .focused($phoneEditorFocused)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .stroke(draftPhoneIsValid ? Theme.cardBorder : Color.red, lineWidth: 0.5)
                )
                .frame(maxWidth: 130)
                .submitLabel(.done)
                .onSubmit { if draftPhoneIsValid { savePhone(orderNumber) } }

            Button("Save") { savePhone(orderNumber) }
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(draftPhoneIsValid ? Color.blue : Color.gray)
                .disabled(!draftPhoneIsValid)

            Button { editingPhoneOrder = nil } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.mutedText)
            }
        } else {
            Button {
                draftPhone = vm.phone(for: orderNumber)
                editingPhoneOrder = orderNumber
            } label: {
                let phone = vm.phone(for: orderNumber)
                Text(phone.isEmpty ? "+ phone" : phone)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.mutedText)
                    .lineLimit(1)
            }
            .buttonStyle(.plain)
        }
    }

    private func savePhone(_ orderNumber: String) {
        let snapshot = draftPhone
        Task { await vm.savePhone(orderNumber: orderNumber, phone: snapshot) }
        editingPhoneOrder = nil
    }

    // MARK: - Notify / reprint action

    @ViewBuilder
    private func actionButton(group: OrderGroup) -> some View {
        HStack(spacing: 6) {
            if EpsonPrinter.shared.hasSavedPrinter {
                Button {
                    Task { await vm.reprint(orderNumber: group.orderNumber) }
                } label: {
                    Image(systemName: "printer")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.mutedText)
                }
                .buttonStyle(.plain)
            }

            let phone = vm.phone(for: group.orderNumber)
            if !phone.isEmpty {
                let notified = vm.notifiedOrders.contains(group.orderNumber)
                Button {
                    smsTarget = SMSTarget(
                        orderNumber: group.orderNumber,
                        phone: phone,
                        body: vm.smsBody(for: group.orderNumber)
                    )
                } label: {
                    Text(notified ? "Notified ✓" : "Notify")
                        .font(.system(size: 11, weight: .semibold))
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(notified ? Color.green.opacity(0.15) : Color.blue)
                        .foregroundStyle(notified ? .green : .white)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}
