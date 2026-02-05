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
  var cachedAt: Date?

  var showingSignInSheet: Bool = false

  private let cacheStore = OverviewCacheStore()

  init(settings: SettingsStore? = nil, auth: AuthStore? = nil) {
    // Default arguments are evaluated outside the MainActor context; construct defaults inside.
    self.settings = settings ?? SettingsStore()
    self.auth = auth ?? AuthStore()

    // Show cached overview immediately when signed in, then refresh in the background.
    if self.auth.isSignedIn, let cached = cacheStore.load() {
      overview = cached.overview
      cachedAt = cached.meta.cachedAt

      // If the user hasn't picked a workspace yet, prefer the cached workspace id.
      if self.settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        self.settings.workspaceID = cached.meta.workspaceID
      }
    }

    if canSync {
      Task { await refresh() }
    }
  }

  var workspaceName: String {
    if let name = overview?.workspace.name, !name.isEmpty { return name }
    if let session = auth.session {
      let selected = settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines)
      if let ws = session.workspaces.first(where: { $0.id == selected }) {
        return ws.name
      }
      if let first = session.workspaces.first {
        return first.name
      }
    }
    return "Company"
  }

  var canSync: Bool {
    auth.isSignedIn && !settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  func refresh() async {
    let workspaceID = settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard auth.isSignedIn else {
      lastError = nil
      return
    }
    guard !workspaceID.isEmpty else {
      lastError = nil
      return
    }
    guard let session = auth.session else {
      lastError = nil
      return
    }

    let baseURLString = settings.serverBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let baseURL = URL(string: baseURLString) else {
      lastError = AppError(
        title: "Invalid server URL",
        message: "Check Settings → Server base URL.",
        debugDetails: baseURLString
      )
      return
    }

    isRefreshing = true
    defer { isRefreshing = false }

    do {
      let client = APIClient(baseURL: baseURL)
      let result = try await client.fetchOverview(workspaceID: workspaceID, accessToken: session.accessToken)
      overview = result.overview
      lastError = nil

      do {
        try cacheStore.save(rawJSON: result.rawJSON, workspaceID: workspaceID)
        cachedAt = Date()
      } catch {
        // Cache failure should not block rendering fresh data.
      }
    } catch {
      lastError = AppError(
        title: "Sync failed",
        message: "Couldn’t refresh your overview. Try again.",
        debugDetails: String(describing: error)
      )
    }
  }

  func signOut() {
    auth.signOut()
    try? cacheStore.clear()
    overview = nil
    cachedAt = nil
    lastError = nil
  }
}

struct AppError: Error, Equatable {
  var title: String
  var message: String
  var debugDetails: String?
}
