import SwiftUI

/// One line saying whether this phone's orders have all reached Supabase, so
/// nobody closes the app or goes home with orders still only on the phone.
struct UploadStatusBadge: View {
    private let outbox = OrderOutbox.shared

    var body: some View {
        let waiting = outbox.waitingOrderCount
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: waiting == 0 ? "checkmark.circle.fill" : "arrow.up.circle.fill")
                .foregroundStyle(waiting == 0 ? Theme.success : Color.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(title(waiting: waiting))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.strongText)
                if waiting > 0 {
                    Text("Saved on this phone. Keep the app open until this turns green.")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.mutedText)
                    if let error = outbox.lastError {
                        Text(error)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.mutedText)
                            .lineLimit(2)
                    }
                }
            }
            Spacer(minLength: 8)
            if waiting > 0 {
                Button("Retry now") { outbox.nudge() }
                    .font(.system(size: 12, weight: .semibold))
                    .buttonStyle(.bordered)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(waiting == 0 ? Theme.cardBackground : Color.orange.opacity(0.12))
        .accessibilityElement(children: .combine)
    }

    private func title(waiting: Int) -> String {
        switch waiting {
        case 0: "All orders uploaded"
        case 1: "1 order waiting to upload"
        default: "\(waiting) orders waiting to upload"
        }
    }
}
