import Foundation

struct APIClient {
  struct DeviceStartResponse: Codable, Equatable {
    var deviceCode: String
    var verificationUrl: String
  }

  struct DeviceExchangeResponse: Codable, Equatable {
    var accessToken: String
    var refreshToken: String
    var expiresIn: Int
    var user: AuthStore.User
    var workspaces: [AuthStore.Workspace]
  }

  struct APIErrorPayload: Codable, Equatable {
    var error: String
    var errorDescription: String?
  }

  enum APIError: Error, LocalizedError, Equatable {
    case invalidBaseURL
    case invalidResponse
    case http(statusCode: Int, body: String)
    case oauth(code: String, description: String?)
    case decoding(String)

    var errorDescription: String? {
      switch self {
      case .invalidBaseURL:
        return "Invalid server base URL"
      case .invalidResponse:
        return "Invalid server response"
      case .http(let statusCode, _):
        return "Server error (HTTP \(statusCode))"
      case .oauth(let code, _):
        return "Sign-in pending (\(code))"
      case .decoding:
        return "Failed to decode server response"
      }
    }
  }

  let baseURL: URL
  var urlSession: URLSession = .shared

  func deviceStart() async throws -> DeviceStartResponse {
    let url = try urlForPath("/api/v1/device/start")
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode([String: String]())

    let (data, response) = try await urlSession.data(for: request)
    let http = try requireHTTP(response)
    guard (200...299).contains(http.statusCode) else {
      throw APIError.http(statusCode: http.statusCode, body: String(decoding: data, as: UTF8.self))
    }

    return try decode(DeviceStartResponse.self, from: data)
  }

  func deviceExchange(deviceCode: String) async throws -> DeviceExchangeResponse {
    let url = try urlForPath("/api/v1/device/exchange")
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(["deviceCode": deviceCode])

    let (data, response) = try await urlSession.data(for: request)
    let http = try requireHTTP(response)

    if (200...299).contains(http.statusCode) {
      return try decode(DeviceExchangeResponse.self, from: data)
    }

    if let payload = try? decode(APIErrorPayload.self, from: data) {
      throw APIError.oauth(code: payload.error, description: payload.errorDescription)
    }

    throw APIError.http(statusCode: http.statusCode, body: String(decoding: data, as: UTF8.self))
  }

  func fetchOverview(workspaceID: String, accessToken: String) async throws -> (overview: Overview, rawJSON: Data) {
    var components = URLComponents(url: try urlForPath("/api/v1/macos/overview"), resolvingAgainstBaseURL: false)
    components?.queryItems = [URLQueryItem(name: "workspace_id", value: workspaceID)]

    guard let url = components?.url else {
      throw APIError.invalidBaseURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

    let (data, response) = try await urlSession.data(for: request)
    let http = try requireHTTP(response)
    guard (200...299).contains(http.statusCode) else {
      throw APIError.http(statusCode: http.statusCode, body: String(decoding: data, as: UTF8.self))
    }

    let overview = try decode(Overview.self, from: data)
    return (overview: overview, rawJSON: data)
  }

  private func urlForPath(_ path: String) throws -> URL {
    guard var url = URL(string: baseURL.absoluteString) else {
      throw APIError.invalidBaseURL
    }

    let trimmed = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    for part in trimmed.split(separator: "/").map(String.init) {
      url.appendPathComponent(part)
    }
    return url
  }

  private func requireHTTP(_ response: URLResponse) throws -> HTTPURLResponse {
    guard let http = response as? HTTPURLResponse else {
      throw APIError.invalidResponse
    }
    return http
  }

  private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
    do {
      let decoder = JSONDecoder()
      decoder.keyDecodingStrategy = .convertFromSnakeCase
      decoder.dateDecodingStrategy = .iso8601
      return try decoder.decode(T.self, from: data)
    } catch {
      throw APIError.decoding(String(describing: error))
    }
  }
}
