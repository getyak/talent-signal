import Foundation

struct LabTaskConfiguration: Codable {
    let contract_version: String
    let session_scope_id: String
    let enabled: Bool
    let backend_revision: String?
    let tasks: [LabTaskCapability]
    let trials: [LabTaskTrial]
    let observations: [LabTrialObservation]
    let summaries: [LabTrialSummary]
}
struct LabTaskCapability: Codable, Identifiable {
    let id: String
    let models: [Model]
    let default_model: String?
    struct Model: Codable, Identifiable {
        let id: String
        let prompt_presets: [String]
    }
}
struct LabTaskTrial: Codable, Identifiable {
    let id: String
    let session_scope_id: String
    let task: String
    let model: String
    let prompt_preset: String
    let prompt_revision: String
    let backend_revision: String?
    let status: String
    let created_at: String
    let expires_at: String
    let scope: String
    let online_assignment: Bool
    let observation_plan: LabTrialObservationPlan
    let stop_reason: String?
}
struct LabTrialObservationPlan: Codable, Equatable {
    let question: String
    let success_metric: String
    let guardrail_metric: String
    let minimum_samples: Int
    let stop_after_adverse_outcomes: Int
    let sample_unit: String
    let assignment_mode: String
    let rollback: String
    let window_minutes: Int
}
struct LabTrialObservation: Codable, Identifiable {
    let id: String
    let trial_id: String
    let task: String
    let observed_at: String
    let product_outcome: String?
    let measurement: Measurement
    struct Measurement: Codable {
        let execution: String
        let remote_requests_started: Int?
        let requested_model: String
        let resolved_model: String
        let actual_model: String?
        let prompt_revision: String
        let actual_prompt_revision: String?
        let duration_ms: Int
        let input_tokens: Int?
        let output_tokens: Int?
        let provider_request_id: String?
        let status: String
        let error_code: String?
    }
}
struct LabTrialSummary: Codable, Identifiable {
    var id: String { trial_id }
    let trial_id: String
    let samples: Int
    let accepted: Int
    let fallback: Int
    let product_failed: Int
    let unverified: Int
    let remote_executions: Int
    let local_executions: Int
    let evidence_state: String
    let causal_claim_allowed: Bool
}
struct LabTaskTrialRequest: Codable, Equatable {
    let id: String
    let task: String
    let model: String
    let prompt_preset: String
    let duration_minutes: Int
    let replaces_trial_id: String?
    let observation_plan: LabTrialObservationPlan
    enum CodingKeys: String, CodingKey { case id, task, model, prompt_preset, duration_minutes, replaces_trial_id, observation_plan }
    func encode(to encoder: Encoder) throws {
        var box = encoder.container(keyedBy: CodingKeys.self)
        try box.encode(id, forKey: .id); try box.encode(task, forKey: .task)
        try box.encode(model, forKey: .model); try box.encode(prompt_preset, forKey: .prompt_preset)
        try box.encode(duration_minutes, forKey: .duration_minutes)
        try box.encode(replaces_trial_id, forKey: .replaces_trial_id)
        try box.encode(observation_plan, forKey: .observation_plan)
    }
}
struct LabTaskTrialEnvelope: Decodable {
    let contract_version: String
    let trial: LabTaskTrial
}
protocol LabTaskTrialServing {
    func loadTaskConfiguration() async throws -> LabTaskConfiguration
    func startTaskTrial(_ request: LabTaskTrialRequest) async throws -> LabTaskTrial
    func taskTrial(id: String) async throws -> LabTaskTrial
    func stopTaskTrial(id: String) async throws -> LabTaskTrial
}
