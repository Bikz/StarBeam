import Foundation
import Observation

@MainActor
@Observable
final class AuthStore {
  struct Tokens: Codable, Equatable {
    var accessToken: String?
    var refreshToken: String
    var expiresAt: Date?
  }

  // For now this is in-memory; Keychain persistence is implemented next.
  var tokens: Tokens?

  var isSignedIn: Bool { tokens != nil }

  func signOut() {
    tokens = nil
  }
}
