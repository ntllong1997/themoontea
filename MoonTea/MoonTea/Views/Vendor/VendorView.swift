import SwiftUI

struct VendorView: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                brandHeader
                    .padding(.top, 44)
                    .padding(.bottom, 32)

                VStack(spacing: 12) {
                    ordersCTA
                    stationRow
                    adminRow
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationBarHidden(true)
    }

    // MARK: - Sections

    private var brandHeader: some View {
        VStack(spacing: 10) {
            Text("🌙")
                .font(.system(size: 52))
            Text("The Moon Tea")
                .font(.system(size: 30, weight: .bold))
            Text("Staff")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.mutedText)
                .tracking(1.5)
                .textCase(.uppercase)
        }
        .frame(maxWidth: .infinity)
    }

    private var ordersCTA: some View {
        Button { router.push(.order) } label: {
            HStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(.white.opacity(0.15))
                        .frame(width: 48, height: 48)
                    Image(systemName: "list.clipboard")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text("Orders")
                        .font(.system(size: 20, weight: .bold))
                    Text("Place orders & track history")
                        .font(.system(size: 13))
                        .opacity(0.75)
                }
                Spacer()
                Image(systemName: "arrow.right.circle.fill")
                    .font(.system(size: 26))
                    .opacity(0.8)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 18)
            .background(Color.black)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var stationRow: some View {
        HStack(spacing: 12) {
            stationTile(emoji: "🌭",
                        title: "Corndog\nStation",
                        route: .corndogStation,
                        color: .red)
            stationTile(emoji: "🧋",
                        title: "Drink\nStation",
                        route: .drinkStation,
                        color: .blue)
        }
    }

    private var adminRow: some View {
        HStack(spacing: 12) {
            adminTile(icon: "chart.bar.fill",         title: "Sales",   route: .summary)
            adminTile(icon: "dollarsign.circle.fill",  title: "CashApp", route: .cashapp)
            adminTile(icon: "printer.fill",            title: "Printer", route: .printer)
            adminTile(icon: "creditcard.and.123",      title: "Reader",  route: .reader)
        }
    }

    // MARK: - Tile builders

    private func stationTile(emoji: String, title: String,
                              route: AppRoute, color: Color) -> some View {
        Button { router.push(route) } label: {
            VStack(spacing: 10) {
                Text(emoji).font(.system(size: 32))
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .lineSpacing(2)
                    .foregroundStyle(color)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 22)
            .background(color.opacity(0.09))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(color.opacity(0.20), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func adminTile(icon: String, title: String, route: AppRoute) -> some View {
        Button { router.push(route) } label: {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(Theme.brand)
                Text(title)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.mutedText)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(Theme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Theme.cardBorder, lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }
}
