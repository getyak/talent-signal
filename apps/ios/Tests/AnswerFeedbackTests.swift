import Foundation
import XCTest
import SwiftUI
@testable import TalentSignal

@MainActor
final class AnswerFeedbackTests: XCTestCase {
    func testResponseLossRetriesSameMutationThenReadsSavedState() async throws {
        let service = FeedbackFixture()
        let editor = makeEditor(service)
        await editor.load { true }
        editor.proposal = "Use only the cited date."
        service.loseReadbackOnce = true
        await editor.save()
        XCTAssertFalse(editor.verified)
        XCTAssertTrue(editor.hasPending)
        XCTAssertFalse(editor.canEdit)
        XCTAssertNil(editor.record)
        await editor.save()
        XCTAssertTrue(editor.verified)
        XCTAssertFalse(editor.hasPending)
        XCTAssertEqual(service.submissions.count, 2)
        XCTAssertEqual(service.submissions[0].idempotencyKey, service.submissions[1].idempotencyKey)
        XCTAssertEqual(editor.record?.revision, 1)
        XCTAssertEqual(service.writeCount, 1)
    }

    func testConflictRequiresFreshSourceBeforeEditing() async {
        let service = FeedbackFixture()
        let editor = makeEditor(service)
        await editor.load { true }
        service.conflict = true
        await editor.save()
        XCTAssertFalse(editor.canEdit)
        XCTAssertNil(editor.source)
        XCTAssertFalse(editor.hasPending)
        service.conflict = false
        await editor.load { true }
        XCTAssertTrue(editor.canEdit)
    }

    func testUnavailableSourceAllowsWithdrawalButNeverNewCorrection() async {
        let service = FeedbackFixture()
        let editor = makeEditor(service)
        await editor.load { true }
        await editor.save()
        service.sourceState = "source_deleted"
        await editor.load { true }
        XCTAssertFalse(editor.canEdit)
        XCTAssertTrue(editor.canWithdraw)
        await editor.save(withdraw: true)
        XCTAssertTrue(editor.verified)
        XCTAssertEqual(editor.record?.status, "withdrawn")
        XCTAssertEqual(service.submissions.last?.operation, "withdraw")
    }

    func testWrongOutputReadbackCannotBeShownAsSaved() async {
        let service = FeedbackFixture()
        let editor = makeEditor(service)
        await editor.load { true }
        service.wrongReadback = true
        await editor.save()
        XCTAssertFalse(editor.verified)
        XCTAssertNil(editor.record)
        XCTAssertFalse(editor.canEdit)
    }

    func testDeletedSessionEndpointDoesNotPreventSavedFeedbackWithdrawal() async {
        let service = FeedbackFixture()
        let editor = makeEditor(service)
        await editor.load { true }
        await editor.save()
        service.sourceGone = true
        await editor.load { true }
        XCTAssertNil(editor.source)
        XCTAssertTrue(editor.canWithdraw)
        await editor.save(withdraw: true)
        XCTAssertEqual(editor.record?.status, "withdrawn")
    }

    func testSyncFailureAndDifferentTaskPreventSubmission() async {
        let service = FeedbackFixture()
        let editor = makeEditor(service)
        await editor.load { false }
        await editor.save()
        XCTAssertTrue(service.submissions.isEmpty)
        service.taskID = UUID().uuidString
        await editor.load { true }
        await editor.save()
        XCTAssertFalse(editor.canEdit)
        XCTAssertTrue(service.submissions.isEmpty)
    }

    func testRetryIDsAreUnambiguousAndStable() {
        XCTAssertEqual(AnswerFeedbackMutation.stableID(["one", "two"]), AnswerFeedbackMutation.stableID(["one", "two"]))
        XCTAssertNotEqual(AnswerFeedbackMutation.stableID(["a", "bc"]), AnswerFeedbackMutation.stableID(["ab", "c"]))
    }

