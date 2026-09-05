import XCTest
@testable import TalentSignal

@MainActor
final class LabCITests: XCTestCase {
    func testRunInputRejectsForeignRepositoryCredentialsAndMalformedIDs() {
        let repository = "getyak/talent-signal"
        XCTAssertEqual(LabCIInput.runID(" 123 ", repository: repository), 123)
        XCTAssertEqual(LabCIInput.runID("https://github.com/getyak/talent-signal/actions/runs/123", repository: repository), 123)
        for input in ["0", "-1", "9007199254740992", "https://github.com/other/repo/actions/runs/123", "https://github.com@evil.example/getyak/talent-signal/actions/runs/123", "https://github.com/getyak/talent-signal/actions/runs/123?token=private", "https://github.com/getyak/talent-signal/actions/runs/123/attempts/2"] {
            XCTAssertNil(LabCIInput.runID(input, repository: repository), input)
        }
    }
    func testLostResponseRecoversSameReceiptAfterRelaunch() async throws {
        let fixture = try await fixture(), directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = LabCIStore(service: fixture, scope: "owned", directory: directory)
        fixture.loseResponse = true
        await store.verify(record: fixture.record, jobID: fixture.runID, runID: 123)
        let operationID = try XCTUnwrap(store.pending?.request.id)
        XCTAssertEqual(fixture.calls, 1)
        let resumed = LabCIStore(service: fixture, scope: "owned", directory: directory)
        await resumed.recover()
        XCTAssertNil(resumed.pending); XCTAssertEqual(resumed.receipt?.id, operationID); XCTAssertEqual(fixture.calls, 1)
        XCTAssertFalse(try String(contentsOf: directory.appendingPathComponent("verification.json"), encoding: .utf8).contains(operationID))
    }
    func testWrongReceiptCannotSatisfyRequestAndNotFoundRetryKeepsID() async throws {
        let fixture = try await fixture(), directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = LabCIStore(service: fixture, scope: "owned", directory: directory)
        fixture.wrongRun = true
        await store.verify(record: fixture.record, jobID: fixture.runID, runID: 123)
        let id = try XCTUnwrap(store.pending?.request.id)
        XCTAssertNil(store.receipt); XCTAssertNotNil(store.error)
        fixture.value = nil; fixture.wrongRun = false
        await store.recover(); XCTAssertTrue(store.canRetry)
        await store.retry(); XCTAssertEqual(store.receipt?.id, id); XCTAssertEqual(fixture.calls, 2)
    }
    func testScopeMismatchAndDeletionCannotReplayProof() async throws {
        let fixture = try await fixture(), directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let original = LabCIStore(service: fixture, scope: "owned", directory: directory)
        fixture.loseResponse = true; await original.verify(record: fixture.record, jobID: fixture.runID, runID: 123)
        let other = LabCIStore(service: fixture, scope: "different-runtime-or-user", directory: directory)
        await other.recover(); await other.verify(record: fixture.record, jobID: fixture.runID, runID: 123)
        XCTAssertEqual(fixture.calls, 1); XCTAssertNil(other.receipt); XCTAssertNotNil(other.error)
        fixture.gone = true; await original.recover(); await original.retry()
        XCTAssertNil(original.pending); XCTAssertNil(original.receipt); XCTAssertEqual(fixture.calls, 1)
    }
    func testUnprovenReleaseFlagRejectedButVerifiedFailedChecksRemainDistinct() async throws {
        let fixture = try await fixture()
        func record(status: String, ci: LabCIState?) -> LabRegressionRecord {
            let r = fixture.record
            return .init(id: r.id, content_hash: r.content_hash, snapshot: r.snapshot, created_at: r.created_at,
                         expires_at: r.expires_at, release_check: status, reruns: r.reruns, ci: ci)
        }
        XCTAssertFalse(LabCIInput.releaseStatusIsValid(record(status: "ci_verified", ci: nil)))
        fixture.integrity = "fail"
        let receipt = try await fixture.verifyCI(regressionID: fixture.record.id, request: .init(id: UUID().uuidString.lowercased(), regression_content_hash: fixture.record.content_hash, job_id: fixture.runID, github_run_id: 123))
        XCTAssertTrue(LabCIInput.releaseStatusIsValid(record(status: "ci_verified", ci: .init(available: true, repository: fixture.repository, latest: receipt))))
        XCTAssertEqual(receipt.integrity, "fail"); XCTAssertEqual(receipt.quality, "needs_review"); XCTAssertEqual(receipt.release_enforcement, "not_verified")
        XCTAssertFalse(LabCIInput.releaseStatusIsValid(record(status: "ci_verified", ci: .init(available: false, repository: nil, latest: receipt))))
        XCTAssertTrue(LabCIInput.releaseStatusIsValid(record(status: "ci_needs_refresh", ci: .init(available: false, repository: nil, latest: receipt))))
    }
    private func fixture() async throws -> LabCIFixture {
        let source = try LabRegressionFixture(), saved = try await source.saveRegression(source.request), runID = UUID().uuidString.lowercased()
        let run = LabJobSummary(id: runID, status: "completed", created_at: saved.created_at, expires_at: saved.expires_at,
                               case_count: 1, repetitions: 1, planned_calls: 2, calls_reserved: 2, models: ["glm-5.3"], review: "unreviewed")
        let record = LabRegressionRecord(id: saved.id, content_hash: saved.content_hash, snapshot: saved.snapshot,
            created_at: saved.created_at, expires_at: saved.expires_at, release_check: "not_connected", reruns: [run],
            ci: .init(available: true, repository: "getyak/talent-signal", latest: nil))
        return LabCIFixture(record: record, runID: runID)
    }
    private func temporaryDirectory() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent("ci-unit-" + UUID().uuidString) }
}

