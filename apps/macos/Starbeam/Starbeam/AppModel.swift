import Foundation
import Observation
import Sparkle

@MainActor
@Observable
final class AppModel {
  var settings: SettingsStore
  var auth: AuthStore
  let updater = UpdaterStore()

  var overview: Overview?
  var isRefreshing: Bool = false
  var lastError: AppError?
  /// Used for signed-out UX (e.g., when the server denies access for beta gating).
  var signedOutNotice: AppError?
  var cachedAt: Date?

  var showingSignInSheet: Bool = false

  private let cacheStore = OverviewCacheStore()
  private let notifications = NotificationScheduler()
  private var autoRefreshTask: Task<Void, Never>?
  private var firstPulseBoostTask: Task<Void, Never>?

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

      // If the cache is from today and includes pulse items, schedule the daily notification.
      if Calendar.current.isDateInToday(cached.meta.cachedAt), !cached.overview.pulse.isEmpty {
        Task {
          await notifications.scheduleIfNeeded(
            isPulseReady: true,
            signedIn: true,
            enabled: self.settings.notificationsEnabled,
            time: self.settings.notificationTimeComponents()
          )
        }
      }
    }

    configureAutoRefreshLoop()
    ensureSelectedWorkspaceIsValid()
    if canSync { Task { await refresh() } }
  }

  private func cancelFirstPulseBoost() {
    firstPulseBoostTask?.cancel()
    firstPulseBoostTask = nil
  }

  private func startFirstPulseBoostIfNeeded() {
    if firstPulseBoostTask != nil { return }
    guard canSync else { return }

    firstPulseBoostTask = Task { [weak self] in
      guard let self else { return }

      let startedAt = Date()
      while !Task.isCancelled {
        // Stop after 20 minutes max.
        if Date().timeIntervalSince(startedAt) >= 20 * 60 { break }

        // Stop if user is no longer in a state where sync makes sense.
        if !self.canSync { break }
        if let overview = self.overview, !overview.pulse.isEmpty { break }

        // Avoid stacking refresh calls.
        if !self.isRefreshing {
          await self.refresh()
        }

        let elapsed = Date().timeIntervalSince(startedAt)
        let sleepSeconds: TimeInterval = elapsed < 10 * 60 ? 30 : 60
        do {
          try await Task.sleep(nanoseconds: UInt64(sleepSeconds * 1_000_000_000))
        } catch {
          break
        }
      }

      await MainActor.run {
        self.firstPulseBoostTask = nil
      }
    }
  }

  /// Keep the app usable for the common demo case:
  /// - If there's exactly one workspace, auto-select it.
  /// - If multiple, default to the first if none is selected (or selection is stale).
  private func ensureSelectedWorkspaceIsValid() {
    guard let session = auth.session, !session.workspaces.isEmpty else { return }

    let selected = settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines)
    let isSelectedValid = session.workspaces.contains(where: { $0.id == selected })

    if isSelectedValid { return }

    // Prefer deterministic default (first workspace returned by the API).
    settings.workspaceID = session.workspaces.first?.id ?? ""
  }

  func selectWorkspace(id: String, shouldRefresh: Bool = true) {
    let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }

    settings.workspaceID = trimmed
    configureAutoRefreshLoop()

    // If we're switching workspaces, don't show the old workspace name while the refresh runs.
    // We'll keep existing data on screen until the new overview arrives.
    if shouldRefresh, canSync {
      Task { await refresh() }
    }
  }

  func cycleWorkspace(direction: Int) {
    guard let session = auth.session, session.workspaces.count >= 2 else { return }
    let list = session.workspaces

    let selected = settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines)
    let currentIndex = list.firstIndex(where: { $0.id == selected }) ?? 0

    let delta = direction >= 0 ? 1 : -1
    let nextIndex = (currentIndex + delta + list.count) % list.count
    selectWorkspace(id: list[nextIndex].id, shouldRefresh: true)
  }

  var workspaceName: String {
    if let session = auth.session {
      let selected = settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines)
      if let ws = session.workspaces.first(where: { $0.id == selected }) {
        return ws.name
      }
      if let first = session.workspaces.first {
        return first.name
      }
    }
    if let name = overview?.workspace.name, !name.isEmpty { return name }
    return "Company"
  }

  var canSync: Bool {
    auth.isSignedIn && !settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  func configureAutoRefreshLoop() {
    autoRefreshTask?.cancel()
    autoRefreshTask = nil

    guard canSync else { return }

    // Refresh once per hour while the app is running.
    autoRefreshTask = Task { [weak self] in
      while !Task.isCancelled {
        do {
          try await Task.sleep(nanoseconds: 60 * 60 * 1_000_000_000)
        } catch {
          break
        }
        guard let self else { break }
        await self.refresh()
      }
    }
  }

  func handleSettingsChanged(refreshIfPossible: Bool) {
    configureAutoRefreshLoop()
    if refreshIfPossible, canSync {
      Task { await refresh() }
    }
  }

  func handleNotificationSettingsChanged() {
    Task {
      if !settings.notificationsEnabled {
        await notifications.cancelScheduledPulseNotification()
        await notifications.clearLastNotifiedDay()
        return
      }
      let ready = (overview?.pulse.isEmpty == false)
      await notifications.scheduleIfNeeded(
        isPulseReady: ready,
        signedIn: auth.isSignedIn,
        enabled: settings.notificationsEnabled,
        time: settings.notificationTimeComponents()
      )
    }
  }

  func clearCache() {
    try? cacheStore.clear()
    cachedAt = nil
  }

  enum DashboardLinkKind {
    case dashboardHome
    case pulse
    case settings
  }

  func dashboardURL(kind: DashboardLinkKind) -> URL? {
    let raw = settings.dashboardBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let base = URL(string: raw) else { return nil }

    // If we have a workspace slug, prefer deep-linking into the web dashboard.
    let slug = overview?.workspace.slug?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !slug.isEmpty else { return base }

    switch kind {
    case .dashboardHome:
      return base.appendingPathComponent("w").appendingPathComponent(slug)
    case .pulse:
      return base.appendingPathComponent("w").appendingPathComponent(slug).appendingPathComponent("pulse")
    case .settings:
      return base.appendingPathComponent("w").appendingPathComponent(slug).appendingPathComponent("settings")
    }
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
    if session.accessToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      lastError = AppError(
        title: "Signed in, but missing token",
        message: "Please sign out and sign in again.",
        debugDetails: "Session.accessToken is empty (will cause HTTP 401 unauthorized)."
      )
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

    let client = APIClient(baseURL: baseURL)
    var activeSession = session
    let hadPulse = (overview?.pulse.isEmpty == false)

    func applyRefreshedSession(_ refreshed: APIClient.DeviceRefreshResponse) throws {
      let expiresAt = Date().addingTimeInterval(TimeInterval(refreshed.expiresIn))
      let updated = AuthStore.Session(
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: expiresAt,
        user: activeSession.user,
        workspaces: activeSession.workspaces
      )
      try auth.saveSession(updated)
      activeSession = updated
    }

    func refreshIfNeeded(skewSeconds: TimeInterval = 60) async throws {
      if activeSession.expiresAt > Date().addingTimeInterval(skewSeconds) { return }
      let refreshed = try await client.deviceRefresh(refreshToken: activeSession.refreshToken)
      try applyRefreshedSession(refreshed)
    }

    func maybeHandleAuthGate(_ error: Error) -> Bool {
      // If the server is enforcing private beta access, treat it as a hard auth failure:
      // clear cached pulses, sign out, and show a signed-out notice.
      guard case APIClient.APIError.http(let statusCode, let body) = error else { return false }
      guard statusCode == 403 || statusCode == 401 else { return false }

      if let data = body.data(using: .utf8) {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        if let payload = try? decoder.decode(APIClient.APIErrorPayload.self, from: data),
         payload.error == "access_denied"
        {
          let msg = payload.errorDescription ?? "Access denied."
          let notice = AppError(
            title: "Access required",
            message: msg,
            debugDetails: "HTTP \(statusCode): \(body)"
          )
          signOut(notice: notice)
          return true
        }
      }

      // Fallback: heuristics when the body isn't JSON.
      let lower = body.lowercased()
      if lower.contains("private beta") || lower.contains("beta access") {
        let notice = AppError(
          title: "Access required",
          message: "This account doesn’t have beta access. Sign in with an invited account.",
          debugDetails: "HTTP \(statusCode): \(body)"
        )
        signOut(notice: notice)
        return true
      }

      return false
    }

    do {
      try await refreshIfNeeded()
      let result = try await client.fetchOverview(
        workspaceID: workspaceID,
        accessToken: activeSession.accessToken,
        refreshToken: activeSession.refreshToken
      )
      overview = result.overview
      lastError = nil
      let hasPulseNow = !result.overview.pulse.isEmpty

      do {
        try cacheStore.save(rawJSON: result.rawJSON, workspaceID: workspaceID)
        cachedAt = Date()
      } catch {
        // Cache failure should not block rendering fresh data.
      }

      if !hadPulse, hasPulseNow {
        await notifications.notifyPulseReadyNowIfNeeded(
          signedIn: true,
          enabled: settings.notificationsEnabled
        )
      } else {
        await notifications.scheduleIfNeeded(
          isPulseReady: hasPulseNow,
          signedIn: true,
          enabled: settings.notificationsEnabled,
          time: settings.notificationTimeComponents()
        )
      }

      if hasPulseNow {
        cancelFirstPulseBoost()
      } else {
        startFirstPulseBoostIfNeeded()
      }
    } catch {
      if maybeHandleAuthGate(error) { return }

      // If the access token expired early, refresh and retry once.
      if case APIClient.APIError.http(let statusCode, _) = error, statusCode == 401 {
        do {
          try await refreshIfNeeded(skewSeconds: 0)
          let retry = try await client.fetchOverview(
            workspaceID: workspaceID,
            accessToken: activeSession.accessToken,
            refreshToken: activeSession.refreshToken
          )
          overview = retry.overview
          lastError = nil
          let hasPulseNow = !retry.overview.pulse.isEmpty

          do {
            try cacheStore.save(rawJSON: retry.rawJSON, workspaceID: workspaceID)
            cachedAt = Date()
          } catch {
            // Cache failure should not block rendering fresh data.
          }

          if !hadPulse, hasPulseNow {
            await notifications.notifyPulseReadyNowIfNeeded(
              signedIn: true,
              enabled: settings.notificationsEnabled
            )
          } else {
            await notifications.scheduleIfNeeded(
              isPulseReady: hasPulseNow,
              signedIn: true,
              enabled: settings.notificationsEnabled,
              time: settings.notificationTimeComponents()
            )
          }

          if hasPulseNow {
            cancelFirstPulseBoost()
          } else {
            startFirstPulseBoostIfNeeded()
          }
          return
        } catch {
          if maybeHandleAuthGate(error) { return }
          // Fallthrough to error surface below.
        }
      }

      lastError = AppError(
        title: "Sync failed",
        message: "Couldn’t refresh your overview. Try again.",
        debugDetails: String(describing: error)
      )
    }
  }

  func signOut(notice: AppError? = nil) {
    autoRefreshTask?.cancel()
    autoRefreshTask = nil
    cancelFirstPulseBoost()
    Task { await notifications.cancelScheduledPulseNotification() }
    auth.signOut()
    try? cacheStore.clear()
    overview = nil
    cachedAt = nil
    lastError = nil
    signedOutNotice = notice
  }
}

// MARK: - Updates (Direct Download via Sparkle)

@MainActor
final class UpdaterStore: NSObject {
  private let controller: SPUStandardUpdaterController

  override init() {
    // Starting the updater means it will perform scheduled checks as configured.
    controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
    super.init()

    // Desired behavior:
    // - check automatically
    // - download silently
    // - ask before install (Sparkle's standard user driver will prompt)
    controller.updater.automaticallyChecksForUpdates = true
    controller.updater.automaticallyDownloadsUpdates = true
  }

  func checkForUpdates() {
    controller.checkForUpdates(nil)
  }
}

struct AppError: Error, Equatable {
  var title: String
  var message: String
  var debugDetails: String?
}
