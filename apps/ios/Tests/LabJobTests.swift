import XCTest
@testable import TalentSignal

@MainActor
final class LabJobTests: XCTestCase {
    func testLostStartRecoversAcceptedBatchWithoutAnotherCallAndSurvivesRelaunch() async throws {
        let fixture = try LabJobFixture(), suite = "lab-job-test-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LabJobStore(service: fixture, scope: "owned-scope", defaults: defaults)
        await store.load()
        fixture.loseStart = true
        await store.start(fixture.request)
        XCTAssertNotNil(store.pending); XCTAssertEqual(fixture.starts, 1)
        let resumed = LabJobStore(service: fixture, scope: "owned-scope", defaults: defaults)
        await resumed.load()
        XCTAssertNil(resumed.pending); XCTAssertEqual(resumed.record?.status, "queued"); XCTAssertEqual(fixture.starts, 1)
        let other = LabJobStore(service: fixture, scope: "different-account-or-environment", defaults: defaults)
        XCTAssertNil(other.pending)
    }
    func testLostCancellationRecoversConfirmedIntentWithoutRepeatingIt() async throws {
        let fixture = try LabJobFixture(), suite = "lab-job-test-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LabJobStore(service: fixture, scope: "owned", defaults: defaults)
        await store.load(); await store.start(fixture.request)
        fixture.loseCancel = true
        await store.cancel()
        XCTAssertNotNil(store.pending)
        await store.load()
        XCTAssertNil(store.pending); XCTAssertEqual(store.record?.status, "cancelled"); XCTAssertEqual(fixture.cancels, 1)
    }
    func testUnknownExecutionCannotRestartOnRefresh() async throws {
        let fixture = try LabJobFixture(), suite = "lab-job-test-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LabJobStore(service: fixture, scope: "owned", defaults: defaults)
        await store.load(); await store.start(fixture.request)
        fixture.value = try fixture.record(status: "unknown")
        await store.refresh(); await store.load()
        XCTAssertEqual(store.record?.status, "unknown"); XCTAssertEqual(fixture.starts, 1)
    }
    func testChangedFrozenDefinitionAndSubstitutedModelAreRejected() async throws {
        let fixture = try LabJobFixture(), suite = "lab-job-test-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LabJobStore(service: fixture, scope: "owned", defaults: defaults)
        await store.load(); await store.start(fixture.request)
        let original = store.record?.definition_hash
        fixture.value = try fixture.record(status: "completed", hash: String(repeating: "f", count: 64))
        await store.refresh()
        XCTAssertEqual(store.record?.definition_hash, original); XCTAssertNotNil(store.error)
        fixture.value = try fixture.record(status: "completed", actualModel: "unexpected-model")
        await store.refresh()
        XCTAssertEqual(store.record?.status, "queued"); XCTAssertNotNil(store.error)
    }
    func testHistorySelectionLoadsTheChosenID() async throws {
        let fixture = try LabJobFixture(), suite = "lab-job-test-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LabJobStore(service: fixture, scope: "owned", defaults: defaults)
        await store.load(); await store.start(fixture.request)
        fixture.value = try fixture.record(status: "completed")
        await store.refresh()
        let nextID = UUID().uuidString.lowercased()
        fixture.value = try fixture.record(status: "completed", id: nextID)
        await store.select(nextID)
        XCTAssertEqual(fixture.lastRead, nextID); XCTAssertEqual(store.record?.id, nextID)
    }
    func testWorkspaceAgentAcceptsTruthfulLocalToolExecutionWithoutClaimingAModelCall() async throws {
        let fixture = try LabJobFixture(task: "unscoped_chat"), suite = "lab-job-test-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LabJobStore(service: fixture, scope: "owned-agent", defaults: defaults)
        await store.load(); await store.start(fixture.request)
        fixture.value = try fixture.record(status: "completed", localOnly: true)
        await store.refresh()
        XCTAssertEqual(store.record?.definition.task, "unscoped_chat")
        XCTAssertEqual(store.record?.attempts.first?.execution, "local_only")
        XCTAssertNil(store.record?.attempts.first?.actual_model)
        XCTAssertNil(store.error)
    }
}

