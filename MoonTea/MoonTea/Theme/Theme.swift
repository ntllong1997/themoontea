import SwiftUI

enum Theme {
    static let background     = Color(.systemGray6)
    static let cardBackground = Color(.systemBackground)
    static let cardBorder     = Color(.separator)
    static let mutedText      = Color(.secondaryLabel)
    static let strongText     = Color(.label)

    // Brand — warm gold, used for accent highlights
    static let brand          = Color(red: 0.82, green: 0.62, blue: 0.12)
    static let brandSubtle    = brand.opacity(0.10)

    static let accent  = Color.blue
    static let danger  = Color.red
    static let success = Color.green
}

struct Card<Content: View>: View {
    let content: Content
    init(@ViewBuilder _ content: () -> Content) { self.content = content() }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(16)
            .background(Theme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Theme.cardBorder, lineWidth: 0.5)
            )
    }
}
