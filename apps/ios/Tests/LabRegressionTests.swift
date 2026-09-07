import XCTest
@testable import TalentSignal

@MainActor
final class LabRegressionTests: XCTestCase {
    func testLostSaveRecoversSameCaseAndErasesPendingReviewText() async throws {
        let fixture = try LabRegressionFixture(), directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = LabRegressionStore(service: fixture, scope: "owned", directory: directory)
        fixture.loseSave = true; await store.save(fixture.request)
        XCTAssertNotNil(store.pending); XCTAssertEqual(fixture.saves, 1)
        XCTAssertTrue(try String(contentsOf: directory.appendingPathComponent("recovery.json"), encoding: .utf8).contains("review-only-marker"))
        let resumed = LabRegressionStore(service: fixture, scope: "owned", directory: directory)
        await resumed.load()
        XCTAssertNil(resumed.pending); XCTAssertEqual(resumed.record?.id, fixture.request.id); XCTAssertEqual(fixture.saves, 1)
        XCTAssertFalse(try String(contentsOf: directory.appendingPathComponent("recovery.json"), encoding: .utf8).contains("review-only-marker"))
    }
    func testScopeMismatchCannotReplayPrivateReview() async throws {
        let fixture = try LabRegressionFixture(), directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = LabRegressionStore(service: fixture, scope: "original", directory: directory)
        fixture.loseSave = true; await store.save(fixture.request)
        let other = LabRegressionStore(service: fixture, scope: "other-account-or-environment", directory: directory)
        await other.load(); await other.save(fixture.request)
        XCTAssertEqual(fixture.saves, 1); XCTAssertNil(other.record); XCTAssertNotNil(other.error)
    }
    func testLostDeletionRecoversReceiptWithoutRevivingSnapshot() async throws {
        let fixture = try LabRegressionFixture(), directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = LabRegressionStore(service: fixture, scope: "owned", directory: directory)
        await store.save(fixture.request); fixture.loseDelete = true; await store.remove()
        XCTAssertNotNil(store.pending)
        let resumed = LabRegressionStore(service: fixture, scope: "owned", directory: directory)
        await resumed.load()
        XCTAssertNil(resumed.pending); XCTAssertNil(resumed.record); XCTAssertEqual(resumed.deletion?.status, "deleted")
        XCTAssertEqual(fixture.deletes, 2); XCTAssertEqual(fixture.saves, 1)
    }
    func testDifferentSourceCannotSatisfyPendingSaveAndGoneDoesNotRetry() async throws {
        let fixture = try LabRegressionFixture(), directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = LabRegressionStore(service: fixture, scope: "owned", directory: directory)
        fixture.wrongSource = true; await store.save(fixture.request)
        XCTAssertNil(store.record); XCTAssertNotNil(store.pending); XCTAssertNotNil(store.error)
        fixture.gone = true; await store.load(); await store.retry()
        XCTAssertNil(store.pending); XCTAssertNil(store.record); XCTAssertEqual(fixture.saves, 1)
    }
    func testRerunCannotAcceptAnOrdinaryBatchWithoutSourceBinding() async throws {
        let fixture = try LabJobFixture(), suite = "lab-regression-origin-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite)); defer { defaults.removePersistentDomain(forName: suite) }
        let store = LabJobStore(service: fixture, scope: "owned", defaults: defaults)
        await store.load()
        var request = fixture.request
        request.regression_source = .init(id: UUID().uuidString.lowercased(), content_hash: String(repeating: "c", count: 64))
        await store.start(request)
        XCTAssertNil(store.record); XCTAssertNotNil(store.pending); XCTAssertNotNil(store.error)
    }
    func testFailedPersistenceRequiresReadbackBeforeAnotherSave() async throws {
        let fixture = try LabRegressionFixture(), directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = LabRegressionStore(service: fixture, scope: "owned", directory: directory)
        let unavailableFile = directory.appendingPathComponent("recovery.json")
        try FileManager.default.createDirectory(at: unavailableFile, withIntermediateDirectories: true)
        await store.save(fixture.request)
        XCTAssertNotNil(store.error); XCTAssertEqual(fixture.saves, 0)
        try FileManager.default.removeItem(at: unavailableFile)
        await store.save(fixture.request)
        XCTAssertEqual(fixture.saves, 0)
        await store.load(); await store.save(fixture.request)
        XCTAssertEqual(fixture.saves, 1); XCTAssertEqual(store.record?.id, fixture.request.id)
    }
    func testFeedbackCaseLoadsFromLibraryAndRequiresAnExplicitCandidateChoice() async throws {
        let fixture = try LabRegressionFixture(), directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        try await fixture.installFeedbackCase()
        let store = LabRegressionStore(service: fixture, scope: "owned", directory: directory)
        await store.load()
        XCTAssertEqual(store.items.map(\.id), [fixture.request.id])
        await store.select(fixture.request.id)
        let snapshot = try XCTUnwrap(store.record?.snapshot)
        XCTAssertNil(store.error); XCTAssertTrue(snapshot.isFeedbackDevelopmentCase)
        XCTAssertEqual(snapshot.configurations.count, 1)
        let choices = snapshot.initialRerunConfigurations
        XCTAssertEqual(choices.count, 2)
        XCTAssertEqual(choices[0].prompt_preset, "baseline")
        XCTAssertEqual(choices[1].model, choices[0].model)
        XCTAssertEqual(choices[1].prompt_preset, "")
        let rerun = LabJobRequest(id: UUID().uuidString.lowercased(), catalog_revision: String(repeating: "c", count: 64),
            task: snapshot.task, case_ids: [snapshot.sample.id],
            configurations: [choices[0], .init(model: choices[1].model, prompt_preset: "concise")], repetitions: 1, call_limit: 2,
            regression_source: .init(id: fixture.request.id, content_hash: fixture.contentHash))
        XCTAssertEqual(rerun.configurations[1].prompt_preset, "concise")
        XCTAssertEqual(rerun.regression_source?.content_hash, fixture.contentHash)
        XCTAssertEqual(store.record?.snapshot.configurations.count, 1, "A new candidate must not fabricate original execution history")
    }
    func testPrivateFeedbackRequiresValidProposalAndOriginalExecutionBinding() async throws {
        let fixture = try LabRegressionFixture()
        try await fixture.installFeedbackCase()
        let original = try XCTUnwrap(fixture.value)
        let mutations: [(inout [String: Any]) -> Void] = [
            { $0.removeValue(forKey: "feedback_source") },
            { var source = $0["feedback_source"] as! [String: Any]; source["feedback_revision"] = 0; $0["feedback_source"] = source },
            { var source = $0["feedback_source"] as! [String: Any]; source["expectation_authority"] = "gold"; $0["feedback_source"] = source },
            { var source = $0["feedback_source"] as! [String: Any]; source["execution_authority"] = "write"; $0["feedback_source"] = source },
            { var source = $0["feedback_source"] as! [String: Any]; source["original_output_hash"] = "invalid"; $0["feedback_source"] = source },
            { var source = $0["feedback_source"] as! [String: Any]; source["execution_id"] = UUID().uuidString.lowercased(); $0["feedback_source"] = source },
            { $0["source_job_id"] = UUID().uuidString.lowercased() },
            { $0["configurations"] = [] },
            { var sample = $0["case"] as! [String: Any]; sample["partition"] = "holdout"; $0["case"] = sample }
        ]
        for mutation in mutations {
            fixture.value = original
            try fixture.editSnapshot(mutation)
            let directory = temporaryDirectory()
            let store = LabRegressionStore(service: fixture, scope: "owned", directory: directory)
            await store.select(fixture.request.id)
            XCTAssertNil(store.record); XCTAssertNotNil(store.error)
            try? FileManager.default.removeItem(at: directory)
        }
    }
    func testFeedbackRefreshCannotSubstituteRevisionOrFrozenInputUnderSameHash() async throws {
        let fixture = try LabRegressionFixture(), directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        try await fixture.installFeedbackCase()
        let original = try XCTUnwrap(fixture.value)
        let store = LabRegressionStore(service: fixture, scope: "owned", directory: directory)
        await store.select(fixture.request.id)
        try fixture.editSnapshot { snapshot in
            var source = snapshot["feedback_source"] as! [String: Any]
            source["feedback_revision"] = 2; snapshot["feedback_source"] = source
        }
        await store.load()
        XCTAssertEqual(store.record?.snapshot.feedback_source?.feedback_revision, 1); XCTAssertNotNil(store.error)
        fixture.value = original
        try fixture.editSnapshot { snapshot in
            var sample = snapshot["case"] as! [String: Any]
            sample["input_json"] = "{\"substituted\":true}"; snapshot["case"] = sample
        }
        await store.load()
        XCTAssertEqual(store.record?.snapshot.sample.input_json, original.snapshot.sample.input_json); XCTAssertNotNil(store.error)
    }
    func testPrivateExportBindsFrozenSnapshotAndIsClearedWhenSourceIsGone() async throws {
        let fixture = try LabRegressionFixture(), directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        try await fixture.installFeedbackCase()
        let store = LabRegressionStore(service: fixture, scope: "owned", directory: directory)
        await store.select(fixture.request.id); await store.prepareExport()
        let exported = try JSONDecoder().decode(LabRegressionExport.self, from: XCTUnwrap(store.exportData))
        XCTAssertEqual(exported.snapshot.data_class, "private_business")
        XCTAssertEqual(exported.snapshot.feedback_source?.feedback_revision, 1)
        XCTAssertEqual(exported.snapshot.configurations.count, 1)
        try fixture.editSnapshot { $0["expected_behavior"] = "Changed proposal under the same snapshot hash" }
        await store.prepareExport()
        XCTAssertNil(store.exportData); XCTAssertNotNil(store.error)
        fixture.gone = true; await store.load(); await store.retry()
        XCTAssertNil(store.record); XCTAssertNil(store.exportData); XCTAssertNil(store.pending)
        XCTAssertEqual(fixture.saves, 1)
    }
    func testLibraryHashCannotBeSubstitutedWhenOpeningFeedbackCase() async throws {
        let fixture = try LabRegressionFixture(), directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        try await fixture.installFeedbackCase(); fixture.listHash = String(repeating: "f", count: 64)
        let store = LabRegressionStore(service: fixture, scope: "owned", directory: directory)
        await store.select(fixture.request.id)
        XCTAssertNil(store.record); XCTAssertNotNil(store.error)
    }
    private func temporaryDirectory() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent("regression-unit-" + UUID().uuidString) }
}