@MainActor
final class LabJobFixture: LabJobServing {
    let request: LabJobRequest
    let catalog: LabJobCatalog
    var value: LabJobRecord?
    var starts = 0, cancels = 0
    var loseStart = false, loseCancel = false
    var lastRead: String?
    let task: String
    let model: String
    let caseID: String
    init(task: String = "relationship_text") throws {
        self.task = task
        model = task == "relationship_image" ? "glm-4.6v" : "glm-5.3"
        caseID = task == "unscoped_chat" ? "agent-case" : task == "relationship_image" ? "image-case" : "synthetic-case"
        let revision = String(repeating: "c", count: 64)
        request = .init(id: UUID().uuidString.lowercased(), catalog_revision: revision, task: task, case_ids: [caseID],
            configurations: [.init(model: model, prompt_preset: "baseline"), .init(model: model, prompt_preset: "concise")], repetitions: 1, call_limit: 2)
        catalog = .init(contract_version: TalentSignalAPIContract.version, catalog_revision: revision, enabled: true,
            cases: [.init(task: task, id: caseID, title: "Synthetic", revision: "1", partition: "development", input_json: "{}", input_hash: revision, expected: "Ask for clarification")],
            models: [.init(task: task, id: model, prompt_presets: ["baseline", "concise"])], jobs: [], daily_call_limit: 240, daily_calls_reserved: 0)
    }
    func loadExperimentJobs() async throws -> LabJobCatalog { catalog }
    func startExperimentJob(_ body: LabJobRequest) async throws -> LabJobRecord {
        starts += 1; value = try record(status: "queued")
        if loseStart { throw URLError(.networkConnectionLost) }
        return value!
    }
    func experimentJob(id: String) async throws -> LabJobRecord {
        lastRead = id
        guard let value else { throw TalentSignalLabClientError.backend(status: 404, code: "LAB_JOB_NOT_FOUND", message: "Missing") }
        return value
    }
    func cancelExperimentJob(id: String) async throws -> LabJobRecord {
        cancels += 1; value = try record(status: "cancelled")
        if loseCancel { throw URLError(.networkConnectionLost) }
        return value!
    }
    func reviewExperimentJob(id: String, value: LabJobReview) async throws -> LabJobRecord { try record(status: "completed") }
    func record(status: String, hash: String = String(repeating: "a", count: 64), actualModel: String? = nil, id: String? = nil, localOnly: Bool = false) throws -> LabJobRecord {
        let time = "2026-09-04T00:00:00Z", prompt = String(repeating: "b", count: 16)
        let terminal = status != "queued"
        let started = status == "completed" || status == "unknown"
        let attempts: [[String: Any]] = (0..<2).map { index in
            let state = status == "queued" ? "pending" : status == "unknown" ? "unknown" : status
            let remoteRequests: Any
            if localOnly {
                remoteRequests = 0
            } else if started {
                remoteRequests = 1
            } else {
                remoteRequests = NSNull()
            }
            return ["id": UUID().uuidString.lowercased(), "ordinal": index, "case_id": caseID, "configuration_index": index,
                "repetition": 1, "status": state, "started_at": started ? time : NSNull(), "finished_at": terminal ? time : NSNull(),
                "requested_model": model, "actual_model": started && !localOnly ? (actualModel ?? model) : NSNull(), "prompt_revision": prompt,
                "actual_prompt_revision": started && !localOnly ? prompt : NSNull(), "execution": localOnly ? "local_only" : "remote", "remote_requests_started": remoteRequests,
                "provider_request_id": NSNull(), "duration_ms": NSNull(), "input_tokens": NSNull(), "output_tokens": NSNull(),
                "title": NSNull(), "answer": NSNull(), "citation_ids": [], "error_code": NSNull(), "checks": []]
        }
        let sample: [String: Any] = ["task": task, "id": caseID, "title": "Synthetic", "revision": "1", "partition": "development", "input_json": "{}", "input_hash": hash, "expected": "Ask for clarification"]
        let definition: [String: Any] = ["task": task, "cases": [sample], "configurations": [
            ["model": model, "prompt_preset": "baseline", "prompt_revision": prompt], ["model": model, "prompt_preset": "concise", "prompt_revision": prompt]],
            "comparison": "prompt", "repetitions": 1, "call_limit": 2, "max_output_tokens_per_call": 1600, "reference_time": time,
            "backend_revision": NSNull(), "instrument_revision": "synthetic", "tool_access": task == "unscoped_chat" ? ["contact_workspace"] : [], "business_write_count": 0, "cost_status": "unavailable"]
        let object: [String: Any] = ["id": id ?? request.id, "definition_hash": hash, "definition": definition, "status": status, "attempts": attempts,
            "calls_reserved": started ? 2 : 0, "created_at": time, "expires_at": "2026-09-11T00:00:00Z", "cancel_requested_at": status == "cancelled" ? time : NSNull(),
            "review": "unreviewed", "failure_categories": [], "quality": "needs_review"]
        return try JSONDecoder().decode(LabJobRecord.self, from: JSONSerialization.data(withJSONObject: object))
    }
}
