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

          Text("Used for device sign-in and API requests. Default: http://localhost:3000")
            .font(.footnote)
            .foregroundStyle(.secondary)
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
          TextField("Workspace ID", text: $settings.workspaceID)
            .textFieldStyle(.roundedBorder)

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
