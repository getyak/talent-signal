import Foundation

struct ProductRunFeedbackState: Codable, Equatable {
    var revision: Int
    var sentiment: String?
    var reasons: [String]
    var comment: String
    var correction: String
    var selected_text: String
}
struct ProductRunFeedbackDetail: Decodable {
    struct Run: Decodable {
        let id: String
        let task_id: String?
        let output_hash: String?
        let feedback: ProductRunFeedbackState
        let content_available: Bool
    }
    let contract_version: String
    let run: Run
}
struct ProductRunFeedbackRequest: Encodable {
    let idempotency_key: String
    let expected_revision: Int
    let output_hash: String
    let sentiment: String?
    let reasons: [String]
    let comment: String
    let correction: String
    let selected_text: String
    enum CodingKeys: String, CodingKey {
        case idempotency_key, expected_revision, output_hash, sentiment, reasons, comment, correction, selected_text
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(idempotency_key, forKey: .idempotency_key)
        try container.encode(expected_revision, forKey: .expected_revision)
        try container.encode(output_hash, forKey: .output_hash)
        try container.encode(sentiment, forKey: .sentiment)
        try container.encode(reasons, forKey: .reasons)
        try container.encode(comment, forKey: .comment)
        try container.encode(correction, forKey: .correction)
        try container.encode(selected_text, forKey: .selected_text)
    }
}
extension AnswerFeedbackServing {
    func productRun(taskID: String) async throws -> ProductRunFeedbackDetail { throw AnswerFeedbackError.unavailable }
    func react(taskID: String, request: ProductRunFeedbackRequest) async throws -> ProductRunFeedbackDetail { throw AnswerFeedbackError.unavailable }
}
extension AnswerFeedbackClient {
    func productRun(taskID: String) async throws -> ProductRunFeedbackDetail {
        try await runRequest(taskID: taskID)
    }
    func react(taskID: String, request: ProductRunFeedbackRequest) async throws -> ProductRunFeedbackDetail {
        try await runRequest(taskID: taskID, mutation: request)
    }
    private func runRequest(taskID: String, mutation: ProductRunFeedbackRequest? = nil) async throws -> ProductRunFeedbackDetail {
        guard UUID(uuidString: taskID) != nil else { throw AnswerFeedbackError.unavailable }
        let path = "v1/product-runs/tasks/\(taskID.lowercased())" + (mutation == nil ? "" : "/feedback")
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = mutation == nil ? "GET" : "PUT"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.setValue("ios", forHTTPHeaderField: "x-talent-signal-platform")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let mutation { request.httpBody = try JSONEncoder().encode(mutation) }
        let (data, response) = try await TalentSignalNetworking.data(for: request, using: session)
        guard let http = response as? HTTPURLResponse else { throw AnswerFeedbackError.invalidResponse }
        if http.statusCode == 409 { throw AnswerFeedbackError.conflict }
        guard (200...299).contains(http.statusCode) else { throw AnswerFeedbackError.unavailable }
        let result = try JSONDecoder().decode(ProductRunFeedbackDetail.self, from: data)
        guard result.contract_version == TalentSignalAPIContract.version,
              result.run.task_id?.lowercased() == taskID.lowercased() else { throw AnswerFeedbackError.invalidResponse }
        return result
    }
}
