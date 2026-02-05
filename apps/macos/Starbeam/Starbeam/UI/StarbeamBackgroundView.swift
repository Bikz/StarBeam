import SwiftUI

struct StarbeamBackgroundView: View {
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    ZStack {
      LinearGradient(
        colors: baseGradientColors,
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )

      // Soft "cloud" blobs for the dreamy vibe.
      Circle()
        .fill(Color.pink.opacity(scheme == .dark ? 0.22 : 0.28))
        .frame(width: 340, height: 340)
        .blur(radius: 42)
        .offset(x: -160, y: -220)
        .blendMode(.plusLighter)

      Circle()
        .fill(Color.blue.opacity(scheme == .dark ? 0.18 : 0.22))
        .frame(width: 420, height: 420)
        .blur(radius: 54)
        .offset(x: 200, y: -160)
        .blendMode(.plusLighter)

      Circle()
        .fill(Color.mint.opacity(scheme == .dark ? 0.14 : 0.18))
        .frame(width: 460, height: 460)
        .blur(radius: 60)
        .offset(x: 80, y: 220)
        .blendMode(.plusLighter)

      // Subtle vignette.
      RadialGradient(
        colors: [Color.black.opacity(scheme == .dark ? 0.55 : 0.18), .clear],
        center: .center,
        startRadius: 0,
        endRadius: 420
      )
      .blendMode(.multiply)
      .opacity(scheme == .dark ? 0.35 : 0.22)
    }
    .ignoresSafeArea()
  }

  private var baseGradientColors: [Color] {
    if scheme == .dark {
      return [
        Color(red: 0.14, green: 0.13, blue: 0.20),
        Color(red: 0.10, green: 0.12, blue: 0.16),
        Color(red: 0.08, green: 0.10, blue: 0.14),
      ]
    }

    return [
      Color(red: 0.98, green: 0.95, blue: 0.98),
      Color(red: 0.93, green: 0.97, blue: 0.99),
      Color(red: 0.96, green: 0.98, blue: 0.95),
    ]
  }
}

#Preview {
  StarbeamBackgroundView()
}
