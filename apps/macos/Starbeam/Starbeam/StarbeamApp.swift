import SwiftUI

@main
struct StarbeamApp: App {
  var body: some Scene {
    MenuBarExtra {
      ContentView()
        .frame(width: 420, height: 720)
    } label: {
      Image(systemName: "sparkles")
    }
    .menuBarExtraStyle(.window)

    Settings {
      SettingsView()
        .frame(width: 520)
    }
  }
}
