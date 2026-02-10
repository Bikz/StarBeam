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
    static let appearanceMode = "appearanceMode"
    static let visualStyle = "visualStyle"
  }

  private let defaults: UserDefaults

  private static var defaultWebOrigin: String {
    return "https://app.starbeamhq.com"
  }

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

  /// "system" | "light" | "dark"
  var appearanceMode: String {
    didSet { defaults.set(appearanceMode, forKey: Keys.appearanceMode) }
  }

  /// "glass" | "chroma"
  var visualStyle: String {
    didSet { defaults.set(visualStyle, forKey: Keys.visualStyle) }
  }

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults

    serverBaseURL = defaults.string(forKey: Keys.serverBaseURL) ?? Self.defaultWebOrigin
    dashboardBaseURL = defaults.string(forKey: Keys.dashboardBaseURL) ?? Self.defaultWebOrigin
    workspaceID = defaults.string(forKey: Keys.workspaceID) ?? ""
    notificationsEnabled = defaults.object(forKey: Keys.notificationsEnabled) as? Bool ?? true

    // Default 8:30 AM local.
    let defaultMinutes = (8 * 60) + 30
    notificationTimeMinutes = defaults.object(forKey: Keys.notificationTimeMinutes) as? Int ?? defaultMinutes

    submitIdeaURL = defaults.string(forKey: Keys.submitIdeaURL) ?? "\(Self.defaultWebOrigin)/feedback?source=macos"

    // Default: neutral system glass and follow OS appearance.
    appearanceMode = defaults.string(forKey: Keys.appearanceMode) ?? "system"
    visualStyle = defaults.string(forKey: Keys.visualStyle) ?? "glass"

    // Demo guardrail: migrate old/stale origins to the current hosted origin.
    // This prevents accidental cross-project sync when the user has other local servers running.
    migrateLegacyOriginsIfNeeded()
  }

  private func migrateLegacyOriginsIfNeeded() {
    let prod = Self.defaultWebOrigin
    let prodSubmitIdea = "\(prod)/feedback?source=macos"

    func shouldMigrate(_ s: String) -> Bool {
      let t = s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      return t.hasPrefix("http://localhost") || t.hasPrefix("https://localhost") ||
        t.hasPrefix("http://127.0.0.1") || t.hasPrefix("https://127.0.0.1") ||
        t.hasPrefix("https://starbeam-web.onrender.com") || t.hasPrefix("http://starbeam-web.onrender.com") ||
        t.hasPrefix("https://starbeam-web") || t.hasPrefix("http://starbeam-web")
    }

    var didMigrateOrigin = false
    if shouldMigrate(serverBaseURL) {
      serverBaseURL = prod
      didMigrateOrigin = true
    }
    if shouldMigrate(dashboardBaseURL) {
      dashboardBaseURL = prod
      didMigrateOrigin = true
    }
    if shouldMigrate(submitIdeaURL) {
      submitIdeaURL = prodSubmitIdea
    }

    // Guardrail: a workspace id from a different environment is guaranteed to 404 in prod.
    if didMigrateOrigin {
      workspaceID = ""
    }
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
