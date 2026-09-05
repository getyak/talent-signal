import XCTest
@testable import TalentSignal

@MainActor
final class LabTaskTrialTests: XCTestCase {
    func testInitialReplacementEncodesAnExplicitNull() throws {
        let request = LabTaskTrialRequest(id: UUID().uuidString, task: "unscoped_chat", model: "fixture-model",
            prompt_preset: "baseline", duration_minutes: 15, replaces_trial_id: nil,
            observation_plan: fixturePlan())
        let data = try JSONEncoder().encode(request)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertTrue(object["replaces_trial_id"] is NSNull)
    }
    func testLostSelectionResponseRecoversWithoutApplyingAgain() async {
        let service = TaskTrialFixture()
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let first = LabTaskTrialStore(service: service, scope: "fixture", defaults: defaults)
        await first.load()
        await first.start(task: "unscoped_chat", model: "fixture-model", preset: "concise", minutes: 15,
            question: "Does concise finish without fallback?", minimumSamples: 5, stopAfterAdverse: 1)
        XCTAssertNotNil(first.pending)
        let restored = LabTaskTrialStore(service: service, scope: "fixture", defaults: defaults)
        await restored.load()
        XCTAssertNil(restored.pending)
        XCTAssertEqual(restored.receipt?.model, "fixture-model")
        XCTAssertEqual(service.starts, 1)
    }
    func testNewSignInCannotReplayPriorSessionsPendingSelection() async {
        let service = TaskTrialFixture()
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let first = LabTaskTrialStore(service: service, scope: "fixture", defaults: defaults)
        await first.load()
        await first.start(task: "unscoped_chat", model: "fixture-model", preset: "baseline", minutes: 15,
            question: "Does baseline finish without fallback?", minimumSamples: 5, stopAfterAdverse: 1)
        service.sessionScope = "new-session"
        let restored = LabTaskTrialStore(service: service, scope: "fixture", defaults: defaults)
        await restored.load()
        XCTAssertNil(restored.pending)
        XCTAssertNil(restored.active("unscoped_chat"))
        XCTAssertEqual(service.starts, 1)
        XCTAssertEqual(service.reads, 0)
        XCTAssertNotNil(restored.error)
    }
    func testLostStopResponseRecoversConfirmedRollback() async {
        let service = TaskTrialFixture()
        service.loseStart = false
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let store = LabTaskTrialStore(service: service, scope: "fixture", defaults: defaults)
        await store.load()
        await store.start(task: "unscoped_chat", model: "fixture-model", preset: "baseline", minutes: 15,
            question: "Does baseline finish without fallback?", minimumSamples: 5, stopAfterAdverse: 1)
        guard let active = store.active("unscoped_chat") else { return XCTFail("Expected an active trial") }
        await store.stop(active)
        XCTAssertNotNil(store.pending)
        let restored = LabTaskTrialStore(service: service, scope: "fixture", defaults: defaults)
        await restored.load()
        XCTAssertEqual(restored.receipt?.status, "stopped")
        XCTAssertNil(restored.pending)
        XCTAssertNil(restored.active("unscoped_chat"))
        XCTAssertEqual(service.stops, 1)
    }
    func testUnverifiedConfigurationCannotClearRecovery() async {
        let service = TaskTrialFixture()
        service.loseStart = false
        service.returnWrongModel = true
        let store = LabTaskTrialStore(service: service, scope: "fixture", defaults: UserDefaults(suiteName: UUID().uuidString)!)
        await store.load()
        await store.start(task: "unscoped_chat", model: "fixture-model", preset: "baseline", minutes: 15,
            question: "Does baseline finish without fallback?", minimumSamples: 5, stopAfterAdverse: 1)
        XCTAssertNotNil(store.pending)
        XCTAssertNil(store.receipt)
        XCTAssertNotNil(store.error)
    }
    func testUnverifiedObservationPlanCannotClearRecovery() async {
        let service = TaskTrialFixture()
        service.loseStart = false
        service.returnWrongPlan = true
        let store = LabTaskTrialStore(service: service, scope: "fixture", defaults: UserDefaults(suiteName: UUID().uuidString)!)
        await store.load()
        await store.start(task: "unscoped_chat", model: "fixture-model", preset: "baseline", minutes: 15,
            question: "Does baseline finish without fallback?", minimumSamples: 5, stopAfterAdverse: 1)
        XCTAssertNotNil(store.pending)
        XCTAssertNil(store.receipt)
        XCTAssertNotNil(store.error)
    }
    func testConfigurationRejectsAClaimOfCausalEvidence() async {
        let service = TaskTrialFixture()
        service.loseStart = false
        let store = LabTaskTrialStore(service: service, scope: "fixture", defaults: UserDefaults(suiteName: UUID().uuidString)!)
        await store.load()
        await store.start(task: "unscoped_chat", model: "fixture-model", preset: "baseline", minutes: 15,
            question: "Does baseline finish without fallback?", minimumSamples: 5, stopAfterAdverse: 1)
        XCTAssertNotNil(store.active("unscoped_chat"))
        service.returnCausalSummary = true
        await store.load()
        XCTAssertNotNil(store.error)
        XCTAssertTrue(store.configuration?.summaries.isEmpty == true)
    }
}

