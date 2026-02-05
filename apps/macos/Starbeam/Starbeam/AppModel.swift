import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
  var settings: SettingsStore
  var auth: AuthStore

  var overview: Overview?
  var isRefreshing: Bool = false
  var lastError: AppError?

  var showingSignInSheet: Bool = false

  init(settings: SettingsStore? = nil, auth: AuthStore? = nil) {
    // Default arguments are evaluated outside the MainActor context; construct defaults inside.
    self.settings = settings ?? SettingsStore()
    self.auth = auth ?? AuthStore()
  }

  var workspaceName: String {
    if let name = overview?.workspace.name, !name.isEmpty { return name }
    return "Company"
  }

  var canSync: Bool {
    auth.isSignedIn && !settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  func refresh() async {
    // Networking is wired up next. For now, we only clear error state.
    lastError = nil
  }

  func signOut() {
    auth.signOut()
    overview = nil
    lastError = nil
  }
}

struct AppError: Error, Equatable {
  var title: String
  var message: String
  var debugDetails: String?
}
