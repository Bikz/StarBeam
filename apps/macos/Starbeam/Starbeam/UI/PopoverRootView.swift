import SwiftUI

struct PopoverRootView: View {
  @Environment(AppModel.self) private var model
  @State private var showingSettings = false
  @State private var expandedPulseCardID: String?

  var body: some View {
    @Bindable var model = model

    ZStack {
      StarbeamBackgroundView()

      VStack(spacing: 0) {
        ScrollView {
          VStack(alignment: .leading, spacing: 14) {
            header
            bumpBanner
            if let error = model.lastError {
              ErrorCardView(error: error) {
                Task { await model.refresh() }
              }
            }

            Text("Your Pulse")
              .font(.system(size: 18, weight: .bold, design: .rounded))
              .padding(.top, 2)
              .accessibilityAddTraits(.isHeader)

            pulseSection

            HStack {
              Spacer()
              Button {
                openViewMore()
              } label: {
                HStack(spacing: 6) {
                  Text("View more…")
                  Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                }
              }
              .buttonStyle(.plain)
              .foregroundStyle(.secondary)
              .accessibilityLabel("View more on dashboard")
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

        Divider().opacity(0.6)

        footer
      }
      .background(
        RoundedRectangle(cornerRadius: StarbeamTheme.outerCorner, style: .continuous)
          .fill(.ultraThinMaterial)
      )
      .overlay(
        RoundedRectangle(cornerRadius: StarbeamTheme.outerCorner, style: .continuous)
          .strokeBorder(.white.opacity(0.20), lineWidth: 1)
      )
      .padding(10)
      .shadow(color: .black.opacity(0.18), radius: 26, x: 0, y: 18)
    }
    .sheet(isPresented: $model.showingSignInSheet) {
      DeviceSignInView()
        .frame(width: 420, height: 420)
    }
    .sheet(isPresented: $showingSettings) {
      SettingsSheetView()
        .environment(model)
        .frame(width: 560, height: 520)
    }
  }

  private var header: some View {
    HStack(alignment: .top, spacing: 12) {
      ZStack {
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
      }
      .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: 3) {
        Text("Starbeam")
          .font(StarbeamTheme.headerTitleFont)

        Text("Your Pulse for \(model.workspaceName)")
          .font(StarbeamTheme.headerSubtitleFont)
          .foregroundStyle(.secondary)
      }

      Spacer()

      Button {
        Task { await model.refresh() }
      } label: {
        HStack(spacing: 8) {
          Group {
            if model.isRefreshing {
              ProgressView()
                .controlSize(.small)
            } else {
              Image(systemName: "arrow.clockwise")
            }
          }
          .font(.system(size: 13, weight: .semibold))
          Text("Refresh")
            .font(.system(size: 13, weight: .semibold, design: .rounded))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(
          Capsule(style: .continuous)
            .fill(.thinMaterial)
        )
        .overlay(
          Capsule(style: .continuous)
            .strokeBorder(.white.opacity(0.20), lineWidth: 1)
        )
      }
      .buttonStyle(.plain)
      .disabled(!model.canSync)
      .opacity(model.canSync ? 1 : 0.5)
      .accessibilityLabel("Refresh")
      .accessibilityHint(model.canSync ? "Sync now" : "Sign in and set a workspace in settings to enable sync")
    }
  }

  private var bumpBanner: some View {
    HStack(spacing: 12) {
      ZStack {
        Circle()
          .fill(Color.orange.opacity(0.22))
          .frame(width: 34, height: 34)

        Image(systemName: "bell.fill")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(Color.orange)
      }
      .accessibilityHidden(true)

      Text(bumpText)
        .font(.system(size: 14, weight: .semibold, design: .rounded))
        .foregroundStyle(.primary)
        .lineLimit(2)

      Spacer(minLength: 0)

      if !model.auth.isSignedIn {
        Button("Sign in") {
          model.showingSignInSheet = true
        }
        .buttonStyle(.borderedProminent)
        .tint(Color.blue.opacity(0.75))
        .controlSize(.small)
        .accessibilityLabel("Sign in")
      } else {
        Image(systemName: model.auth.session?.workspaces.count ?? 0 > 1 ? "chevron.left.slash.chevron.right" : "sparkle")
          .foregroundStyle(.secondary)
          .opacity(0.8)
          .accessibilityHidden(true)
      }
    }
    .padding(14)
    .starbeamCard()
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Pulse bump")
    // Quick workspace switching: swipe left/right on the bump banner.
    // This avoids forcing Settings interaction during demos.
    .gesture(
      DragGesture(minimumDistance: 24, coordinateSpace: .local)
        .onEnded { value in
          guard model.auth.isSignedIn else { return }
          guard (model.auth.session?.workspaces.count ?? 0) >= 2 else { return }

          // Only treat mostly-horizontal drags as a workspace swipe.
          let dx = value.translation.width
          let dy = value.translation.height
          guard abs(dx) > abs(dy) else { return }
          guard abs(dx) > 60 else { return }

          if dx < 0 {
            model.cycleWorkspace(direction: +1)
          } else {
            model.cycleWorkspace(direction: -1)
          }
        }
    )
  }

  private var bumpText: String {
    if let msg = model.overview?.bumpMessage, !msg.isEmpty {
      return msg
    }

    if model.auth.isSignedIn {
      // Avoid cheerleader copy; keep it concise and contextual.
      let name = model.workspaceName
      if let generatedAt = model.overview?.generatedAt, Calendar.current.isDateInToday(generatedAt) {
        return "Today’s pulse bump for \(name)."
      }
      return "Syncing today’s pulse bump for \(name)…"
    }

    return "Sign in to get your daily pulse bump, focus, and agenda."
  }

  private var pulseSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      if model.isRefreshing && model.overview == nil {
        PulseSkeletonList()
      } else if let overview = model.overview {
        if overview.pulse.isEmpty { emptyPulse } else {
          ForEach(overview.pulse) { card in
            PulseCardView(
              card: card,
              isExpanded: expandedPulseCardID == card.id,
              onToggleExpanded: {
                if expandedPulseCardID == card.id {
                  expandedPulseCardID = nil
                } else {
                  expandedPulseCardID = card.id
                }
              },
              onRegenerate: { Task { await model.refresh() } }
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

    return VStack(alignment: .leading, spacing: 6) {
      Text("No pulse yet")
        .font(.system(size: 14, weight: .bold, design: .rounded))

      Text(emptyPulseMessage(signedIn: model.auth.isSignedIn, workspaceID: workspaceID))
        .font(.system(size: 12, weight: .medium, design: .rounded))
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
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
    return "We’ll show your daily pulse cards here once your workspace starts generating pulses."
  }

  private var splitPanels: some View {
    HStack(alignment: .top, spacing: 14) {
      VStack(alignment: .leading, spacing: 10) {
        Text("Today’s Focus")
          .font(.system(size: 18, weight: .bold, design: .rounded))
          .accessibilityAddTraits(.isHeader)

        FocusListView(items: model.overview?.focus ?? [], signedIn: model.auth.isSignedIn)
      }

      Rectangle()
        .fill(.white.opacity(0.18))
        .frame(width: 1)
        .padding(.top, 32)

      VStack(alignment: .leading, spacing: 10) {
        Text("Today’s Calendar")
          .font(.system(size: 18, weight: .bold, design: .rounded))
          .accessibilityAddTraits(.isHeader)

        CalendarListView(items: model.overview?.calendar ?? [], signedIn: model.auth.isSignedIn)
      }
    }
  }

  private var footer: some View {
    HStack(spacing: 18) {
      Button {
        showingSettings = true
      } label: {
        Label("Settings", systemImage: "gearshape")
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Settings")

      Spacer()

      Button {
        openSubmitIdea()
      } label: {
        Label("Submit idea…", systemImage: "bubble.left")
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Submit idea")

      Button {
        openDashboard()
      } label: {
        Label("Open dashboard", systemImage: "plus.circle")
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Open dashboard")

      Button {
        NSApp.terminate(nil)
      } label: {
        Label("Quit", systemImage: "power")
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Quit Starbeam")
    }
    .font(.system(size: 12, weight: .semibold, design: .rounded))
    .foregroundStyle(.secondary)
    .padding(.horizontal, 18)
    .padding(.vertical, 12)
  }

  private func openDashboard() {
    guard let url = model.dashboardURL(kind: .dashboardHome) else { return }
    NSWorkspace.shared.open(url)
  }

  private func openViewMore() {
    guard let url = model.dashboardURL(kind: .pulse) else { return }
    NSWorkspace.shared.open(url)
  }

  private func openSubmitIdea() {
    guard let url = URL(string: model.settings.submitIdeaURL.trimmingCharacters(in: .whitespacesAndNewlines)) else { return }
    NSWorkspace.shared.open(url)
  }
}

private struct SettingsSheetView: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(AppModel.self) private var model

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Text("Settings")
          .font(.system(size: 14, weight: .bold, design: .rounded))
        Spacer()
        Button("Done") { dismiss() }
          .keyboardShortcut(.defaultAction)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)

      Divider()

      SettingsView()
        .environment(model)
        .padding(.top, 4)
    }
    .background(.ultraThinMaterial)
  }
}

private struct ErrorCardView: View {
  let error: AppError
  let onRetry: () -> Void

  @State private var showDetails = false

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 10) {
        Image(systemName: "exclamationmark.triangle.fill")
          .foregroundStyle(.orange)
          .accessibilityHidden(true)

        VStack(alignment: .leading, spacing: 4) {
          Text(error.title)
            .font(.system(size: 13, weight: .bold, design: .rounded))

          Text(error.message)
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }

        Spacer(minLength: 0)

        Button("Retry") { onRetry() }
          .buttonStyle(.bordered)
          .controlSize(.small)
          .accessibilityLabel("Retry")
      }

      if let debug = error.debugDetails, !debug.isEmpty {
        DisclosureGroup("Details", isExpanded: $showDetails) {
          Text(debug)
            .font(.system(.caption, design: .monospaced))
            .foregroundStyle(.secondary)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 6)
        }
        .font(.system(size: 12, weight: .semibold, design: .rounded))
      }
    }
    .padding(14)
    .starbeamCard()
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Error")
  }
}

private struct PulseSkeletonList: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      ForEach(0..<3, id: \.self) { _ in
        PulseSkeletonCard()
      }
    }
  }
}

