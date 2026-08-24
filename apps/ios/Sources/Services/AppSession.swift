import CryptoKit
import Foundation
import Security

struct TalentSignalSession: Codable, Equatable {
    let baseURL: URL
    let accessToken: String
    let expiresAt: Date
    let account: Account
    let user: User

    struct Account: Codable, Equatable {
        let id: String
        let slug: String
        let name: String
    }

    struct User: Codable, Equatable {
        let id: String
        let email: String
        let displayName: String
        let kind: String
    }
}

struct AppleLoginChallenge: Decodable, Equatable {
    let contractVersion: String
    let id: String
    let nonce: String
    let expiresAt: Date

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case id = "challenge_id"
        case nonce
        case expiresAt = "expires_at"
    }
}

protocol TalentSignalSessionPersisting {
    func load() throws -> TalentSignalSession?
    func save(_ session: TalentSignalSession) throws
    func delete() throws
}

final class KeychainTalentSignalSessionStore: TalentSignalSessionPersisting {
    private let service = "com.talentsignal.app.session"
    private let account = "current"

    func load() throws -> TalentSignalSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw AppSessionError.keychain(status)
        }
        do {
            return try JSONDecoder.appSession.decode(TalentSignalSession.self, from: data)
        } catch {
            try? delete()
            throw AppSessionError.invalidStoredSession
        }
    }

    func save(_ session: TalentSignalSession) throws {
        let data = try JSONEncoder.appSession.encode(session)
        try delete()
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            kSecValueData as String: data,
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw AppSessionError.keychain(status)
        }
    }

    func delete() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AppSessionError.keychain(status)
        }
    }
}

protocol AppAuthenticationServing {
    func challenge() async throws -> AppleLoginChallenge
    func signIn(
        identityToken: String,
        challengeID: String,
        givenName: String?,
        familyName: String?
    ) async throws -> TalentSignalSession
    func validate(_ stored: TalentSignalSession) async throws -> TalentSignalSession
    func logout(_ stored: TalentSignalSession) async throws
}

actor AppAuthenticationClient: AppAuthenticationServing {
    private let baseURL: URL
    private let session: URLSession

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func challenge() async throws -> AppleLoginChallenge {
        try await request(
            path: "v1/auth/apple/challenges",
            method: "POST",
            token: nil,
            body: AppleChallengeBody(clientLabel: "ios")
        )
    }

    func signIn(
        identityToken: String,
        challengeID: String,
        givenName: String?,
        familyName: String?
    ) async throws -> TalentSignalSession {
        let response: AppSessionEnvelope = try await request(
            path: "v1/auth/apple",
            method: "POST",
            token: nil,
            body: AppleLoginBody(
                challengeID: challengeID,
                identityToken: identityToken,
                clientLabel: "ios",
                givenName: givenName,
                familyName: familyName
            )
        )
        guard response.contractVersion == TalentSignalAPIContract.version else {
            throw AppSessionError.contractMismatch
        }
        return TalentSignalSession(
            baseURL: baseURL,
            accessToken: response.accessToken,
            expiresAt: response.expiresAt,
            account: .init(
                id: response.account.id,
                slug: response.account.slug,
                name: response.account.name
            ),
            user: .init(
                id: response.user.id,
                email: response.user.email,
                displayName: response.user.displayName,
                kind: response.user.kind
            )
        )
    }

    func validate(_ stored: TalentSignalSession) async throws -> TalentSignalSession {
        let response: CurrentSessionEnvelope = try await request(
            path: "v1/auth/session",
            method: "GET",
            token: stored.accessToken,
            body: Optional<EmptySessionBody>.none
        )
        guard response.contractVersion == TalentSignalAPIContract.version,
              response.account.id == stored.account.id,
              response.user.id == stored.user.id else {
            throw AppSessionError.scopeMismatch
        }
        return TalentSignalSession(
            baseURL: baseURL,
            accessToken: stored.accessToken,
            expiresAt: response.expiresAt,
            account: .init(
                id: response.account.id,
                slug: response.account.slug,
                name: response.account.name
            ),
            user: .init(
                id: response.user.id,
                email: response.user.email,
                displayName: response.user.displayName,
                kind: response.user.kind
            )
        )
    }

    func logout(_ stored: TalentSignalSession) async throws {
        let response: LogoutEnvelope = try await request(
            path: "v1/auth/logout",
            method: "POST",
            token: stored.accessToken,
            body: Optional<EmptySessionBody>.none
        )
        guard response.contractVersion == TalentSignalAPIContract.version else {
            throw AppSessionError.contractMismatch
        }
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        token: String?,
        body: Body?
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "accept")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONEncoder.appSession.encode(body)
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AppSessionError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let envelope = try? JSONDecoder.appSession.decode(
                AppSessionErrorEnvelope.self,
                from: data
            )
            throw AppSessionError.backend(
                status: http.statusCode,
                code: envelope?.error.code ?? "HTTP_\(http.statusCode)",
                message: envelope?.error.message ?? "Authentication was rejected."
            )
        }
        do {
            return try JSONDecoder.appSession.decode(Response.self, from: data)
        } catch {
            throw AppSessionError.invalidResponse
        }
    }
}