    func testIdempotentNetworkReplaySupersededByAnotherDeviceCanReload() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FeedbackURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel(); FeedbackURLProtocol.handler = nil }
        let sessionID = UUID(), turnID = UUID(), executionID = UUID(), id = UUID()
        let client = AnswerFeedbackClient(baseURL: URL(string: "https://example.invalid")!, bearerToken: "synthetic", session: network)
        let mutation = AnswerFeedbackMutation(idempotencyKey: UUID(), expectedRevision: 0,
            sessionID: sessionID, turnID: turnID, expectedSessionRevision: 1, executionID: executionID,
            outputHash: String(repeating: "a", count: 64), operation: "submit", category: .factError, expectedBehaviorProposal: "Check date")
        var requests = 0
        FeedbackURLProtocol.handler = { request in
            requests += 1
            XCTAssertEqual(request.httpMethod, "PUT")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer synthetic")
            XCTAssertEqual(request.url?.path, "/v1/feedback/\(id.uuidString.lowercased())")
            if requests == 1 { throw URLError(.networkConnectionLost) }
            // Same idempotency key, but another device has already withdrawn rev 1.
            return try JSONSerialization.data(withJSONObject: ["contract_version": TalentSignalAPIContract.version,
                "feedback": ["id": id.uuidString, "revision": 2, "session_id": sessionID.uuidString,
                    "turn_id": turnID.uuidString, "execution_id": executionID.uuidString,
                    "output_hash": String(repeating: "a", count: 64), "source_state": "available",
                    "category": "fact_error", "status": "withdrawn", "expected_behavior_proposal": NSNull(), "adjudication": "proposed"]])
        }
        do { _ = try await client.submit(id: id, mutation: mutation); XCTFail("Expected lost response") }
        catch is URLError { }
        do { _ = try await client.submit(id: id, mutation: mutation); XCTFail("Expected authoritative reload") }
        catch AnswerFeedbackError.conflict { }
        XCTAssertEqual(requests, 2)
    }

    func testDraftChangeClearsVerifiedState() async {
        let editor = makeEditor(FeedbackFixture())
        await editor.load { true }
        await editor.save()
        XCTAssertTrue(editor.verified)
        editor.proposal = "This is not yet saved."
        XCTAssertFalse(editor.verified)
        XCTAssertTrue(editor.hasUnsavedDraft)
    }

    func testCorrectionSheetRendersInChineseWithLargeText() async throws {
        let editor = makeEditor(FeedbackFixture())
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let previous = scene.windows.first { $0.isKeyWindow }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = UIHostingController(rootView: AnswerFeedbackSheet(editor: editor, synchronize: { true })
            .environment(\.appLanguage, .simplifiedChinese).dynamicTypeSize(.accessibility2))
        window.makeKeyAndVisible()
        defer { window.isHidden = true; previous?.makeKeyAndVisible() }
        // Hosting and SwiftUI's .task are scheduled asynchronously. Wait for
        // the canonical source, rather than assuming a CI frame-time budget.
        let deadline = ContinuousClock.now.advanced(by: .seconds(10))
        while !editor.canEdit, editor.error == nil, ContinuousClock.now < deadline {
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertTrue(editor.canEdit, editor.error?.localizedDescription ?? "The hosted feedback sheet did not load its source.")
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        let attachment = XCTAttachment(image: image)
        attachment.name = "get11-correction-zh-large-text"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func makeEditor(_ service: FeedbackFixture) -> AnswerFeedbackEditor {
        AnswerFeedbackEditor(client: service, sessionID: service.sessionID, turnID: service.turnID, taskID: service.taskID)
    }
}

private final class FeedbackURLProtocol: URLProtocol, @unchecked Sendable {
    static var handler: ((URLRequest) throws -> Data)?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let data = try Self.handler!(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

private final class FeedbackFixture: AnswerFeedbackServing {
    let sessionID = UUID(), turnID = UUID(), executionID = UUID()
    var taskID = UUID().uuidString, sourceState = "available"
    var loseReadbackOnce = false, conflict = false, wrongReadback = false
    var sourceGone = false
    var submissions: [AnswerFeedbackMutation] = [], writeCount = 0
    var saved: AnswerFeedbackRecord?
    private var keys = Set<UUID>()
    func source(sessionID: UUID, turnID: UUID) async throws -> AnswerFeedbackSource {
        if sourceGone { throw AnswerFeedbackError.unavailable }
        return AnswerFeedbackSource(sessionID: self.sessionID, turnID: self.turnID, sessionRevision: 1,
            taskID: taskID, executionID: executionID, outputHash: String(repeating: "a", count: 64), sourceState: sourceState)
    }
    func list(sessionID: UUID, turnID: UUID) async throws -> [AnswerFeedbackRecord] { saved.map { [$0] } ?? [] }
    func submit(id: UUID, mutation: AnswerFeedbackMutation) async throws -> AnswerFeedbackRecord {
        submissions.append(mutation)
        if conflict { throw AnswerFeedbackError.conflict }
        if keys.insert(mutation.idempotencyKey).inserted {
            writeCount += 1
            saved = AnswerFeedbackRecord(id: id, revision: mutation.expectedRevision + 1,
                sessionID: sessionID, turnID: turnID, executionID: executionID, outputHash: mutation.outputHash,
                sourceState: sourceState, category: mutation.category,
                status: mutation.operation == "withdraw" ? "withdrawn" : "active",
                expectedBehaviorProposal: mutation.operation == "withdraw" ? nil : mutation.expectedBehaviorProposal,
                adjudication: "proposed")
        }
        return saved!
    }
    func read(id: UUID) async throws -> AnswerFeedbackRecord {
        if loseReadbackOnce { loseReadbackOnce = false; throw URLError(.networkConnectionLost) }
        let record = saved!
        if wrongReadback {
            return AnswerFeedbackRecord(id: record.id, revision: record.revision,
                sessionID: record.sessionID, turnID: record.turnID, executionID: record.executionID,
                outputHash: String(repeating: "b", count: 64), sourceState: record.sourceState,
                category: record.category, status: record.status, expectedBehaviorProposal: record.expectedBehaviorProposal,
                adjudication: "proposed")
        }
        return record
    }
}
