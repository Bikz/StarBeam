import SwiftUI

@main
struct StarbeamApp: App {
  @State private var model = AppModel()

  var body: some Scene {
    MenuBarExtra {
      ContentView()
        .environment(model)
        .frame(width: 460, height: 760)
    } label: {
      Image(systemName: "sparkles")
        .accessibilityLabel("Starbeam")
    }
    .menuBarExtraStyle(.window)
  }
}
