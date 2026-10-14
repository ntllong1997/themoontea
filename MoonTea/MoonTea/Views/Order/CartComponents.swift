import SwiftUI

// Cart presentation pieces shared by the counter's `CartView` and the
// `EditOrderSheet` used to correct an already-submitted order. They take plain
// values and closures rather than an `OrderViewModel`, so the same row serves
// the live cart and an edit draft without either knowing about
// the other.

struct StepperButton: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 16, weight: .semibold))
                .frame(width: 40, height: 40)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(Theme.cardBorder, lineWidth: 0.5)
                )
        }
        .buttonStyle(.plain)
        .foregroundStyle(Theme.strongText)
    }
}

struct CartLineItemRow: View {
    let item: CartItem
    let onDecrement: () -> Void
    let onIncrement: () -> Void
    let onRemove: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).font(.system(size: 14, weight: .medium))
                Text("$\(item.price.fmt2) × \(item.quantity) = $\(item.lineTotal.fmt2)")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.mutedText)
            }
            Spacer()
            HStack(spacing: 4) {
                StepperButton(label: "−", action: onDecrement)
                StepperButton(label: "+", action: onIncrement)
                Button(action: onRemove) {
                    Text("✕")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(width: 40, height: 40)
                        .foregroundStyle(.white)
                        .background(Color.red)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 6)
        .overlay(alignment: .bottom) {
            Rectangle().frame(height: 0.5).foregroundStyle(Theme.cardBorder)
        }
    }
}

struct TotalsRow: View {
    let left: String
    let right: String
    var muted: Bool = false
    var bold: Bool = false

    var body: some View {
        HStack {
            Text(left)
            Spacer()
            Text(right)
        }
        .font(.system(size: bold ? 16 : 14, weight: bold ? .bold : .regular))
        .foregroundStyle(muted ? Theme.mutedText : Theme.strongText)
    }
}
