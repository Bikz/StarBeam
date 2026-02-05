import SwiftUI

struct ContentView: View {
  var body: some View {
    PopoverRootView()
  }
}

#Preview {
  let model = AppModel()
  model.auth.tokens = .init(accessToken: nil, refreshToken: "preview", expiresAt: nil)
  model.overview = OverviewPreviewMocks.overview

  return ContentView()
    .environment(model)
    .frame(width: 460, height: 760)
}
