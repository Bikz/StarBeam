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

        WorkspacePagerView(
          workspaces: model.auth.session?.workspaces ?? [],
          selectedWorkspaceID: model.settings.workspaceID,
          signedIn: model.auth.isSignedIn,
          onSelect: { id in
            model.selectWorkspace(id: id, shouldRefresh: true)
          }
        )

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
    // Workspace switching: swipe left/right anywhere in the popover.
    // Keep it strict to avoid interfering with normal vertical scrolling.
    .simultaneousGesture(workspaceSwipeGesture())
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

      if model.auth.isSignedIn, !workspaceID.isEmpty, model.dashboardURL(kind: .dashboardHome) != nil {
        Button {
          openDashboard()
        } label: {
          Text("Finish setup in web")
            .font(.system(size: 12, weight: .bold, design: .rounded))
        }
        .buttonStyle(.plain)
        .padding(.top, 6)
        .accessibilityLabel("Finish setup in web dashboard")
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
