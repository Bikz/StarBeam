import SwiftUI

struct ContentView: View {
  var body: some View {
    ZStack {
      LinearGradient(
        colors: [Color.pink.opacity(0.25), Color.blue.opacity(0.18), Color.mint.opacity(0.18)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      .ignoresSafeArea()

      VStack(alignment: .leading, spacing: 12) {
        HStack {
          VStack(alignment: .leading, spacing: 2) {
            Text("Starbeam")
              .font(.system(size: 18, weight: .semibold))
            Text("Signed out")
              .foregroundStyle(.secondary)
              .font(.system(size: 12))
          }

          Spacer()

          Button {
            // TODO: hook up refresh once auth + API client land.
          } label: {
            Image(systemName: "arrow.clockwise")
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Refresh")
        }

        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .fill(.thinMaterial)
          .overlay(
            VStack(alignment: .leading, spacing: 8) {
              Text("Pulse bump")
                .font(.system(size: 14, weight: .semibold))
              Text("Sign in to see your daily pulse, focus, and agenda.")
                .foregroundStyle(.secondary)
                .font(.system(size: 12))

              Button("Sign in") {
                // TODO: device flow UI.
              }
              .keyboardShortcut(.defaultAction)
            }
            .padding(14)
          )

        Spacer()

        HStack {
          Button("Settings") {
            NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
          }
          .buttonStyle(.plain)

          Spacer()

          Button("Open dashboard") {
            // TODO: open base URL from settings.
          }
          .buttonStyle(.plain)
        }
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(.secondary)
      }
      .padding(14)
    }
  }
}

#Preview {
  ContentView()
}
