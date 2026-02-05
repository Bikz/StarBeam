import Foundation
import Observation

@MainActor
@Observable
final class AuthStore {
  struct User: Codable, Equatable {
    var id: String
    var email: String
    var name: String?
    var image: String?
  }

  struct Workspace: Codable, Equatable, Identifiable {
    var id: String
    var type: String
    var name: String
    var slug: String
  }

  struct Session: Codable, Equatable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var user: User
    var workspaces: [Workspace]
  }

  private static let keychainService = "com.starbeam.macos"
  private static let keychainAccount = "session"

  var session: Session?

  var isSignedIn: Bool { session != nil }

  init() {
    session = Self.loadFromKeychain()
  }

  func saveSession(_ session: Session) throws {
    self.session = session

    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let data = try encoder.encode(session)
    try KeychainStore.write(data, service: Self.keychainService, account: Self.keychainAccount)
  }

  func signOut() {
    session = nil
    try? KeychainStore.delete(service: Self.keychainService, account: Self.keychainAccount)
  }

  private static func loadFromKeychain() -> Session? {
    do {
      guard let data = try KeychainStore.read(service: keychainService, account: keychainAccount) else { return nil }
      let decoder = JSONDecoder()
      decoder.dateDecodingStrategy = .iso8601
      return try decoder.decode(Session.self, from: data)
    } catch {
      return nil
    }
  }
}
