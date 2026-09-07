import CryptoKit
import Foundation

enum AnswerFeedbackCategory: String, Codable, CaseIterable, Identifiable {
    case factError = "fact_error", wrongIdentity = "wrong_identity", wrongTime = "wrong_time"
    case unsupportedSuggestion = "unsupported_suggestion", preference, laterChange = "later_change"
    case helpful, unhelpful, click
    var id: String { rawValue }
    static let corrections: [Self] = [.factError, .wrongIdentity, .wrongTime, .unsupportedSuggestion, .preference, .laterChange]
    func title(_ language: AppLanguage) -> String {
        switch self {
        case .factError: return language.text("Incorrect fact")
        case .wrongIdentity: return language.text("Wrong person")
        case .wrongTime: return language.text("Wrong time")
        case .unsupportedSuggestion: return language.text("Unsupported suggestion")
        case .preference: return language.text("My preference")
        case .laterChange: return language.text("Something changed later")
        case .helpful: return language.text("Helpful")
        case .unhelpful: return language.text("Not helpful")
        case .click: return language.text("Opened")
        }
    }
}

struct AnswerFeedbackSource: Decodable {
    let sessionID: UUID, turnID: UUID, sessionRevision: Int, taskID: String
    let executionID: UUID?, outputHash: String?, sourceState: String
    enum CodingKeys: String, CodingKey {
        case sessionID = "session_id", turnID = "turn_id", sessionRevision = "session_revision", taskID = "task_id"
        case executionID = "execution_id", outputHash = "output_hash", sourceState = "source_state"
    }
}

struct AnswerFeedbackRecord: Decodable {
    let id: UUID, revision: Int, sessionID: UUID, turnID: UUID, executionID: UUID
    let outputHash: String, sourceState: String, category: AnswerFeedbackCategory, status: String
    let expectedBehaviorProposal: String?, adjudication: String
    enum CodingKeys: String, CodingKey {
        case id, revision, category, status, adjudication
        case sessionID = "session_id", turnID = "turn_id", executionID = "execution_id"
        case outputHash = "output_hash", sourceState = "source_state", expectedBehaviorProposal = "expected_behavior_proposal"
    }
}

struct AnswerFeedbackMutation: Encodable {
    let idempotencyKey: UUID, expectedRevision: Int, sessionID: UUID, turnID: UUID
    let expectedSessionRevision: Int, executionID: UUID, outputHash: String
    let operation: String, category: AnswerFeedbackCategory, expectedBehaviorProposal: String
    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key", expectedRevision = "expected_revision", sessionID = "session_id"
        case turnID = "turn_id", expectedSessionRevision = "expected_session_revision", executionID = "execution_id"
        case outputHash = "output_hash", operation, category, expectedBehaviorProposal = "expected_behavior_proposal"
    }

    static func stableID(_ parts: [String]) -> UUID {
        // Length-delimited JSON avoids ambiguous concatenation; stable across retries/devices.
        let data = try! JSONEncoder().encode(parts)
        var bytes = Array(SHA256.hash(data: data).prefix(16))
        bytes[6] = (bytes[6] & 0x0f) | 0x40
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                           bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
    }
}

protocol AnswerFeedbackServing {
    func source(sessionID: UUID, turnID: UUID) async throws -> AnswerFeedbackSource
    func list(sessionID: UUID, turnID: UUID) async throws -> [AnswerFeedbackRecord]
    func submit(id: UUID, mutation: AnswerFeedbackMutation) async throws -> AnswerFeedbackRecord
    func read(id: UUID) async throws -> AnswerFeedbackRecord
}

enum AnswerFeedbackError: LocalizedError {
    case conflict, invalidResponse, unavailable
    var errorDescription: String? {
        switch self {
        case .conflict: return "This answer or feedback changed. Reload before editing."
        case .invalidResponse: return "The feedback could not be verified. Reload to check its saved state."
        case .unavailable: return "Feedback is unavailable. Your answer is unchanged."
        }
    }
}

struct AnswerFeedbackClient: AnswerFeedbackServing {
    let baseURL: URL, bearerToken: String
    var session: URLSession = TalentSignalNetworking.session
    private struct SourceEnvelope: Decodable { let contract_version: String; let source: AnswerFeedbackSource }
    private struct ListEnvelope: Decodable { let contract_version: String; let feedback: [AnswerFeedbackRecord] }
    private struct Envelope: Decodable { let contract_version: String; let feedback: AnswerFeedbackRecord }

    func source(sessionID: UUID, turnID: UUID) async throws -> AnswerFeedbackSource {
        let result: SourceEnvelope = try await request(path: turnPath(sessionID, turnID) + "/feedback-source")
        guard result.contract_version == TalentSignalAPIContract.version, result.source.sessionID == sessionID,
              result.source.turnID == turnID else { throw AnswerFeedbackError.invalidResponse }
        return result.source
    }
    func list(sessionID: UUID, turnID: UUID) async throws -> [AnswerFeedbackRecord] {
        let result: ListEnvelope = try await request(path: turnPath(sessionID, turnID) + "/feedback")
        guard result.contract_version == TalentSignalAPIContract.version,
              result.feedback.allSatisfy({ $0.sessionID == sessionID && $0.turnID == turnID && $0.adjudication == "proposed" })
        else { throw AnswerFeedbackError.invalidResponse }
        return result.feedback
    }
    func submit(id: UUID, mutation: AnswerFeedbackMutation) async throws -> AnswerFeedbackRecord {
        let result: Envelope = try await request(path: "v1/feedback/\(id.uuidString.lowercased())", body: mutation)
        guard result.contract_version == TalentSignalAPIContract.version, result.feedback.id == id,
              result.feedback.sessionID == mutation.sessionID, result.feedback.turnID == mutation.turnID,
              result.feedback.executionID == mutation.executionID, result.feedback.outputHash == mutation.outputHash,
              result.feedback.adjudication == "proposed"
        else { throw AnswerFeedbackError.invalidResponse }
        // An idempotent replay returns current state. A later edit can have
        // superseded the lost response, so unblock authoritative reload.
        if result.feedback.revision > mutation.expectedRevision + 1 { throw AnswerFeedbackError.conflict }
        guard result.feedback.revision == mutation.expectedRevision + 1 else { throw AnswerFeedbackError.invalidResponse }
        return result.feedback
    }
    func read(id: UUID) async throws -> AnswerFeedbackRecord {
        let result: Envelope = try await request(path: "v1/feedback/\(id.uuidString.lowercased())")
        guard result.contract_version == TalentSignalAPIContract.version, result.feedback.id == id,
              result.feedback.adjudication == "proposed" else { throw AnswerFeedbackError.invalidResponse }
        return result.feedback
    }
    private func turnPath(_ session: UUID, _ turn: UUID) -> String {
        "v1/agent-sessions/\(session.uuidString.lowercased())/turns/\(turn.uuidString.lowercased())"
    }
    private func request<T: Decodable>(path: String, body: AnswerFeedbackMutation? = nil) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = body == nil ? "GET" : "PUT"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try JSONEncoder.agentSession.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await TalentSignalNetworking.data(for: request, using: session)
        guard let http = response as? HTTPURLResponse else { throw AnswerFeedbackError.invalidResponse }
        if http.statusCode == 409 { throw AnswerFeedbackError.conflict }
        guard (200...299).contains(http.statusCode) else { throw AnswerFeedbackError.unavailable }
        return try JSONDecoder.agentSession.decode(T.self, from: data)
    }
}