@MainActor
final class LabRegressionFixture: LabRegressionServing {
    let source: LabJobRecord
    let request: LabRegressionRequest
    let contentHash = String(repeating: "e", count: 64)
    var value: LabRegressionRecord?
    var listHash: String?
    var saves = 0, deletes = 0
    var loseSave = false, loseDelete = false, wrongSource = false, gone = false
    init() throws {
        source = try LabJobFixture().record(status: "completed")
        request = .init(id: UUID().uuidString.lowercased(), source_job_id: source.id, source_attempt_id: source.attempts[0].id,
            source_definition_hash: source.definition_hash, failure_categories: ["missed_uncertainty"], expected_behavior: "Retain uncertainty", review_note: "review-only-marker")
    }
    func loadRegressions() async throws -> LabRegressionList {
        .init(contract_version: TalentSignalAPIContract.version, regressions: value.map { record in
            [.init(id: record.id, content_hash: listHash ?? record.content_hash, title: record.snapshot.sample.title,
                failure_categories: record.snapshot.failure_categories, created_at: record.created_at,
                expires_at: record.expires_at, release_check: record.release_check)]
        } ?? [])
    }
    func installFeedbackCase() async throws {
        _ = try await saveRegression(request)
        try editSnapshot { snapshot in
            snapshot["data_class"] = "private_business"; snapshot["task"] = "relationship_text"
            snapshot["configurations"] = Array((snapshot["configurations"] as! [[String: Any]]).prefix(1))
            snapshot["feedback_source"] = ["feedback_id": UUID().uuidString.lowercased(), "feedback_revision": 1,
                "execution_id": source.attempts[0].id, "original_task_id": source.id,
                "original_output_hash": String(repeating: "d", count: 64), "expectation_authority": "proposal", "execution_authority": "none"]
        }
    }
    func editSnapshot(_ edit: (inout [String: Any]) -> Void) throws {
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(XCTUnwrap(value))) as! [String: Any]
        var snapshot = object["snapshot"] as! [String: Any]
        edit(&snapshot); object["snapshot"] = snapshot
        value = try JSONDecoder().decode(LabRegressionRecord.self, from: JSONSerialization.data(withJSONObject: object))
    }
    func saveRegression(_ request: LabRegressionRequest) async throws -> LabRegressionRecord {
        saves += 1
        let snapshot = LabRegressionSnapshot(schema_version: "lab-regression.v1", data_class: "registered_synthetic",
            source_job_id: wrongSource ? UUID().uuidString.lowercased() : source.id, source_definition_hash: source.definition_hash,
            source_attempt: source.attempts[0], sample: source.definition.cases[0], configurations: source.definition.configurations,
            reference_time: source.definition.reference_time, backend_revision: nil, instrument_revision: "fixture", failure_categories: request.failure_categories,
            expected_behavior: request.expected_behavior, review_note: request.review_note, reviewer_id: UUID().uuidString.lowercased(), reviewed_at: "2026-09-04T00:00:00Z")
        let record = LabRegressionRecord(id: request.id, content_hash: contentHash, snapshot: snapshot, created_at: "2026-09-04T00:00:00Z", expires_at: "2026-12-03T00:00:00Z", release_check: "not_connected", reruns: [])
        value = record
        if loseSave { throw URLError(.networkConnectionLost) }
        return record
    }
    func regression(id: String) async throws -> LabRegressionRecord {
        if gone { throw TalentSignalLabClientError.backend(status: 410, code: "GONE", message: "Removed") }
        guard let value else { throw TalentSignalLabClientError.backend(status: 404, code: "MISSING", message: "Not found") }
        return value
    }
    func deleteRegression(id: String) async throws -> LabRegressionDeletion {
        deletes += 1; gone = true; value = nil
        if loseDelete { loseDelete = false; throw URLError(.networkConnectionLost) }
        return .init(contract_version: TalentSignalAPIContract.version, id: id, content_hash: contentHash, status: "deleted", deleted_at: "2026-09-04T00:00:00Z", affected_job_ids: [])
    }
    func exportRegression(id: String) async throws -> Data {
        let record = try await regression(id: id)
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(record)) as! [String: Any]
        object["schema_version"] = "lab-regression-bundle.v1"; object["execution_authority"] = "none"
        return try JSONSerialization.data(withJSONObject: object)
    }
}
