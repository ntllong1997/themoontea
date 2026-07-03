import SwiftUI

enum CorndogState: String, CaseIterable, Sendable {
    case received, making, ready, pickedup

    var next: CorndogState {
        switch self {
        case .received: .making
        case .making:   .ready
        case .ready:    .pickedup
        case .pickedup: .received
        }
    }

    var badge: String {
        switch self {
        case .received: "New"
        case .making:   "Making…"
        case .ready:    "Ready ✓"
        case .pickedup: "Picked Up ✓"
        }
    }

    var background: Color {
        switch self {
        case .received: Color.red.opacity(0.08)
        case .making:   Color.red.opacity(0.18)
        case .ready:    Color.red.opacity(0.45)
        case .pickedup: Color.red
        }
    }

    var foreground: Color {
        self == .pickedup ? .white : Color(red: 0.5, green: 0.0, blue: 0.0)
    }
}

enum BobaState: String, CaseIterable, Sendable {
    case new, ready, pickedup

    var next: BobaState {
        switch self {
        case .new:      .ready
        case .ready:    .pickedup
        case .pickedup: .new
        }
    }

    var badge: String {
        switch self {
        case .new:      "New"
        case .ready:    "Ready ✓"
        case .pickedup: "Picked Up ✓"
        }
    }

    var background: Color {
        switch self {
        case .new:      Color.blue.opacity(0.18)
        case .ready:    Color.blue.opacity(0.45)
        case .pickedup: Color.blue
        }
    }

    var foreground: Color {
        self == .pickedup ? .white : Color(red: 0.05, green: 0.15, blue: 0.5)
    }
}
