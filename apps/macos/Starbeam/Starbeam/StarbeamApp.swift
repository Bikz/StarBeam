import SwiftUI
import AppKit

@main
struct StarbeamApp: App {
  @State private var model = AppModel()

  var body: some Scene {
    MenuBarExtra {
      ContentView()
        .environment(model)
        .frame(width: 460, height: 760)
    } label: {
      // Keep this as an SF Symbol for now. Custom menu bar icons should be
      // vector/PDF template assets (or SF Symbols) to avoid fuzziness.
      Image(systemName: "sparkles")
        .accessibilityLabel("Starbeam")
    }
    .menuBarExtraStyle(.window)
    .commands {
      CommandGroup(replacing: .appTermination) {
        Button("Quit Starbeam") {
          NSApp.terminate(nil)
        }
        .keyboardShortcut("q")
      }
    }
  }
}
