import XCTest
@testable import TalentSignal

final class RelationshipAskOperationStateTests: XCTestCase {
    func testSubmissionLifecycleReturnsVisibleStateToIdle() {
        var state = RelationshipAskOperationState()

        state.beginSubmission(objective: "Review the new evidence")
        state.adoptScopedSend(
            objective: "Review the new evidence",
            recallPhase: .reading(nil)
        )
        XCTAssertTrue(
            state.transitionAskSubmissionPhase(to: .requestingWorkspaceAnswer)
        )

        XCTAssertTrue(state.isSending)
        XCTAssertEqual(state.pendingObjective, "Review the new evidence")
        XCTAssertEqual(state.pendingScopedSend, "Review the new evidence")
        XCTAssertEqual(state.relationshipRecallPhase, .reading(nil))
        XCTAssertEqual(state.askSubmissionPhase, .requestingWorkspaceAnswer)

        XCTAssertTrue(state.returnToIdle())
        XCTAssertFalse(state.isSending)
        XCTAssertNil(state.pendingObjective)
        XCTAssertNil(state.pendingScopedSend)
        XCTAssertEqual(state.relationshipRecallPhase, .idle)
        XCTAssertEqual(state.askSubmissionPhase, .idle)
        XCTAssertFalse(state.returnToIdle())
    }

    func testReplacingOperationCancelsThePriorTask() async {
        let priorStarted = expectation(description: "prior task started")
        let priorCancelled = expectation(description: "prior task cancelled")
        let prior = Task {
            priorStarted.fulfill()
            while !Task.isCancelled {
                await Task.yield()
            }
            priorCancelled.fulfill()
        }
        var state = RelationshipAskOperationState()
        var createdPriorID: UUID?
        let priorID = state.replaceOperation { operationID in
            createdPriorID = operationID
            return prior
        }
        XCTAssertEqual(createdPriorID, priorID)
        XCTAssertTrue(state.isCurrentOperation(priorID))
        await fulfillment(of: [priorStarted], timeout: 1)

        let replacement = Task<Void, Never> {}
        var priorWasCancelledBeforeReplacementCreation = false
        let replacementID = state.replaceOperation { _ in
            priorWasCancelledBeforeReplacementCreation = prior.isCancelled
            return replacement
        }

        await fulfillment(of: [priorCancelled], timeout: 1)
        XCTAssertTrue(priorWasCancelledBeforeReplacementCreation)
        XCTAssertTrue(prior.isCancelled)
        XCTAssertFalse(replacement.isCancelled)
        XCTAssertFalse(state.finishOperationIfCurrent(priorID))
        XCTAssertTrue(state.isCurrentOperation(replacementID))
        XCTAssertNotNil(state.askOperation)
        state.cancelOperation()
        XCTAssertTrue(replacement.isCancelled)
        XCTAssertNil(state.askOperation)
        XCTAssertNil(state.operationID)
    }

    func testOnlyCurrentOperationCanReleaseOwnership() {
        var state = RelationshipAskOperationState()
        let stale = UUID()
        let current = state.replaceOperation { _ in Task {} }

        XCTAssertFalse(state.finishOperationIfCurrent(stale))
        XCTAssertEqual(state.operationID, current)
        XCTAssertNotNil(state.askOperation)

        XCTAssertTrue(state.finishOperationIfCurrent(current))
        XCTAssertNil(state.operationID)
        XCTAssertNil(state.askOperation)
    }

    func testStaleCompletionCannotResetReplacementVisibleState() {
        var state = RelationshipAskOperationState()
        state.beginSubmission(objective: "First objective")
        let staleID = state.replaceOperation { _ in Task {} }

        state.beginSubmission(objective: "Replacement objective")
        state.adoptScopedSend(
            objective: "Replacement objective",
            recallPhase: .reading(nil)
        )
        _ = state.transitionAskSubmissionPhase(to: .requestingWorkspaceAnswer)
        let replacementID = state.replaceOperation { _ in Task {} }

        if state.finishOperationIfCurrent(staleID) {
            _ = state.returnToIdle()
        }

        XCTAssertTrue(state.isCurrentOperation(replacementID))
        XCTAssertTrue(state.isSending)
        XCTAssertEqual(state.pendingObjective, "Replacement objective")
        XCTAssertEqual(state.pendingScopedSend, "Replacement objective")
        XCTAssertEqual(state.relationshipRecallPhase, .reading(nil))
        XCTAssertEqual(state.askSubmissionPhase, .requestingWorkspaceAnswer)
    }

