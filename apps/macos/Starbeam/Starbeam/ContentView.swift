import SwiftUI

struct ContentView: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    @Bindable var model = model
    PopoverRootView()
      // Apply here (not in StarbeamApp) so changes to SettingsStore trigger SwiftUI updates.
      .environment(\.starbeamVisualStyle, model.settings.visualStyleEnum)
      .preferredColorScheme(model.settings.preferredColorScheme)
  }
}

#if DEBUG
@MainActor
private func makeContentPreviewModel() -> AppModel {
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
  ContentView()
    .environment(makeContentPreviewModel())
    .frame(width: 460, height: 760)
}
#endif
