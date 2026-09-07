import XCTest
@testable import TalentSignal

final class AgentSessionContinuityTests: XCTestCase {
    @MainActor
    func testTwoSessionProposalsRemainIndependentAcrossRelaunchAndDecline() throws {
        let persistence = SessionContinuityMemoryPersistence()
        let store = AgentSessionStore(persistence: persistence)
        let first = try XCTUnwrap(store.beginUnscopedSession(objective: "Add Maya Chen, email maya@example.com, for Product"))
        let second = try XCTUnwrap(store.beginUnscopedSession(objective: "Add Noor Vega, email noor@example.com, for Design"))
        let firstDraft = try XCTUnwrap(ConversationContactIntake.propose("Add Maya Chen, email maya@example.com, for Product"))
        let secondDraft = try XCTUnwrap(ConversationContactIntake.propose("Add Noor Vega, email noor@example.com, for Design"))
        XCTAssertTrue(store.saveContactProposal(firstDraft, idempotencyKey: "first", sessionID: first))
        XCTAssertTrue(store.saveContactProposal(secondDraft, idempotencyKey: "second", sessionID: second))
        let sourceID = try XCTUnwrap(store.contactProposal(sessionID: first)?.sourceMessageID)
        let restored = AgentSessionStore(persistence: persistence)
        XCTAssertEqual(restored.contactProposal(sessionID: first)?.draft, firstDraft)
        XCTAssertEqual(restored.contactProposal(sessionID: second)?.draft, secondDraft)
        XCTAssertTrue(restored.clearContactProposal(sessionID: first))
        XCTAssertNil(restored.contactProposal(sessionID: first))
        XCTAssertNotNil(restored.contactProposal(sessionID: second))
        XCTAssertEqual(restored.session(id: first)?.turns.first?.id, sourceID)
        XCTAssertEqual(restored.session(id: first)?.turns.first?.objective, firstDraft.sourceNote)
    }