@MainActor
private final class LabCIFixture: LabCIVerificationServing {
    let record: LabRegressionRecord
    let runID: String
    let repository = "getyak/talent-signal"
    var calls = 0, loseResponse = false, wrongRun = false, gone = false
    var integrity = "pass"
    var value: LabCIReceipt?
    init(record: LabRegressionRecord, runID: String) { self.record = record; self.runID = runID }
    func verifyCI(regressionID: String, request: LabCIRequest) async throws -> LabCIReceipt {
        calls += 1
        let time = ISO8601DateFormatter(), now = Date()
        let receipt = LabCIReceipt(id: request.id, regression_id: regressionID, regression_content_hash: request.regression_content_hash,
            job_id: wrongRun ? UUID().uuidString.lowercased() : request.job_id, state: "verified", reason_code: "LAB_CI_VERIFIED",
            checked_at: time.string(from: now), valid_until: time.string(from: now.addingTimeInterval(900)), repository: repository,
            trust_digest: "sha256:" + String(repeating: "a", count: 64), github_run_id: request.github_run_id, github_run_attempt: 2,
            github_job_id: 456, artifact_id: 789, artifact_digest: "sha256:" + String(repeating: "b", count: 64),
            report_digest: "sha256:" + String(repeating: "c", count: 64), source_revision: String(repeating: "d", count: 40), backend_revision: nil,
            workflow_conclusion: integrity == "pass" ? "success" : "failure", job_conclusion: integrity == "pass" ? "success" : "failure",
            integrity: integrity, quality: "needs_review", release_enforcement: "not_verified")
        value = receipt
        if loseResponse { throw URLError(.networkConnectionLost) }
        return receipt
    }
    func ciVerification(regressionID: String, id: String) async throws -> LabCIReceipt {
        if gone { throw TalentSignalLabClientError.backend(status: 410, code: "GONE", message: "Removed") }
        guard let value else { throw TalentSignalLabClientError.backend(status: 404, code: "MISSING", message: "Not found") }
        return value
    }
}
