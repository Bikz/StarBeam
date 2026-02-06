import SwiftUI

struct SettingsView: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    @Bindable var model = model
    @Bindable var settings = model.settings

    Form {
      Section("Account") {
        if model.auth.isSignedIn {
          Text("Signed in")
            .foregroundStyle(.secondary)

          if let session = model.auth.session {
            VStack(alignment: .leading, spacing: 4) {
              Text(session.user.email)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)

              let tokenOK = !session.accessToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
              Text("Access token: \(tokenOK ? "present" : "missing") · Expires: \(session.expiresAt.formatted(date: .abbreviated, time: .shortened))")
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
            .padding(.top, 2)
          }

          Button("Sign out") {
            model.signOut()
          }
        } else {
          Text("Not signed in")
            .foregroundStyle(.secondary)

          Button("Sign in") {
            model.showingSignInSheet = true
          }
          .keyboardShortcut(.defaultAction)
        }
      }

      Section("Server") {
        VStack(alignment: .leading, spacing: 6) {
          TextField("Base URL", text: $settings.serverBaseURL)
            .textFieldStyle(.roundedBorder)

          Text("Used for device sign-in and API requests. Default: https://app.starbeamhq.com")
            .font(.footnote)
            .foregroundStyle(.secondary)

          HStack(spacing: 10) {
            Button("Clear local cache") {
              model.clearCache()
            }

            Text("Clears last successful overview JSON stored in Application Support.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }
      }

      Section("Dashboard") {
        VStack(alignment: .leading, spacing: 6) {
          TextField("Dashboard URL", text: $settings.dashboardBaseURL)
            .textFieldStyle(.roundedBorder)

          TextField("Submit idea URL", text: $settings.submitIdeaURL)
            .textFieldStyle(.roundedBorder)

          Text("These links open in your default browser.")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }

      Section("Workspace") {
        VStack(alignment: .leading, spacing: 6) {
          if let session = model.auth.session, !session.workspaces.isEmpty {
            Picker("Workspace", selection: $settings.workspaceID) {
              ForEach(session.workspaces) { ws in
                Text(ws.name).tag(ws.id)
              }
            }
            .pickerStyle(.menu)

            if !settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
              Text("Workspace ID: \(settings.workspaceID)")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
            }
          } else {
            TextField("Workspace ID", text: $settings.workspaceID)
              .textFieldStyle(.roundedBorder)
          }

          Text("Required for overview sync (used as workspace_id in /api/v1/macos/overview).")
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
    }
    .formStyle(.grouped)
    .padding(20)
    .sheet(isPresented: $model.showingSignInSheet) {
      DeviceSignInView()
        .frame(width: 420, height: 420)
    }
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
}

#Preview {
  let model = AppModel()
  return SettingsView()
    .environment(model)
    .frame(width: 560, height: 440)
}