    @MainActor
    func testComposerDraftAndPendingAskAreIsolatedBetweenSessionsOfTheSameRelationship() throws {
        let persistence = SessionContinuityMemoryPersistence()
        let store = AgentSessionStore(persistence: persistence)
        let person = try XCTUnwrap(PursuitWorkspaceSnapshot.preview.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let first = try XCTUnwrap(store.beginSession(person: person, context: context, objective: "Same question"))
        let second = try XCTUnwrap(store.beginSession(person: person, context: context, objective: "Same question"))
        XCTAssertTrue(store.saveDraft("First draft", sessionID: first))
        XCTAssertTrue(store.saveDraft("Second draft", sessionID: second))
        XCTAssertEqual(store.beginAsk("Same question", personID: person.id, relationshipContextID: context.id,
                                      proposedIdempotencyKey: "first-key", sessionID: first), "first-key")
        XCTAssertEqual(store.beginAsk("Same question", personID: person.id, relationshipContextID: context.id,
                                      proposedIdempotencyKey: "second-key", sessionID: second), "second-key")
        let restored = AgentSessionStore(persistence: persistence)
        XCTAssertEqual(restored.draft(sessionID: first), "First draft")
        XCTAssertEqual(restored.draft(sessionID: second), "Second draft")
        XCTAssertEqual(restored.beginAsk("Same question", personID: person.id, relationshipContextID: context.id,
                                         proposedIdempotencyKey: "retry-key", sessionID: first), "first-key")
        XCTAssertTrue(restored.clearDraft(sessionID: first))
        XCTAssertEqual(restored.draft(sessionID: second), "Second draft")
    }

    @MainActor
    func testContactConfirmationKeepsSessionAndOriginalMessageID() throws {
        let store = AgentSessionStore()
        let objective = "Add Maya Chen, email maya@example.com, for Product"
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: objective))
        let draft = try XCTUnwrap(ConversationContactIntake.propose(objective))
        XCTAssertTrue(store.saveContactProposal(draft, idempotencyKey: "contact-key", sessionID: id))
        let sourceID = try XCTUnwrap(store.session(id: id)?.turns.first?.id)
        let result = ResourceCaptureResult(captureID: UUID().uuidString,
            identity: .init(status: "resolved", personID: UUID().uuidString,
                            relationshipContextID: UUID().uuidString, resolutionCaseID: nil, candidatePersonIDs: []),
            resource: .init(id: UUID().uuidString, processingState: "ready", duplicateOfResourceID: nil, fragmentCount: 1))
        let confirmed = store.recordContactReceipt(operationKey: "contact-key", outcome: .createdPerson,
            result: result, personDisplayLabel: "Maya Chen", contextDisplayLabel: "Product")
        XCTAssertEqual(confirmed, id)
        XCTAssertEqual(store.sessions.count, 1)
        XCTAssertEqual(store.session(id: id)?.turns.first?.id, sourceID)
        XCTAssertEqual(store.session(id: id)?.contactReceipts.count, 1)
        XCTAssertNil(store.contactProposal(sessionID: id))
    }

    @MainActor
    func testPendingContactCannotBeReplacedOrDeclinedAndSurvivesRelaunch() throws {
        let persistence = SessionContinuityMemoryPersistence()
        let store = AgentSessionStore(persistence: persistence)
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: "Add Maya Chen, email maya@example.com, for Product"))
        let draft = try XCTUnwrap(ConversationContactIntake.propose("Add Maya Chen, email maya@example.com, for Product"))
        XCTAssertTrue(store.saveContactProposal(draft, idempotencyKey: "pending", pendingTarget: .newPerson,
                                               pendingConfirmIdentityClue: true, sessionID: id))
        XCTAssertFalse(store.saveContactProposal(draft, idempotencyKey: "replacement", sessionID: id))
        XCTAssertFalse(store.clearContactProposal(sessionID: id))
        XCTAssertFalse(store.delete(id))
        let restored = AgentSessionStore(persistence: persistence)
        XCTAssertEqual(restored.contactProposal(sessionID: id)?.pendingTarget, .newPerson)
        XCTAssertEqual(restored.contactProposal(sessionID: id)?.idempotencyKey, "pending")
    }

    @MainActor
    func testProposalExpiryKeepsTheOriginalConversation() throws {
        var current = Date()
        let store = AgentSessionStore(now: { current })
        let objective = "Add Maya Chen, email maya@example.com, for Product"
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: objective))
        let draft = try XCTUnwrap(ConversationContactIntake.propose(objective))
        XCTAssertTrue(store.saveContactProposal(draft, idempotencyKey: "expires", sessionID: id))
        current.addTimeInterval(7 * 24 * 60 * 60)
        XCTAssertNil(store.contactProposal(sessionID: id))
        XCTAssertEqual(store.session(id: id)?.turns.first?.objective, objective)
    }

    @MainActor
    func testExpiredOpenProposalCannotRenewItsIntentAfterPruneOrRelaunch() throws {
        var current = Date()
        let persistence = SessionContinuityMemoryPersistence()
        let store = AgentSessionStore(persistence: persistence, now: { current })
        let objective = "Add Maya Chen, email maya@example.com, for Product"
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: objective))
        let staleViewDraft = try XCTUnwrap(ConversationContactIntake.propose(objective))
        let expiredKey = "expired-open-intent"
        XCTAssertTrue(store.saveContactProposal(staleViewDraft, idempotencyKey: expiredKey, sessionID: id))
        let sourceID = try XCTUnwrap(store.contactProposal(sessionID: id)?.sourceMessageID)
        current.addTimeInterval(7 * 24 * 60 * 60)
        XCTAssertFalse(store.isContactProposalCurrent(sessionID: id, idempotencyKey: expiredKey))
        // Mirrors an open SwiftUI @State draft confirming after its protected proposal expired.
        XCTAssertFalse(store.saveContactProposal(staleViewDraft, idempotencyKey: expiredKey,
            pendingTarget: .newPerson, pendingConfirmIdentityClue: true, sessionID: id))
        XCTAssertNil(store.contactProposal(sessionID: id))
        XCTAssertEqual(store.session(id: id)?.turns.map(\.id), [sourceID])
        let restored = AgentSessionStore(persistence: persistence, now: { current })
        XCTAssertFalse(restored.saveContactProposal(staleViewDraft, idempotencyKey: expiredKey, sessionID: id))
        XCTAssertEqual(restored.session(id: id)?.turns.map(\.id), [sourceID])
        // A deliberate new message has a new intent and may establish a fresh proposal.
        XCTAssertTrue(restored.saveContactProposal(staleViewDraft, idempotencyKey: "new-message-intent", sessionID: id))
        XCTAssertTrue(restored.isContactProposalCurrent(sessionID: id, idempotencyKey: "new-message-intent"))
        XCTAssertEqual(restored.session(id: id)?.turns.count, 2)
    }

    @MainActor
    func testDeclinedIntentCannotReopenAndPendingRecoveryCannotChangeItsEffect() throws {
        let store = AgentSessionStore()
        let objective = "Add Maya Chen, email maya@example.com, for Product"
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: objective))
        let draft = try XCTUnwrap(ConversationContactIntake.propose(objective))
        XCTAssertTrue(store.saveContactProposal(draft, idempotencyKey: "declined", sessionID: id))
        XCTAssertTrue(store.clearContactProposal(sessionID: id))
        XCTAssertFalse(store.saveContactProposal(draft, idempotencyKey: "declined", sessionID: id))
        XCTAssertTrue(store.saveContactProposal(draft, idempotencyKey: "pending", pendingTarget: .newPerson,
            pendingConfirmIdentityClue: true, sessionID: id))
        var changed = draft
        changed.name = "Another person"
        XCTAssertFalse(store.saveContactProposal(changed, idempotencyKey: "pending", pendingTarget: .newPerson,
            pendingConfirmIdentityClue: true, sessionID: id))
        XCTAssertTrue(store.saveContactProposal(draft, idempotencyKey: "pending", pendingTarget: .newPerson,
            pendingConfirmIdentityClue: true, sessionID: id))
    }

    @MainActor
    func testFeedbackTogglePersistsAndForkDropsAllAuthority() throws {
        let persistence = SessionContinuityMemoryPersistence()
        let store = AgentSessionStore(persistence: persistence)
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: "What next?"))
        XCTAssertTrue(store.recordUnscopedChat(sessionID: id, objective: "What next?", response: continuityResponse("first")))
        let turnID = try XCTUnwrap(store.session(id: id)?.turns.first?.id)
        XCTAssertTrue(store.toggleFeedback(sessionID: id, turnID: turnID, feedback: .helpful))
        XCTAssertEqual(AgentSessionStore(persistence: persistence).session(id: id)?.turns.first?.feedback, .helpful)
        XCTAssertTrue(store.toggleFeedback(sessionID: id, turnID: turnID, feedback: .helpful))
        XCTAssertNil(store.session(id: id)?.turns.first?.feedback)
        XCTAssertNotNil(store.beginUnscopedChat(sessionID: id, objective: "Pending", proposedIdempotencyKey: "pending-token"))
        let forkID = try XCTUnwrap(store.forkSession(id))
        let fork = try XCTUnwrap(store.session(id: forkID))
        XCTAssertNotEqual(forkID, id)
        XCTAssertEqual(fork.originSessionID, id)
        XCTAssertEqual(fork.originTurnID, turnID)
        XCTAssertNil(fork.pendingObjective)
        XCTAssertNil(fork.pendingUnscopedChatIdempotencyKey)
        XCTAssertTrue(fork.contactReceipts.isEmpty)
        XCTAssertNil(store.contactProposal(sessionID: forkID))
        XCTAssertTrue(fork.turns.allSatisfy(\.requiresRefresh))
        XCTAssertTrue(fork.turns.allSatisfy { $0.response.citations.isEmpty && $0.response.media.isEmpty })
        XCTAssertTrue(fork.turns.flatMap { $0.response.blocks }.allSatisfy { !$0.requiresUserDecision && $0.targetRef == nil })
        let exported = try XCTUnwrap(store.exportMarkdown(sessionID: forkID, language: .english))
        XCTAssertTrue(exported.contains("What next?"))
        XCTAssertTrue(exported.contains("Review the latest message."))
        XCTAssertFalse(exported.contains("pending-token"))
        XCTAssertFalse(exported.contains(id.uuidString))
        XCTAssertFalse(exported.contains("private-action-id"))
    }

    @MainActor
    func testScreenshotTaskUpdatesRetainTranscriptIdentity() throws {
        let store = AgentSessionStore()
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: "Review this screenshot"))
        let taskID = UUID().uuidString
        XCTAssertTrue(store.recordScreenshotTask(sessionID: id, taskID: taskID, objective: "Review this screenshot", summary: "Processing", status: "running"))
        let first = try XCTUnwrap(store.session(id: id)?.turns.first)
        XCTAssertTrue(store.recordScreenshotTask(sessionID: id, taskID: taskID, objective: "Changed input", summary: "Needs your review", status: "ready"))
        let updated = try XCTUnwrap(store.session(id: id)?.turns.first)
        XCTAssertEqual(updated.id, first.id)
        XCTAssertEqual(updated.objective, first.objective)
        XCTAssertEqual(updated.createdAt, first.createdAt)
        XCTAssertEqual(updated.response.blocks.first?.body, "Needs your review")
        XCTAssertEqual(store.session(id: id)?.screenshotTaskIDs, [taskID])
    }

    @MainActor
    func testInterruptedScreenshotAdmissionRequiresTheSameImagesAndNeverBecomesChat() throws {
        let persistence = SessionContinuityMemoryPersistence()
        let store = AgentSessionStore(persistence: persistence)
        let objective = "Review this screenshot"
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: objective))
        XCTAssertTrue(store.saveDraft("Keep this composer draft", sessionID: id))
        let capturedAt = Date(timeIntervalSince1970: 1_789_000_000.49)
        XCTAssertEqual(store.beginScreenshotAdmission(sessionID: id, objective: objective,
            requestIdentity: String(repeating: "a", count: 64), proposedIdempotencyKey: "original-key", capturedAt: capturedAt), "original-key")
        let restored = AgentSessionStore(persistence: persistence)
        XCTAssertTrue(try XCTUnwrap(restored.session(id: id)).hasPendingScreenshotAdmission)
        XCTAssertEqual(restored.beginScreenshotAdmission(sessionID: id, objective: objective,
            requestIdentity: String(repeating: "a", count: 64), proposedIdempotencyKey: "retry-key", capturedAt: Date()), "original-key")
        XCTAssertEqual(restored.session(id: id)?.pendingScreenshotCapturedAt, Date(timeIntervalSince1970: 1_789_000_000))
        XCTAssertNil(restored.beginScreenshotAdmission(sessionID: id, objective: objective,
            requestIdentity: String(repeating: "b", count: 64), proposedIdempotencyKey: "different-key"))
        XCTAssertNil(restored.beginUnscopedChat(sessionID: id, objective: objective, proposedIdempotencyKey: "chat-key"))
        XCTAssertNil(restored.beginUnscopedPersonResearch(sessionID: id, objective: objective,
            requestIdentity: "other", proposedIdempotencyKey: "research-key"))
        XCTAssertTrue(restored.recordScreenshotTask(sessionID: id, taskID: UUID().uuidString,
            objective: "Older screenshot", summary: "Saved", status: "ready"))
        XCTAssertTrue(try XCTUnwrap(restored.session(id: id)).hasPendingScreenshotAdmission)
        XCTAssertTrue(restored.recordScreenshotTask(sessionID: id, taskID: UUID().uuidString,
            objective: objective, summary: "Accepted", status: "running", admissionIdempotencyKey: "original-key"))
        let accepted = try XCTUnwrap(restored.session(id: id))
        XCTAssertFalse(accepted.hasPendingScreenshotAdmission)
        XCTAssertNil(accepted.pendingScreenshotCapturedAt)
        XCTAssertNil(accepted.pendingObjective)
        XCTAssertEqual(restored.draft(sessionID: id), "Keep this composer draft")
        let encoded = try XCTUnwrap(String(data: XCTUnwrap(persistence.data), encoding: .utf8))
        XCTAssertFalse(encoded.contains("dataBase64"))
        XCTAssertFalse(encoded.contains("data_base64"))
    }

    @MainActor
    func testScreenshotCapacityRejectsAdmissionAndForkLeavesOneOwnedCaptureSlot() throws {
        let persistence = SessionContinuityMemoryPersistence()
        let store = AgentSessionStore(persistence: persistence)
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: "Capture history"))
        for index in 0..<20 {
            XCTAssertTrue(store.recordScreenshotTask(sessionID: id, taskID: UUID().uuidString,
                objective: "Screenshot \(index)", summary: "Saved", status: "ready"))
        }
        XCTAssertNotNil(store.screenshotAdmissionNotice(sessionID: id))
        XCTAssertNil(store.beginScreenshotAdmission(sessionID: id, objective: "Selected image remains here",
            requestIdentity: String(repeating: "a", count: 64), proposedIdempotencyKey: "blocked-at-capacity"))
        XCTAssertFalse(try XCTUnwrap(store.session(id: id)).hasPendingScreenshotAdmission)
        let forkID = try XCTUnwrap(store.forkSession(id))
        let fork = try XCTUnwrap(store.session(id: forkID))
        XCTAssertEqual(fork.screenshotTaskIDs.count, 19)
        XCTAssertEqual(fork.readOnlyScreenshotTaskIDs.count, 19)
        XCTAssertTrue(fork.ownedScreenshotTaskIDs.isEmpty)
        XCTAssertTrue(fork.contextWasTrimmed)
        XCTAssertNil(store.screenshotAdmissionNotice(sessionID: forkID))
        XCTAssertEqual(store.beginScreenshotAdmission(sessionID: forkID, objective: "A new screenshot",
            requestIdentity: String(repeating: "b", count: 64), proposedIdempotencyKey: "owned-new-capture"), "owned-new-capture")
        let ownedTaskID = UUID().uuidString
        XCTAssertTrue(store.recordScreenshotTask(sessionID: forkID, taskID: ownedTaskID,
            objective: "A new screenshot", summary: "Created inside this fork", status: "ready",
            admissionIdempotencyKey: "owned-new-capture"))
        let restored = AgentSessionStore(persistence: persistence)
        let restoredFork = try XCTUnwrap(restored.session(id: forkID))
        XCTAssertEqual(restoredFork.ownedScreenshotTaskIDs, [ownedTaskID])
        XCTAssertFalse(restoredFork.readOnlyScreenshotTaskIDs.contains(ownedTaskID))
        XCTAssertTrue(restored.recordScreenshotTask(sessionID: forkID, taskID: ownedTaskID,
            objective: "A new screenshot", summary: "Refreshed owned result", status: "ready"))
        XCTAssertFalse(restored.recordScreenshotTask(sessionID: forkID, taskID: try XCTUnwrap(fork.screenshotTaskIDs.first),
            objective: "Inherited screenshot", summary: "Must stay read-only", status: "ready"))
        XCTAssertEqual(restored.session(id: id)?.screenshotTaskIDs.count, 20)
    }

    @MainActor
    func testAdmittedScreenshotRaceKeepsCanonicalReceiptWithoutStuckPendingState() throws {
        let store = AgentSessionStore()
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: "Capture history"))
        for index in 0..<19 {
            XCTAssertTrue(store.recordScreenshotTask(sessionID: id, taskID: UUID().uuidString,
                objective: "Screenshot \(index)", summary: "Saved", status: "ready"))
        }
        XCTAssertNotNil(store.beginScreenshotAdmission(sessionID: id, objective: "Already sent screenshot",
            requestIdentity: String(repeating: "c", count: 64), proposedIdempotencyKey: "admitted-before-race"))
        // A second device can fill the last slot after local admission has been protected.
        XCTAssertTrue(store.recordScreenshotTask(sessionID: id, taskID: UUID().uuidString,
            objective: "Other device result", summary: "Saved", status: "ready"))
        let acceptedID = UUID().uuidString
        XCTAssertTrue(store.recordScreenshotTask(sessionID: id, taskID: acceptedID,
            objective: "Already sent screenshot", summary: "Canonical result retained", status: "ready",
            admissionIdempotencyKey: "admitted-before-race"))
        let recovered = try XCTUnwrap(store.session(id: id))
        XCTAssertFalse(recovered.hasPendingScreenshotAdmission)
        XCTAssertTrue(recovered.screenshotTaskIDs.contains(acceptedID))
        XCTAssertEqual(recovered.screenshotTaskIDs.count, 21)
        XCTAssertNotNil(store.syncNotice(sessionID: id))
        XCTAssertNil(store.beginScreenshotAdmission(sessionID: id, objective: "Another new screenshot",
            requestIdentity: String(repeating: "d", count: 64), proposedIdempotencyKey: "not-admitted"))
        XCTAssertNotNil(store.forkSession(id))
    }

    @MainActor
    func testSyncUnionsConcurrentMessagesAndPersistsDeletionBeforeSending() async throws {
        let persistence = SessionContinuityMemoryPersistence()
        let store = AgentSessionStore(persistence: persistence)
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: "Local question"))
        XCTAssertTrue(store.recordUnscopedChat(sessionID: id, objective: "Local question", response: continuityResponse("local")))
        var remote = try XCTUnwrap(store.session(id: id))
        remote.turns = [AgentSessionTurn(id: UUID(), objective: "Other device", response: continuityResponse("remote"), createdAt: Date().addingTimeInterval(1), requiresRefresh: true)]
        let service = SessionContinuitySyncFixture(records: [remoteRecord(remote, revision: 1)])
        let synced = await store.synchronize(using: service)
        XCTAssertTrue(synced)
        XCTAssertEqual(Set(try XCTUnwrap(store.session(id: id)).turns.map(\.objective)), Set(["Local question", "Other device"]))
        XCTAssertEqual(service.puts.last?.turns.count, 2)
        XCTAssertTrue(store.delete(id))
        let restored = AgentSessionStore(persistence: persistence)
        let deleted = await restored.synchronize(using: service)
        XCTAssertTrue(deleted)
        XCTAssertEqual(service.deletedIDs, [id])
        XCTAssertNil(restored.session(id: id))
    }

    @MainActor
    func testOfflineDraftAndFeedbackCannotExtendOriginalSessionRetention() throws {
        let createdAt = Date()
        var current = createdAt
        let persistence = SessionContinuityMemoryPersistence()
        let store = AgentSessionStore(persistence: persistence, now: { current })
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: "Original question"))
        XCTAssertTrue(store.recordUnscopedChat(sessionID: id, objective: "Original question", response: continuityResponse("retention"), createdAt: createdAt))
        let turnID = try XCTUnwrap(store.session(id: id)?.turns.first?.id)
        current.addTimeInterval(29 * 24 * 60 * 60)
        XCTAssertTrue(store.saveDraft("A later draft", sessionID: id))
        XCTAssertTrue(store.toggleFeedback(sessionID: id, turnID: turnID, feedback: .helpful))
        let relaunched = AgentSessionStore(persistence: persistence, now: { current })
        XCTAssertEqual(relaunched.session(id: id)?.originalCreatedAt.timeIntervalSince1970.rounded(.down), createdAt.timeIntervalSince1970.rounded(.down))
        current.addTimeInterval(24 * 60 * 60)
        XCTAssertNil(relaunched.session(id: id))
        XCTAssertTrue(AgentSessionStore(persistence: persistence, now: { current }).sessions.isEmpty)
    }

    @MainActor
    func testDelayedScopedAnswerCannotRestoreDeletedOrMissingSession() async throws {
        let store = AgentSessionStore()
        let person = try XCTUnwrap(PursuitWorkspaceSnapshot.preview.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let id = try XCTUnwrap(store.beginSession(person: person, context: context, objective: "Pending answer"))
        let service = SessionContinuitySyncFixture(records: [AgentSessionRemoteRecord(sessionID: id,
            revision: 2, updatedAt: Date(), expiresAt: Date().addingTimeInterval(86400), deletedAt: Date(), payload: nil)])
        let allowed = await store.synchronize(using: service, requiredSessionID: id)
        XCTAssertFalse(allowed)
        XCTAssertNil(store.recordIfOwned(sessionID: id, objective: "Pending answer", response: continuityResponse("late"), person: person, context: context))
        _ = store.record(sessionID: id, objective: "Legacy delayed callback", response: continuityResponse("late-legacy"), person: person, context: context)
        XCTAssertNil(store.recordIfOwned(sessionID: UUID(), objective: "Missing owner", response: continuityResponse("missing"), person: person, context: context))
        XCTAssertTrue(store.sessions.isEmpty)
    }

    @MainActor
    func testOversizedSessionDoesNotBlockAnotherSessionAndForkCopiesBoundedWholeTurns() async throws {
        let seed = AgentSessionStore()
        let largeID = try XCTUnwrap(seed.beginUnscopedSession(objective: "Large history"))
        let smallID = try XCTUnwrap(seed.beginUnscopedSession(objective: "New question"))
        var large = try XCTUnwrap(seed.session(id: largeID))
        large.pendingObjective = nil
        large.turns = (0..<201).map { index in
            AgentSessionTurn(id: UUID(), objective: "Question \(index)", response: continuityResponse("large-\(index)"), createdAt: Date(), requiresRefresh: true)
        }
        let store = AgentSessionStore(sessions: [large, try XCTUnwrap(seed.session(id: smallID))])
        let service = SessionContinuitySyncFixture(records: [])
        let smallAllowed = await store.synchronize(using: service, requiredSessionID: smallID)
        XCTAssertTrue(smallAllowed)
        XCTAssertEqual(service.puts.map(\.id), [smallID])
        XCTAssertNotNil(store.syncNotice(sessionID: largeID))
        XCTAssertNil(store.syncNotice(sessionID: smallID))
        XCTAssertEqual(store.session(id: largeID)?.turns.count, 201)
        let largeAllowed = await store.synchronize(using: service, requiredSessionID: largeID)
        XCTAssertFalse(largeAllowed)
        let forkID = try XCTUnwrap(store.forkSession(largeID))
        let fork = try XCTUnwrap(store.session(id: forkID))
        XCTAssertTrue(fork.contextWasTrimmed)
        XCTAssertEqual(fork.originKind, "local")
        XCTAssertEqual(fork.originSessionID, largeID)
        XCTAssertEqual(fork.originTurnID, large.turns.last?.id)
        XCTAssertLessThanOrEqual(fork.turns.count, 40)
        XCTAssertLessThan(try JSONEncoder.agentSession.encode(PersistedAgentSession(fork)).count, 150 * 1024)
        XCTAssertEqual(store.session(id: largeID)?.turns.count, 201)
        XCTAssertTrue(fork.turns.allSatisfy(\.requiresRefresh))
    }

    @MainActor
    func testForkByteBudgetSkipsWholeOversizedTurnsAndKeepsOriginal() throws {
        let seed = AgentSessionStore()
        let id = try XCTUnwrap(seed.beginUnscopedSession(objective: "Large answer"))
        var original = try XCTUnwrap(seed.session(id: id))
        let response = RelationshipAskResponse(contractVersion: TalentSignalAPIContract.version, taskID: "huge",
            contextManifestID: "none-unbound-conversation", knowledgeSnapshotID: "none-unbound-conversation",
            disposition: "answered", blocks: [.init(id: "huge-block", kind: "answer", title: "Large answer",
                body: String(repeating: "x", count: 140 * 1024), status: "ready", citationDependencyIDs: [], requiresUserDecision: false)],
            media: [], createdAt: ISO8601DateFormatter().string(from: Date()), citations: [])
        original.turns = [AgentSessionTurn(id: UUID(), objective: "Keep the whole answer", response: response, createdAt: Date(), requiresRefresh: false)]
        let store = AgentSessionStore(sessions: [original])
        let forkID = try XCTUnwrap(store.forkSession(id))
        let fork = try XCTUnwrap(store.session(id: forkID))
        XCTAssertTrue(fork.contextWasTrimmed)
        XCTAssertTrue(fork.turns.isEmpty)
        XCTAssertEqual(store.session(id: id)?.turns.first?.response.blocks.first?.body.count, 140 * 1024)
        XCTAssertLessThan(try JSONEncoder.agentSession.encode(PersistedAgentSession(fork)).count, 150 * 1024)
    }

    @MainActor
    func testSyncKeepsFreshOriginalResponseAndAvoidsNoOpWritesButSecondDeviceIsStale() async throws {
        let store = AgentSessionStore()
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: "Question"))
        XCTAssertTrue(store.recordUnscopedChat(sessionID: id, objective: "Question", response: continuityResponse("fresh")))
        let service = SessionContinuitySyncFixture(records: [])
        let first = await store.synchronize(using: service)
        XCTAssertTrue(first)
        XCTAssertFalse(try XCTUnwrap(store.session(id: id)?.turns.first).requiresRefresh)
        let repeated = await store.synchronize(using: service)
        XCTAssertTrue(repeated)
        XCTAssertEqual(service.puts.count, 1)
        let otherDevice = AgentSessionStore()
        let recovered = await otherDevice.synchronize(using: service)
        XCTAssertTrue(recovered)
        XCTAssertTrue(try XCTUnwrap(otherDevice.session(id: id)?.turns.first).requiresRefresh)
        XCTAssertEqual(service.puts.count, 1)
    }

    @MainActor
    func testNewerCanonicalRedactionReplacesThePreviouslyFreshDisplay() async throws {
        let store = AgentSessionStore()
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: "Question"))
        XCTAssertTrue(store.recordUnscopedChat(sessionID: id, objective: "Question", response: continuityResponse("redacted")))
        let service = SessionContinuitySyncFixture(records: [])
        _ = await store.synchronize(using: service)
        var redacted = try XCTUnwrap(store.session(id: id))
        let original = try XCTUnwrap(redacted.turns.first)
        let response = original.response
        redacted.turns[0] = AgentSessionTurn(id: original.id, objective: original.objective,
            response: .init(contractVersion: response.contractVersion, taskID: response.taskID,
                contextManifestID: response.contextManifestID, knowledgeSnapshotID: response.knowledgeSnapshotID,
                disposition: "needs_review", blocks: [], media: [], createdAt: response.createdAt, citations: []),
            createdAt: original.createdAt, requiresRefresh: true)
        service.records = [remoteRecord(redacted, revision: 2)]
        _ = await store.synchronize(using: service)
        let updated = try XCTUnwrap(store.session(id: id)?.turns.first)
        XCTAssertTrue(updated.requiresRefresh)
        XCTAssertFalse(updated.response.blocks.contains { $0.body == "Review the latest message." })
    }

    @MainActor
    func testSyncConflictKeepsLocalPendingAndRemoteTombstonePreventsResurrection() async throws {
        let store = AgentSessionStore()
        let id = try XCTUnwrap(store.beginUnscopedSession(objective: "Pending question"))
        XCTAssertNotNil(store.beginUnscopedChat(sessionID: id, objective: "Pending question", proposedIdempotencyKey: "recover-me"))
        let service = SessionContinuitySyncFixture(records: [])
        service.failPut = true
        let conflicted = await store.synchronize(using: service)
        XCTAssertFalse(conflicted)
        XCTAssertEqual(store.session(id: id)?.pendingUnscopedChatIdempotencyKey, "recover-me")
        XCTAssertNotNil(store.syncNotice)
        service.failPut = false
        service.records = [AgentSessionRemoteRecord(sessionID: id, revision: 4, updatedAt: Date(), expiresAt: Date().addingTimeInterval(100), deletedAt: Date(), payload: nil)]
        let removed = await store.synchronize(using: service)
        XCTAssertTrue(removed)
        XCTAssertNil(store.session(id: id))
        XCTAssertTrue(service.puts.isEmpty)
    }
}