enum AppSessionError: LocalizedError {
    case backend(status: Int, code: String, message: String)
    case contractMismatch
    case invalidIdentityToken
    case invalidResponse
    case invalidStoredSession
    case keychain(OSStatus)
    case scopeMismatch

    var errorDescription: String? {
        switch self {
        case let .backend(_, code, message):
            return "\(message) (\(code))"
        case .contractMismatch:
            return "The service contract changed. Update Talent Signal and try again."
        case .invalidIdentityToken:
            return "Apple did not return a readable identity token."
        case .invalidResponse:
            return "The authentication response could not be verified."
        case .invalidStoredSession:
            return "The saved session could not be read and was removed."
        case let .keychain(status):
            return "The secure session store is unavailable (\(status))."
        case .scopeMismatch:
            return "The session readback did not match the saved account."
        }
    }

    var invalidatesSession: Bool {
        guard case let .backend(status, code, _) = self else { return false }
        return status == 401 || ["SESSION_INVALID", "AUTHENTICATION_REQUIRED"].contains(code)
    }
}

extension SHA256 {
    static func hex(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}

private extension JSONDecoder {
    static var appSession: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

private extension JSONEncoder {
    static var appSession: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

private struct AppleChallengeBody: Encodable {
    let clientLabel: String
    enum CodingKeys: String, CodingKey { case clientLabel = "client_label" }
}

private struct AppleLoginBody: Encodable {
    let challengeID: String
    let identityToken: String
    let clientLabel: String
    let givenName: String?
    let familyName: String?

    enum CodingKeys: String, CodingKey {
        case challengeID = "challenge_id"
        case identityToken = "identity_token"
        case clientLabel = "client_label"
        case givenName = "given_name"
        case familyName = "family_name"
    }
}

private struct EmptySessionBody: Encodable {}

private struct AppSessionEnvelope: Decodable {
    let contractVersion: String
    let accessToken: String
    let expiresAt: Date
    let account: Account
    let user: User

    struct Account: Decodable { let id: String; let slug: String; let name: String }
    struct User: Decodable {
        let id: String
        let email: String
        let displayName: String
        let kind: String
        enum CodingKeys: String, CodingKey {
            case id, email, kind
            case displayName = "display_name"
        }
    }

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case accessToken = "access_token"
        case expiresAt = "expires_at"
        case account, user
    }
}

private struct CurrentSessionEnvelope: Decodable {
    let contractVersion: String
    let expiresAt: Date
    let account: AppSessionEnvelope.Account
    let user: AppSessionEnvelope.User

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case expiresAt = "expires_at"
        case account, user
    }
}

private struct LogoutEnvelope: Decodable {
    let contractVersion: String
    enum CodingKeys: String, CodingKey { case contractVersion = "contract_version" }
}

private struct AppSessionErrorEnvelope: Decodable {
    struct ErrorBody: Decodable { let code: String; let message: String }
    let error: ErrorBody
}