private struct PulseSkeletonCard: View {
  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      RoundedRectangle(cornerRadius: 7, style: .continuous)
        .fill(Color.secondary.opacity(0.22))
        .frame(width: 26, height: 26)
        .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: 9) {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(Color.secondary.opacity(0.22))
          .frame(height: 14)
          .frame(maxWidth: 240, alignment: .leading)

        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(Color.secondary.opacity(0.16))
          .frame(height: 12)
          .frame(maxWidth: 290, alignment: .leading)

        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(Color.secondary.opacity(0.12))
          .frame(height: 12)
          .frame(maxWidth: 210, alignment: .leading)
      }
      .accessibilityHidden(true)

      Spacer(minLength: 0)

      RoundedRectangle(cornerRadius: 7, style: .continuous)
        .fill(Color.secondary.opacity(0.16))
        .frame(width: 24, height: 24)
        .accessibilityHidden(true)
    }
    .padding(14)
    .starbeamCard()
    .accessibilityHidden(true)
  }
}

private struct PulseCardView: View {
  let card: Overview.PulseCard
  let isExpanded: Bool
  let onToggleExpanded: () -> Void
  let onRegenerate: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Button {
        onToggleExpanded()
      } label: {
        HStack(alignment: .top, spacing: 12) {
          CardIcon(card.icon)

          VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
              Text(card.title)
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundStyle(.primary)
                .lineLimit(1)

              if let kind = card.kind, !kind.isEmpty {
                Text(kindLabel(kind))
                  .font(.system(size: 10, weight: .bold, design: .rounded))
                  .foregroundStyle(.secondary)
                  .padding(.horizontal, 8)
                  .padding(.vertical, 4)
                  .background(
                    Capsule(style: .continuous)
                      .fill(.thinMaterial)
                  )
                  .overlay(
                    Capsule(style: .continuous)
                      .strokeBorder(.white.opacity(0.20), lineWidth: 1)
                  )
                  .accessibilityHidden(true)
              }
            }

            if !card.body.isEmpty {
              Text(card.body)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            }
          }