private func continuityResponse(_ task: String) -> RelationshipAskResponse {
    .init(contractVersion: TalentSignalAPIContract.version, taskID: task,
          contextManifestID: "none-unbound-conversation", knowledgeSnapshotID: "none-unbound-conversation",
          disposition: "answered", blocks: [.init(id: "block-\(task)", kind: "answer", title: "Next step",
          body: "Review the latest message.", status: "ready", citationDependencyIDs: [], requiresUserDecision: true,
          targetRef: .init(type: "action", pursuitID: "private-pursuit-id", actionID: "private-action-id"))],
          media: [], createdAt: ISO8601DateFormatter().string(from: Date()), citations: [])
}

private func remoteRecord(_ session: AgentSession, revision: Int) -> AgentSessionRemoteRecord {
    .init(sessionID: session.id, revision: revision, updatedAt: Date(), expiresAt: Date().addingTimeInterval(86400), deletedAt: nil, payload: PersistedAgentSession(session))
}

private final class SessionContinuityMemoryPersistence: AgentSessionPersisting {
    var data: Data?
    var isDeleting = false
    func load() throws -> Data? { data }
    func save(_ data: Data) throws { self.data = data }
    func deletionPending() throws -> Bool { isDeleting }
    func beginDeletion() throws { isDeleting = true }
    func completeDeletion() throws { data = nil; isDeleting = false }
}

