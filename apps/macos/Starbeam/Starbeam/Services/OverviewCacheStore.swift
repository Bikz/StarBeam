import Foundation

final class OverviewCacheStore {
  struct Meta: Codable, Equatable {
    var cachedAt: Date
    var workspaceID: String
  }

  struct CachedOverview: Equatable {
    var meta: Meta
    var overview: Overview
    var rawJSON: Data
  }

  private let fileManager: FileManager
  private let baseDirectory: URL

  init(fileManager: FileManager = .default) {
    self.fileManager = fileManager

    if let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
      baseDirectory = appSupport.appendingPathComponent("Starbeam", isDirectory: true)
    } else {
      baseDirectory = fileManager.homeDirectoryForCurrentUser
        .appendingPathComponent("Library", isDirectory: true)
        .appendingPathComponent("Application Support", isDirectory: true)
        .appendingPathComponent("Starbeam", isDirectory: true)
    }
  }

  func load() -> CachedOverview? {
    do {
      let metaURL = baseDirectory.appendingPathComponent("overview.meta.json")
      let jsonURL = baseDirectory.appendingPathComponent("overview.json")

      guard fileManager.fileExists(atPath: metaURL.path), fileManager.fileExists(atPath: jsonURL.path) else {
        return nil
      }

      let metaData = try Data(contentsOf: metaURL)
      let rawJSON = try Data(contentsOf: jsonURL)

      let decoder = JSONDecoder()
      decoder.dateDecodingStrategy = .iso8601
      let meta = try decoder.decode(Meta.self, from: metaData)

      let apiDecoder = JSONDecoder()
      apiDecoder.keyDecodingStrategy = .convertFromSnakeCase
      apiDecoder.dateDecodingStrategy = .iso8601
      let overview = try apiDecoder.decode(Overview.self, from: rawJSON)

      return CachedOverview(meta: meta, overview: overview, rawJSON: rawJSON)
    } catch {
      purgeCorruptedCacheFiles()
      return nil
    }
  }

  func save(rawJSON: Data, workspaceID: String, now: Date = Date()) throws {
    try ensureDirectory()

    let meta = Meta(cachedAt: now, workspaceID: workspaceID)

    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let metaData = try encoder.encode(meta)

    let metaURL = baseDirectory.appendingPathComponent("overview.meta.json")
    let jsonURL = baseDirectory.appendingPathComponent("overview.json")

    try metaData.write(to: metaURL, options: [.atomic])
    try rawJSON.write(to: jsonURL, options: [.atomic])
  }

  func clear() throws {
    let metaURL = baseDirectory.appendingPathComponent("overview.meta.json")
    let jsonURL = baseDirectory.appendingPathComponent("overview.json")

    if fileManager.fileExists(atPath: metaURL.path) {
      try fileManager.removeItem(at: metaURL)
    }

    if fileManager.fileExists(atPath: jsonURL.path) {
      try fileManager.removeItem(at: jsonURL)
    }
  }

  private func ensureDirectory() throws {
    if !fileManager.fileExists(atPath: baseDirectory.path) {
      try fileManager.createDirectory(at: baseDirectory, withIntermediateDirectories: true)
    }
  }

  private func purgeCorruptedCacheFiles() {
    let metaURL = baseDirectory.appendingPathComponent("overview.meta.json")
    let jsonURL = baseDirectory.appendingPathComponent("overview.json")

    if fileManager.fileExists(atPath: metaURL.path) {
      try? fileManager.removeItem(at: metaURL)
    }
    if fileManager.fileExists(atPath: jsonURL.path) {
      try? fileManager.removeItem(at: jsonURL)
    }
  }
}
