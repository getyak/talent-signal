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
struct LabRegressionSnapshot: Codable {
    let schema_version: String
    let data_class: String
    var task: String? = nil
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
        case schema_version, data_class, task, source_job_id, source_definition_hash, source_attempt, configurations,
             reference_time, backend_revision, instrument_revision, failure_categories, expected_behavior,
             review_note, reviewer_id, reviewed_at
        case sample = "case"
    }
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