    func testStaleCancelCannotCancelReplacement() {
        var state = RelationshipAskOperationState()
        let priorID = state.replaceOperation { _ in Task {} }
        let replacement = Task<Void, Never> {}
        let replacementID = state.replaceOperation { _ in replacement }

        XCTAssertFalse(state.cancelOperationIfCurrent(priorID))
        XCTAssertFalse(replacement.isCancelled)
        XCTAssertTrue(state.isCurrentOperation(replacementID))

        XCTAssertTrue(state.cancelOperationIfCurrent(replacementID))
        XCTAssertTrue(replacement.isCancelled)
        XCTAssertNil(state.operationID)
        XCTAssertNil(state.askOperation)
    }

    func testScreenshotCancellationDoesNotReplaceAskOperation() {
        var state = RelationshipAskOperationState()
        state.beginSubmission(objective: "Concurrent Ask")
        let ask = Task<Void, Never> {}
        let askID = state.replaceOperation { _ in ask }
        let cancellation = Task<Void, Never> {}
        let cancellationID = state.replaceScreenshotCancellation(for: "screenshot-1") { _ in
            cancellation
        }

        XCTAssertTrue(state.isCurrentOperation(askID))
        XCTAssertFalse(ask.isCancelled)
        XCTAssertTrue(
            state.isCurrentScreenshotCancellation(cancellationID, for: "screenshot-1")
        )
        XCTAssertTrue(state.isCancellingScreenshot("screenshot-1"))

        XCTAssertTrue(
            state.finishScreenshotCancellationIfCurrent(cancellationID, for: "screenshot-1")
        )
        XCTAssertFalse(state.isCancellingScreenshot("screenshot-1"))
        XCTAssertTrue(state.isCurrentOperation(askID))
        XCTAssertTrue(state.isSending)
        XCTAssertEqual(state.pendingObjective, "Concurrent Ask")
    }

    func testReplacingAskLeavesScreenshotCancellationRunning() {
        var state = RelationshipAskOperationState()
        let priorAsk = Task<Void, Never> {}
        _ = state.replaceOperation { _ in priorAsk }
        let cancellation = Task<Void, Never> {}
        let cancellationID = state.replaceScreenshotCancellation(for: "screenshot-1") { _ in
            cancellation
        }
        let replacementAsk = Task<Void, Never> {}
        let replacementAskID = state.replaceOperation { _ in replacementAsk }

        XCTAssertTrue(priorAsk.isCancelled)
        XCTAssertFalse(replacementAsk.isCancelled)
        XCTAssertTrue(state.isCurrentOperation(replacementAskID))
        XCTAssertFalse(cancellation.isCancelled)
        XCTAssertTrue(
            state.isCurrentScreenshotCancellation(cancellationID, for: "screenshot-1")
        )
    }

    func testScreenshotTasksOwnIndependentCancellationLanes() {
        var state = RelationshipAskOperationState()
        let firstID = state.replaceScreenshotCancellation(for: "screenshot-1") { _ in Task {} }
        let secondID = state.replaceScreenshotCancellation(for: "screenshot-2") { _ in Task {} }

        XCTAssertTrue(state.finishScreenshotCancellationIfCurrent(firstID, for: "screenshot-1"))
        XCTAssertFalse(state.isCancellingScreenshot("screenshot-1"))
        XCTAssertTrue(state.isCurrentScreenshotCancellation(secondID, for: "screenshot-2"))
    }

    func testStaleScreenshotCancellationCannotReleaseReplacement() {
        var state = RelationshipAskOperationState()
        let prior = Task<Void, Never> {}
        let priorID = state.replaceScreenshotCancellation(for: "screenshot-1") { _ in prior }
        let replacement = Task<Void, Never> {}
        let replacementID = state.replaceScreenshotCancellation(for: "screenshot-1") { _ in replacement }

        XCTAssertTrue(prior.isCancelled)
        XCTAssertFalse(state.finishScreenshotCancellationIfCurrent(priorID, for: "screenshot-1"))
        XCTAssertFalse(replacement.isCancelled)
        XCTAssertTrue(
            state.isCurrentScreenshotCancellation(replacementID, for: "screenshot-1")
        )
    }

