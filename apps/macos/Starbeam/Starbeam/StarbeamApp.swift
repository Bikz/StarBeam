import SwiftUI

@main
struct StarbeamApp: App {
  @State private var model = AppModel()

  var body: some Scene {
    // Desktop window so the app is easy to discover/test without relying on the menu bar.
    WindowGroup("Starbeam") {
      ContentView()
        .environment(model)
        .frame(minWidth: 520, minHeight: 760)
    }
    .defaultSize(width: 520, height: 760)

    MenuBarExtra {
      ContentView()
        .environment(model)
        .frame(width: 460, height: 760)
    } label: {
      Image(systemName: "sparkles")
        .accessibilityLabel("Starbeam")
    }
    .menuBarExtraStyle(.window)

    Settings {
      SettingsView()
        .environment(model)
        .frame(width: 560, height: 440)
    }

    // A dedicated settings window that can be opened from inside the menu bar UI.
    // This avoids relying on the app menu being focused/active.
    Window("Settings", id: "settings") {
      SettingsView()
        .environment(model)
        .frame(width: 560, height: 440)
    }
    .defaultSize(width: 560, height: 440)
    .windowResizability(.contentSize)
  }
}
