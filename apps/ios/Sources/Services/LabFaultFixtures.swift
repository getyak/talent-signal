import Foundation

// Wire fixtures deliberately traverse the actual workspace decoder and scope checks.
// There is no free-form input, provider route, source upload or external effect.
enum LabFaultFixtures {
    static let workspaceID = "lab-fault-workspace"
    static let userID = "lab-fault-user"
    static let token = "lab-fault-synthetic-token"
    static let personID = "lab-fault-person"
    static func data(route: LabFaultRoute, expiredEvidence: Bool = false) throws -> Data {
        let version = TalentSignalAPIContract.version
        let timestamp = "2026-09-04T00:00:00Z"
        let evidence: [String: Any] = ["availability": expiredEvidence ? "unavailable" : "available", "reference_count": 1,
            "available_reference_count": expiredEvidence ? 0 : 1, "unavailable_reference_count": expiredEvidence ? 1 : 0]
        let person: [String: Any] = ["id": personID, "display_label": "Alex Morgan · synthetic", "context_count": 1,
            "capture_count": 1, "confirmed_identity_count": 0, "last_activity_at": timestamp,
            "contexts": [["id": "lab-fault-context", "display_label": "Synthetic product test", "last_activity_at": timestamp]], "identity_matches": []]
        let pursuit: [String: Any] = ["id": "lab-fault-pursuit", "workspace_id": workspaceID, "type": "search", "title": "Synthetic relationship review",
            "target_outcome": "Review the source before deciding", "target_date": "2026-10-01", "status": "active", "milestone": "discovery", "revision": 1,
            "milestone_authority": ["kind": "recruiter_authored", "evidence_refs": [], "evidence_state": ["availability": "not_required", "reference_count": 0, "available_reference_count": 0, "unavailable_reference_count": 0]],
            "roles": [], "criteria": [], "gaps": [], "actions": [], "updated_at": timestamp]
        let proposal: [String: Any] = ["id": "lab-fault-proposal", "pursuit_id": "lab-fault-pursuit", "base_revision": 1,
            "summary": "Inspect this synthetic source before reviewing the proposed next step", "status": "needs_review", "evidence_state": evidence,
            "review_context": ["subject": ["display_label": "Alex Morgan · synthetic"], "evidence": [["observed_at": timestamp, "source_timezone": "UTC"]]],
            "items": [["id": "lab-fault-item", "epistemic_status": "interpretation", "evidence_refs": ["lab-fault-evidence"], "evidence_state": evidence,
                "reason": "A reviewed source is needed for this synthetic proposal", "effect_summary": "No external action is available in this fixture"]], "updated_at": timestamp]
        let body: [String: Any]
        switch route {
        case .people: body = ["contract_version": version, "people": [person]]
        case .pursuits: body = ["contract_version": version, "workspace_id": workspaceID, "pursuits": [pursuit]]
        case .proposals: body = ["contract_version": version, "workspace_id": workspaceID, "proposals": [proposal]]
        case .rejected: throw URLError(.unsupportedURL)
        }
        return try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
    }
    static func error(status: Int) throws -> Data {
        let message: String
        switch status {
        case 401: message = "Synthetic 401: fixture session rejected once. Retry this isolated read."
        case 429: message = "Synthetic 429: fixture read limited once. Retry this isolated read."
        default: message = "Synthetic 500: fixture service failed once. Retry this isolated read."
        }
        return try JSONSerialization.data(withJSONObject: ["error": ["code": "LAB_SYNTHETIC_\(status)", "message": message]])
    }
}
