import SwiftUI

struct ErrorCardView: View {
  let error: AppError
  let onRetry: () -> Void

  @State private var showDetails = false

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 10) {
        Image(systemName: "exclamationmark.triangle.fill")
          .foregroundStyle(.orange)
          .accessibilityHidden(true)

        VStack(alignment: .leading, spacing: 4) {
          Text(error.title)
            .font(.system(size: 13, weight: .bold, design: .rounded))

          Text(error.message)
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }

        Spacer(minLength: 0)

        Button("Retry") { onRetry() }
          .buttonStyle(.bordered)
          .controlSize(.small)
          .accessibilityLabel("Retry")
      }

      if let debug = error.debugDetails, !debug.isEmpty {
        DisclosureGroup("Details", isExpanded: $showDetails) {
          Text(debug)
            .font(.system(.caption, design: .monospaced))
            .foregroundStyle(.secondary)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 6)
        }
        .font(.system(size: 12, weight: .semibold, design: .rounded))
      }
    }
    .padding(14)
    .starbeamCard()
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Error")
  }
}

