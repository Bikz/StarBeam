import SwiftUI

enum StarbeamTheme {
  static let outerCorner: CGFloat = 22
  static let cardCorner: CGFloat = 16

  static let headerTitleFont: Font = .system(size: 22, weight: .bold, design: .rounded)
  static let headerSubtitleFont: Font = .system(size: 13, weight: .medium, design: .rounded)

  static func cardShadow(_ scheme: ColorScheme) -> Color {
    scheme == .dark ? .black.opacity(0.25) : .black.opacity(0.10)
  }
}

struct StarbeamCardModifier: ViewModifier {
  @Environment(\.colorScheme) private var scheme

  func body(content: Content) -> some View {
    content
      .starbeamSurface(
        cornerRadius: StarbeamTheme.cardCorner,
        material: .thinMaterial,
        shadow: .card
      )
  }
}

extension View {
  func starbeamCard() -> some View {
    modifier(StarbeamCardModifier())
  }
}
