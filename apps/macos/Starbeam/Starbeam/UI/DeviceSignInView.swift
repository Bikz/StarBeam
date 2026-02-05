import SwiftUI

struct DeviceSignInView: View {
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Sign in")
        .font(.system(size: 18, weight: .bold, design: .rounded))

      Text("Device sign-in flow is wired up next: the app will open your browser to a verification URL, then store tokens in Keychain.")
        .foregroundStyle(.secondary)
        .font(.system(size: 13, weight: .medium, design: .rounded))
        .fixedSize(horizontal: false, vertical: true)

      Spacer()

      HStack {
        Spacer()
        Button("Close") { dismiss() }
          .keyboardShortcut(.cancelAction)
      }
    }
    .padding(18)
  }
}

#Preview {
  DeviceSignInView()
    .frame(width: 420, height: 420)
}
