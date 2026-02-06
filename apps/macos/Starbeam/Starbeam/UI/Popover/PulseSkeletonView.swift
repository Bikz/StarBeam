import SwiftUI

struct PulseSkeletonList: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      ForEach(0..<3, id: \.self) { _ in
        PulseSkeletonCard()
      }
    }
  }
}

private struct PulseSkeletonCard: View {
  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      RoundedRectangle(cornerRadius: 7, style: .continuous)
        .fill(Color.secondary.opacity(0.22))
        .frame(width: 26, height: 26)
        .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: 9) {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(Color.secondary.opacity(0.22))
          .frame(height: 14)
          .frame(maxWidth: 240, alignment: .leading)

        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(Color.secondary.opacity(0.16))
          .frame(height: 12)
          .frame(maxWidth: 290, alignment: .leading)

        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(Color.secondary.opacity(0.12))
          .frame(height: 12)
          .frame(maxWidth: 210, alignment: .leading)
      }
      .accessibilityHidden(true)

      Spacer(minLength: 0)

      RoundedRectangle(cornerRadius: 7, style: .continuous)
        .fill(Color.secondary.opacity(0.16))
        .frame(width: 24, height: 24)
        .accessibilityHidden(true)
    }
    .padding(14)
    .starbeamCard()
    .accessibilityHidden(true)
  }
}

