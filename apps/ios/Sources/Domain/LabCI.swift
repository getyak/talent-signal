import Foundation

struct LabCIRequest: Codable, Equatable {
    let id: String
    let regression_content_hash: String
    let job_id: String
    let github_run_id: Int64
}
struct LabCIReceipt: Codable, Equatable {
    let id: String
    let regression_id: String
    let regression_content_hash: String
    let job_id: String
    let state: String
    let reason_code: String
    let checked_at: String
    let valid_until: String
    let repository: String
    let trust_digest: String
    let github_run_id: Int64
    let github_run_attempt: Int?
    let github_job_id: Int64?
    let artifact_id: Int64?
    let artifact_digest: String?
    let report_digest: String?
    let source_revision: String?
    let backend_revision: String?
    let workflow_conclusion: String?
    let job_conclusion: String?
    let integrity: String?
    let quality: String
    let release_enforcement: String

    var runURL: URL? {
        guard LabCIInput.validRepository(repository), github_run_id > 0 else { return nil }
        return URL(string: "https://github.com/\(repository)/actions/runs/\(github_run_id)")
    }
    func matches(regressionID: String, contentHash: String) -> Bool {
        guard regression_id == regressionID, regression_content_hash == contentHash,
              UUID(uuidString: id) != nil, UUID(uuidString: job_id) != nil,
              ["verified", "not_verified"].contains(state), quality == "needs_review", release_enforcement == "not_verified",
              LabCIInput.validRepository(repository), github_run_id > 0, github_run_id <= 9_007_199_254_740_991,
              LabCIInput.isDigest(trust_digest), LabCIInput.date(checked_at) != nil, LabCIInput.date(valid_until) != nil else { return false }
        if state == "verified" {
            return (github_run_attempt ?? 0) > 0 && (github_job_id ?? 0) > 0 && (artifact_id ?? 0) > 0
                && LabCIInput.isDigest(artifact_digest ?? "") && LabCIInput.isDigest(report_digest ?? "")
                && (source_revision ?? "").range(of: "^[a-f0-9]{40}$", options: .regularExpression) != nil
                && ["pass", "fail", "not_run"].contains(integrity ?? "")
                && ["success", "failure"].contains(workflow_conclusion ?? "") && ["success", "failure"].contains(job_conclusion ?? "")
                && LabCIInput.date(valid_until)! > LabCIInput.date(checked_at)!
        }
        return true
    }
}
struct LabCIState: Codable {
    let available: Bool
    let repository: String?
    let latest: LabCIReceipt?
}
struct LabCIEnvelope: Decodable {
    let contract_version: String
    let verification: LabCIReceipt
}
protocol LabCIVerificationServing {
    func verifyCI(regressionID: String, request: LabCIRequest) async throws -> LabCIReceipt
    func ciVerification(regressionID: String, id: String) async throws -> LabCIReceipt
}
enum LabCIInput {
    static func validRepository(_ value: String) -> Bool {
        value.range(of: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", options: .regularExpression) != nil
            && value.split(separator: "/").allSatisfy { $0 != "." && $0 != ".." }
    }
    static func isDigest(_ value: String) -> Bool { value.range(of: "^sha256:[a-f0-9]{64}$", options: .regularExpression) != nil }
    static func date(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    static func runID(_ input: String, repository: String) -> Int64? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let raw: String
        if trimmed.range(of: "^[0-9]+$", options: .regularExpression) != nil { raw = trimmed }
        else {
            guard validRepository(repository), let url = URLComponents(string: trimmed), url.scheme == "https", url.host == "github.com",
                  url.user == nil, url.password == nil, url.port == nil, url.query == nil, url.fragment == nil else { return nil }
            let prefix = "/\(repository)/actions/runs/"
            guard url.path.lowercased().hasPrefix(prefix.lowercased()) else { return nil }
            raw = String(url.path.dropFirst(prefix.count))
        }
        guard raw.range(of: "^[0-9]+$", options: .regularExpression) != nil, let value = Int64(raw), value > 0, value <= 9_007_199_254_740_991 else { return nil }
        return value
    }
    static func releaseStatusIsValid(_ record: LabRegressionRecord) -> Bool {
        guard ["not_connected", "ci_verified", "ci_needs_refresh"].contains(record.release_check) else { return false }
        if let latest = record.ci?.latest, !latest.matches(regressionID: record.id, contentHash: record.content_hash) { return false }
        if record.release_check != "not_connected" {
            guard let ci = record.ci, let latest = ci.latest, latest.state == "verified" else { return false }
            if record.release_check == "ci_verified" { return ci.available && ci.repository == latest.repository }
        }
        return true
    }
}
