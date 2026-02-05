import Foundation
import UserNotifications

/// Schedules a once-per-day local notification when the pulse is ready.
/// Content is intentionally generic (no sensitive preview text).
actor NotificationScheduler {
  private enum Keys {
    static let lastNotifiedDay = "starbeam.notifications.lastNotifiedDay"
    static let scheduledRequestID = "starbeam.notifications.scheduledRequestID"
  }

  private let center: UNUserNotificationCenter
  private let defaults: UserDefaults

  init(center: UNUserNotificationCenter = .current(), defaults: UserDefaults = .standard) {
    self.center = center
    self.defaults = defaults
  }

  func authorizationStatus() async -> UNAuthorizationStatus {
    let settings = await center.notificationSettings()
    return settings.authorizationStatus
  }

  func requestAuthorizationIfNeeded() async -> Bool {
    let status = await authorizationStatus()
    switch status {
    case .authorized, .provisional, .ephemeral:
      return true
    case .denied:
      return false
    case .notDetermined:
      do {
        return try await center.requestAuthorization(options: [.alert, .sound])
      } catch {
        return false
      }
    @unknown default:
      return false
    }
  }

  func cancelScheduledPulseNotification() async {
    if let id = defaults.string(forKey: Keys.scheduledRequestID), !id.isEmpty {
      center.removePendingNotificationRequests(withIdentifiers: [id])
    }
    defaults.removeObject(forKey: Keys.scheduledRequestID)
  }

  func clearLastNotifiedDay() {
    defaults.removeObject(forKey: Keys.lastNotifiedDay)
  }

  /// Call whenever overview is refreshed, or when notification settings change.
  /// - Behavior:
  ///   - If pulse isn't ready or notifications are disabled: don't schedule.
  ///   - If it's before the configured time: schedule for today at that time.
  ///   - If it's after the configured time: notify immediately (once per day).
  func scheduleIfNeeded(
    isPulseReady: Bool,
    signedIn: Bool,
    enabled: Bool,
    time: DateComponents,
    now: Date = Date(),
    calendar: Calendar = .current
  ) async {
    guard signedIn, enabled, isPulseReady else { return }
    guard await requestAuthorizationIfNeeded() else { return }

    let todayKey = dayKey(for: now, calendar: calendar)
    let alreadyNotified = defaults.string(forKey: Keys.lastNotifiedDay) == todayKey
    if alreadyNotified { return }

    // Only keep a single pending request; rescheduling is handled by canceling first.
    await cancelScheduledPulseNotification()

    let configured = nextFireDate(now: now, time: time, calendar: calendar)
    let requestID = "starbeam.pulse.\(todayKey)"

    let content = UNMutableNotificationContent()
    content.title = "Starbeam"
    content.body = "Your pulse is ready. Open Starbeam to view it."
    content.sound = .default

    let trigger: UNNotificationTrigger
    if configured.fireImmediately {
      trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
    } else {
      let comps = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: configured.date)
      trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
    }

    do {
      try await center.add(UNNotificationRequest(identifier: requestID, content: content, trigger: trigger))
      defaults.set(requestID, forKey: Keys.scheduledRequestID)
      defaults.set(todayKey, forKey: Keys.lastNotifiedDay)
    } catch {
      // Don't mark as notified if we failed to schedule.
      defaults.removeObject(forKey: Keys.scheduledRequestID)
    }
  }

  private func dayKey(for date: Date, calendar: Calendar) -> String {
    let comps = calendar.dateComponents([.year, .month, .day], from: date)
    let y = comps.year ?? 0
    let m = comps.month ?? 0
    let d = comps.day ?? 0
    return String(format: "%04d-%02d-%02d", y, m, d)
  }

  private struct FireDateResult {
    var date: Date
    var fireImmediately: Bool
  }

  private func nextFireDate(now: Date, time: DateComponents, calendar: Calendar) -> FireDateResult {
    let hour = time.hour ?? 8
    let minute = time.minute ?? 30

    if let todayAtTime = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: now),
       now < todayAtTime
    {
      return .init(date: todayAtTime, fireImmediately: false)
    }

    return .init(date: now, fireImmediately: true)
  }
}

