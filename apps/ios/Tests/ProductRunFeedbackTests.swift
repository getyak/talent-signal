import XCTest
@testable import TalentSignal

@MainActor final class ProductRunFeedbackTests: XCTestCase {
    func testConflictRetryKeepsOriginalHelpfulIntent() async {
        let service = RunFeedbackFixture()
        let editor = ProductRunFeedbackEditor(client: service, taskID: service.taskID)
        await editor.load()
        service.hash = "new-version"
        XCTAssertFalse(awaitResult: await editor.save("helpful"))
        XCTAssertEqual(editor.pending?.sentiment, "helpful")
        XCTAssertEqual(editor.pending?.output_hash, "new-version")
        XCTAssertTrue(awaitResult: await editor.save(editor.sentiment, retry: true))
        XCTAssertEqual(editor.sentiment, "helpful")
    }
    func testLostResponseRetriesSameIDAndRestoresSavedNotes() async {
        let service = RunFeedbackFixture()
        let editor = ProductRunFeedbackEditor(client: service, taskID: service.taskID)
        await editor.load(); service.loseOnce = true
        XCTAssertFalse(awaitResult: await editor.save("unhelpful"))
        let id = editor.pending?.idempotency_key
        XCTAssertTrue(awaitResult: await editor.save(editor.sentiment, retry: true))
        XCTAssertEqual(service.ids, [id!,id!]); XCTAssertEqual(service.revision,1)
        editor.comment = "The date is tentative"
        XCTAssertTrue(awaitResult: await editor.save(editor.sentiment, notes:true))
        let restored = ProductRunFeedbackEditor(client:service,taskID:service.taskID);await restored.load()
        XCTAssertEqual(restored.comment,editor.comment)
        XCTAssertTrue(awaitResult: await restored.save(nil));XCTAssertNil(restored.sentiment)
    }
    // Evaluate asynchronous results before calling XCTest's synchronous autoclosure.
    private func XCTAssertTrue(awaitResult: Bool) { XCTAssert(awaitResult) }
    private func XCTAssertFalse(awaitResult: Bool) { XCTAssert(!awaitResult) }
}
@MainActor private final class RunFeedbackFixture: AnswerFeedbackServing {
    let taskID=UUID().uuidString
    var hash="original",revision=0, sentiment:String?, comment="", loseOnce=false
    var ids:[String]=[];var saved:Set<String>=[]
    func productRun(taskID:String) async throws -> ProductRunFeedbackDetail {
        .init(contract_version:TalentSignalAPIContract.version,run:.init(id:UUID().uuidString,task_id:taskID,output_hash:hash,
            feedback:.init(revision:revision,sentiment:sentiment,reasons:[],comment:comment,correction:"",selected_text:""),content_available:true))
    }
    func react(taskID:String,request:ProductRunFeedbackRequest) async throws -> ProductRunFeedbackDetail {
        ids.append(request.idempotency_key)
        if !saved.contains(request.idempotency_key) {
            guard request.output_hash==hash,request.expected_revision==revision else { throw AnswerFeedbackError.conflict }
            saved.insert(request.idempotency_key);revision+=1;sentiment=request.sentiment;comment=request.comment
        }
        if loseOnce {loseOnce=false;throw AnswerFeedbackError.unavailable}
        return try await productRun(taskID:taskID)
    }
    func source(sessionID:UUID,turnID:UUID) async throws -> AnswerFeedbackSource {throw AnswerFeedbackError.unavailable}
    func list(sessionID:UUID,turnID:UUID) async throws -> [AnswerFeedbackRecord] {[]}
    func submit(id:UUID,mutation:AnswerFeedbackMutation) async throws -> AnswerFeedbackRecord {throw AnswerFeedbackError.unavailable}
    func read(id:UUID) async throws -> AnswerFeedbackRecord {throw AnswerFeedbackError.unavailable}
}
