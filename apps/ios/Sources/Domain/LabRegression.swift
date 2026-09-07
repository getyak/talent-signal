import Foundation

struct LabRegressionRequest: Codable, Equatable {
    let id: String
    let source_job_id: String
    let source_attempt_id: String
    let source_definition_hash: String
    let failure_categories: [String]
    let expected_behavior: String
    let review_note: String
}
struct LabRegressionFeedbackSource: Codable, Equatable {
    let feedback_id: String
    let feedback_revision: Int
    let execution_id: String
    let original_task_id: String
    let original_output_hash: String
    let expectation_authority: String
    let execution_authority: String

    var isValidProposal: Bool {
        [feedback_id, execution_id, original_task_id].allSatisfy { UUID(uuidString: $0) != nil }
            && feedback_revision > 0 && LabRegressionSnapshot.isHash(original_output_hash)
            && expectation_authority == "proposal" && execution_authority == "none"
    }
}
struct LabRegressionSnapshot: Codable {
    let schema_version: String
    let data_class: String
    var task: String? = nil
    var feedback_source: LabRegressionFeedbackSource? = nil
    let source_job_id: String
    let source_definition_hash: String
    let source_attempt: LabJobAttempt
    let sample: LabJobCase
    let configurations: [LabJobDefinition.Configuration]
    let reference_time: String
    let backend_revision: String?
    let instrument_revision: String
    let failure_categories: [String]
    let expected_behavior: String
    let review_note: String
    let reviewer_id: String
    let reviewed_at: String
    enum CodingKeys: String, CodingKey {
        case schema_version, data_class, task, feedback_source, source_job_id, source_definition_hash, source_attempt, configurations,
             reference_time, backend_revision, instrument_revision, failure_categories, expected_behavior,
             review_note, reviewer_id, reviewed_at
        case sample = "case"
    }
    var isFeedbackDevelopmentCase: Bool { data_class == "private_business" && feedback_source?.isValidProposal == true }
    var hasValidSource: Bool {
        guard UUID(uuidString: source_job_id) != nil, UUID(uuidString: source_attempt.id) != nil,
              Self.isHash(source_definition_hash), Self.isHash(sample.input_hash),
              source_attempt.case_id == sample.id,
              configurations.indices.contains(source_attempt.configuration_index),
              configurations[source_attempt.configuration_index].model == source_attempt.requested_model,
              configurations[source_attempt.configuration_index].prompt_revision == source_attempt.prompt_revision else { return false }
        if data_class == "registered_synthetic" { return feedback_source == nil && configurations.count == 2 }
        guard isFeedbackDevelopmentCase, [1, 2].contains(configurations.count), sample.partition == "development",
              (task ?? sample.task ?? "relationship_text") == "relationship_text" else { return false }
        if configurations.count == 1 {
            return source_attempt.id == feedback_source?.execution_id && source_job_id == feedback_source?.original_task_id
        }
        return true
    }
    // These are editable choices for a NEW rerun, never fabricated source history.
    var initialRerunConfigurations: [LabJobConfiguration] {
        guard let first = configurations.first else { return [] }
        let baseline = LabJobConfiguration(model: first.model, prompt_preset: first.prompt_preset)
        let candidate = configurations.dropFirst().first.map { LabJobConfiguration(model: $0.model, prompt_preset: $0.prompt_preset) }
            ?? LabJobConfiguration(model: first.model, prompt_preset: "")
        return [baseline, candidate]
    }
    func matchesFrozenSnapshot(_ other: LabRegressionSnapshot) -> Bool {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        guard let current = try? encoder.encode(self), let proposed = try? encoder.encode(other) else { return false }
        return current == proposed
    }
    static func isHash(_ value: String) -> Bool { value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil }
}
struct LabRegressionRecord: Codable, Identifiable {
    let id: String
    let content_hash: String
    let snapshot: LabRegressionSnapshot
    let created_at: String
    let expires_at: String
    let release_check: String
    let reruns: [LabJobSummary]
    var ci: LabCIState? = nil
}
struct LabRegressionSummary: Codable, Identifiable {
    let id: String
    let content_hash: String
    let title: String
    let failure_categories: [String]
    let created_at: String
    let expires_at: String
    let release_check: String
}
struct LabRegressionEnvelope: Decodable {
    let contract_version: String
    let regression: LabRegressionRecord
}
struct LabRegressionList: Decodable {
    let contract_version: String
    let regressions: [LabRegressionSummary]
}
struct LabRegressionDeletion: Codable {
    let contract_version: String
    let id: String
    let content_hash: String
    let status: String
    let deleted_at: String
    let affected_job_ids: [String]
}
struct LabRegressionExport: Decodable {
    let schema_version: String
    let execution_authority: String
    let id: String
    let content_hash: String
    let snapshot: LabRegressionSnapshot
    let created_at: String
    let expires_at: String
}
protocol LabRegressionServing {
    func loadRegressions() async throws -> LabRegressionList
    func saveRegression(_ request: LabRegressionRequest) async throws -> LabRegressionRecord
    func regression(id: String) async throws -> LabRegressionRecord
    func deleteRegression(id: String) async throws -> LabRegressionDeletion
    func exportRegression(id: String) async throws -> Data
}
