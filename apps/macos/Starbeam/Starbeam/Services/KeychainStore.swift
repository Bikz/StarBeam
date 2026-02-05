import Foundation
import Security

enum KeychainStore {
  enum KeychainError: Error, LocalizedError {
    case unexpectedStatus(OSStatus)

    var errorDescription: String? {
      switch self {
      case .unexpectedStatus(let status):
        return "Keychain error (status: \(status))"
      }
    }
  }

  static func read(service: String, account: String) throws -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)

    if status == errSecItemNotFound {
      return nil
    }

    guard status == errSecSuccess else {
      throw KeychainError.unexpectedStatus(status)
    }

    return item as? Data
  }

  static func write(_ data: Data, service: String, account: String) throws {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]

    let attributes: [String: Any] = [
      kSecValueData as String: data,
    ]

    let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)

    if status == errSecItemNotFound {
      let add: [String: Any] = query.merging(attributes) { _, new in new }
      let addStatus = SecItemAdd(add as CFDictionary, nil)
      guard addStatus == errSecSuccess else {
        throw KeychainError.unexpectedStatus(addStatus)
      }
      return
    }

    guard status == errSecSuccess else {
      throw KeychainError.unexpectedStatus(status)
    }
  }

  static func delete(service: String, account: String) throws {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]

    let status = SecItemDelete(query as CFDictionary)

    if status == errSecItemNotFound {
      return
    }

    guard status == errSecSuccess else {
      throw KeychainError.unexpectedStatus(status)
    }
  }
}
