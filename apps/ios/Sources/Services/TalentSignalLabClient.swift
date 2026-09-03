import Foundation

protocol TalentSignalLabServing {
    func loadManifest() async throws -> LabManifest
    func startSession(
        scenarioID: String,
        idempotencyKey: String
    ) async throws -> LabSession
    func run(
        sessionID: String,
        variant: LabRunVariant,
        idempotencyKey: String
    ) async throws -> LabRun
    func compare(
        sessionID: String,
        idempotencyKey: String
    ) async throws -> LabComparison
    func createReceipt(
        sessionID: String,
        runID: String,
        idempotencyKey: String
    ) async throws -> RealityReceipt
    func promoteReceipt(
        receiptID: String,
        idempotencyKey: String
    ) async throws -> LabEvalCase
}

actor URLTalentSignalLabClient: TalentSignalLabServing {
    private let baseURL: URL
    private let accountSlug: String
    private let userEmail: String
    private let session: URLSession
    private var accessToken: String?

    init(
        baseURL: URL,
        accountSlug: String,
        userEmail: String,
        accessToken: String?,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.accountSlug = accountSlug
        self.userEmail = userEmail
        self.accessToken = accessToken
        self.session = session
    }

    func loadManifest() async throws -> LabManifest {
        let manifest: LabManifest = try await request(
            path: "v1/lab",
            method: "GET",
            body: Optional<LabEmptyBody>.none
        )
        try validateContract(manifest.contractVersion)
        return manifest
    }

    func startSession(
        scenarioID: String,
        idempotencyKey: String
    ) async throws -> LabSession {
        let response: LabSessionEnvelope = try await request(
            path: "v1/lab/sessions",
            method: "POST",
            body: LabStartSessionBody(
                scenarioID: scenarioID,
                idempotencyKey: idempotencyKey
            )
        )
        try validateContract(response.contractVersion)
        return response.session
    }

    func run(
        sessionID: String,
        variant: LabRunVariant,
        idempotencyKey: String
    ) async throws -> LabRun {
        let response: LabRunEnvelope = try await request(
            path: "v1/lab/sessions/\(sessionID)/runs",
            method: "POST",
            body: LabRunBody(
                variant: variant.rawValue,
                idempotencyKey: idempotencyKey
            )
        )
        try validateContract(response.contractVersion)
        return response.run
    }

    func compare(
        sessionID: String,
        idempotencyKey: String
    ) async throws -> LabComparison {
        let response: LabComparisonEnvelope = try await request(
            path: "v1/lab/sessions/\(sessionID)/comparisons",
            method: "POST",
            body: LabIdempotencyBody(idempotencyKey: idempotencyKey)
        )
        try validateContract(response.contractVersion)
        guard response.comparison.identicalSnapshot,
              response.comparison.baselineRun.snapshotHash
                == response.comparison.candidateRun.snapshotHash else {
            throw TalentSignalLabClientError.snapshotMismatch
        }
        return response.comparison
    }

    func createReceipt(
        sessionID: String,
        runID: String,
        idempotencyKey: String
    ) async throws -> RealityReceipt {
        let response: RealityReceiptEnvelope = try await request(
            path: "v1/lab/sessions/\(sessionID)/receipts",
            method: "POST",
            body: LabReceiptBody(runID: runID, idempotencyKey: idempotencyKey)
        )
        try validateContract(response.contractVersion)
        guard response.receipt.redactionApplied else {
            throw TalentSignalLabClientError.unredactedReceipt
        }
        return response.receipt
    }

    func promoteReceipt(
        receiptID: String,
        idempotencyKey: String
    ) async throws -> LabEvalCase {
        let response: LabEvalCaseEnvelope = try await request(
            path: "v1/lab/receipts/\(receiptID)/promotions",
            method: "POST",
            body: LabPromotionBody(
                decision: "promote",
                idempotencyKey: idempotencyKey
            )
        )
        try validateContract(response.contractVersion)
        return response.evalCase
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body?
    ) async throws -> Response {
        guard accessToken != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw TalentSignalLabClientError.authenticationRequired
        }
        let token = try await authenticatedToken()
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw TalentSignalLabClientError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let envelope = try? JSONDecoder().decode(LabErrorEnvelope.self, from: data)
            throw TalentSignalLabClientError.backend(
                status: http.statusCode,
                code: envelope?.error.code ?? "HTTP_\(http.statusCode)",
                message: envelope?.error.message ?? "The Lab request was rejected."
            )
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw TalentSignalLabClientError.invalidResponse
        }
    }

    private func authenticatedToken() async throws -> String {
        if let accessToken { return accessToken }
#if DEBUG
        guard URLFixtureLoader.isLoopback(baseURL) else {
            throw TalentSignalLabClientError.authenticationRequired
        }
        var request = URLRequest(url: baseURL.appending(path: "v1/auth/simulated-login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(
            LabSimulatedLoginBody(
                accountSlug: accountSlug,
                userEmail: userEmail,
                clientLabel: "ios-talent-signal-lab"
            )
        )
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode),
              let login = try? JSONDecoder().decode(
                LabSimulatedLoginEnvelope.self,
                from: data
              ) else {
            throw TalentSignalLabClientError.loginFailed
        }
        accessToken = login.accessToken
        return login.accessToken
#else
        throw TalentSignalLabClientError.authenticationRequired
#endif
    }

    private func validateContract(_ version: String) throws {
        guard version == TalentSignalAPIContract.version else {
            throw TalentSignalLabClientError.contractMismatch
        }
    }
}

