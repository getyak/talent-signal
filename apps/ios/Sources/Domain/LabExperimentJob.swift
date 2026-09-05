import Foundation

struct LabJobConfiguration: Codable, Equatable {
    let model: String
    let prompt_preset: String
}
struct LabJobRequest: Codable, Equatable {
    let id: String
    let catalog_revision: String
    var task: String? = nil
    let case_ids: [String]
    let configurations: [LabJobConfiguration]
    let repetitions: Int
    let call_limit: Int
    var regression_source: LabRegressionSource? = nil
}
struct LabRegressionSource: Codable, Equatable {
    let id: String
    let content_hash: String
}
struct LabJobCase: Codable, Identifiable {
    var task: String? = nil
    let id: String
    let title: String
    let revision: String
    let partition: String
    let input_json: String
    let input_hash: String
    let expected: String
}
struct LabJobDefinition: Codable {
    let task: String
    let cases: [LabJobCase]
    let configurations: [Configuration]
    let comparison: String
    let repetitions: Int
    let call_limit: Int
    let max_output_tokens_per_call: Int
    let reference_time: String
    let backend_revision: String?
    let instrument_revision: String
    let tool_access: [String]
    let business_write_count: Int
    let cost_status: String
    var regression_source: LabRegressionSource? = nil
    struct Configuration: Codable {
        let model: String
        let prompt_preset: String
        let prompt_revision: String
    }
}
struct LabJobAttempt: Codable, Identifiable {
    let id: String
    let ordinal: Int
    let case_id: String
    let configuration_index: Int
    let repetition: Int
    let status: String
    let started_at: String?
    let finished_at: String?
    let requested_model: String
    let actual_model: String?
    let prompt_revision: String
    let actual_prompt_revision: String?
    var execution: String? = nil
    var remote_requests_started: Int? = nil
    let provider_request_id: String?
    let duration_ms: Int?
    let input_tokens: Int?
    let output_tokens: Int?
    let title: String?
    let answer: String?
    let citation_ids: [String]
    let error_code: String?
    let checks: [Check]
    struct Check: Codable, Identifiable {
        let id: String
        let verdict: String
        let summary: String
    }
}
struct LabJobRecord: Codable, Identifiable {
    let id: String
    let definition_hash: String
    let definition: LabJobDefinition
    let status: String
    let attempts: [LabJobAttempt]
    let calls_reserved: Int
    let created_at: String
    let expires_at: String
    let cancel_requested_at: String?
    let review: String
    let failure_categories: [String]
    let quality: String
    var isActive: Bool { ["queued", "running", "cancelling"].contains(status) }
}
struct LabJobSummary: Codable, Identifiable {
    let id: String
    let status: String
    let created_at: String
    let expires_at: String
    var task: String? = nil
    let case_count: Int
    let repetitions: Int
    let planned_calls: Int
    let calls_reserved: Int
    let models: [String]
    let review: String
}
struct LabJobCatalog: Codable {
    let contract_version: String
    let catalog_revision: String
    let enabled: Bool
    let cases: [LabJobCase]
    let models: [Model]
    let jobs: [LabJobSummary]
    let daily_call_limit: Int
    let daily_calls_reserved: Int
    struct Model: Codable, Identifiable {
        var task: String? = nil
        let id: String
        let prompt_presets: [String]
    }
}
struct LabJobEnvelope: Decodable {
    let contract_version: String
    let job: LabJobRecord
}
struct LabJobReview: Codable {
    let review: String
    let failure_categories: [String]
}
protocol LabJobServing {
    func loadExperimentJobs() async throws -> LabJobCatalog
    func startExperimentJob(_ body: LabJobRequest) async throws -> LabJobRecord
    func experimentJob(id: String) async throws -> LabJobRecord
    func cancelExperimentJob(id: String) async throws -> LabJobRecord
    func reviewExperimentJob(id: String, value: LabJobReview) async throws -> LabJobRecord
}