          Spacer(minLength: 0)

          Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.secondary)
            .padding(.top, 2)
            .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(card.title)
      .accessibilityHint(isExpanded ? "Collapse card details" : "Expand for more details")

      if isExpanded {
        PulseCardDetailView(card: card, onRegenerate: onRegenerate)
          .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .padding(14)
    .starbeamCard()
    .animation(.easeInOut(duration: 0.15), value: isExpanded)
  }

  private func kindLabel(_ kind: String) -> String {
    switch kind {
    case "ANNOUNCEMENT":
      return "Announcement"
    case "GOAL":
      return "Goal"
    case "WEB_RESEARCH":
      return "Web"
    default:
      return "Note"
    }
  }
}

private struct PulseCardDetailView: View {
  let card: Overview.PulseCard
  let onRegenerate: () -> Void

  @State private var didCopyAction = false

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if !card.body.isEmpty {
        Text(card.body)
          .font(.system(size: 13, weight: .medium, design: .rounded))
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
          .textSelection(.enabled)
      }

      if let why = card.why?.trimmingCharacters(in: .whitespacesAndNewlines), !why.isEmpty {
        detailRow(label: "Why", value: why)
      }

      if let action = card.action?.trimmingCharacters(in: .whitespacesAndNewlines), !action.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("Action")
              .font(.system(size: 12, weight: .bold, design: .rounded))
              .foregroundStyle(.primary)
              .accessibilityAddTraits(.isHeader)

            Spacer(minLength: 0)

