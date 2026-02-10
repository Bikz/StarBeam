import SwiftUI

struct FocusListView: View {
  let items: [Overview.FocusItem]
  let signedIn: Bool

  @Environment(AppModel.self) private var model

  @State private var isAddingTodo: Bool = false
  @State private var todoTitle: String = ""
  @State private var todoDetails: String = ""
  @State private var showDetails: Bool = false
  @State private var showCompleted: Bool = false

  @FocusState private var titleFocused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if items.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          Text("Nothing yet")
            .font(.system(size: 13, weight: .bold, design: .rounded))
          Text(signedIn ? "Add a todo below, or connect tools to populate focus automatically." : "Sign in and connect Google to see focus items.")
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

            Button {
              Task { await model.setTodoDone(taskID: item.id, isDone: true) }
            } label: {
              Image(systemName: "checkmark.circle")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(width: 26, height: 26)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Mark todo as done")
          }
          .padding(12)
          .starbeamCard()
        }
      }

      if isAddingTodo {
        VStack(alignment: .leading, spacing: 10) {
          TextField("Todo", text: $todoTitle)
            .textFieldStyle(.roundedBorder)
            .focused($titleFocused)
            .onSubmit {
              submitTodo()
            }

          DisclosureGroup("Details", isExpanded: $showDetails) {
            TextField("Optional details", text: $todoDetails, axis: .vertical)
              .textFieldStyle(.roundedBorder)
              .lineLimit(3, reservesSpace: true)
              .padding(.top, 6)
          }
          .font(.system(size: 12, weight: .semibold, design: .rounded))

          HStack {
            Button("Cancel") {
              resetComposer()
            }

            Spacer()

            Button("Add") {
              submitTodo()
            }
            .buttonStyle(.borderedProminent)
            .disabled(todoTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          }
        }
        .padding(12)
        .starbeamCard()
        .onAppear {
          DispatchQueue.main.async { titleFocused = true }
        }
      } else {
        Button {
          isAddingTodo = true
        } label: {
          HStack(spacing: 10) {
            Image(systemName: "checkmark.circle")
              .foregroundStyle(.secondary)
            Text("Add a todo…")
              .foregroundStyle(.secondary)
              .font(.system(size: 13, weight: .semibold, design: .rounded))
            Spacer(minLength: 0)
          }
          .padding(12)
          .starbeamCard()
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add a todo")
      }

      let completed = model.overview?.completedFocus ?? []
      if !completed.isEmpty {
        DisclosureGroup("Completed recently", isExpanded: $showCompleted) {
          VStack(alignment: .leading, spacing: 8) {
            ForEach(completed) { item in
              HStack(alignment: .top, spacing: 10) {
                CardIcon(item.icon)
                VStack(alignment: .leading, spacing: 2) {
                  Text(item.title)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                  if let subtitle = item.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                      .font(.system(size: 11, weight: .medium, design: .rounded))
                      .foregroundStyle(.secondary)
                      .lineLimit(1)
                  }
                }
                Spacer(minLength: 0)
              }
              .padding(10)
              .starbeamCard()
              .opacity(0.85)
            }
          }
          .padding(.top, 6)
        }
        .font(.system(size: 12, weight: .semibold, design: .rounded))
      }
    }
  }

  private func resetComposer() {
    isAddingTodo = false
    todoTitle = ""
    todoDetails = ""
    showDetails = false
    titleFocused = false
  }

  private func submitTodo() {
    let title = todoTitle.trimmingCharacters(in: .whitespacesAndNewlines)
    if title.isEmpty { return }
    let details = showDetails ? todoDetails.trimmingCharacters(in: .whitespacesAndNewlines) : ""

    resetComposer()
    Task {
      await model.addTodo(title: title, details: details.isEmpty ? nil : details)
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