private final class SessionContinuitySyncFixture: AgentSessionSyncServing {
    var records: [AgentSessionRemoteRecord]
    var puts: [PersistedAgentSession] = []
    var deletedIDs: [UUID] = []
    var failPut = false
    init(records: [AgentSessionRemoteRecord]) { self.records = records }
    func list(after: String?) async throws -> AgentSessionRemotePage {
        .init(contractVersion: TalentSignalAPIContract.version, sessions: records, complete: true, nextCursor: nil)
    }
    func put(_ payload: PersistedAgentSession, expectedRevision: Int, idempotencyKey: UUID) async throws -> AgentSessionRemoteRecord {
        if failPut { throw AgentSessionSyncError.conflict }
        puts.append(payload)
        let record = AgentSessionRemoteRecord(sessionID: payload.id, revision: expectedRevision + 1,
            updatedAt: Date(), expiresAt: Date().addingTimeInterval(86400), deletedAt: nil, payload: payload)
        records.removeAll { $0.sessionID == payload.id }
        records.append(record)
        return record
    }
    func delete(id: UUID, expectedRevision: Int, idempotencyKey: UUID) async throws -> AgentSessionRemoteRecord {
        deletedIDs.append(id)
        let record = AgentSessionRemoteRecord(sessionID: id, revision: expectedRevision + 1, updatedAt: Date(),
            expiresAt: Date().addingTimeInterval(86400), deletedAt: Date(), payload: nil)
        records.removeAll { $0.sessionID == id }
        records.append(record)
        return record
    }
}
