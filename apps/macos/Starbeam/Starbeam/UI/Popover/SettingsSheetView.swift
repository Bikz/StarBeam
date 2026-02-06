import SwiftUI

struct SettingsSheetView: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(AppModel.self) private var model

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Text("Settings")
          .font(.system(size: 14, weight: .bold, design: .rounded))
        Spacer()
        Button("Done") { dismiss() }
          .keyboardShortcut(.defaultAction)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)

      Divider()

      SettingsView()
        .environment(model)
        .padding(.top, 4)
    }
    .background(.ultraThinMaterial)
  }
}

