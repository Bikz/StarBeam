import Foundation
import Observation

@MainActor
@Observable
final class SettingsStore {
  enum Keys {
    static let serverBaseURL = "serverBaseURL"
    static let dashboardBaseURL = "dashboardBaseURL"
    static let workspaceID = "workspaceID"
    static let notificationsEnabled = "notificationsEnabled"
    static let notificationTimeMinutes = "notificationTimeMinutes"
    static let submitIdeaURL = "submitIdeaURL"
  }

  private let defaults: UserDefaults

  var serverBaseURL: String {
    didSet { defaults.set(serverBaseURL, forKey: Keys.serverBaseURL) }
  }

  var dashboardBaseURL: String {
    didSet { defaults.set(dashboardBaseURL, forKey: Keys.dashboardBaseURL) }
  }

  var workspaceID: String {
    didSet { defaults.set(workspaceID, forKey: Keys.workspaceID) }
  }

  var notificationsEnabled: Bool {
    didSet { defaults.set(notificationsEnabled, forKey: Keys.notificationsEnabled) }
  }

  /// Minutes since midnight (local).
  var notificationTimeMinutes: Int {
    didSet { defaults.set(notificationTimeMinutes, forKey: Keys.notificationTimeMinutes) }
  }

  var submitIdeaURL: String {
    didSet { defaults.set(submitIdeaURL, forKey: Keys.submitIdeaURL) }
  }

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults

    serverBaseURL = defaults.string(forKey: Keys.serverBaseURL) ?? "http://localhost:3000"
    dashboardBaseURL = defaults.string(forKey: Keys.dashboardBaseURL) ?? "http://localhost:3000"
    workspaceID = defaults.string(forKey: Keys.workspaceID) ?? ""
    notificationsEnabled = defaults.object(forKey: Keys.notificationsEnabled) as? Bool ?? true

    // Default 8:30 AM local.
    let defaultMinutes = (8 * 60) + 30
    notificationTimeMinutes = defaults.object(forKey: Keys.notificationTimeMinutes) as? Int ?? defaultMinutes

    submitIdeaURL = defaults.string(forKey: Keys.submitIdeaURL) ?? "http://localhost:3000"
  }

  func notificationTimeComponents() -> DateComponents {
    let minutes = max(0, min(notificationTimeMinutes, 24 * 60 - 1))
    return DateComponents(hour: minutes / 60, minute: minutes % 60)
  }

  func setNotificationTime(date: Date, calendar: Calendar = .current) {
    let comps = calendar.dateComponents([.hour, .minute], from: date)
    let minutes = (comps.hour ?? 0) * 60 + (comps.minute ?? 0)
    notificationTimeMinutes = max(0, min(minutes, 24 * 60 - 1))
  }
}
