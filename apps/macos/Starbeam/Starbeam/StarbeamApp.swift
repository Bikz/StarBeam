import SwiftUI
import AppKit

@main
struct StarbeamApp: App {
  @State private var model = AppModel()

  private static let menuBarTemplateImage: NSImage? = {
    // Prefer a template image so macOS can color it correctly in the menu bar.
    if let url = Bundle.main.url(forResource: "starbeam-menu-template-64", withExtension: "png"),
       let img = NSImage(contentsOf: url) {
      img.isTemplate = true
      return img
    }
    return nil
  }()

  var body: some Scene {
    MenuBarExtra {
      ContentView()
        .environment(model)
        .frame(width: 460, height: 760)
    } label: {
      if let img = Self.menuBarTemplateImage {
        Image(nsImage: img)
          .renderingMode(.template)
          .resizable()
          .frame(width: 18, height: 18)
          .accessibilityLabel("Starbeam")
      } else {
        // Fallback to a symbol if the resource is missing.
        Image(systemName: "sparkles")
          .accessibilityLabel("Starbeam")
      }
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