            Button(didCopyAction ? "Copied" : "Copy") {
              copyToPasteboard(action)
              didCopyAction = true
              DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                didCopyAction = false
              }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .accessibilityLabel("Copy suggested action")
          }

          Text(action)
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
        }
      }

      if let sources = card.sources, !sources.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          Text("Sources")
            .font(.system(size: 12, weight: .bold, design: .rounded))
            .foregroundStyle(.primary)
            .accessibilityAddTraits(.isHeader)

          VStack(alignment: .leading, spacing: 4) {
            ForEach(sources) { s in
              if let url = URL(string: s.url) {
                Link(destination: url) {
                  Text(sourceLabel(s))
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                }
              } else {
                Text(sourceLabel(s))
                  .font(.system(size: 12, weight: .semibold, design: .rounded))
                  .foregroundStyle(.secondary)
                  .lineLimit(1)
              }
            }
          }
        }
      }

      HStack(spacing: 10) {
        Button {
          onRegenerate()
        } label: {
          Label("Refresh pulse", systemImage: "arrow.clockwise")
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .accessibilityLabel("Refresh pulse")

        Spacer(minLength: 0)
      }
      .padding(.top, 2)
    }
    .padding(.top, 6)
  }

  private func detailRow(label: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label)
        .font(.system(size: 12, weight: .bold, design: .rounded))
        .foregroundStyle(.primary)
        .accessibilityAddTraits(.isHeader)

      Text(value)
        .font(.system(size: 13, weight: .medium, design: .rounded))
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
        .textSelection(.enabled)
    }
  }

  private func sourceLabel(_ source: Overview.Citation) -> String {
    if let title = source.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty {
      return title
    }
    return source.url
  }

  private func copyToPasteboard(_ string: String) {
    let pb = NSPasteboard.general
    pb.clearContents()
    pb.setString(string, forType: .string)
  }
}

private struct CardIcon: View {
  let icon: String?

  init(_ icon: String?) {
    self.icon = icon
  }

  var body: some View {
    Group {
      if let icon, icon.hasPrefix("sf:"), let symbol = icon.split(separator: ":").dropFirst().first {
        Image(systemName: String(symbol))
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(.primary)
          .frame(width: 26)
      } else if let icon, !icon.isEmpty {
        Text(icon)
          .font(.system(size: 18))
          .frame(width: 26)
      } else {
        Text("✦")
          .font(.system(size: 18, weight: .semibold, design: .rounded))
          .frame(width: 26)
      }
    }
    .accessibilityHidden(true)
  }
}

private struct FocusListView: View {
  let items: [Overview.FocusItem]
  let signedIn: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if items.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          Text("Nothing yet")
            .font(.system(size: 13, weight: .bold, design: .rounded))
          Text(signedIn ? "We’ll populate focus items from connected tools." : "Sign in and connect Google to see focus items.")
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
        }
        .padding(12)
        .starbeamCard()
      } else {
        ForEach(items) { item in
          HStack(alignment: .top, spacing: 10) {
            CardIcon(item.icon)

            VStack(alignment: .leading, spacing: 4) {
              Text(item.title)
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .lineLimit(2)

              if let subtitle = item.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                  .font(.system(size: 12, weight: .medium, design: .rounded))
                  .foregroundStyle(.secondary)
                  .lineLimit(1)
              }
            }

            Spacer(minLength: 0)
          }
          .padding(12)
          .starbeamCard()
        }
      }

      Button {
        // TODO: wire to reminders or quick-add.
      } label: {
        HStack(spacing: 10) {
          Image(systemName: "checkmark.circle")
            .foregroundStyle(.secondary)
          Text("Add a reminder…")
            .foregroundStyle(.secondary)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
          Spacer(minLength: 0)
        }
        .padding(12)
        .starbeamCard()
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Add a reminder")
    }
  }
}

private struct CalendarListView: View {
  let items: [Overview.CalendarItem]
  let signedIn: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if items.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          Text("No events")
            .font(.system(size: 13, weight: .bold, design: .rounded))
          Text(signedIn ? "Your agenda will appear here." : "Sign in and connect Google Calendar to see today’s agenda.")
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
        }
        .padding(12)
        .starbeamCard()
      } else {
        VStack(alignment: .leading, spacing: 8) {
          ForEach(items) { item in
            Text(CalendarRowView.text(for: item))
              .font(.system(size: 13, weight: .medium, design: .rounded))
              .foregroundStyle(.secondary)
              .frame(maxWidth: .infinity, alignment: .leading)
              .lineLimit(1)
          }
        }
        .padding(12)
        .starbeamCard()
      }

      Button {
        // TODO: wire to reminders or quick-add.
      } label: {
        HStack(spacing: 10) {
          Image(systemName: "plus")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(.secondary)
          Text("Add a reminder…")
            .foregroundStyle(.secondary)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
          Spacer(minLength: 0)
        }
        .padding(12)
        .starbeamCard()
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Add a reminder")
    }
  }
}

private enum CalendarRowView {
  static func text(for item: Overview.CalendarItem) -> String {
    let df = DateFormatter()
    df.locale = .current
    df.timeStyle = .short
    df.dateStyle = .none
    let start = df.string(from: item.start)
    return "\(start) - \(item.title)"
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
