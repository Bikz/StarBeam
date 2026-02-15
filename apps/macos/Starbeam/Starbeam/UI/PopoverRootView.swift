import SwiftUI
import AppKit

struct PopoverRootView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.starbeamVisualStyle) private var style

  private enum Route {
    case home
    case settings
    case signIn
  }

  @State private var route: Route = .home

  var body: some View {
    @Bindable var model = model

    ZStack {
      StarbeamRootBackgroundView(style: style)

      StarbeamGlassGroup {
        VStack(spacing: 0) {
          switch route {
          case .home:
            homeContent
          case .settings:
            settingsContent
          case .signIn:
            signInContent
          }
        }
        .starbeamSurface(cornerRadius: StarbeamTheme.outerCorner, material: .ultraThinMaterial, shadow: .window)
        .padding(10)
      }
    }
    .onDisappear {
      // MenuBarExtra closes when focus changes; ensure we don't "stick" on Settings/Sign-in.
      route = .home
    }
  }

  @ViewBuilder
  private var homeContent: some View {
    if !model.auth.isSignedIn {
      signedOutContent
    } else {
      VStack(spacing: 0) {
        ScrollView {
          VStack(alignment: .leading, spacing: 14) {
            headerFlat()

            if let error = model.lastError {
              errorBanner(error)
            }

            if let overview = model.overview {
              onboardingSection(overview)
            }

            pulseHeader

            if model.overview != nil {
              todaySnapshotStrip
            }

            pulseSection

            HStack {
              Spacer()
              Button {
                openViewMore()
              } label: {
                HStack(spacing: 6) {
                  Text("Open dashboard")
                  Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                }
              }
              .buttonStyle(.plain)
              .foregroundStyle(.secondary)
              .accessibilityLabel("Open dashboard")
            }
            .padding(.top, 2)

            Divider()
              .opacity(0.6)
              .padding(.top, 4)

            splitPanels
          }
          .padding(18)
        }
        .scrollIndicators(.hidden)
        .refreshable {
          guard model.canSync else { return }
          await model.refresh()
        }
        // Workspace switching: swipe left/right anywhere in the popover.
        // Keep it strict to avoid interfering with normal vertical scrolling.
        .simultaneousGesture(workspaceSwipeGesture())

        WorkspacePagerView(
          workspaces: model.auth.session?.workspaces ?? [],
          selectedWorkspaceID: model.settings.workspaceID,
          signedIn: model.auth.isSignedIn,
          onSelect: { id in
            model.selectWorkspace(id: id, shouldRefresh: true)
          }
        )
      }
    }
  }

  private var signedOutContent: some View {
    VStack(spacing: 0) {
      headerFlat(showDivider: false)
        .padding(.horizontal, 18)
        .padding(.top, 18)

      VStack(spacing: 14) {
        Spacer(minLength: 0)

        EmptyStatePulseArt()
          .frame(width: 176, height: 176)
          .opacity(0.92)
          .padding(.bottom, 2)

        if let notice = model.signedOutNotice {
          VStack(alignment: .leading, spacing: 6) {
            Text(notice.title)
              .font(.system(size: 14, weight: .bold, design: .rounded))
            Text(notice.message)
              .font(.system(size: 12, weight: .medium, design: .rounded))
              .foregroundStyle(.secondary)
              .fixedSize(horizontal: false, vertical: true)
          }
          .frame(maxWidth: 360, alignment: .leading)
          .padding(12)
          .starbeamSurface(cornerRadius: 14, material: .thinMaterial, shadow: .card)
        } else {
          Text("Sign in to get a calm daily pulse in your menu bar.")
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
            .frame(maxWidth: 360, alignment: .center)
        }

        Button("Sign in") { route = .signIn }
          .buttonStyle(.borderedProminent)
          .controlSize(.large)
          .accessibilityLabel("Sign in")

        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity)
      .padding(18)
    }
  }

  private var settingsContent: some View {
    VStack(spacing: 0) {
      HStack(spacing: 10) {
        Button {
          route = .home
        } label: {
          Image(systemName: "chevron.left")
            .font(.system(size: 12, weight: .semibold))
            .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .accessibilityLabel("Back")

        Text("Settings")
          .font(.system(size: 14, weight: .bold, design: .rounded))

        Spacer()
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 12)

      Divider().opacity(0.6)

      SettingsView(
        onRequestSignIn: { route = .signIn },
        onSignedOut: { route = .home }
      )
        .environment(model)
    }
  }

  private var signInContent: some View {
    VStack(spacing: 0) {
      HStack(spacing: 10) {
        Button {
          // Prefer returning to Settings if that's where the user came from.
          route = .settings
        } label: {
          Image(systemName: "chevron.left")
            .font(.system(size: 12, weight: .semibold))
            .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .accessibilityLabel("Back")

        Text("Sign in")
          .font(.system(size: 14, weight: .bold, design: .rounded))

        Spacer()
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 12)

      Divider().opacity(0.6)

      DeviceSignInView(onDismiss: { route = .home })
        .environment(model)
        .padding(18)
    }
  }

  private var header: some View {
    let canOpenDashboard = model.auth.isSignedIn && model.dashboardURL(kind: .dashboardHome) != nil

    return StarbeamHeaderBar(
      style: style,
      workspaceName: model.workspaceName,
      signedIn: model.auth.isSignedIn,
      canOpenDashboard: canOpenDashboard,
      canSync: model.canSync,
      isRefreshing: model.isRefreshing,
      onOpenDashboard: openDashboard,
      onOpenSettings: { route = .settings },
      onRefresh: { Task { await model.refresh() } }
    )
  }

  private func headerFlat(showDivider: Bool = true) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      header
      if showDivider {
        Divider().opacity(0.35)
      }
    }
  }

  private struct StarbeamHeaderBar: View {
    let style: StarbeamVisualStyle
    let workspaceName: String
    let signedIn: Bool
    let canOpenDashboard: Bool
    let canSync: Bool
    let isRefreshing: Bool
    let onOpenDashboard: () -> Void
    let onOpenSettings: () -> Void
    let onRefresh: () -> Void

    var body: some View {
      HStack(alignment: .center, spacing: 12) {
        appMark

        VStack(alignment: .leading, spacing: signedIn ? 2 : 0) {
          Text("Starbeam")
            .font(StarbeamTheme.headerTitleFont)
            .lineLimit(1)

          if signedIn {
            Text("Your Pulse for \(workspaceName)")
              .font(StarbeamTheme.headerSubtitleFont)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
        }
        .layoutPriority(1)

        Spacer(minLength: 0)

        HStack(spacing: 10) {
          if signedIn {
            HeaderIconButton(
              systemImage: "house",
              accessibilityLabel: "Open pulse on web",
              enabled: canOpenDashboard,
              action: onOpenDashboard
            )
          }

          HeaderIconButton(
            systemImage: "gearshape",
            accessibilityLabel: "Settings",
            enabled: true,
            action: onOpenSettings
          )

          if signedIn {
            HeaderIconButton(
              accessibilityLabel: "Refresh",
              enabled: canSync,
              action: onRefresh,
              accessibilityHint: canSync ? "Sync now" : "Set a workspace in Settings to enable sync"
            ) {
              if isRefreshing {
                ProgressView()
                  .controlSize(.small)
              } else {
                Image(systemName: "arrow.clockwise")
                  .font(.system(size: 13, weight: .semibold))
              }
            }
          }
        }
      }
    }

    private var appMark: some View {
      ZStack {
        if style == .chroma {
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(
              LinearGradient(
                colors: [Color.pink.opacity(0.6), Color.blue.opacity(0.45)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
            .frame(width: 44, height: 44)
            .shadow(color: .black.opacity(0.12), radius: 10, x: 0, y: 6)

          Image(systemName: "sparkles")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(.white)
        } else {
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(.thinMaterial)
            .frame(width: 44, height: 44)
            .overlay(
              RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(.white.opacity(0.16), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.08), radius: 10, x: 0, y: 6)

          Image(systemName: "sparkles")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(.primary)
        }
      }
      .accessibilityHidden(true)
    }
  }

  private struct EmptyStatePulseArt: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
      if reduceTransparency {
        EmptyView()
      } else if let img = load() {
        Image(nsImage: img)
          .resizable()
          .scaledToFit()
          .saturation(scheme == .dark ? 0.98 : 0.86)
      } else {
        EmptyView()
      }
    }

    private func load() -> NSImage? {
      // Use separate assets for light/dark so we can tune the tonemapping per scheme.
      let base = scheme == .dark ? "empty_state_pulse_glass_orb_dark" : "empty_state_pulse_glass_orb"
      let ext = "png"

      func url(_ subdir: String?) -> URL? {
        Bundle.main.url(forResource: base, withExtension: ext, subdirectory: subdir)
      }

      let candidates = [
        url(nil),
        url("EmptyState"),
        url("Resources/EmptyState"),
      ].compactMap { $0 }

      for u in candidates {
        if let img = NSImage(contentsOf: u) { return img }
      }
      return nil
    }
  }

  private struct HeaderIconButton: View {
    let accessibilityLabel: String
    let accessibilityHint: String?
    let enabled: Bool
    let action: () -> Void
    let content: AnyView

    init(
      systemImage: String,
      accessibilityLabel: String,
      enabled: Bool,
      action: @escaping () -> Void,
      accessibilityHint: String? = nil
    ) {
      self.accessibilityLabel = accessibilityLabel
      self.accessibilityHint = accessibilityHint
      self.enabled = enabled
      self.action = action
      self.content = AnyView(Image(systemName: systemImage).font(.system(size: 13, weight: .semibold)))
    }

    init(
      accessibilityLabel: String,
      enabled: Bool,
      action: @escaping () -> Void,
      accessibilityHint: String? = nil,
      @ViewBuilder content: () -> some View
    ) {
      self.accessibilityLabel = accessibilityLabel
      self.accessibilityHint = accessibilityHint
      self.enabled = enabled
      self.action = action
      self.content = AnyView(content())
    }

    var body: some View {
      let button = Button(action: action) {
        content.frame(width: 28, height: 28)
      }
      .buttonStyle(.plain)
      .foregroundStyle(.secondary)
      .disabled(!enabled)
      .opacity(enabled ? 1 : 0.4)
      .accessibilityLabel(accessibilityLabel)

      if let accessibilityHint {
        button.accessibilityHint(accessibilityHint)
      } else {
        button
      }
    }
  }

  private func errorBanner(_ error: AppError) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      ErrorBannerView(error: error) {
        Task { await model.refresh() }
      }
    }
    .padding(12)
    .starbeamSurface(cornerRadius: 14, material: .thinMaterial, shadow: .card)
  }

  @ViewBuilder
  private func onboardingSection(_ overview: Overview) -> some View {
    if overview.onboardingMode == .setup {
      VStack(alignment: .leading, spacing: 8) {
        Text("Setup checklist")
          .font(.system(size: 17, weight: .bold, design: .rounded))
          .accessibilityAddTraits(.isHeader)
        setupChecklistCard(overview.onboardingChecklist)
      }
    } else if !overview.onboardingChecklist.isEmpty {
      HStack(spacing: 8) {
        Image(systemName: "checkmark.seal.fill")
          .foregroundStyle(.secondary)
          .font(.system(size: 13, weight: .semibold))
        Text("Setup complete")
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(.secondary)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .starbeamCard()
      .accessibilityLabel("Setup complete")
    }
  }

  private func setupChecklistCard(_ checklist: [Overview.Onboarding.ChecklistItem]) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      VStack(alignment: .leading, spacing: 8) {
        ForEach(Array(checklist.prefix(4))) { item in
          HStack(spacing: 8) {
            Image(systemName: item.isComplete ? "checkmark.circle.fill" : "circle")
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(item.isComplete ? .secondary : .primary)
              .accessibilityHidden(true)
            Text(item.title)
              .font(.system(size: 12, weight: .semibold, design: .rounded))
              .foregroundStyle(item.isComplete ? .secondary : .primary)
              .strikethrough(item.isComplete)
            Spacer(minLength: 0)
          }
        }
      }

      if let next = checklist.first(where: { !$0.isComplete }) {
        Button(next.ctaLabel) {
          openOnboardingCTA(next)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.small)
        .accessibilityLabel(next.ctaLabel)
      }
    }
    .padding(12)
    .starbeamCard()
  }

  private var pulseHeader: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text(model.overview?.onboardingMode == .setup ? "Daily ideas" : "Your Pulse")
          .font(.system(size: 18, weight: .bold, design: .rounded))
          .accessibilityAddTraits(.isHeader)

        Spacer(minLength: 0)

        if let label = pulseUpdatedLabel {
          Text(label)
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .foregroundStyle(.secondary)
        }
      }

      if let pulseMeta = model.overview?.pulseMeta {
        VStack(alignment: .leading, spacing: 2) {
          Text("Focus: \(pulseMeta.recommendedFocus)")
            .font(.system(size: 11, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
            .lineLimit(2)
          if let whyThisToday = pulseMeta.whyThisToday, !whyThisToday.isEmpty {
            Text(whyThisToday)
              .font(.system(size: 11, weight: .regular, design: .rounded))
              .foregroundStyle(.secondary)
              .lineLimit(2)
          }
        }
      }
    }
    .padding(.top, 2)
  }

  private var todaySnapshotStrip: some View {
    HStack(spacing: 10) {
      snapshotPill("Focus", value: "\(focusCount)")
      snapshotPill("Emails", value: "\(importantEmailCount)")
      snapshotPill("Next", value: nextCalendarSummary)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .starbeamCard()
    .accessibilityLabel("Today snapshot. Focus \(focusCount). Emails \(importantEmailCount). Next \(nextCalendarSummary)")
  }

  private func snapshotPill(_ label: String, value: String) -> some View {
    HStack(spacing: 4) {
      Text(label)
        .foregroundStyle(.secondary)
      Text(value)
    }
    .font(.system(size: 11, weight: .semibold, design: .rounded))
    .lineLimit(1)
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var pulseUpdatedLabel: String? {
    if let generatedAt = model.overview?.generatedAt {
      return "Updated \(relativePast(generatedAt))"
    }
    if let cachedAt = model.cachedAt {
      return "Updated \(relativePast(cachedAt))"
    }
    return nil
  }

  private var focusCount: Int {
    model.overview?.focus.count ?? 0
  }

  private var importantEmailCount: Int {
    guard let focus = model.overview?.focus else { return 0 }
    return focus.filter {
      ($0.icon ?? "") == "sf:envelope" ||
        ($0.subtitle ?? "").localizedCaseInsensitiveContains("gmail")
    }.count
  }

  private var nextCalendarSummary: String {
    guard let items = model.overview?.calendar, !items.isEmpty else { return "None" }

    let now = Date()
    let upcoming = items
      .filter { $0.start >= now }
      .sorted { $0.start < $1.start }
      .first ?? items.sorted { $0.start < $1.start }.first

    guard let upcoming else { return "None" }
    let df = DateFormatter()
    df.locale = .current
    df.timeStyle = .short
    df.dateStyle = .none
    return "\(df.string(from: upcoming.start)) \(upcoming.title)"
  }

  private func relativePast(_ date: Date, now: Date = Date()) -> String {
    let seconds = max(0, Int(now.timeIntervalSince(date)))
    let minutes = seconds / 60
    if minutes < 60 { return "\(minutes)m ago" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)h ago" }
    let days = hours / 24
    return "\(days)d ago"
  }

  private var pulseSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      if model.isRefreshing && model.overview == nil {
        PulseSkeletonList()
      } else if let overview = model.overview {
        if overview.pulse.isEmpty { emptyPulse } else {
          ForEach(Array(overview.pulse.enumerated()), id: \.element.id) { index, card in
            PulseCardView(
              card: card,
              highlightPriority: index < 2,
              onMarkDone: {
                Task { await model.setPulseCardState(cardID: card.id, state: "DONE") }
              },
              onDismiss: {
                Task { await model.setPulseCardState(cardID: card.id, state: "DISMISSED") }
              }
            )
          }
        }
      } else {
        emptyPulse
      }
    }
  }

  private var emptyPulse: some View {
    let workspaceID = model.settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines)
    let cta = emptyPulseCTA()

    return VStack(alignment: .leading, spacing: 6) {
      Text("No pulse yet")
        .font(.system(size: 14, weight: .bold, design: .rounded))

      Text(emptyPulseMessage(signedIn: model.auth.isSignedIn, workspaceID: workspaceID))
        .font(.system(size: 12, weight: .medium, design: .rounded))
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)

      if !workspaceID.isEmpty, let cta {
        Button {
          NSWorkspace.shared.open(cta.url)
        } label: {
          Text(cta.label)
            .font(.system(size: 12, weight: .bold, design: .rounded))
        }
        .buttonStyle(.plain)
        .padding(.top, 6)
        .accessibilityLabel(cta.label)
      }
    }
    .padding(14)
    .starbeamCard()
  }

  private func emptyPulseMessage(signedIn: Bool, workspaceID: String) -> String {
    if !signedIn {
      return "Sign in to see your pulse cards each morning."
    }
    if workspaceID.isEmpty {
      return "Add your Workspace ID in Settings to enable sync."
    }

    if let hints = model.overview?.activationHints {
      let reason = (hints.reason ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      let state = normalizedActivationHintState(hints.state)
      switch state {
      case "running":
        return reason.isEmpty
          ? "Generating your first pulse now. We’ll keep checking in the background."
          : reason
      case "queued":
        return reason.isEmpty
          ? "Your first pulse is queued. It should be ready shortly."
          : reason
      case "failed_retriable":
        return reason.isEmpty
          ? "First pulse hit a temporary issue. Open web to retry."
          : reason
      case "failed_blocking":
        return reason.isEmpty
          ? "Setup is blocked. Open web integrations to fix and retry."
          : reason
      case "not_started":
        return reason.isEmpty
          ? "Complete setup in web to generate your first pulse."
          : reason
      default:
        break
      }
    }

    return "Starbeam runs overnight and will drop your pulse cards here when they’re ready."
  }

  private func normalizedActivationHintState(_ value: String) -> String {
    value
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
      .replacingOccurrences(of: "-", with: "_")
  }

  private func normalizedActivationHintAction(_ value: String) -> String {
    value
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
      .replacingOccurrences(of: "-", with: "_")
  }

  private func emptyPulseCTA() -> (label: String, url: URL)? {
    guard let slug = model.overview?.workspace.slug?.trimmingCharacters(in: .whitespacesAndNewlines),
      !slug.isEmpty
    else {
      guard let fallback = model.dashboardURL(kind: .pulse) else { return nil }
      return ("Finish setup in web", fallback)
    }

    guard let hints = model.overview?.activationHints else {
      guard let fallback = model.dashboardURL(kind: .pulse) else { return nil }
      return ("Finish setup in web", fallback)
    }

    let action = normalizedActivationHintAction(hints.nextAction)
    let path: String
    let label: String

    switch action {
    case "connect_google":
      path = "/w/\(slug)/integrations"
      label = "Connect Google in web"
    case "open_integrations":
      path = "/w/\(slug)/integrations"
      label = "Open integrations in web"
    case "generate_now":
      path = "/w/\(slug)/pulse"
      label = "Generate first pulse in web"
    case "refresh":
      path = "/w/\(slug)/pulse?queued=1"
      label = "Refresh in web"
    case "open_pulse":
      path = "/w/\(slug)/pulse"
      label = "Open pulse in web"
    default:
      path = "/w/\(slug)/onboarding"
      label = "Finish setup in web"
    }

    if let url = model.dashboardURL(path: path) {
      return (label, url)
    }
    guard let fallback = model.dashboardURL(kind: .pulse) else { return nil }
    return (label, fallback)
  }

  private var splitPanels: some View {
    HStack(alignment: .top, spacing: 12) {
      VStack(alignment: .leading, spacing: 8) {
        Text("Today’s Focus")
          .font(.system(size: 17, weight: .bold, design: .rounded))
          .accessibilityAddTraits(.isHeader)

        FocusListView(items: model.overview?.focus ?? [], signedIn: model.auth.isSignedIn)
      }

      Rectangle()
        .fill(.white.opacity(0.18))
        .frame(width: 1)
        .padding(.top, 32)

      VStack(alignment: .leading, spacing: 8) {
        Text("Today’s Calendar")
          .font(.system(size: 17, weight: .bold, design: .rounded))
          .accessibilityAddTraits(.isHeader)

        CalendarListView(items: model.overview?.calendar ?? [], signedIn: model.auth.isSignedIn)
      }
    }
  }

  private func openDashboard() {
    guard let url = model.dashboardURL(kind: .pulse) else { return }
    NSWorkspace.shared.open(url)
  }

  private func openViewMore() {
    guard let url = model.dashboardURL(kind: .pulse) else { return }
    NSWorkspace.shared.open(url)
  }

  private func openOnboardingCTA(_ item: Overview.Onboarding.ChecklistItem) {
    if let path = item.ctaUrl?.trimmingCharacters(in: .whitespacesAndNewlines), !path.isEmpty,
      let url = model.dashboardURL(path: path)
    {
      NSWorkspace.shared.open(url)
      return
    }

    openDashboard()
  }

  private func openSubmitIdea() {
    guard let url = URL(string: model.settings.submitIdeaURL.trimmingCharacters(in: .whitespacesAndNewlines)) else { return }
    NSWorkspace.shared.open(url)
  }

  private func workspaceSwipeGesture() -> some Gesture {
    DragGesture(minimumDistance: 24, coordinateSpace: .local)
      .onEnded { value in
        guard model.auth.isSignedIn else { return }
        guard (model.auth.session?.workspaces.count ?? 0) >= 2 else { return }

        let dx = value.translation.width
        let dy = value.translation.height

        // Only treat mostly-horizontal drags as a workspace swipe.
        guard abs(dx) > abs(dy) else { return }
        guard abs(dx) > 80 else { return }

        if dx < 0 {
          model.cycleWorkspace(direction: +1)
        } else {
          model.cycleWorkspace(direction: -1)
        }
      }
  }
}

#if DEBUG
@MainActor
private func makePopoverPreviewModel() -> AppModel {
  let model = AppModel()
  model.auth.session = .init(
    accessToken: "preview",
    refreshToken: "preview",
    expiresAt: Date().addingTimeInterval(60 * 60),
    user: .init(id: "u_123", email: "preview@starbeam.invalid", name: "Preview", image: nil),
    workspaces: [
      .init(id: "w_123", type: "ORG", name: "Company Name", slug: "company"),
    ]
  )
  model.overview = OverviewPreviewMocks.overview
  return model
}

#Preview {
  PopoverRootView()
    .environment(makePopoverPreviewModel())
    .frame(width: 460, height: 760)
}
#endif
