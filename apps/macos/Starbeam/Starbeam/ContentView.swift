import SwiftUI

struct ContentView: View {
  var body: some View {
    PopoverRootView()
  }
}

#if DEBUG
#Preview {
  let model = AppModel()
  model.auth.session = .init(
    accessToken: "preview",
    refreshToken: "preview",
    expiresAt: Date().addingTimeInterval(60 * 60),
    user: .init(id: "u_123", email: "preview@starbeam.invalid", name: "Preview", image: nil),
    workspaces: [.init(id: "w_123", type: "ORG", name: "Company Name", slug: "company")]
  )
  model.overview = OverviewPreviewMocks.overview

  ContentView()
    .environment(model)
    .frame(width: 460, height: 760)
}
#endif
