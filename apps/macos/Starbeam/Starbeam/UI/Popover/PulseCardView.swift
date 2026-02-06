import SwiftUI

struct PulseCardView: View {
  let card: Overview.PulseCard
  let isExpanded: Bool
  let onToggleExpanded: () -> Void
  let onRegenerate: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Button {
        onToggleExpanded()
      } label: {
        HStack(alignment: .top, spacing: 12) {
          CardIcon(card.icon)

          VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
              Text(card.title)
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundStyle(.primary)
                .lineLimit(1)

              if let kind = card.kind, !kind.isEmpty {
                Text(kindLabel(kind))
                  .font(.system(size: 10, weight: .bold, design: .rounded))
                  .foregroundStyle(.secondary)
                  .padding(.horizontal, 8)
                  .padding(.vertical, 4)
                  .background(
                    Capsule(style: .continuous)
                      .fill(.thinMaterial)
                  )
                  .overlay(
                    Capsule(style: .continuous)
                      .strokeBorder(.white.opacity(0.20), lineWidth: 1)
                  )
                  .accessibilityHidden(true)
              }
            }

            if !card.body.isEmpty {
              Text(card.body)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            }
          }

          Spacer(minLength: 0)

          Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.secondary)
            .padding(.top, 2)
            .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(card.title)
      .accessibilityHint(isExpanded ? "Collapse card details" : "Expand for more details")

      if isExpanded {
        PulseCardDetailView(card: card, onRegenerate: onRegenerate)
          .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .padding(14)
    .starbeamCard()
    .animation(.easeInOut(duration: 0.15), value: isExpanded)
  }

  private func kindLabel(_ kind: String) -> String {
    switch kind {
    case "ANNOUNCEMENT":
      return "Announcement"
    case "GOAL":
      return "Goal"
    case "WEB_RESEARCH":
      return "Web"
    default:
      return "Note"
    }
  }
}

struct PulseCardDetailView: View {
  let card: Overview.PulseCard
  let onRegenerate: () -> Void

  @State private var didCopyAction = false

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if !card.body.isEmpty {
        Text(card.body)
          .font(.system(size: 13, weight: .medium, design: .rounded))
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
          .textSelection(.enabled)
      }

      if let why = card.why?.trimmingCharacters(in: .whitespacesAndNewlines), !why.isEmpty {
        detailRow(label: "Why", value: why)
      }

      if let action = card.action?.trimmingCharacters(in: .whitespacesAndNewlines), !action.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("Action")
              .font(.system(size: 12, weight: .bold, design: .rounded))
              .foregroundStyle(.primary)
              .accessibilityAddTraits(.isHeader)

            Spacer(minLength: 0)

            Button(didCopyAction ? "Copied" : "Copy") {
              copyToPasteboard(action)
              didCopyAction = true
              DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                didCopyAction = false
              }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .accessibilityLabel("Copy suggested action")
          }

          Text(action)
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
        }
      }

      if let sources = card.sources, !sources.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          Text("Sources")
            .font(.system(size: 12, weight: .bold, design: .rounded))
            .foregroundStyle(.primary)
            .accessibilityAddTraits(.isHeader)

          VStack(alignment: .leading, spacing: 4) {
            ForEach(sources) { s in
              if let url = URL(string: s.url) {
                Link(destination: url) {
                  Text(sourceLabel(s))
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                }
              } else {
                Text(sourceLabel(s))
                  .font(.system(size: 12, weight: .semibold, design: .rounded))
                  .foregroundStyle(.secondary)
                  .lineLimit(1)
              }
            }
          }
        }
      }

      HStack(spacing: 10) {
        Button {
          onRegenerate()
        } label: {
          Label("Refresh pulse", systemImage: "arrow.clockwise")
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .accessibilityLabel("Refresh pulse")

        Spacer(minLength: 0)
      }
      .padding(.top, 2)
    }
    .padding(.top, 6)
  }

  private func detailRow(label: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label)
        .font(.system(size: 12, weight: .bold, design: .rounded))
        .foregroundStyle(.primary)
        .accessibilityAddTraits(.isHeader)

      Text(value)
        .font(.system(size: 13, weight: .medium, design: .rounded))
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
        .textSelection(.enabled)
    }
  }

  private func sourceLabel(_ source: Overview.Citation) -> String {
    if let title = source.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty {
      return title
    }
    return source.url
  }

  private func copyToPasteboard(_ string: String) {
    let pb = NSPasteboard.general
    pb.clearContents()
    pb.setString(string, forType: .string)
  }
}

