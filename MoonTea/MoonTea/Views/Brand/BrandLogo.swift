import SwiftUI

/// The Moon Tea brand mark. Use anywhere a logo is needed. Renders at any
/// size — pass a `size:` to scale. Suitable to screenshot at 1024 pt for an
/// app-icon starting point.
struct BrandLogo: View {
    var size: CGFloat = 96
    var showWordmark: Bool = false

    var body: some View {
        VStack(spacing: size * 0.08) {
            ZStack {
                // Background pill
                RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.10, green: 0.10, blue: 0.18),
                                Color(red: 0.18, green: 0.14, blue: 0.30)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: size, height: size)

                // Crescent moon (stars optional, hidden for now)
                ZStack {
                    Circle()
                        .fill(Color(red: 1.0, green: 0.96, blue: 0.78))
                        .frame(width: size * 0.55, height: size * 0.55)
                    Circle()
                        .fill(Color(red: 0.10, green: 0.10, blue: 0.18))
                        .frame(width: size * 0.46, height: size * 0.46)
                        .offset(x: -size * 0.12)
                }
                .offset(x: size * 0.04, y: -size * 0.10)

                // Boba cup silhouette
                BobaCupShape()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 1.0, green: 0.78, blue: 0.65),
                                Color(red: 0.95, green: 0.55, blue: 0.42)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: size * 0.42, height: size * 0.46)
                    .offset(x: -size * 0.02, y: size * 0.18)

                // Boba pearls
                ZStack {
                    Circle().fill(Color(red: 0.30, green: 0.18, blue: 0.10))
                        .frame(width: size * 0.06)
                        .offset(x: -size * 0.06, y: size * 0.30)
                    Circle().fill(Color(red: 0.30, green: 0.18, blue: 0.10))
                        .frame(width: size * 0.06)
                        .offset(x: size * 0.02, y: size * 0.33)
                    Circle().fill(Color(red: 0.30, green: 0.18, blue: 0.10))
                        .frame(width: size * 0.06)
                        .offset(x: size * 0.06, y: size * 0.28)
                }
            }
            .compositingGroup()

            if showWordmark {
                Text("The Moon Tea")
                    .font(.system(size: size * 0.18, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color(red: 0.10, green: 0.10, blue: 0.18))
            }
        }
    }
}

private struct BobaCupShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let topInset = rect.width * 0.06
        let bottomInset = rect.width * 0.16
        // Top edge
        p.move(to: CGPoint(x: rect.minX + topInset, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - topInset, y: rect.minY))
        // Right side tapering to narrower bottom
        p.addLine(to: CGPoint(x: rect.maxX - bottomInset, y: rect.maxY))
        // Bottom (rounded)
        p.addQuadCurve(
            to: CGPoint(x: rect.minX + bottomInset, y: rect.maxY),
            control: CGPoint(x: rect.midX, y: rect.maxY + rect.height * 0.08)
        )
        p.closeSubpath()
        return p
    }
}

#Preview {
    VStack(spacing: 24) {
        BrandLogo(size: 200, showWordmark: true)
        BrandLogo(size: 96)
    }
    .padding()
}
