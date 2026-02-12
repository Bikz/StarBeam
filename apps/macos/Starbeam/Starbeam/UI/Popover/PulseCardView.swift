import SwiftUI
import AppKit

struct PulseCardView: View {
  let card: Overview.PulseCard
  let highlightPriority: Bool

  @State private var didCopyAction = false

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
          CardIcon(card.icon)

          VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
              Text(card.title)
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundStyle(.primary)
                .lineLimit(2)

              Text(chipLabel)
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule(style: .continuous).fill(.thinMaterial))
                .overlay(
                  Capsule(style: .continuous)
                    .strokeBorder(.white.opacity(0.20), lineWidth: 1)
                )
                .accessibilityHidden(true)
            }

            if let meta = metadataText {
              Text(meta)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
          }

          Spacer(minLength: 0)
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
            HStack(alignment: .firstTextBaseline, spacing: 8) {
              Text("Action")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundStyle(.primary)

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
  }

  private var chipLabel: String {
    if card.laneValue == .onboarding {
      return "Setup"
    }

    switch card.kind {
    case "ANNOUNCEMENT":
      return "Announcement"
    case "GOAL":
      return "Goal"
    case "WEB_RESEARCH":
      return "Research"
    default:
      return "Daily"
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

  private func copyToPasteboard(_ string: String) {
    let pb = NSPasteboard.general
    pb.clearContents()
    pb.setString(string, forType: .string)
  }
}
