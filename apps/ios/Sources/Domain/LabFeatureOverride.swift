import Foundation

struct LabFeatureConfiguration: Codable {
    let contract_version: String
    let session_scope_id: String
    let enabled: Bool
    let backend_revision: String?
    let catalog_revision: String
    let features: [LabFeatureCatalogEntry]
    let overrides: [LabFeatureOverride]
}

struct LabFeatureCatalogEntry: Codable, Identifiable {
    let id: String
    let name: String
    let summary: String
    let definition_revision: String
    let server_value: String
    let allowed_values: [String]
    let dependency: String
    let safety_boundary: String
}

struct LabFeatureOverride: Codable, Identifiable {
    let id: String
    let session_scope_id: String
    let feature_id: String
    let server_value: String
    let override_value: String
    let effective_value: String
    let catalog_revision: String
    let definition_revision: String
    let backend_revision: String?
    let status: String
    let created_at: String
    let expires_at: String
    let scope: String
    let stop_reason: String?
}

struct LabFeatureOverrideRequest: Codable, Equatable {
    let id: String
    let feature_id: String
    let value: String
    let duration_minutes: Int
    let replaces_override_id: String?
    enum CodingKeys: String, CodingKey {
        case id, feature_id, value, duration_minutes, replaces_override_id
    }
    func encode(to encoder: Encoder) throws {
        var box = encoder.container(keyedBy: CodingKeys.self)
        try box.encode(id, forKey: .id)
        try box.encode(feature_id, forKey: .feature_id)
        try box.encode(value, forKey: .value)
        try box.encode(duration_minutes, forKey: .duration_minutes)
        try box.encode(replaces_override_id, forKey: .replaces_override_id)
    }
}

struct LabFeatureOverrideEnvelope: Decodable {
    let contract_version: String
    let override: LabFeatureOverride
}

struct LabFeatureAdoptionReceipt: Codable, Equatable {
    let override_id: String
    let feature_id: String
    let server_value: String
    let override_value: String
    let effective_value: String
    let catalog_revision: String
    let definition_revision: String
    let backend_revision: String?
    let scope: String
    let observed_at: String
}

protocol LabFeatureOverrideServing {
    func loadFeatureConfiguration() async throws -> LabFeatureConfiguration
    func startFeatureOverride(_ request: LabFeatureOverrideRequest) async throws -> LabFeatureOverride
    func featureOverride(id: String) async throws -> LabFeatureOverride
    func stopFeatureOverride(id: String) async throws -> LabFeatureOverride
}
