import SwiftUI

// Cart presentation pieces shared by the counter's `CartView` and the
// `EditOrderSheet` used to correct an already-submitted order. They take plain
// values and closures rather than an `OrderViewModel`, so the same row and
// picker serve the live cart and an edit draft without either knowing about
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

struct PaymentMethodPicker: View {
    @Binding var selection: PaymentMethod

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("PAYMENT")
                .font(.system(size: 11, weight: .medium))
                .tracking(0.5)
                .foregroundStyle(Theme.mutedText)
            HStack(spacing: 6) {
                ForEach(PaymentMethod.allCases) { method in
                    let active = selection == method
                    Button { selection = method } label: {
                        VStack(spacing: 4) {
                            Image(systemName: method.icon).font(.system(size: 18))
                            Text(method.displayName).font(.system(size: 12, weight: .medium))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(active ? Color.black : Color(.secondarySystemBackground))
                        .foregroundStyle(active ? .white : Theme.strongText)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(Theme.cardBorder, lineWidth: active ? 0 : 0.5)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 4)
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
