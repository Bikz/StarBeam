import SwiftUI
import AppKit

struct PulseCardView: View {
  let card: Overview.PulseCard
  let highlightPriority: Bool
  var onMarkDone: (() -> Void)? = nil
  var onDismiss: (() -> Void)? = nil

  @State private var didCopyCard = false
  @State private var isHovered = false

  var body: some View {
    HStack(alignment: .top, spacing: 0) {
      if highlightPriority {
        RoundedRectangle(cornerRadius: 2, style: .continuous)
          .fill(Color.accentColor.opacity(0.32))
          .frame(width: 3)
          .padding(.leading, 8)
          .padding(.vertical, 10)
      }

      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .top, spacing: 10) {
          Text(card.title)
            .font(.system(size: 15, weight: .bold, design: .rounded))
            .foregroundStyle(.primary)
            .lineLimit(2)
          Spacer(minLength: 0)

          if isHovered || didCopyCard {
            HStack(spacing: 6) {
              Button {
                copyToPasteboard(cardCopyText())
                didCopyCard = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                  didCopyCard = false
                }
              } label: {
                Image(systemName: didCopyCard ? "checkmark" : "doc.on.doc")
                  .font(.system(size: 12, weight: .semibold))
                  .frame(width: 22, height: 22)
              }
              .buttonStyle(.plain)
              .foregroundStyle(.secondary)
              .accessibilityLabel("Copy pulse card")

              if let onMarkDone {
                Button {
                  onMarkDone()
                } label: {
                  Image(systemName: "checkmark.circle")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(width: 22, height: 22)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Mark pulse card as done")
              }

              if let onDismiss {
                Button {
                  onDismiss()
                } label: {
                  Image(systemName: "xmark.circle")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(width: 22, height: 22)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Dismiss pulse card")
              }
            }
            .transition(.opacity)
          }
        }

        if let meta = metadataText {
          Text(meta)
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        if !card.body.isEmpty {
          Text(card.body)
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
            .lineLimit(3)
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
        }

        if let action = trimmed(card.action), !action.isEmpty {
          VStack(alignment: .leading, spacing: 4) {
            Text("Action")
              .font(.system(size: 12, weight: .bold, design: .rounded))
              .foregroundStyle(.primary)

            Text(action)
              .font(.system(size: 13, weight: .medium, design: .rounded))
              .foregroundStyle(.secondary)
              .lineLimit(2)
              .fixedSize(horizontal: false, vertical: true)
              .textSelection(.enabled)
          }
        }

        if let sources = card.sources, !sources.isEmpty {
          HStack(spacing: 10) {
            ForEach(Array(sources.prefix(2))) { source in
              if let url = URL(string: source.url) {
                Link(destination: url) {
                  Text(sourceLabel(source))
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                }
              }
            }
            Spacer(minLength: 0)
          }
        }
      }
      .padding(12)
    }
    .starbeamCard()
    .onHover { hovering in
      isHovered = hovering
    }
  }

  private var metadataText: String? {
    var parts: [String] = []

    if let source = trimmed(card.sourceLabel), !source.isEmpty {
      parts.append(source)
    }

    if let occurredAt = card.occurredAt {
      parts.append(relativePast(occurredAt))
    }

    if parts.isEmpty { return nil }
    return parts.joined(separator: " · ")
  }

  private func relativePast(_ date: Date, now: Date = Date()) -> String {
    let seconds = max(0, Int(now.timeIntervalSince(date)))
    let minutes = seconds / 60
    if minutes < 60 { return "\(minutes)m ago" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)h ago" }
    let days = hours / 24
    return "\(days)d ago"
  }

  private func sourceLabel(_ source: Overview.Citation) -> String {
    if let title = trimmed(source.title), !title.isEmpty {
      return title
    }

    guard let host = URL(string: source.url)?.host else { return source.url }
    return host.replacingOccurrences(of: "www.", with: "")
  }

  private func trimmed(_ value: String?) -> String? {
    value?.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func cardCopyText() -> String {
    var lines: [String] = [card.title]
    if !card.body.isEmpty {
      lines.append("")
      lines.append(card.body)
    }
    if let why = trimmed(card.why), !why.isEmpty {
      lines.append("")
      lines.append("Why: \(why)")
    }
    if let action = trimmed(card.action), !action.isEmpty {
      lines.append("")
      lines.append("Action: \(action)")
    }
    if let sources = card.sources, !sources.isEmpty {
      lines.append("")
      lines.append("Sources:")
      for source in sources.prefix(6) {
        if let title = trimmed(source.title), !title.isEmpty {
          lines.append("- \(title) - \(source.url)")
        } else {
          lines.append("- \(source.url)")
        }
      }
    }
    return lines.joined(separator: "\n")
  }

  private func copyToPasteboard(_ string: String) {
    let pb = NSPasteboard.general
    pb.clearContents()
    pb.setString(string, forType: .string)
  }
}
