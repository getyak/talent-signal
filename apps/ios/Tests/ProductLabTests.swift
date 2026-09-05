import XCTest
@testable import TalentSignal

@MainActor
final class ProductLabTests: XCTestCase {
    func testLostStartResponseRecoversWithoutAnotherModelRequest() async throws {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let service = ExperimentTestService()
        let first = LabExperimentStore(service: service, scope: "environment-a|account-a", defaults: defaults)
        await first.load()
        await first.start(caseID: "conflict", models: ["glm-a", "glm-b"])
        XCTAssertNotNil(first.pendingRequest)
        XCTAssertEqual(service.starts, 1)

        let restored = LabExperimentStore(service: service, scope: "environment-a|account-a", defaults: defaults)
        await restored.load()
        XCTAssertEqual(restored.record?.id, first.pendingRequest?.id)
        XCTAssertNil(restored.pendingRequest)
        XCTAssertEqual(service.starts, 1)
        let different = LabExperimentStore(service: service, scope: "environment-b|account-a", defaults: defaults)
        XCTAssertNil(different.pendingRequest)
    }

    func testUnverifiedRunDoesNotClearRecovery() async {
        let service = ExperimentTestService()
        service.badModel = true
        let store = LabExperimentStore(service: service, scope: "isolated", defaults: UserDefaults(suiteName: UUID().uuidString)!)
        await store.load()
        await store.start(caseID: "conflict", models: ["glm-a", "glm-b"])
        await store.refreshRun()
        XCTAssertNotNil(store.pendingRequest)
        XCTAssertNil(store.record)
        XCTAssertNotNil(store.error)
    }

    func testCacheClearOnlyRemovesSuppliedURLCache() async throws {
        let cache = URLCache(memoryCapacity: 100_000, diskCapacity: 0)
        let url = URL(string: "https://example.test/synthetic")!
        let request = URLRequest(url: url)
        cache.storeCachedResponse(CachedURLResponse(response: URLResponse(url: url, mimeType: "text/plain", expectedContentLength: 5, textEncodingName: nil), data: Data("cache".utf8)), for: request)
        XCTAssertNotNil(cache.cachedResponse(for: request))
        let device = DeviceLabStore(cache: cache)
        await device.clearCache()
        XCTAssertNil(cache.cachedResponse(for: request))
        XCTAssertEqual(device.cacheAfterClear, 0)
    }

    func testExpiredRecoveryAllowsAFreshExplicitExperiment() async {
        let service = ExperimentTestService()
        let store = LabExperimentStore(service: service, scope: "expired", defaults: UserDefaults(suiteName: UUID().uuidString)!)
        await store.load()
        await store.start(caseID: "conflict", models: ["glm-a", "glm-b"])
        service.expired = true
        await store.refreshRun()
        XCTAssertNil(store.pendingRequest)
        XCTAssertFalse(store.canResubmit)
        XCTAssertNotNil(store.error)
        XCTAssertEqual(service.starts, 1)
    }

    func testOnboardingReplayKeepsAnIndependentState() throws {
        let first = LabOnboardingMemoryStore()
        let second = LabOnboardingMemoryStore()
        var state = StandaloneOnboardingState.fresh()
        state.startFirstProgressExample()
        try first.save(state)
        XCTAssertEqual(try first.load()?.route, .proposalReview)
        XCTAssertNil(try second.load())
        try first.reset()
        XCTAssertNil(try first.load())
    }
}

@MainActor
private final class ExperimentTestService: LabExperimentServing {
    var starts = 0
    var request: LabExperimentRequest?
    var badModel = false
    var expired = false
    func loadExperiments() async throws -> LabExperimentCatalog {
        LabExperimentCatalog(contract_version: TalentSignalAPIContract.version, enabled: true, backend_revision: nil,
            provider: "zhipu-chat-completions", prompt_version: "test", models: ["glm-a", "glm-b"],
            cases: [LabExperimentCase(id: "conflict", title: "Conflict", input: "Synthetic", expected: "Clarify")], experiments: [])
    }
    func startExperiment(_ body: LabExperimentRequest) async throws -> LabExperimentRecord {
        starts += 1
        request = body
        throw URLError(.networkConnectionLost)
    }
    func experiment(id: String) async throws -> LabExperimentRecord {
        if expired { throw TalentSignalLabClientError.backend(status: 410, code: "LAB_EXPERIMENT_EXPIRED", message: "Expired") }
        guard let request else { throw TalentSignalLabClientError.invalidResponse }
        return LabExperimentRecord(id: request.id, case_id: request.case_id, case_revision: "test", snapshot_hash: "test",
            prompt_version: "test", backend_revision: nil, models: request.models, status: "completed",
            results: request.models.map { model in LabModelResult(model: badModel ? "substituted" : model, status: "completed", duration_ms: 12,
                answer: "Synthetic", title: "Test", kind: "clarification", citation_ids: [], provider_request_id: nil,
                input_tokens: nil, output_tokens: nil, error_code: nil) }, review: "unreviewed", created_at: "test", expires_at: "test",
            provider_call_limit: 2, business_write_count: 0, cost_status: "unavailable")
    }
    func reviewExperiment(id: String, review: String) async throws -> LabExperimentRecord { try await experiment(id: id) }
}
