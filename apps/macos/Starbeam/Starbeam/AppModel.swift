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

  private func normalizedActivationState(from overview: Overview?) -> String {
    let raw = overview?.activationHints?.state ?? ""
    return raw
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
      .replacingOccurrences(of: "-", with: "_")
  }

  private func nextFirstPulseBoostSleepSeconds(
    elapsed: TimeInterval,
    overview: Overview?
  ) -> TimeInterval? {
    let state = normalizedActivationState(from: overview)
    switch state {
    case "ready", "failed_blocking":
      return nil
    case "running":
      return 20
    case "queued":
      return 30
    case "failed_retriable":
      return 45
    case "not_started":
      return elapsed < 10 * 60 ? 75 : 120
    default:
      // Backward-compatible fallback when hints are missing.
      return elapsed < 10 * 60 ? 30 : 60
    }
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

        let elapsed = Date().timeIntervalSince(startedAt)
        guard let sleepSeconds = self.nextFirstPulseBoostSleepSeconds(
          elapsed: elapsed,
          overview: self.overview
        ) else {
          break
        }

        // Avoid stacking refresh calls.
        if !self.isRefreshing {
          await self.refresh()
        }

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

  /// Keep the app usable without requiring manual Settings tweaks:
  /// - If there's exactly one workspace, auto-select it.
  /// - If multiple, prefer PERSONAL, otherwise pick a deterministic default if the selection is stale.
  @discardableResult
  func ensureSelectedWorkspaceIsValid() -> Bool {
    guard let session = auth.session, !session.workspaces.isEmpty else { return false }

    let selected = settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines)
    let isSelectedValid = session.workspaces.contains(where: { $0.id == selected })

    if isSelectedValid { return false }

    // If the selection is stale (common when switching between environments or accounts),
    // fall back deterministically. Prefer PERSONAL when available.
    let choice: AuthStore.Workspace?
    if session.workspaces.count == 1 {
      choice = session.workspaces.first
    } else {
      let personal = session.workspaces.first(where: { $0.type.uppercased() == "PERSONAL" }) ??
        session.workspaces.first(where: { $0.slug.lowercased() == "personal" || $0.name.lowercased() == "personal" })

      choice = personal ?? session.workspaces.sorted {
        $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
      }.first
    }

    let next = choice?.id ?? ""
    if next == selected { return false }

    settings.workspaceID = next
    return true
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

  private func noticeForRefreshAuthFailure(_ error: Error) -> AppError? {
    let debug = String(describing: error)

    guard let apiError = error as? APIClient.APIError else { return nil }
    switch apiError {
    case .oauth(let code, let description):
      switch code {
      case "invalid_token", "expired_token":
        return AppError(
          title: "Session expired",
          message: "Please sign in again to continue syncing.",
          debugDetails: debug
        )
      case "invalid_request":
        return AppError(
          title: "Sign-in required",
          message: "Your session is incomplete. Please sign in again.",
          debugDetails: debug
        )
      case "access_denied":
        let msg = (description ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return AppError(
          title: "Access required",
          message: msg.isEmpty ? "Private beta access required." : msg,
          debugDetails: debug
        )
      default:
        return nil
      }
    case .http(let statusCode, _):
      // Only use this helper when the HTTP error is known to have occurred during
      // a refresh-token refresh attempt (not during normal overview fetch).
      if statusCode == 401 {
        return AppError(
          title: "Session expired",
          message: "Please sign in again to continue syncing.",
          debugDetails: debug
        )
      }
      return nil
    default:
      return nil
    }
  }

  private func refreshActiveSessionIfNeeded(
    client: APIClient,
    activeSession: inout AuthStore.Session,
    skewSeconds: TimeInterval = 60
  ) async throws {
    if activeSession.expiresAt > Date().addingTimeInterval(skewSeconds) { return }

    let refreshed = try await client.deviceRefresh(refreshToken: activeSession.refreshToken)
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

  func addTodo(title: String, details: String? = nil) async {
    guard auth.isSignedIn else { return }
    guard var activeSession = auth.session else { return }

    let workspaceID = settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !workspaceID.isEmpty else {
      lastError = AppError(
        title: "Missing workspace",
        message: "Choose a primary workspace in Settings to add todos.",
        debugDetails: "SettingsStore.workspaceID is empty."
      )
      return
    }

    let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedTitle.isEmpty else { return }

    let baseURLString = settings.serverBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let baseURL = URL(string: baseURLString) else {
      lastError = AppError(
        title: "Invalid server URL",
        message: "Check Settings → Advanced → Server base URL.",
        debugDetails: baseURLString
      )
      return
    }

    let client = APIClient(baseURL: baseURL)

    do {
      do {
        try await refreshActiveSessionIfNeeded(client: client, activeSession: &activeSession)
      } catch {
        if let notice = noticeForRefreshAuthFailure(error) {
          signOut(notice: notice)
          return
        }
        throw error
      }

      _ = try await client.createTask(
        workspaceID: workspaceID,
        title: trimmedTitle,
        body: details,
        accessToken: activeSession.accessToken,
        refreshToken: activeSession.refreshToken
      )

      await refresh()
    } catch {
      if let notice = noticeForRefreshAuthFailure(error) {
        signOut(notice: notice)
        return
      }
      lastError = AppError(
        title: "Couldn’t add todo",
        message: "Try again.",
        debugDetails: String(describing: error)
      )
    }
  }

  func setTodoDone(taskID: String, isDone: Bool) async {
    guard auth.isSignedIn else { return }
    guard var activeSession = auth.session else { return }

    let workspaceID = settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !workspaceID.isEmpty else { return }

    let trimmedID = taskID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedID.isEmpty else { return }

    let baseURLString = settings.serverBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let baseURL = URL(string: baseURLString) else { return }

    let client = APIClient(baseURL: baseURL)
    let status = isDone ? "DONE" : "OPEN"

    do {
      do {
        try await refreshActiveSessionIfNeeded(client: client, activeSession: &activeSession)
      } catch {
        if let notice = noticeForRefreshAuthFailure(error) {
          signOut(notice: notice)
          return
        }
        throw error
      }

      _ = try await client.updateTaskStatus(
        workspaceID: workspaceID,
        taskID: trimmedID,
        status: status,
        accessToken: activeSession.accessToken,
        refreshToken: activeSession.refreshToken
      )

      await refresh()
    } catch {
      if let notice = noticeForRefreshAuthFailure(error) {
        signOut(notice: notice)
        return
      }
      lastError = AppError(
        title: "Couldn’t update todo",
        message: "Try again.",
        debugDetails: String(describing: error)
      )
    }
  }

  func deleteTodo(taskID: String) async {
    guard auth.isSignedIn else { return }
    guard var activeSession = auth.session else { return }

    let workspaceID = settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !workspaceID.isEmpty else { return }

    let trimmedID = taskID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedID.isEmpty else { return }

    let baseURLString = settings.serverBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let baseURL = URL(string: baseURLString) else { return }

    let client = APIClient(baseURL: baseURL)

    do {
      do {
        try await refreshActiveSessionIfNeeded(client: client, activeSession: &activeSession)
      } catch {
        if let notice = noticeForRefreshAuthFailure(error) {
          signOut(notice: notice)
          return
        }
        throw error
      }

      _ = try await client.deleteTask(
        workspaceID: workspaceID,
        taskID: trimmedID,
        accessToken: activeSession.accessToken,
        refreshToken: activeSession.refreshToken
      )

      await refresh()
    } catch {
      if let notice = noticeForRefreshAuthFailure(error) {
        signOut(notice: notice)
        return
      }
      lastError = AppError(
        title: "Couldn’t delete todo",
        message: "Try again.",
        debugDetails: String(describing: error)
      )
    }
  }

  func setPulseCardState(cardID: String, state: String) async {
    guard auth.isSignedIn else { return }
    guard var activeSession = auth.session else { return }

    let workspaceID = settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !workspaceID.isEmpty else { return }

    let trimmedCardID = cardID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedCardID.isEmpty else { return }

    let normalizedState = state.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    guard normalizedState == "DONE" || normalizedState == "DISMISSED" || normalizedState == "OPEN" else {
      return
    }

    guard let editionDate = overview?.editionDate else { return }

    let baseURLString = settings.serverBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let baseURL = URL(string: baseURLString) else { return }

    let client = APIClient(baseURL: baseURL)

    do {
      do {
        try await refreshActiveSessionIfNeeded(client: client, activeSession: &activeSession)
      } catch {
        if let notice = noticeForRefreshAuthFailure(error) {
          signOut(notice: notice)
          return
        }
        throw error
      }

      _ = try await client.updatePulseActionState(
        workspaceID: workspaceID,
        editionDate: editionDate,
        cardID: trimmedCardID,
        state: normalizedState,
        accessToken: activeSession.accessToken,
        refreshToken: activeSession.refreshToken
      )

      await refresh()
    } catch {
      if let notice = noticeForRefreshAuthFailure(error) {
        signOut(notice: notice)
        return
      }
      lastError = AppError(
        title: "Couldn’t update pulse card",
        message: "Try again.",
        debugDetails: String(describing: error)
      )
    }
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

  func dashboardURL(path: String) -> URL? {
    let raw = settings.dashboardBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let base = URL(string: raw) else { return nil }

    let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return base }
    guard trimmed.hasPrefix("/") else {
      return URL(string: trimmed, relativeTo: base)?.absoluteURL
    }

    return URL(string: trimmed, relativeTo: base)?.absoluteURL
  }

  func refresh() async {
    guard auth.isSignedIn else {
      lastError = nil
      return
    }
    guard let session = auth.session else {
      lastError = nil
      return
    }

    // Self-heal stale workspace selections before we make any request.
    if ensureSelectedWorkspaceIsValid() {
      configureAutoRefreshLoop()
    }

    let workspaceID = settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !workspaceID.isEmpty else {
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
      do {
        try await refreshActiveSessionIfNeeded(client: client, activeSession: &activeSession)
      } catch {
        if let notice = noticeForRefreshAuthFailure(error) {
          signOut(notice: notice)
          return
        }
        throw error
      }
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
          do {
            try await refreshActiveSessionIfNeeded(client: client, activeSession: &activeSession, skewSeconds: 0)
          } catch {
            if let notice = noticeForRefreshAuthFailure(error) {
              signOut(notice: notice)
              return
            }
            throw error
          }
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
    settings.workspaceID = ""
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
