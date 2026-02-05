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
      .background(
        RoundedRectangle(cornerRadius: StarbeamTheme.cardCorner, style: .continuous)
          .fill(.thinMaterial)
      )
      .overlay(
        RoundedRectangle(cornerRadius: StarbeamTheme.cardCorner, style: .continuous)
          .strokeBorder(.white.opacity(scheme == .dark ? 0.10 : 0.22), lineWidth: 1)
      )
      .shadow(color: StarbeamTheme.cardShadow(scheme), radius: scheme == .dark ? 14 : 18, x: 0, y: 10)
  }
}

extension View {
  func starbeamCard() -> some View {
    modifier(StarbeamCardModifier())
  }
}
