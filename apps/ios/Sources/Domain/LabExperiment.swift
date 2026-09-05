import Foundation

struct LabExperimentCatalog: Codable {
    let contract_version: String
    let enabled: Bool
    let backend_revision: String?
    let provider: String
    let prompt_version: String
    let models: [String]
    let cases: [LabExperimentCase]
    let experiments: [LabExperimentRecord]
}

struct LabExperimentCase: Codable, Identifiable {
    let id: String
    let title: String
    let input: String
    let expected: String
}

struct LabModelResult: Codable {
    let model: String
    let status: String
    let duration_ms: Int
    let answer: String?
    let title: String?
    let kind: String?
    let citation_ids: [String]
    let provider_request_id: String?
    let input_tokens: Int?
    let output_tokens: Int?
    let error_code: String?
}

struct LabExperimentRecord: Codable, Identifiable {
    let id: String
    let case_id: String
    let case_revision: String
    let snapshot_hash: String
    let prompt_version: String
    let backend_revision: String?
    let models: [String]
    let status: String
    let results: [LabModelResult]
    let review: String
    let created_at: String
    let expires_at: String
    let provider_call_limit: Int
    let business_write_count: Int
    let cost_status: String
}

struct LabExperimentRequest: Codable, Equatable {
    let id: String
    let case_id: String
    let models: [String]
}

struct LabExperimentEnvelope: Decodable {
    let contract_version: String
    let experiment: LabExperimentRecord
}

protocol LabExperimentServing {
    func loadExperiments() async throws -> LabExperimentCatalog
    func startExperiment(_ body: LabExperimentRequest) async throws -> LabExperimentRecord
    func experiment(id: String) async throws -> LabExperimentRecord
    func reviewExperiment(id: String, review: String) async throws -> LabExperimentRecord
}
