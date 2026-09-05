import XCTest
@testable import TalentSignal

@MainActor
final class LabFeatureOverrideTests: XCTestCase {
    func testInitialReplacementEncodesExplicitNull() throws {
        let request = LabFeatureOverrideRequest(id: UUID().uuidString, feature_id: "relationship_evidence_preview",
            value: "inline_excerpt", duration_minutes: 15, replaces_override_id: nil)
        let data = try JSONEncoder().encode(request)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertTrue(object["replaces_override_id"] is NSNull)
    }

    func testLostStartResponseRecoversOneAppliedOverride() async {
        let fixture = FeatureOverrideFixture()
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let first = LabFeatureOverrideStore(service: fixture, scope: "runtime", defaults: defaults)
        await first.load()
        await first.start(featureID: "relationship_evidence_preview", value: "inline_excerpt", minutes: 15)
        XCTAssertNotNil(first.pending)

        let restored = LabFeatureOverrideStore(service: fixture, scope: "runtime", defaults: defaults)
        await restored.load()
        XCTAssertNil(restored.pending)
        XCTAssertEqual(restored.active("relationship_evidence_preview")?.effective_value, "inline_excerpt")
        XCTAssertEqual(fixture.starts, 1)
    }

    func testNewSignInDoesNotReadPriorPendingOverride() async {
        let fixture = FeatureOverrideFixture()
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let first = LabFeatureOverrideStore(service: fixture, scope: "runtime", defaults: defaults)
        await first.load()
        await first.start(featureID: "relationship_evidence_preview", value: "inline_excerpt", minutes: 15)
        fixture.sessionScope = "new-session"

        let restored = LabFeatureOverrideStore(service: fixture, scope: "runtime", defaults: defaults)
        await restored.load()
        XCTAssertNil(restored.pending)
        XCTAssertNil(restored.active("relationship_evidence_preview"))
        XCTAssertEqual(fixture.reads, 0)
        XCTAssertNotNil(restored.error)
    }

    func testLostStopResponseRecoversServerDefault() async {
        let fixture = FeatureOverrideFixture()
        fixture.loseStart = false
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let store = LabFeatureOverrideStore(service: fixture, scope: "runtime", defaults: defaults)
        await store.load()
        await store.start(featureID: "relationship_evidence_preview", value: "inline_excerpt", minutes: 15)
        let active = try! XCTUnwrap(store.active("relationship_evidence_preview"))
        await store.stop(active)
        XCTAssertNotNil(store.pending)

        let restored = LabFeatureOverrideStore(service: fixture, scope: "runtime", defaults: defaults)
        await restored.load()
        XCTAssertEqual(restored.receipt?.status, "stopped")
        XCTAssertNil(restored.active("relationship_evidence_preview"))
        XCTAssertNil(restored.pending)
        XCTAssertEqual(fixture.stops, 1)
    }

    func testSubstitutedFeatureValueCannotClearRecovery() async {
        let fixture = FeatureOverrideFixture()
        fixture.loseStart = false
        fixture.substituteValue = true
        let store = LabFeatureOverrideStore(service: fixture, scope: "runtime",
            defaults: UserDefaults(suiteName: UUID().uuidString)!)
        await store.load()
        await store.start(featureID: "relationship_evidence_preview", value: "inline_excerpt", minutes: 15)
        XCTAssertNotNil(store.pending)
        XCTAssertNil(store.receipt)
        XCTAssertNotNil(store.error)
    }

    func testRelationshipReadbackAdoptsOnlyValidatedFrozenReceipt() throws {
        let receipt = LabFeatureAdoptionReceipt(
            override_id: "11111111-1111-4111-8111-111111111111",
            feature_id: "relationship_evidence_preview", server_value: "source_only",
            override_value: "inline_excerpt", effective_value: "inline_excerpt",
            catalog_revision: "catalog/1", definition_revision: "relationship-evidence-preview/1",
            backend_revision: "backend/1", scope: "this_authenticated_session",
            observed_at: "2026-09-05T00:00:00Z"
        )
        let response = RelationshipAskResponse(contractVersion: TalentSignalAPIContract.version,
            taskID: "task", contextManifestID: "manifest", knowledgeSnapshotID: "snapshot",
            disposition: "answer", blocks: [], createdAt: "2026-09-05T00:00:00Z")
        let readback = RelationshipAskReadback(contractVersion: TalentSignalAPIContract.version,
            accountID: "account", taskID: "task", contextManifestID: "manifest",
            knowledgeSnapshotID: "snapshot", personID: "person", relationshipContextID: "context",
            manifestStatus: "active", snapshotStatus: "published",
            authorizationScope: "person:person:relationship-context:context", citations: [],
            labFeatureReceipt: receipt, createdAt: "2026-09-05T00:00:00Z")

        let validated = try readback.validated(response, expectedAccountID: "account",
            expectedPersonID: "person", expectedRelationshipContextID: "context")
        XCTAssertEqual(validated.labFeatureReceipt, receipt)
    }