enum TalentSignalLabClientError: LocalizedError, Equatable {
    case authenticationRequired
    case backend(status: Int, code: String, message: String)
    case contractMismatch
    case invalidResponse
    case loginFailed
    case snapshotMismatch
    case unredactedReceipt

    var errorDescription: String? {
        switch self {
        case .authenticationRequired:
            return "Talent Signal Lab requires an authenticated internal build."
        case let .backend(_, code, message):
            return "\(message) (\(code))"
        case .contractMismatch:
            return "The Lab contract changed. Update Talent Signal and try again."
        case .invalidResponse:
            return "The Lab response could not be verified."
        case .loginFailed:
            return "The local Lab test session could not be opened."
        case .snapshotMismatch:
            return "Baseline comparison was rejected because the evidence snapshots differ."
        case .unredactedReceipt:
            return "The Reality Receipt was rejected because redaction was not verified."
        }
    }
}

private struct LabEmptyBody: Encodable {}

private struct LabStartSessionBody: Encodable {
    let scenarioID: String
    let idempotencyKey: String

    enum CodingKeys: String, CodingKey {
        case scenarioID = "scenario_id"
        case idempotencyKey = "idempotency_key"
    }
}

private struct LabRunBody: Encodable {
    let variant: String
    let idempotencyKey: String

    enum CodingKeys: String, CodingKey {
        case variant
        case idempotencyKey = "idempotency_key"
    }
}

private struct LabIdempotencyBody: Encodable {
    let idempotencyKey: String
    enum CodingKeys: String, CodingKey { case idempotencyKey = "idempotency_key" }
}

private struct LabReceiptBody: Encodable {
    let runID: String
    let idempotencyKey: String

    enum CodingKeys: String, CodingKey {
        case runID = "run_id"
        case idempotencyKey = "idempotency_key"
    }
}

private struct LabPromotionBody: Encodable {
    let decision: String
    let idempotencyKey: String

    enum CodingKeys: String, CodingKey {
        case decision
        case idempotencyKey = "idempotency_key"
    }
}

private struct LabSessionEnvelope: Decodable {
    let contractVersion: String
    let session: LabSession
    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case session
    }
}

private struct LabRunEnvelope: Decodable {
    let contractVersion: String
    let run: LabRun
    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case run
    }
}

private struct LabComparisonEnvelope: Decodable {
    let contractVersion: String
    let comparison: LabComparison
    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case comparison
    }
}

private struct RealityReceiptEnvelope: Decodable {
    let contractVersion: String
    let receipt: RealityReceipt
    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case receipt
    }
}

private struct LabEvalCaseEnvelope: Decodable {
    let contractVersion: String
    let evalCase: LabEvalCase
    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case evalCase = "eval_case"
    }
}

private struct LabErrorEnvelope: Decodable {
    struct ErrorBody: Decodable {
        let code: String
        let message: String
    }
    let error: ErrorBody
}

#if DEBUG
private struct LabSimulatedLoginBody: Encodable {
    let accountSlug: String
    let userEmail: String
    let clientLabel: String

    enum CodingKeys: String, CodingKey {
        case accountSlug = "account_slug"
        case userEmail = "user_email"
        case clientLabel = "client_label"
    }
}

private struct LabSimulatedLoginEnvelope: Decodable {
    let accessToken: String
    enum CodingKeys: String, CodingKey { case accessToken = "access_token" }
}
#endif
