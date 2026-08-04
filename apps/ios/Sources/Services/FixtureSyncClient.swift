import Foundation

protocol FixtureLoading {
    func load(from url: URL) async throws -> FixtureSuite
}

struct URLFixtureLoader: FixtureLoading {
    func load(from url: URL) async throws -> FixtureSuite {
        guard Self.isLoopback(url) else {
            throw FixtureSyncError.loopbackOnly
        }

        let (data, response) = try await URLSession.shared.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw FixtureSyncError.unsuccessfulResponse
        }
        guard data.count <= 2_000_000 else {
            throw FixtureSyncError.responseTooLarge
        }

        do {
            return try JSONDecoder().decode(FixtureSuite.self, from: data).validated()
        } catch let error as FixtureValidationError {
            throw error
        } catch {
            throw FixtureSyncError.invalidJSON
        }
    }

    static func isLoopback(_ url: URL) -> Bool {
        guard ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
              let host = url.host?.lowercased() else {
            return false
        }
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }
}

enum FixtureSyncError: LocalizedError, Equatable {
    case invalidAddress
    case loopbackOnly
    case unsuccessfulResponse
    case responseTooLarge
    case invalidJSON

    var errorDescription: String? {
        switch self {
        case .invalidAddress:
            return "Enter a complete localhost URL, including http:// and a port."
        case .loopbackOnly:
            return "This demo accepts fixture sync only from localhost or another loopback address."
        case .unsuccessfulResponse:
            return "The local fixture server did not return a successful response."
        case .responseTooLarge:
            return "The local fixture response is larger than the 2 MB demo limit."
        case .invalidJSON:
            return "The local response is not a valid candidate-momentum fixture suite."
        }
    }
}
