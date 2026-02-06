import SwiftUI

struct CardIcon: View {
  let icon: String?

  init(_ icon: String?) {
    self.icon = icon
  }

  var body: some View {
    Group {
      if let icon, icon.hasPrefix("sf:"), let symbol = icon.split(separator: ":").dropFirst().first {
        Image(systemName: String(symbol))
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(.primary)
          .frame(width: 26)
      } else if let icon, !icon.isEmpty {
        Text(icon)
          .font(.system(size: 18))
          .frame(width: 26)
      } else {
        Text("✦")
          .font(.system(size: 18, weight: .semibold, design: .rounded))
          .frame(width: 26)
      }
    }
    .accessibilityHidden(true)
  }
}

