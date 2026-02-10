import SwiftUI
import AppKit

@main
struct StarbeamApp: App {
  @State private var model = AppModel()

  private static let menuBarTemplateImage: NSImage? = {
    // Prefer a template image so macOS can color it correctly in the menu bar.
    let candidates: [(name: String, ext: String, subdir: String?)] = [
      // Preferred: vector PDF for crisp rendering at all sizes.
      ("starbeam_menu_bar_template", "pdf", nil),
      ("starbeam_menu_bar_template", "pdf", "MenuBar"),
      // Fallback: raster PNG.
      ("starbeam-menu-template-64", "png", nil),
      ("starbeam-menu-template-64", "png", "Brand"),
    ]

    for c in candidates {
      let url = Bundle.main.url(forResource: c.name, withExtension: c.ext, subdirectory: c.subdir)
        ?? Bundle.main.url(forResource: c.name, withExtension: c.ext)
      if let url, let img = NSImage(contentsOf: url) {
        img.isTemplate = true
        // Avoid SwiftUI resizing oddities for status bar icons; give it a sane intrinsic size.
        img.size = NSSize(width: 18, height: 18)
        return img
      }
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
          .accessibilityLabel("Starbeam")
      } else {
        // Fallbacks if the resource is missing.
        if #available(macOS 13.0, *) {
          Image(systemName: "sparkles")
            .accessibilityLabel("Starbeam")
        } else {
          Text("★")
            .accessibilityLabel("Starbeam")
        }
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
