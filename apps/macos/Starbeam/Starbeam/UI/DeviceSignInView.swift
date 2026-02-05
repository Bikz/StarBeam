import AppKit
import SwiftUI

struct DeviceSignInView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss

  @State private var didStart = false
  @State private var isWorking = false
  @State private var deviceCode: String?
  @State private var verificationURL: URL?
  @State private var lastError: AppError?
  @State private var showDetails = false

  @State private var pollTask: Task<Void, Never>?

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("Sign in")
          .font(.system(size: 18, weight: .bold, design: .rounded))

        Spacer()

        if isWorking {
          ProgressView()
            .controlSize(.small)
            .accessibilityLabel("Signing in")
        }
      }

      Text("We’ll open a verification page in your browser. After you finish sign-in, Starbeam will sync your overview.")
        .foregroundStyle(.secondary)
        .font(.system(size: 13, weight: .medium, design: .rounded))
        .fixedSize(horizontal: false, vertical: true)

      if let lastError {
        VStack(alignment: .leading, spacing: 10) {
          HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
              .foregroundStyle(.orange)
              .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
              Text(lastError.title)
                .font(.system(size: 13, weight: .bold, design: .rounded))

              Text(lastError.message)
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
          }

          if let debug = lastError.debugDetails, !debug.isEmpty {
            DisclosureGroup("Details", isExpanded: $showDetails) {
              Text(debug)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 6)
            }
            .font(.system(size: 12, weight: .semibold, design: .rounded))
          }

          HStack {
            Button("Retry") {
              Task { await start() }
            }
            .buttonStyle(.borderedProminent)

            Spacer()

            Button("Close") { cancelAndDismiss() }
              .keyboardShortcut(.cancelAction)
          }
        }
        .padding(12)
        .background(
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(.thinMaterial)
        )
        .overlay(
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .strokeBorder(.white.opacity(0.20), lineWidth: 1)
        )
      } else {
        if let verificationURL, let deviceCode {
          VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
              Text("Verification")
                .font(.system(size: 13, weight: .bold, design: .rounded))

              Spacer()

              Button("Open") { NSWorkspace.shared.open(verificationURL) }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityLabel("Open verification page")

              Button("Copy link") { copyToPasteboard(verificationURL.absoluteString) }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityLabel("Copy verification link")
            }

            Text(verificationURL.absoluteString)
              .font(.system(.caption, design: .monospaced))
              .foregroundStyle(.secondary)
              .textSelection(.enabled)
              .lineLimit(2)

            Divider().opacity(0.5)

            HStack(spacing: 8) {
              Text("Device code")
                .font(.system(size: 13, weight: .bold, design: .rounded))

              Spacer()

              Button("Copy") { copyToPasteboard(deviceCode) }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityLabel("Copy device code")
            }

            Text(deviceCode)
              .font(.system(size: 20, weight: .bold, design: .monospaced))
              .tracking(1)
              .textSelection(.enabled)

            Text("Waiting for you to complete sign-in in your browser…")
              .font(.system(size: 12, weight: .medium, design: .rounded))
              .foregroundStyle(.secondary)
              .fixedSize(horizontal: false, vertical: true)
          }
          .padding(12)
          .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
              .fill(.thinMaterial)
          )
          .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
              .strokeBorder(.white.opacity(0.20), lineWidth: 1)
          )
        }

        Spacer()

        HStack {
          Button("Cancel") { cancelAndDismiss() }
            .keyboardShortcut(.cancelAction)

          Spacer()

          if verificationURL == nil {
            Button("Start sign-in") {
              Task { await start() }
            }
            .buttonStyle(.borderedProminent)
            .keyboardShortcut(.defaultAction)
          }
        }
      }
    }
    .padding(18)
    .onAppear {
      if !didStart {
        didStart = true
        Task { await start() }
      }
    }
    .onDisappear {
      pollTask?.cancel()
      pollTask = nil
    }
  }

  private func start() async {
    pollTask?.cancel()
    pollTask = nil

    lastError = nil
    showDetails = false

    let baseURLString = model.settings.serverBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let baseURL = URL(string: baseURLString) else {
      lastError = AppError(title: "Invalid server URL", message: "Check Settings → Server base URL.", debugDetails: baseURLString)
      return
    }

    isWorking = true
    defer { isWorking = false }

    do {
      let client = APIClient(baseURL: baseURL)
      let start = try await client.deviceStart()

      deviceCode = start.deviceCode
      verificationURL = URL(string: start.verificationUrl)

      if let url = verificationURL {
        NSWorkspace.shared.open(url)
      }

      if let code = deviceCode {
        pollTask = Task { await pollExchange(baseURL: baseURL, deviceCode: code) }
      }
    } catch {
      lastError = AppError(
        title: "Couldn’t start sign-in",
        message: "Make sure the server is running and reachable.",
        debugDetails: String(describing: error)
      )
    }
  }

  private func pollExchange(baseURL: URL, deviceCode: String) async {
    var delaySeconds: Double = 2
    let client = APIClient(baseURL: baseURL)

    while !Task.isCancelled {
      do {
        let exchange = try await client.deviceExchange(deviceCode: deviceCode)

        let expiresAt = Date().addingTimeInterval(TimeInterval(exchange.expiresIn))
        let session = AuthStore.Session(
          accessToken: exchange.accessToken,
          refreshToken: exchange.refreshToken,
          expiresAt: expiresAt,
          user: exchange.user,
          workspaces: exchange.workspaces
        )

        try model.auth.saveSession(session)

        if model.settings.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          model.settings.workspaceID = session.workspaces.first?.id ?? ""
        }

        await model.refresh()
        dismiss()
        return
      } catch let apiError as APIClient.APIError {
        switch apiError {
        case .oauth(let code, _):
          if code == "authorization_pending" {
            // keep polling
          } else if code == "slow_down" {
            delaySeconds = min(delaySeconds + 1, 10)
          } else if code == "expired_token" {
            await MainActor.run {
              lastError = AppError(title: "Sign-in expired", message: "Please retry.", debugDetails: String(describing: apiError))
            }
            return
          } else if code == "access_denied" {
            await MainActor.run {
              lastError = AppError(title: "Sign-in denied", message: "Please retry.", debugDetails: String(describing: apiError))
            }
            return
          } else {
            // Treat unknown oauth errors as fatal.
            await MainActor.run {
              lastError = AppError(title: "Sign-in failed", message: "Please retry.", debugDetails: String(describing: apiError))
            }
            return
          }
        default:
          await MainActor.run {
            lastError = AppError(title: "Sign-in failed", message: "Please retry.", debugDetails: String(describing: apiError))
          }
          return
        }
      } catch {
        await MainActor.run {
          lastError = AppError(title: "Sign-in failed", message: "Please retry.", debugDetails: String(describing: error))
        }
        return
      }

      do {
        try await Task.sleep(nanoseconds: UInt64(delaySeconds * 1_000_000_000))
      } catch {
        return
      }
    }
  }

  private func copyToPasteboard(_ string: String) {
    let pb = NSPasteboard.general
    pb.clearContents()
    pb.setString(string, forType: .string)
  }

  private func cancelAndDismiss() {
    pollTask?.cancel()
    pollTask = nil
    dismiss()
  }
}

#Preview {
  let model = AppModel()
  return DeviceSignInView()
    .environment(model)
    .frame(width: 420, height: 420)
}
