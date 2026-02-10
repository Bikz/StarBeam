import SwiftUI
import AppKit

struct SettingsView: View {
  let onRequestSignIn: () -> Void
  let onSignedOut: () -> Void

  @Environment(AppModel.self) private var model

  @State private var showAdvanced: Bool = false

  init(
    onRequestSignIn: @escaping () -> Void = {},
    onSignedOut: @escaping () -> Void = {}
  ) {
    self.onRequestSignIn = onRequestSignIn
    self.onSignedOut = onSignedOut
  }

  var body: some View {
    @Bindable var model = model
    @Bindable var settings = model.settings

    Form {
      Section("Workspace") {
        VStack(alignment: .leading, spacing: 6) {
          if !model.auth.isSignedIn {
            Text("Sign in to choose a workspace.")
              .font(.footnote)
              .foregroundStyle(.secondary)

            Button("Sign in") { onRequestSignIn() }
              .keyboardShortcut(.defaultAction)
          } else if let session = model.auth.session, !session.workspaces.isEmpty {
            Picker("Primary workspace", selection: $settings.workspaceID) {
              ForEach(session.workspaces) { ws in
                Text(ws.name).tag(ws.id)
              }
            }
            .pickerStyle(.menu)
          } else {
            Text("No workspaces found for this account.")
              .font(.footnote)
              .foregroundStyle(.secondary)

            Text("Try signing out and signing back in.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }

          Text("This is the workspace shown first. You can swipe left/right in the menu bar to switch between workspaces.")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }

      Section("Notifications") {
        Toggle("Daily pulse notification", isOn: $settings.notificationsEnabled)

        DatePicker(
          "Time",
          selection: Binding(
            get: { notificationTimeDate(minutes: settings.notificationTimeMinutes) },
            set: { settings.setNotificationTime(date: $0) }
          ),
          displayedComponents: [.hourAndMinute]
        )
        .disabled(!settings.notificationsEnabled)

        Text("Notification content is generic (no sensitive preview text).")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }

      Section("Appearance") {
        Picker("Mode", selection: $settings.appearanceMode) {
          ForEach(StarbeamAppearanceMode.allCases) { mode in
            Text(mode.displayName).tag(mode.rawValue)
          }
        }
        .pickerStyle(.segmented)

        Picker("Style", selection: $settings.visualStyle) {
          ForEach(StarbeamVisualStyle.allCases) { s in
            Text(s.displayName).tag(s.rawValue)
          }
        }
        .pickerStyle(.segmented)

        Text("Glass is neutral and system-native. Chroma brings back the colorful background.")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }

      Section("Advanced") {
        DisclosureGroup("Advanced settings", isExpanded: $showAdvanced) {
          VStack(alignment: .leading, spacing: 10) {
            Text("These settings are for troubleshooting and self-hosting. Most users should keep the defaults.")
              .font(.footnote)
              .foregroundStyle(.secondary)
              .fixedSize(horizontal: false, vertical: true)

            TextField("Server base URL", text: $settings.serverBaseURL)
              .textFieldStyle(.roundedBorder)

            TextField("Web dashboard URL", text: $settings.dashboardBaseURL)
              .textFieldStyle(.roundedBorder)

            TextField("Submit idea URL", text: $settings.submitIdeaURL)
              .textFieldStyle(.roundedBorder)

            HStack(spacing: 10) {
              Button("Clear local cache") { model.clearCache() }

              Text("Clears last successful overview JSON stored in Application Support.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            }

            HStack(spacing: 10) {
              Button("Open web pulse") {
                if let url = model.dashboardURL(kind: .pulse) {
                  NSWorkspace.shared.open(url)
                }
              }
              .disabled(model.dashboardURL(kind: .pulse) == nil)

              Button("Submit idea…") {
                let raw = settings.submitIdeaURL.trimmingCharacters(in: .whitespacesAndNewlines)
                if let url = URL(string: raw) {
                  NSWorkspace.shared.open(url)
                }
              }
            }
            .padding(.top, 2)
          }
          .padding(.top, 6)
        }
      }

      Section("Updates") {
        VStack(alignment: .leading, spacing: 8) {
          Button("Check for updates…") {
            model.updater.checkForUpdates()
          }

          Text("Version: \(appVersionString())")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }

      Section("Account") {
        if model.auth.isSignedIn {
          Text("Signed in")
            .foregroundStyle(.secondary)

          if let session = model.auth.session {
            Text(session.user.email)
              .font(.footnote)
              .foregroundStyle(.secondary)
              .textSelection(.enabled)
          }

          Button("Sign out") {
            model.signOut()
            onSignedOut()
          }
        } else {
          Text("Not signed in")
            .foregroundStyle(.secondary)

          Button("Sign in") { onRequestSignIn() }
        }
      }
    }
    .formStyle(.grouped)
    .padding(20)
    .onChange(of: settings.notificationsEnabled) { _, _ in
      model.handleNotificationSettingsChanged()
    }
    .onChange(of: settings.notificationTimeMinutes) { _, _ in
      model.handleNotificationSettingsChanged()
    }
    .onChange(of: settings.workspaceID) { _, _ in
      model.handleSettingsChanged(refreshIfPossible: true)
    }
    .onChange(of: settings.serverBaseURL) { _, _ in
      model.handleSettingsChanged(refreshIfPossible: false)
    }
  }

  private func notificationTimeDate(minutes: Int, calendar: Calendar = .current) -> Date {
    let now = Date()
    let day = calendar.startOfDay(for: now)
    return calendar.date(byAdding: .minute, value: minutes, to: day) ?? now
  }

  private func appVersionString() -> String {
    let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
    if let short, let build { return "\(short) (\(build))" }
    return short ?? "Unknown"
  }
}

#Preview {
  let model = AppModel()
  return SettingsView()
    .environment(model)
    .frame(width: 560, height: 440)
}
