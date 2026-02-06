import SwiftUI

struct FocusListView: View {
  let items: [Overview.FocusItem]
  let signedIn: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if items.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          Text("Nothing yet")
            .font(.system(size: 13, weight: .bold, design: .rounded))
          Text(signedIn ? "We’ll populate focus items from connected tools." : "Sign in and connect Google to see focus items.")
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
        }
        .padding(12)
        .starbeamCard()
      } else {
        ForEach(items) { item in
          HStack(alignment: .top, spacing: 10) {
            CardIcon(item.icon)

            VStack(alignment: .leading, spacing: 4) {
              Text(item.title)
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .lineLimit(2)

              if let subtitle = item.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                  .font(.system(size: 12, weight: .medium, design: .rounded))
                  .foregroundStyle(.secondary)
                  .lineLimit(1)
              }
            }

            Spacer(minLength: 0)
          }
          .padding(12)
          .starbeamCard()
        }
      }

      Button {
        // TODO: wire to reminders or quick-add.
      } label: {
        HStack(spacing: 10) {
          Image(systemName: "checkmark.circle")
            .foregroundStyle(.secondary)
          Text("Add a reminder…")
            .foregroundStyle(.secondary)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
          Spacer(minLength: 0)
        }
        .padding(12)
        .starbeamCard()
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Add a reminder")
    }
  }
}

struct CalendarListView: View {
  let items: [Overview.CalendarItem]
  let signedIn: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if items.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          Text("No events")
            .font(.system(size: 13, weight: .bold, design: .rounded))
          Text(signedIn ? "Your agenda will appear here." : "Sign in and connect Google Calendar to see today’s agenda.")
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
        }
        .padding(12)
        .starbeamCard()
      } else {
        VStack(alignment: .leading, spacing: 8) {
          ForEach(items) { item in
            Text(CalendarRowView.text(for: item))
              .font(.system(size: 13, weight: .medium, design: .rounded))
              .foregroundStyle(.secondary)
              .frame(maxWidth: .infinity, alignment: .leading)
              .lineLimit(1)
          }
        }
        .padding(12)
        .starbeamCard()
      }

      Button {
        // TODO: wire to reminders or quick-add.
      } label: {
        HStack(spacing: 10) {
          Image(systemName: "plus")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(.secondary)
          Text("Add a reminder…")
            .foregroundStyle(.secondary)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
          Spacer(minLength: 0)
        }
        .padding(12)
        .starbeamCard()
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Add a reminder")
    }
  }
}

private enum CalendarRowView {
  static func text(for item: Overview.CalendarItem) -> String {
    let df = DateFormatter()
    df.locale = .current
    df.timeStyle = .short
    df.dateStyle = .none
    let start = df.string(from: item.start)
    return "\(start) - \(item.title)"
  }
}