private func fixturePlan(question: String = "Does this configuration finish without fallback?") -> LabTrialObservationPlan {
    .init(question: question, success_metric: "product_adoption",
        guardrail_metric: "fallback_or_product_failure", minimum_samples: 5,
        stop_after_adverse_outcomes: 1, sample_unit: "unique_product_request",
        assignment_mode: "current_authenticated_session_opt_in", rollback: "task_default",
        window_minutes: 15)
}

private final class TaskTrialFixture: LabTaskTrialServing {
    var sessionScope = "first-session"
    var starts = 0, stops = 0, reads = 0
    var loseStart = true
    var returnWrongModel = false
    var returnWrongPlan = false
    var returnCausalSummary = false
    var record: LabTaskTrial?
    func loadTaskConfiguration() async throws -> LabTaskConfiguration {
        let trials = record.map { $0.session_scope_id == sessionScope ? [$0] : [] } ?? []
        let summaries = returnCausalSummary && !trials.isEmpty
            ? [LabTrialSummary(trial_id: trials[0].id, samples: 0, accepted: 0, fallback: 0,
                product_failed: 0, unverified: 0, remote_executions: 0, local_executions: 0,
                evidence_state: "collecting", causal_claim_allowed: true)] : []
        return .init(contract_version: TalentSignalAPIContract.version, session_scope_id: sessionScope, enabled: true,
            backend_revision: "fixture", tasks: [.init(id: "unscoped_chat", models: [.init(id: "fixture-model", prompt_presets: ["baseline", "concise"])], default_model: "fixture-model")],
            trials: trials, observations: [], summaries: summaries)
    }
    func startTaskTrial(_ request: LabTaskTrialRequest) async throws -> LabTaskTrial {
        starts += 1
        let plan = returnWrongPlan ? LabTrialObservationPlan(question: request.observation_plan.question,
            success_metric: request.observation_plan.success_metric,
            guardrail_metric: request.observation_plan.guardrail_metric,
            minimum_samples: request.observation_plan.minimum_samples,
            stop_after_adverse_outcomes: request.observation_plan.stop_after_adverse_outcomes,
            sample_unit: "page_view", assignment_mode: request.observation_plan.assignment_mode,
            rollback: request.observation_plan.rollback, window_minutes: request.observation_plan.window_minutes)
            : request.observation_plan
        let value = LabTaskTrial(id: request.id, session_scope_id: sessionScope, task: request.task,
            model: returnWrongModel ? "substituted" : request.model, prompt_preset: request.prompt_preset,
            prompt_revision: "fixture-prompt", backend_revision: "fixture", status: "active", created_at: "fixture",
            expires_at: "fixture", scope: "this_authenticated_session", online_assignment: false,
            observation_plan: plan, stop_reason: nil)
        record = value
        if loseStart { throw URLError(.networkConnectionLost) }
        return value
    }
    func taskTrial(id: String) async throws -> LabTaskTrial {
        reads += 1
        guard let record, record.id == id else { throw TalentSignalLabClientError.invalidResponse }
        return record
    }
    func stopTaskTrial(id: String) async throws -> LabTaskTrial {
        stops += 1
        guard let current = record else { throw TalentSignalLabClientError.invalidResponse }
        record = .init(id: current.id, session_scope_id: current.session_scope_id, task: current.task, model: current.model,
            prompt_preset: current.prompt_preset, prompt_revision: current.prompt_revision, backend_revision: current.backend_revision,
            status: "stopped", created_at: current.created_at, expires_at: current.expires_at,
            scope: current.scope, online_assignment: false, observation_plan: current.observation_plan,
            stop_reason: "manual")
        throw URLError(.networkConnectionLost)
    }
}
