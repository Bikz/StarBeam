import SwiftUI

@main
struct StarbeamApp: App {
  @State private var model = AppModel()

  var body: some Scene {
    MenuBarExtra {
      ContentView()
        .environment(model)
        .environment(\.starbeamVisualStyle, model.settings.visualStyleEnum)
        .preferredColorScheme(model.settings.preferredColorScheme)
        .frame(width: 460, height: 760)
    } label: {
      Image(systemName: "sparkles")
        .accessibilityLabel("Starbeam")
    }
    .menuBarExtraStyle(.window)
  }
}