    func testRelationshipReadbackRejectsUnadmittedReceiptValue() {
        let receipt = LabFeatureAdoptionReceipt(
            override_id: "11111111-1111-4111-8111-111111111111",
            feature_id: "relationship_evidence_preview", server_value: "source_only",
            override_value: "source_only", effective_value: "source_only",
            catalog_revision: "catalog/1", definition_revision: "relationship-evidence-preview/1",
            backend_revision: "backend/1", scope: "this_authenticated_session",
            observed_at: "2026-09-05T00:00:00Z"
        )
        let response = RelationshipAskResponse(contractVersion: TalentSignalAPIContract.version,
            taskID: "task", contextManifestID: "manifest", knowledgeSnapshotID: "snapshot",
            disposition: "answer", blocks: [], createdAt: "2026-09-05T00:00:00Z")
        let readback = RelationshipAskReadback(contractVersion: TalentSignalAPIContract.version,
            accountID: "account", taskID: "task", contextManifestID: "manifest",
            knowledgeSnapshotID: "snapshot", personID: "person", relationshipContextID: "context",
            manifestStatus: "active", snapshotStatus: "published",
            authorizationScope: "person:person:relationship-context:context", citations: [],
            labFeatureReceipt: receipt, createdAt: "2026-09-05T00:00:00Z")

        XCTAssertThrowsError(try readback.validated(response, expectedAccountID: "account",
            expectedPersonID: "person", expectedRelationshipContextID: "context"))
    }

    func testFrozenReceiptSurvivesSavedSessionReload() throws {
        let receipt = LabFeatureAdoptionReceipt(
            override_id: "11111111-1111-4111-8111-111111111111",
            feature_id: "relationship_evidence_preview", server_value: "source_only",
            override_value: "inline_excerpt", effective_value: "inline_excerpt",
            catalog_revision: "catalog/1", definition_revision: "relationship-evidence-preview/1",
            backend_revision: "backend/1", scope: "this_authenticated_session",
            observed_at: "2026-09-05T00:00:00Z"
        )
        let persistence = FeatureReceiptSessionPersistence()
        let snapshot = PursuitWorkspaceSnapshot.preview
        let person = try XCTUnwrap(snapshot.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let writer = AgentSessionStore(persistence: persistence)
        let sessionID = writer.record(sessionID: nil, objective: "What changed?",
            response: RelationshipAskResponse(contractVersion: TalentSignalAPIContract.version,
                taskID: "task", contextManifestID: "manifest", knowledgeSnapshotID: "snapshot",
                disposition: "answer", blocks: [], createdAt: "2026-09-05T00:00:00Z",
                labFeatureReceipt: receipt), person: person, context: context)

        let restored = AgentSessionStore(persistence: persistence)
        XCTAssertEqual(try XCTUnwrap(restored.session(id: sessionID)).turns.first?.response.labFeatureReceipt, receipt)
    }
}

private final class FeatureReceiptSessionPersistence: AgentSessionPersisting {
    var data: Data?
    func load() throws -> Data? { data }
    func save(_ data: Data) throws { self.data = data }
    func deletionPending() throws -> Bool { false }
    func beginDeletion() throws {}
    func completeDeletion() throws { data = nil }
}

private final class FeatureOverrideFixture: LabFeatureOverrideServing {
    var sessionScope = "first-session"
    var starts = 0, stops = 0, reads = 0
    var loseStart = true
    var substituteValue = false
    var record: LabFeatureOverride?

    func loadFeatureConfiguration() async throws -> LabFeatureConfiguration {
        .init(contract_version: TalentSignalAPIContract.version, session_scope_id: sessionScope,
            enabled: true, backend_revision: "fixture-backend", catalog_revision: "fixture-catalog",
            features: [.init(id: "relationship_evidence_preview", name: "Relationship evidence preview",
                summary: "Show exact evidence inline.", definition_revision: "relationship-evidence-preview/1",
                server_value: "source_only", allowed_values: ["source_only", "inline_excerpt"],
                dependency: "relationship_text_citations", safety_boundary: "Presentation only.")],
            overrides: record.map { $0.session_scope_id == sessionScope ? [$0] : [] } ?? [])
    }

    func startFeatureOverride(_ request: LabFeatureOverrideRequest) async throws -> LabFeatureOverride {
        starts += 1
        let value = LabFeatureOverride(id: request.id, session_scope_id: sessionScope,
            feature_id: request.feature_id, server_value: "source_only",
            override_value: substituteValue ? "source_only" : request.value,
            effective_value: substituteValue ? "source_only" : request.value,
            catalog_revision: "fixture-catalog", definition_revision: "relationship-evidence-preview/1",
            backend_revision: "fixture-backend", status: "active", created_at: "2026-09-05T00:00:00Z",
            expires_at: "2026-09-05T00:15:00Z", scope: "this_authenticated_session", stop_reason: nil)
        record = value
        if loseStart { throw URLError(.networkConnectionLost) }
        return value
    }

    func featureOverride(id: String) async throws -> LabFeatureOverride {
        reads += 1
        guard let record, record.id == id else { throw TalentSignalLabClientError.invalidResponse }
        return record
    }

    func stopFeatureOverride(id: String) async throws -> LabFeatureOverride {
        stops += 1
        guard let current = record, current.id == id else { throw TalentSignalLabClientError.invalidResponse }
        record = .init(id: current.id, session_scope_id: current.session_scope_id,
            feature_id: current.feature_id, server_value: current.server_value,
            override_value: current.override_value, effective_value: current.effective_value,
            catalog_revision: current.catalog_revision, definition_revision: current.definition_revision,
            backend_revision: current.backend_revision, status: "stopped", created_at: current.created_at,
            expires_at: current.expires_at, scope: current.scope, stop_reason: "manual")
        throw URLError(.networkConnectionLost)
    }
}
