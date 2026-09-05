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
    private func temporaryDirectory() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent("regression-unit-" + UUID().uuidString) }
}

@MainActor
final class LabRegressionFixture: LabRegressionServing {
    let source: LabJobRecord
    let request: LabRegressionRequest
    let contentHash = String(repeating: "e", count: 64)
    var value: LabRegressionRecord?
    var saves = 0, deletes = 0
    var loseSave = false, loseDelete = false, wrongSource = false, gone = false
    init() throws {
        source = try LabJobFixture().record(status: "completed")
        request = .init(id: UUID().uuidString.lowercased(), source_job_id: source.id, source_attempt_id: source.attempts[0].id,
            source_definition_hash: source.definition_hash, failure_categories: ["missed_uncertainty"], expected_behavior: "Retain uncertainty", review_note: "review-only-marker")
    }
    func loadRegressions() async throws -> LabRegressionList { .init(contract_version: TalentSignalAPIContract.version, regressions: []) }
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
    func exportRegression(id: String) async throws -> Data { throw URLError(.unsupportedURL) }
}