    func testLeavingViewCancelsAskButPreservesAcceptedScreenshotCancellations() {
        var state = RelationshipAskOperationState()
        let ask = Task<Void, Never> {}
        _ = state.replaceOperation { _ in ask }
        let first = Task<Void, Never> {}
        _ = state.replaceScreenshotCancellation(for: "screenshot-1") { _ in first }
        let second = Task<Void, Never> {}
        _ = state.replaceScreenshotCancellation(for: "screenshot-2") { _ in second }

        state.cancelViewBoundOperations()

        XCTAssertTrue(ask.isCancelled)
        XCTAssertFalse(first.isCancelled)
        XCTAssertFalse(second.isCancelled)
        XCTAssertNil(state.operationID)
        XCTAssertNil(state.askOperation)
        XCTAssertTrue(state.isCancellingScreenshot("screenshot-1"))
        XCTAssertTrue(state.isCancellingScreenshot("screenshot-2"))
    }

    @MainActor
    func testAcceptedScreenshotStopReachesBackendAfterViewExit() async {
        let taskID = "screenshot-stop-survives-view"
        let service = SuspendedScreenshotCancellationService(taskID: taskID)
        let store = PursuitWorkspaceStore(service: service)
        let completed = expectation(description: "accepted stop completed")
        var state = RelationshipAskOperationState()
        let cancellationID = state.replaceScreenshotCancellation(for: taskID) { _ in
            Task {
                _ = try? await store.cancelLatestScreenshotContactTask(id: taskID)
                completed.fulfill()
            }
        }

        await service.waitUntilLoadStarted()
        state.cancelViewBoundOperations()
        XCTAssertTrue(state.isCurrentScreenshotCancellation(cancellationID, for: taskID))
        await service.resumeLoad()
        await fulfillment(of: [completed], timeout: 1)

        let cancelCallCount = await service.cancelCallCount()
        let cancelledRevision = await service.cancelledRevision()
        XCTAssertEqual(cancelCallCount, 1)
        XCTAssertEqual(cancelledRevision, 7)
    }

    @MainActor
    func testReplacedScreenshotStopCannotReachBackendAfterSuspendedLoad() async {
        let taskID = "replaced-screenshot-stop"
        let service = SuspendedScreenshotCancellationService(taskID: taskID)
        let store = PursuitWorkspaceStore(service: service)
        let staleCompleted = expectation(description: "stale stop completed")
        var state = RelationshipAskOperationState()
        _ = state.replaceScreenshotCancellation(for: taskID) { _ in
            Task {
                _ = try? await store.cancelLatestScreenshotContactTask(id: taskID)
                staleCompleted.fulfill()
            }
        }

        await service.waitUntilLoadStarted()
        let replacement = Task<Void, Never> {}
        _ = state.replaceScreenshotCancellation(for: taskID) { _ in replacement }
        await service.resumeLoad()
        await fulfillment(of: [staleCompleted], timeout: 1)

        let cancelCallCount = await service.cancelCallCount()
        XCTAssertEqual(cancelCallCount, 0)
    }
}

private actor SuspendedScreenshotCancellationService: PursuitWorkspaceServing {
    private let taskID: String
    private var loadStarted = false
    private var loadContinuation: CheckedContinuation<ScreenshotContactTask, Never>?
    private var cancelCount = 0
    private var revision: Int?

    init(taskID: String) {
        self.taskID = taskID
    }

    func loadWorkspace() async throws -> PursuitWorkspaceSnapshot {
        .preview
    }

    func loadScreenshotContactTask(id: String) async throws -> ScreenshotContactTask {
        loadStarted = true
        return await withCheckedContinuation { continuation in
            loadContinuation = continuation
        }
    }

    func cancelScreenshotContactTask(id: String, revision: Int) async throws -> ScreenshotContactTask {
        cancelCount += 1
        self.revision = revision
        return screenshotTask(taskID: id, revision: revision + 1, status: "cancelled")
    }

    func waitUntilLoadStarted() async {
        while !loadStarted {
            await Task.yield()
        }
    }

    func resumeLoad() {
        loadContinuation?.resume(
            returning: screenshotTask(taskID: taskID, revision: 7, status: "running")
        )
        loadContinuation = nil
    }

    func cancelCallCount() -> Int { cancelCount }
    func cancelledRevision() -> Int? { revision }
}

private func screenshotTask(
    taskID: String,
    revision: Int,
    status: String
) -> ScreenshotContactTask {
    ScreenshotContactTask(
        sourceImages: nil,
        taskID: taskID,
        revision: revision,
        status: status,
        contact: nil,
        captureID: nil,
        sourceResourceID: nil,
        messageCount: 0,
        extraction: nil,
        summary: "",
        findings: [],
        profileFields: [],
        publicSources: [],
        question: nil,
        candidates: [],
        limitations: [],
        events: []
    )
}
