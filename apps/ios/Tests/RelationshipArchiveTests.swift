import XCTest
@testable import TalentSignal

final class RelationshipArchiveTests: XCTestCase {
    func testReviewedCaptureSeedsOneEditableScopedAgentQuestion() {
        let seed = AgentSessionSeed.reviewedCapture(
            personID: "person-1",
            relationshipContextID: "context-1"
        )

        XCTAssertEqual(seed.personID, "person-1")
        XCTAssertEqual(seed.relationshipContextID, "context-1")
        XCTAssertEqual(
            seed.suggestedObjective,
            "What changed in this relationship, and what is the smallest safe next step?"
        )
    }

    func testMeetingPreparationSeedsOneEditableScopedAgentQuestion() {
        let seed = AgentSessionSeed.meetingPreparation(
            personID: "person-1",
            relationshipContextID: "context-1",
            suggestedObjective: "Prepare for the 3:00 PM interview."
        )

        XCTAssertEqual(seed.personID, "person-1")
        XCTAssertEqual(seed.relationshipContextID, "context-1")
        XCTAssertEqual(
            seed.suggestedObjective,
            "Prepare for the 3:00 PM interview."
        )
    }

    func testPreviewCalendarProjectsRelationshipMomentsWithoutReadingDeviceCalendar() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let now = Date(timeIntervalSince1970: 1_787_738_400)

        let activities = RelationshipCalendarProjection.activities(
            snapshot: .preview,
            isPreview: true,
            now: now,
            calendar: calendar
        )

        XCTAssertEqual(activities.count, 2)
        XCTAssertEqual(activities.first?.source, .preview)
        XCTAssertEqual(
            activities.first?.personID,
            PursuitWorkspaceSnapshot.preview.people.first?.id
        )
        XCTAssertTrue(activities.allSatisfy { $0.eventIdentifier == nil })
        XCTAssertEqual(
            RelationshipCalendarProjection.next(in: activities, now: now)?.id,
            activities.first?.id
        )
    }

    func testCanonicalCalendarDoesNotInventActivitiesFromPeopleOrTargets() {
        XCTAssertTrue(
            RelationshipCalendarProjection.activities(
                snapshot: .preview,
                isPreview: false
            ).isEmpty
        )
    }

    func testStoredLanguageFallsBackToSystemForUnknownValues() {
        XCTAssertEqual(AppLanguage.stored(nil), .system)
        XCTAssertEqual(AppLanguage.stored("fr"), .system)
        XCTAssertEqual(AppLanguage.stored("en"), .english)
        XCTAssertEqual(AppLanguage.stored("zh-Hans"), .simplifiedChinese)
    }

    func testLanguageSelectionOverridesThePreferredSystemLanguage() {
        XCTAssertEqual(
            AppLanguage.system.text(
                "Settings",
                zhHans: "设置",
                preferredLanguages: ["zh-Hans-CN"]
            ),
            "设置"
        )
        XCTAssertEqual(
            AppLanguage.english.text(
                "Settings",
                zhHans: "设置",
                preferredLanguages: ["zh-Hans-CN"]
            ),
            "Settings"
        )
        XCTAssertEqual(
            AppLanguage.simplifiedChinese.text(
                "Settings",
                zhHans: "设置",
                preferredLanguages: ["en-US"]
            ),
            "设置"
        )
    }

    func testCatalogOwnsInterfaceAndWorkspaceVocabulary() {
        XCTAssertEqual(
            AppLanguage.simplifiedChinese.text(
                "Record voice",
                preferredLanguages: ["en-US"]
            ),
            "记录语音"
        )
        XCTAssertEqual(
            AppLanguage.simplifiedChinese.workspaceTerm("Evidence-backed gap"),
            "有证据支持的缺口"
        )
        XCTAssertEqual(
            AppLanguage.english.workspaceTerm("Evidence-backed gap"),
            "Evidence-backed gap"
        )
    }

    @MainActor
    func testPreviewSessionsCanExposeUnreadAgentWorkWithoutChangingWorkspaceTruth() {
        let store = AgentSessionStore.preview(snapshot: .preview)

        XCTAssertEqual(store.sessions.count, 2)
        XCTAssertTrue(store.unreadSessions.isEmpty)
        store.markUnread(store.sessions[0].id)
        XCTAssertEqual(store.unreadSessions.count, 1)
        XCTAssertTrue(store.unreadSessions[0].latestPreview.contains("Proposal"))
        XCTAssertEqual(PursuitWorkspaceSnapshot.preview.todayItems.count, 2)
    }

    @MainActor
    func testSuccessfulAskTasksStayGroupedInOneReviewableSession() throws {
        let snapshot = PursuitWorkspaceSnapshot.preview
        let person = try XCTUnwrap(snapshot.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let store = AgentSessionStore()
        let response = RelationshipAskResponse(
            contractVersion: "test",
            taskID: "task-1",
            contextManifestID: "manifest-1",
            knowledgeSnapshotID: "snapshot-1",
            disposition: "proposal_only",
            blocks: [
                .init(
                    id: "block-1",
                    kind: "brief",
                    title: "Needs review",
                    body: "One proposal remains unconfirmed.",
                    status: "needs_review",
                    citationDependencyIDs: ["evidence-1"],
                    requiresUserDecision: true
                ),
            ],
            createdAt: "2026-08-25T08:30:00.000Z"
        )

        let sessionID = store.record(
            sessionID: nil,
            objective: "What changed?",
            response: response,
            person: person,
            context: context
        )
        let reusedID = store.record(
            sessionID: sessionID,
            objective: "What remains uncertain?",
            response: response,
            person: person,
            context: context
        )

        XCTAssertEqual(reusedID, sessionID)
        XCTAssertEqual(store.sessions.count, 1)
        XCTAssertEqual(store.session(id: sessionID)?.turns.count, 2)
        XCTAssertFalse(try XCTUnwrap(store.session(id: sessionID)).isUnread)

        store.markUnread(sessionID)
        XCTAssertEqual(store.unreadSessions.map(\.id), [sessionID])
        store.markRead(sessionID)
        XCTAssertTrue(store.unreadSessions.isEmpty)
        store.delete(sessionID)
        XCTAssertTrue(store.sessions.isEmpty)
    }

    @MainActor
    func testRejectingACitationMarksOnlyItsAgentTurnStale() throws {
        let person = try XCTUnwrap(PursuitWorkspaceSnapshot.preview.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let store = AgentSessionStore()
        let response = try relationshipAskReadbackFixture().validated(
            relationshipAskResponseFixture(),
            expectedAccountID: "account-1",
            expectedPersonID: "person-1",
            expectedRelationshipContextID: "context-1"
        )
        let sessionID = store.record(
            sessionID: nil,
            objective: "What changed?",
            response: response,
            person: person,
            context: context
        )

        store.markCitationStale("evidence-1")

        let turn = try XCTUnwrap(store.session(id: sessionID)?.turns.first)
        XCTAssertTrue(turn.requiresRefresh)
        XCTAssertEqual(turn.response.citations.map(\.id), ["evidence-1"])
    }

    @MainActor
    func testEvidenceReviewOutcomePersistsForSafeRetryAndAppendOnlyReReview() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "evidence-review-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let now = Date(timeIntervalSince1970: 1_787_650_000)
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let response = try relationshipAskReadbackFixture().validated(
            relationshipAskResponseFixture(),
            expectedAccountID: "account-1",
            expectedPersonID: "person-1",
            expectedRelationshipContextID: "context-1"
        )
        let citation = try XCTUnwrap(response.citations.first)
        let writer = AgentSessionStore(
            persistence: persistence,
            now: { now }
        )
        let rejected = try writer.beginEvidenceReview(
            idempotencyKey: "review-key-rejected",
            taskID: response.taskID,
            citation: citation,
            personDisplayName: "Leila Hartmann",
            relationshipContextDisplayName: "Chief Product Officer search",
            expectedReviewStatus: "reviewed",
            decision: "rejected",
            reason: "The excerpt needs correction."
        )
        writer.markEvidenceReviewUnknown(
            rejected.idempotencyKey,
            message: "The canonical outcome is unknown."
        )

        let restored = AgentSessionStore(
            persistence: persistence,
            now: { now }
        )
        let unresolved = try XCTUnwrap(
            restored.latestEvidenceReviews(taskID: response.taskID).first
        )
        XCTAssertEqual(unresolved.idempotencyKey, rejected.idempotencyKey)
        XCTAssertEqual(unresolved.state, .outcomeUnknown)
        XCTAssertEqual(unresolved.fragmentID, citation.id)
        XCTAssertEqual(unresolved.reason, "The excerpt needs correction.")

        XCTAssertTrue(
            restored.requiresEvidenceReviewAuthorityReadback(
                unresolved.idempotencyKey
            )
        )
        restored.revalidateEvidenceReviewAuthority(
            citations: response.citations,
            supersededMessage: "A newer source decision is current."
        )
        try restored.markEvidenceReviewPending(unresolved.idempotencyKey)
        let rejectedResult = PursuitEvidenceReviewResult(
            reviewID: "review-rejected",
            priorReviewID: citation.lastReviewID,
            decidedAt: "2026-08-25T04:30:00.000Z"
        )
        XCTAssertTrue(
            restored.markEvidenceReviewApplied(
                unresolved.idempotencyKey,
                result: rejectedResult
            )
        )
        let reviewedAgain = try restored.beginEvidenceReview(
            idempotencyKey: "review-key-restored",
            basedOn: unresolved,
            expectedReviewStatus: "rejected",
            authorityReviewID: rejectedResult.reviewID,
            decision: "reviewed",
            reason: "The source was corrected and rechecked."
        )
        XCTAssertTrue(
            restored.markEvidenceReviewApplied(
                reviewedAgain.idempotencyKey,
                result: PursuitEvidenceReviewResult(
                    reviewID: "review-restored",
                    priorReviewID: rejectedResult.reviewID,
                    decidedAt: "2026-08-25T04:31:00.000Z"
                )
            )
        )

        let latest = try XCTUnwrap(
            restored.latestEvidenceReviews(taskID: response.taskID).first
        )
        XCTAssertEqual(latest.idempotencyKey, reviewedAgain.idempotencyKey)
        XCTAssertEqual(latest.decision, "reviewed")
        XCTAssertEqual(latest.state, .applied)
        XCTAssertEqual(latest.authorityReviewID, rejectedResult.reviewID)
        XCTAssertEqual(latest.resultingReviewID, "review-restored")
        XCTAssertEqual(
            restored.evidenceReviewHistory(taskID: response.taskID).map(\.idempotencyKey),
            [reviewedAgain.idempotencyKey, rejected.idempotencyKey]
        )

        let otherAccount = AgentSessionStore(
            persistence: FileAgentSessionPersistence(
                accountID: "account-two",
                rootURL: root
            ),
            now: { now }
        )
        XCTAssertTrue(
            otherAccount.latestEvidenceReviews(taskID: response.taskID).isEmpty
        )

        XCTAssertTrue(restored.deleteAll())
        let afterDeletion = AgentSessionStore(
            persistence: persistence,
            now: { now }
        )
        XCTAssertTrue(
            afterDeletion.latestEvidenceReviews(taskID: response.taskID).isEmpty
        )
    }

    @MainActor
    func testEvidenceReviewTaskOwnershipSurvivesPresentationButNotRelaunch() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "evidence-review-owner-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let response = try relationshipAskReadbackFixture().validated(
            relationshipAskResponseFixture(),
            expectedAccountID: "account-1",
            expectedPersonID: "person-1",
            expectedRelationshipContextID: "context-1"
        )
        let citation = try XCTUnwrap(response.citations.first)
        let store = AgentSessionStore(persistence: persistence)
        let operation = try store.beginEvidenceReview(
            idempotencyKey: "session-owned-review",
            taskID: response.taskID,
            citation: citation,
            personDisplayName: "Leila Hartmann",
            relationshipContextDisplayName: "Chief Product Officer search",
            expectedReviewStatus: "reviewed",
            decision: "rejected",
            reason: "The excerpt needs correction."
        )

        XCTAssertTrue(store.claimEvidenceReview(operation.idempotencyKey))
        XCTAssertFalse(store.claimEvidenceReview(operation.idempotencyKey))
        XCTAssertEqual(
            store.activeEvidenceReviewKeys,
            Set([operation.idempotencyKey])
        )

        let restored = AgentSessionStore(persistence: persistence)
        XCTAssertTrue(restored.activeEvidenceReviewKeys.isEmpty)
        XCTAssertEqual(
            restored.latestEvidenceReviews(taskID: response.taskID).first?.state,
            .pending
        )

        store.releaseEvidenceReview(operation.idempotencyKey)
        XCTAssertTrue(store.activeEvidenceReviewKeys.isEmpty)
        XCTAssertTrue(store.claimEvidenceReview(operation.idempotencyKey))
        XCTAssertTrue(store.deleteAll())
        XCTAssertTrue(store.activeEvidenceReviewKeys.isEmpty)
    }

    @MainActor
    func testSupersededEvidenceReviewIsTerminalAndPersists() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "evidence-review-superseded-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let response = try relationshipAskReadbackFixture().validated(
            relationshipAskResponseFixture(),
            expectedAccountID: "account-1",
            expectedPersonID: "person-1",
            expectedRelationshipContextID: "context-1"
        )
        let citation = try XCTUnwrap(response.citations.first)
        let store = AgentSessionStore(persistence: persistence)
        let operation = try store.beginEvidenceReview(
            idempotencyKey: "superseded-review",
            taskID: response.taskID,
            citation: citation,
            personDisplayName: "Leila Hartmann",
            relationshipContextDisplayName: "Chief Product Officer search",
            expectedReviewStatus: "reviewed",
            decision: "rejected",
            reason: "The excerpt needs correction."
        )
        let message = "A newer source decision is already current."

        XCTAssertTrue(
            store.markEvidenceReviewSuperseded(
                operation.idempotencyKey,
                message: message
            )
        )
        XCTAssertEqual(
            store.latestEvidenceReviews(taskID: response.taskID).first?.state,
            .superseded
        )

        let restored = AgentSessionStore(persistence: persistence)
        let terminal = try XCTUnwrap(
            restored.latestEvidenceReviews(taskID: response.taskID).first
        )
        XCTAssertEqual(terminal.state, .superseded)
        XCTAssertEqual(terminal.statusMessage, message)
        XCTAssertThrowsError(
            try restored.markEvidenceReviewPending(operation.idempotencyKey)
        ) { error in
            XCTAssertEqual(
                error as? AgentSessionPersistenceError,
                .evidenceReviewSuperseded
            )
        }
        XCTAssertEqual(
            restored.latestEvidenceReviews(taskID: response.taskID).first,
            terminal
        )
        XCTAssertFalse(restored.claimEvidenceReview(operation.idempotencyKey))
        XCTAssertTrue(
            PursuitWorkspaceClientError.backend(
                code: "EVIDENCE_REVIEW_AUTHORITY_STALE",
                message: "A newer review is current."
            ).isSupersededEvidenceReview
        )
        XCTAssertFalse(
            PursuitWorkspaceClientError.backend(
                code: "EVIDENCE_SOURCE_AUTHORIZATION_UNAVAILABLE",
                message: "The source is unavailable."
            ).isSupersededEvidenceReview
        )
    }

    @MainActor
    func testSupersededPersistenceFailureKeepsSessionTerminalGuard() throws {
        let persistence = ToggleSaveAgentSessionPersistence()
        let store = AgentSessionStore(persistence: persistence)
        let response = try relationshipAskReadbackFixture().validated(
            relationshipAskResponseFixture(),
            expectedAccountID: "account-1",
            expectedPersonID: "person-1",
            expectedRelationshipContextID: "context-1"
        )
        let citation = try XCTUnwrap(response.citations.first)
        let operation = try store.beginEvidenceReview(
            idempotencyKey: "superseded-save-failure",
            taskID: response.taskID,
            citation: citation,
            personDisplayName: "Leila Hartmann",
            relationshipContextDisplayName: "Chief Product Officer search",
            expectedReviewStatus: "reviewed",
            decision: "rejected",
            reason: "The excerpt needs correction."
        )
        XCTAssertTrue(store.claimEvidenceReview(operation.idempotencyKey))
        persistence.failSave = true

        XCTAssertFalse(
            store.markEvidenceReviewSuperseded(
                operation.idempotencyKey,
                message: "A newer source decision is already current."
            )
        )
        store.releaseEvidenceReview(operation.idempotencyKey)

        XCTAssertEqual(
            store.latestEvidenceReviews(taskID: response.taskID).first?.state,
            .pending
        )
        XCTAssertTrue(
            store.transientSupersededEvidenceReviewKeys.contains(
                operation.idempotencyKey
            )
        )
        XCTAssertTrue(store.isEvidenceReviewSuperseded(operation.idempotencyKey))
        XCTAssertFalse(store.claimEvidenceReview(operation.idempotencyKey))
        XCTAssertThrowsError(
            try store.markEvidenceReviewPending(operation.idempotencyKey)
        ) { error in
            XCTAssertEqual(
                error as? AgentSessionPersistenceError,
                .evidenceReviewSuperseded
            )
        }

        let restored = AgentSessionStore(persistence: persistence)
        XCTAssertTrue(
            restored.requiresEvidenceReviewAuthorityReadback(
                operation.idempotencyKey
            )
        )
        XCTAssertFalse(restored.claimEvidenceReview(operation.idempotencyKey))
        XCTAssertThrowsError(
            try restored.markEvidenceReviewPending(operation.idempotencyKey)
        ) { error in
            XCTAssertEqual(
                error as? AgentSessionPersistenceError,
                .evidenceReviewAuthorityReadbackRequired
            )
        }
        XCTAssertEqual(
            restored.latestEvidenceReviews(taskID: response.taskID).first?.state,
            .pending
        )
    }

    @MainActor
    func testRestoredEvidenceReviewUnlocksOnlyAfterExactAuthorityReadback() throws {
        let persistence = ToggleSaveAgentSessionPersistence()
        let response = try relationshipAskReadbackFixture().validated(
            relationshipAskResponseFixture(),
            expectedAccountID: "account-1",
            expectedPersonID: "person-1",
            expectedRelationshipContextID: "context-1"
        )
        let citation = try XCTUnwrap(response.citations.first)
        let first = AgentSessionStore(persistence: persistence)
        let operation = try first.beginEvidenceReview(
            idempotencyKey: "restored-authority-readback",
            taskID: response.taskID,
            citation: citation,
            personDisplayName: "Leila Hartmann",
            relationshipContextDisplayName: "Chief Product Officer search",
            expectedReviewStatus: "reviewed",
            decision: "rejected",
            reason: "The excerpt needs correction."
        )

        let restored = AgentSessionStore(persistence: persistence)
        XCTAssertFalse(restored.claimEvidenceReview(operation.idempotencyKey))
        restored.revalidateEvidenceReviewAuthority(
            citations: response.citations,
            supersededMessage: "A newer source decision is current."
        )

        XCTAssertFalse(
            restored.requiresEvidenceReviewAuthorityReadback(
                operation.idempotencyKey
            )
        )
        XCTAssertTrue(restored.claimEvidenceReview(operation.idempotencyKey))
        restored.releaseEvidenceReview(operation.idempotencyKey)
    }

    @MainActor
    func testRestoredEvidenceReviewBecomesTerminalAfterNewerAuthorityReadback() throws {
        let persistence = ToggleSaveAgentSessionPersistence()
        let response = try relationshipAskReadbackFixture().validated(
            relationshipAskResponseFixture(),
            expectedAccountID: "account-1",
            expectedPersonID: "person-1",
            expectedRelationshipContextID: "context-1"
        )
        let citation = try XCTUnwrap(response.citations.first)
        let first = AgentSessionStore(persistence: persistence)
        let operation = try first.beginEvidenceReview(
            idempotencyKey: "restored-stale-authority",
            taskID: response.taskID,
            citation: citation,
            personDisplayName: "Leila Hartmann",
            relationshipContextDisplayName: "Chief Product Officer search",
            expectedReviewStatus: "reviewed",
            decision: "rejected",
            reason: "The excerpt needs correction."
        )
        let newer = try relationshipAskReadbackFixture(
            citationLastReviewID: "review-2"
        ).validated(
            relationshipAskResponseFixture(),
            expectedAccountID: "account-1",
            expectedPersonID: "person-1",
            expectedRelationshipContextID: "context-1"
        )

        let restored = AgentSessionStore(persistence: persistence)
        restored.revalidateEvidenceReviewAuthority(
            citations: newer.citations,
            supersededMessage: "A newer source decision is current."
        )

        XCTAssertTrue(restored.isEvidenceReviewSuperseded(operation.idempotencyKey))
        XCTAssertFalse(restored.claimEvidenceReview(operation.idempotencyKey))
        XCTAssertEqual(
            restored.latestEvidenceReviews(taskID: response.taskID).first?.state,
            .superseded
        )
    }

    @MainActor
    func testCurrentEvidenceSuggestionPreservesPersistedNonemptyDraft() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "ask-draft-preservation-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let store = AgentSessionStore(persistence: persistence)
        let original = "Ask whether the client can move the final conversation."
        store.saveDraft(
            original,
            personID: "person-1",
            relationshipContextID: "context-1"
        )
        let restored = store.draft(
            personID: "person-1",
            relationshipContextID: "context-1"
        )
        let next = RelationshipAskDraftPolicy.currentEvidenceDraft(
            preserving: restored,
            suggestion: "What is current now?"
        )

        XCTAssertEqual(next, original)
        XCTAssertEqual(
            store.draft(
                personID: "person-1",
                relationshipContextID: "context-1"
            ),
            original
        )
        XCTAssertEqual(
            RelationshipAskDraftPolicy.currentEvidenceDraft(
                preserving: "  \n",
                suggestion: "What is current now?"
            ),
            "What is current now?"
        )
    }

    @MainActor
    func testEvidenceReviewFailsClosedWhenProtectedSaveFails() throws {
        let persistence = ToggleSaveAgentSessionPersistence()
        persistence.failSave = true
        let store = AgentSessionStore(persistence: persistence)
        let response = try relationshipAskReadbackFixture().validated(
            relationshipAskResponseFixture(),
            expectedAccountID: "account-1",
            expectedPersonID: "person-1",
            expectedRelationshipContextID: "context-1"
        )
        let citation = try XCTUnwrap(response.citations.first)

        XCTAssertThrowsError(
            try store.beginEvidenceReview(
                idempotencyKey: "review-save-failure",
                taskID: response.taskID,
                citation: citation,
                personDisplayName: "Leila Hartmann",
                relationshipContextDisplayName: "Chief Product Officer search",
                expectedReviewStatus: "reviewed",
                decision: "rejected",
                reason: "The excerpt needs correction."
            )
        ) { error in
            XCTAssertEqual(
                error as? AgentSessionPersistenceError,
                .evidenceReviewRecoveryUnavailable
            )
        }
        XCTAssertTrue(
            store.evidenceReviewHistory(taskID: response.taskID).isEmpty
        )
        XCTAssertNotNil(store.persistenceNotice)
        XCTAssertEqual(persistence.saveAttempts, 1)

        persistence.failSave = false
        let operation = try store.beginEvidenceReview(
            idempotencyKey: "review-save-failure",
            taskID: response.taskID,
            citation: citation,
            personDisplayName: "Leila Hartmann",
            relationshipContextDisplayName: "Chief Product Officer search",
            expectedReviewStatus: "reviewed",
            decision: "rejected",
            reason: "The excerpt needs correction."
        )
        XCTAssertTrue(
            store.markEvidenceReviewFailed(
                operation.idempotencyKey,
                message: "No canonical change was recorded."
            )
        )
        persistence.failSave = true
        XCTAssertThrowsError(
            try store.markEvidenceReviewPending(operation.idempotencyKey)
        )
        XCTAssertEqual(
            store.evidenceReviewHistory(taskID: response.taskID).first?.state,
            .failed
        )
    }

    func testEvidenceReviewIdempotencyBindsEachCanonicalAuthorityCycle() {
        let firstReject = AgentEvidenceReviewIntent.idempotencyKey(
            fragmentID: "evidence-1",
            expectedReviewStatus: "reviewed",
            authorityToken: "2026-08-25T01:00:00.000Z",
            decision: "rejected",
            reason: "The excerpt needs correction."
        )
        let firstRetry = AgentEvidenceReviewIntent.idempotencyKey(
            fragmentID: "evidence-1",
            expectedReviewStatus: "reviewed",
            authorityToken: "2026-08-25T01:00:00.000Z",
            decision: "rejected",
            reason: "The excerpt needs correction."
        )
        let reviewedAgain = AgentEvidenceReviewIntent.idempotencyKey(
            fragmentID: "evidence-1",
            expectedReviewStatus: "rejected",
            authorityToken: firstReject,
            decision: "reviewed",
            reason: "The corrected source was checked."
        )
        let laterSameReasonReject = AgentEvidenceReviewIntent.idempotencyKey(
            fragmentID: "evidence-1",
            expectedReviewStatus: "reviewed",
            authorityToken: "2026-08-25T02:00:00.000Z",
            decision: "rejected",
            reason: "The excerpt needs correction."
        )

        XCTAssertEqual(firstReject, firstRetry)
        XCTAssertNotEqual(firstReject, reviewedAgain)
        XCTAssertNotEqual(firstReject, laterSameReasonReject)
    }

    func testEvidenceReviewResponseMustMatchCanonicalAuthorityIDs() throws {
        let result = try URLPursuitWorkspaceClient.validatedEvidenceReviewResult(
            expectedFragmentID: "fragment-1",
            expectedLastReviewID: "review-1",
            expectedDecision: "rejected",
            responseFragmentID: "fragment-1",
            responseReviewID: "review-2",
            responsePriorReviewID: "review-1",
            responseReviewStatus: "rejected",
            responseDecidedAt: "2026-08-25T04:31:00.000Z"
        )
        XCTAssertEqual(result.reviewID, "review-2")
        XCTAssertEqual(result.priorReviewID, "review-1")

        XCTAssertThrowsError(
            try URLPursuitWorkspaceClient.validatedEvidenceReviewResult(
                expectedFragmentID: "fragment-1",
                expectedLastReviewID: "review-1",
                expectedDecision: "rejected",
                responseFragmentID: "fragment-1",
                responseReviewID: "review-2",
                responsePriorReviewID: "review-stale",
                responseReviewStatus: "rejected",
                responseDecidedAt: "2026-08-25T04:31:00.000Z"
            )
        ) { error in
            XCTAssertEqual(
                error as? PursuitWorkspaceClientError,
                .scopeReadbackMismatch
            )
        }
    }

    @MainActor
    func testCanonicalRevalidationCanStaleATurnWithoutALocalCitationCallback() throws {
        let person = try XCTUnwrap(PursuitWorkspaceSnapshot.preview.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let store = AgentSessionStore()
        let response = try relationshipAskReadbackFixture().validated(
            relationshipAskResponseFixture(),
            expectedAccountID: "account-1",
            expectedPersonID: "person-1",
            expectedRelationshipContextID: "context-1"
        )
        let sessionID = store.record(
            sessionID: nil,
            objective: "What changed?",
            response: response,
            person: person,
            context: context
        )
        XCTAssertEqual(store.validationTargets().map(\.taskID), ["task-1"])

        store.markTaskStale("task-1")

        let turn = try XCTUnwrap(store.session(id: sessionID)?.turns.first)
        XCTAssertTrue(turn.requiresRefresh)
        XCTAssertTrue(store.validationTargets().isEmpty)
    }

    @MainActor
    func testAgentSessionsAndDraftsRestoreOnlyInsideTheirAccountBoundary() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "agent-session-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: root) }
        let now = Date(timeIntervalSince1970: 1_787_650_000)
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let snapshot = PursuitWorkspaceSnapshot.preview
        let person = try XCTUnwrap(snapshot.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let response = try relationshipAskReadbackFixture().validated(
            relationshipAskResponseFixture(),
            expectedAccountID: "account-1",
            expectedPersonID: "person-1",
            expectedRelationshipContextID: "context-1"
        )
        let writer = AgentSessionStore(
            persistence: persistence,
            now: { now }
        )
        let sessionID = writer.record(
            sessionID: nil,
            objective: "What changed?",
            response: response,
            person: person,
            context: context,
            createdAt: now
        )
        writer.saveDraft(
            "Ask about the relocation boundary",
            personID: person.id,
            relationshipContextID: context.id
        )

        let restored = AgentSessionStore(
            persistence: FileAgentSessionPersistence(
                accountID: "account-one",
                rootURL: root
            ),
            now: { now }
        )
        let restoredTurn = try XCTUnwrap(restored.session(id: sessionID)?.turns.first)
        XCTAssertNotEqual(restoredTurn.response, response)
        XCTAssertEqual(restoredTurn.response.taskID, response.taskID)
        XCTAssertEqual(restoredTurn.response.citations, [])
        XCTAssertEqual(restoredTurn.response.blocks.first?.status, "needs_review")
        XCTAssertTrue(
            restoredTurn.requiresRefresh
        )
        XCTAssertEqual(
            restored.draft(
                personID: person.id,
                relationshipContextID: context.id
            ),
            "Ask about the relocation boundary"
        )
        XCTAssertNil(restored.persistenceNotice)

        let otherAccount = AgentSessionStore(
            persistence: FileAgentSessionPersistence(
                accountID: "account-two",
                rootURL: root
            ),
            now: { now }
        )
        XCTAssertTrue(otherAccount.sessions.isEmpty)
        XCTAssertTrue(
            otherAccount.draft(
                personID: person.id,
                relationshipContextID: context.id
            ).isEmpty
        )

        restored.deleteAll()
        let afterSignOut = AgentSessionStore(
            persistence: persistence,
            now: { now }
        )
        XCTAssertTrue(afterSignOut.sessions.isEmpty)
    }

    @MainActor
    func testExpiredAgentSessionAndDraftDoNotRestore() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "expired-agent-session-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let oldNow = Date(timeIntervalSince1970: 1_780_000_000)
        let currentNow = oldNow.addingTimeInterval(31 * 24 * 60 * 60)
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let snapshot = PursuitWorkspaceSnapshot.preview
        let person = try XCTUnwrap(snapshot.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let writer = AgentSessionStore(
            persistence: persistence,
            now: { oldNow }
        )
        _ = writer.record(
            sessionID: nil,
            objective: "Old question",
            response: relationshipAskResponseFixture(),
            person: person,
            context: context,
            createdAt: oldNow
        )
        writer.saveDraft(
            "Old draft",
            personID: person.id,
            relationshipContextID: context.id
        )

        let restored = AgentSessionStore(
            persistence: persistence,
            now: { currentNow }
        )
        XCTAssertTrue(restored.sessions.isEmpty)
        XCTAssertTrue(
            restored.draft(
                personID: person.id,
                relationshipContextID: context.id
            ).isEmpty
        )
    }

    @MainActor
    func testGlobalAgentDraftRestoresWithoutInventingRelationshipScope() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "global-agent-draft-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let clock = AgentSessionTestClock(
            now: Date(timeIntervalSince1970: 1_780_000_000)
        )
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let message = "Add Amara Singh for the health search"
        let first = AgentSessionStore(
            persistence: persistence,
            now: { clock.now }
        )

        first.saveGlobalDraft(message)

        XCTAssertEqual(first.globalDraft(), message)
        XCTAssertTrue(first.sessions.isEmpty)
        let person = try XCTUnwrap(PursuitWorkspaceSnapshot.preview.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        XCTAssertTrue(
            first.draft(
                personID: person.id,
                relationshipContextID: context.id
            ).isEmpty
        )

        let restored = AgentSessionStore(
            persistence: persistence,
            now: { clock.now }
        )
        XCTAssertEqual(restored.globalDraft(), message)
        XCTAssertTrue(restored.sessions.isEmpty)
        let otherAccount = AgentSessionStore(
            persistence: FileAgentSessionPersistence(
                accountID: "account-two",
                rootURL: root
            ),
            now: { clock.now }
        )
        XCTAssertTrue(otherAccount.globalDraft().isEmpty)

        clock.now.addTimeInterval(7 * 24 * 60 * 60)
        XCTAssertTrue(restored.globalDraft().isEmpty)
        XCTAssertTrue(
            AgentSessionStore(
                persistence: persistence,
                now: { clock.now }
            ).globalDraft().isEmpty
        )
    }

    @MainActor
    func testGlobalDraftPromotionToRelationshipIsAtomic() throws {
        let persistence = ToggleSaveAgentSessionPersistence()
        let store = AgentSessionStore(persistence: persistence)
        let person = try XCTUnwrap(PursuitWorkspaceSnapshot.preview.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let message = "What changed in this relationship?"
        store.saveGlobalDraft(message)
        persistence.failSave = true

        XCTAssertFalse(
            store.promoteGlobalDraft(
                message,
                personID: person.id,
                relationshipContextID: context.id
            )
        )
        XCTAssertEqual(store.globalDraft(), message)
        XCTAssertTrue(
            store.draft(
                personID: person.id,
                relationshipContextID: context.id
            ).isEmpty
        )

        persistence.failSave = false
        XCTAssertTrue(
            store.promoteGlobalDraft(
                message,
                personID: person.id,
                relationshipContextID: context.id
            )
        )
        XCTAssertTrue(store.globalDraft().isEmpty)
        XCTAssertEqual(
            store.draft(
                personID: person.id,
                relationshipContextID: context.id
            ),
            message
        )
        let restored = AgentSessionStore(persistence: persistence)
        XCTAssertTrue(restored.globalDraft().isEmpty)
        XCTAssertEqual(
            restored.draft(
                personID: person.id,
                relationshipContextID: context.id
            ),
            message
        )
    }

    @MainActor
    func testContactProposalPromotionClearsGlobalDraftAtomically() throws {
        let persistence = ToggleSaveAgentSessionPersistence()
        let store = AgentSessionStore(persistence: persistence)
        let message = "Add Amara Singh for the health search"
        let proposal = try XCTUnwrap(ConversationContactIntake.propose(message))
        store.saveGlobalDraft(message)
        persistence.failSave = true

        XCTAssertFalse(
            store.saveContactProposal(
                proposal,
                idempotencyKey: "ios:contact:atomic",
                clearingGlobalDraft: true
            )
        )
        XCTAssertEqual(store.globalDraft(), message)
        XCTAssertNil(store.contactProposalDraft)

        persistence.failSave = false
        XCTAssertTrue(
            store.saveContactProposal(
                proposal,
                idempotencyKey: "ios:contact:atomic",
                clearingGlobalDraft: true
            )
        )
        XCTAssertTrue(store.globalDraft().isEmpty)
        XCTAssertEqual(store.contactProposalDraft, proposal)
        let restored = AgentSessionStore(persistence: persistence)
        XCTAssertTrue(restored.globalDraft().isEmpty)
        XCTAssertEqual(restored.contactProposalDraft, proposal)
    }

    @MainActor
    func testAgentRetentionPrunesAContinuingStoreAtExactCutoffs() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "live-agent-retention-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let clock = AgentSessionTestClock(
            now: Date(timeIntervalSince1970: 1_780_000_000)
        )
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let person = try XCTUnwrap(PursuitWorkspaceSnapshot.preview.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let store = AgentSessionStore(
            persistence: persistence,
            now: { clock.now }
        )
        let sessionID = store.record(
            sessionID: nil,
            objective: "Retained question",
            response: relationshipAskResponseFixture(),
            person: person,
            context: context,
            createdAt: clock.now
        )
        store.saveDraft(
            "Retained draft",
            personID: person.id,
            relationshipContextID: context.id
        )

        clock.now.addTimeInterval(7 * 24 * 60 * 60 - 1)
        XCTAssertEqual(
            store.draft(personID: person.id, relationshipContextID: context.id),
            "Retained draft"
        )
        clock.now.addTimeInterval(1)
        XCTAssertTrue(
            store.draft(personID: person.id, relationshipContextID: context.id).isEmpty
        )
        XCTAssertNotNil(store.session(id: sessionID))
        let daySevenReadback = AgentSessionStore(
            persistence: persistence,
            now: { clock.now }
        )
        XCTAssertTrue(
            daySevenReadback.draft(
                personID: person.id,
                relationshipContextID: context.id
            ).isEmpty
        )

        clock.now = Date(timeIntervalSince1970: 1_780_000_000)
            .addingTimeInterval(30 * 24 * 60 * 60)
        XCTAssertNil(store.session(id: sessionID))
        let dayThirtyReadback = AgentSessionStore(
            persistence: persistence,
            now: { clock.now }
        )
        XCTAssertTrue(dayThirtyReadback.sessions.isEmpty)
    }

    @MainActor
    func testContinuouslyVisibleSessionListPrunesAtTheExactThirtyDayBoundary() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "visible-agent-retention-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let clock = AgentSessionTestClock(
            now: Date(timeIntervalSince1970: 1_780_000_000)
        )
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let person = try XCTUnwrap(PursuitWorkspaceSnapshot.preview.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let store = AgentSessionStore(
            persistence: persistence,
            now: { clock.now }
        )
        _ = store.record(
            sessionID: nil,
            objective: "Private retained question",
            response: relationshipAskResponseFixture(),
            person: person,
            context: context,
            createdAt: clock.now
        )
        XCTAssertEqual(store.sessions.count, 1)

        clock.now.addTimeInterval(30 * 24 * 60 * 60)

        XCTAssertTrue(store.sessions.isEmpty)
        let relaunched = AgentSessionStore(
            persistence: persistence,
            now: { clock.now }
        )
        XCTAssertTrue(relaunched.sessions.isEmpty)
    }

    @MainActor
    func testContactProposalRestoresEditsAndOneOperationKeyAfterRelaunch() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "contact-proposal-recovery-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let first = AgentSessionStore(persistence: persistence)
        var draft = try XCTUnwrap(
            ConversationContactIntake.propose(
                "Add Maya Chen for the product search, maya@example.com"
            )
        )

        XCTAssertTrue(
            first.saveContactProposal(
                draft,
                idempotencyKey: "ios:contact:stable"
            )
        )
        draft.relationshipContext = "Chief Product Officer"
        XCTAssertTrue(
            first.saveContactProposal(
                draft,
                idempotencyKey: "ios:contact:stable"
            )
        )

        let relaunched = AgentSessionStore(persistence: persistence)
        XCTAssertEqual(relaunched.contactProposalDraft, draft)
        XCTAssertEqual(
            relaunched.contactProposalOperationKey,
            "ios:contact:stable"
        )
        XCTAssertTrue(relaunched.clearContactProposal())
        XCTAssertNil(
            AgentSessionStore(persistence: persistence).contactProposalDraft
        )
    }

    @MainActor
    func testConfirmedContactOperationRestoresExactRetryIntentAndCaptureTime() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "contact-operation-recovery-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let clock = AgentSessionTestClock(
            now: Date(timeIntervalSince1970: 1_780_100_000)
        )
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let first = AgentSessionStore(
            persistence: persistence,
            now: { clock.now }
        )
        let draft = try XCTUnwrap(
            ConversationContactIntake.propose(
                "Add Mina Patel for Finance, email mina@example.com"
            )
        )
        let originalCapturedAt = clock.now
        let target = ConversationContactTarget.newPerson

        XCTAssertTrue(
            first.saveContactProposal(
                draft,
                idempotencyKey: "ios:contact:response-lost",
                pendingTarget: target,
                pendingConfirmIdentityClue: true
            )
        )
        clock.now.addTimeInterval(90)
        XCTAssertTrue(
            first.saveContactProposal(
                draft,
                idempotencyKey: "ios:contact:response-lost",
                pendingTarget: target,
                pendingConfirmIdentityClue: true
            )
        )

        let relaunched = AgentSessionStore(
            persistence: persistence,
            now: { clock.now }
        )
        XCTAssertEqual(relaunched.contactProposalPendingTarget, target)
        XCTAssertEqual(relaunched.contactProposalPendingConfirmIdentityClue, true)
        XCTAssertEqual(relaunched.contactProposalCapturedAt, originalCapturedAt)
        XCTAssertEqual(
            relaunched.contactProposalOperationKey,
            "ios:contact:response-lost"
        )
    }

    @MainActor
    func testCanonicalContactReceiptPersistsOnlyMinimalReferencesAndDeduplicatesRetry() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "contact-receipt-history-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let now = Date(timeIntervalSince1970: 1_780_200_000)
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let store = AgentSessionStore(
            persistence: persistence,
            now: { now }
        )
        let result = ResourceCaptureResult(
            captureID: "capture-contact-1",
            identity: .init(
                status: "resolved",
                personID: "person-noor",
                relationshipContextID: "context-design",
                resolutionCaseID: nil,
                candidatePersonIDs: []
            ),
            resource: .init(
                id: "resource-contact-12345678",
                processingState: "ready",
                duplicateOfResourceID: nil,
                fragmentCount: 1
            )
        )

        let sessionID = try XCTUnwrap(
            store.recordContactReceipt(
                operationKey: "ios:contact:stable-receipt",
                outcome: .createdPerson,
                result: result,
                personDisplayLabel: "Noor Vega",
                contextDisplayLabel: "Design"
            )
        )
        let retriedSessionID = try XCTUnwrap(
            store.recordContactReceipt(
                operationKey: "ios:contact:stable-receipt",
                outcome: .createdPerson,
                result: result,
                personDisplayLabel: "Noor Vega",
                contextDisplayLabel: "Design"
            )
        )

        XCTAssertEqual(retriedSessionID, sessionID)
        XCTAssertEqual(store.sessions.count, 1)
        let mismatchedReadback = ResourceCaptureResult(
            captureID: "capture-contact-mismatch",
            identity: result.identity,
            resource: .init(
                id: "resource-contact-mismatch",
                processingState: "ready",
                duplicateOfResourceID: nil,
                fragmentCount: 1
            )
        )
        XCTAssertNil(
            store.recordContactReceipt(
                operationKey: "ios:contact:stable-receipt",
                outcome: .createdPerson,
                result: mismatchedReadback,
                personDisplayLabel: "Noor Vega",
                contextDisplayLabel: "Design"
            )
        )
        XCTAssertEqual(store.sessions.count, 1)
        let live = try XCTUnwrap(store.session(id: sessionID))
        XCTAssertEqual(live.personID, "person-noor")
        XCTAssertEqual(live.relationshipContextID, "context-design")
        XCTAssertEqual(live.contactReceipts.count, 1)
        XCTAssertFalse(try XCTUnwrap(live.contactReceipts.first).requiresRefresh)
        XCTAssertTrue(live.latestPreview.contains("receipt 12345678"))
        XCTAssertEqual(live.displayTitle(in: .english), "Added Noor Vega")
        XCTAssertEqual(live.displayTitle(in: .simplifiedChinese), "已添加 Noor Vega")
        XCTAssertEqual(
            live.latestPreview(in: .simplifiedChinese),
            "联系人已创建 · 回执 12345678"
        )

        let persistedData = try XCTUnwrap(persistence.load())
        let persistedText = try XCTUnwrap(
            String(data: persistedData, encoding: .utf8)
        )
        XCTAssertFalse(persistedText.contains("noor@example.com"))
        XCTAssertFalse(persistedText.contains("Add Noor Vega for Design"))
        XCTAssertTrue(persistedText.contains("resource-contact-12345678"))

        let restored = AgentSessionStore(
            persistence: persistence,
            now: { now }
        )
        let restoredReceipt = try XCTUnwrap(
            restored.session(id: sessionID)?.contactReceipts.first
        )
        XCTAssertTrue(restoredReceipt.requiresRefresh)
        XCTAssertEqual(restoredReceipt.captureID, result.captureID)
        XCTAssertEqual(restoredReceipt.resourceID, result.resource.id)
        XCTAssertNil(restoredReceipt.currentPerson(in: .preview))

        let currentPerson = try XCTUnwrap(PursuitWorkspaceSnapshot.preview.people.first)
        let currentReceipt = AgentContactReceipt(
            id: UUID(),
            operationKey: "ios:contact:current-person",
            outcome: .matchedExisting,
            captureID: "capture-current-person",
            resourceID: "resource-current-person",
            duplicateOfResourceID: nil,
            personID: currentPerson.id,
            relationshipContextID: currentPerson.contexts.first?.id,
            resolutionCaseID: nil,
            personDisplayLabel: currentPerson.displayLabel,
            contextDisplayLabel: currentPerson.contexts.first?.displayLabel,
            createdAt: now,
            requiresRefresh: true
        )
        XCTAssertEqual(
            currentReceipt.currentPerson(in: .preview)?.id,
            currentPerson.id
        )
    }

    @MainActor
    func testIdentityReviewReceiptHasNoFakeRelationshipScope() throws {
        let store = AgentSessionStore()
        let result = ResourceCaptureResult(
            captureID: "capture-conflict-1",
            identity: .init(
                status: "needs_review",
                personID: nil,
                relationshipContextID: nil,
                resolutionCaseID: "identity-case-87654321",
                candidatePersonIDs: ["person-current", "person-historical"]
            ),
            resource: .init(
                id: "resource-conflict-12345678",
                processingState: "ready",
                duplicateOfResourceID: nil,
                fragmentCount: 1
            )
        )
        let identitySessionID = try XCTUnwrap(
            store.recordContactReceipt(
                operationKey: "ios:contact:identity-review",
                outcome: .identityReview,
                result: result,
                personDisplayLabel: "Robin Lee",
                contextDisplayLabel: nil
            )
        )
        let identitySession = try XCTUnwrap(
            store.session(id: identitySessionID)
        )

        XCTAssertTrue(identitySession.isIdentityReview)
        XCTAssertNil(identitySession.personID)
        XCTAssertNil(identitySession.relationshipContextID)
        XCTAssertEqual(identitySession.resolutionCaseID, "identity-case-87654321")
        XCTAssertEqual(identitySession.contextDisplayLabel, "Identity review")
        XCTAssertTrue(identitySession.latestPreview.contains("case 87654321"))
        XCTAssertEqual(
            identitySession.displayTitle(in: .simplifiedChinese),
            "核对 Robin Lee 的身份"
        )
        XCTAssertEqual(
            identitySession.displayContextLabel(in: .simplifiedChinese),
            "身份核对"
        )

        let contradictoryReadback = ResourceCaptureResult(
            captureID: "capture-conflict-contradictory",
            identity: .init(
                status: "needs_review",
                personID: "person-current",
                relationshipContextID: "context-current",
                resolutionCaseID: "identity-case-contradictory",
                candidatePersonIDs: ["person-current"]
            ),
            resource: .init(
                id: "resource-conflict-contradictory",
                processingState: "ready",
                duplicateOfResourceID: nil,
                fragmentCount: 1
            )
        )
        XCTAssertNil(
            store.recordContactReceipt(
                operationKey: "ios:contact:identity-review-contradictory",
                outcome: .identityReview,
                result: contradictoryReadback,
                personDisplayLabel: "Robin Lee",
                contextDisplayLabel: nil
            )
        )
        XCTAssertEqual(store.sessions.count, 1)

        let person = try XCTUnwrap(PursuitWorkspaceSnapshot.preview.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let askSessionID = store.record(
            sessionID: identitySessionID,
            objective: "What changed?",
            response: relationshipAskResponseFixture(),
            person: person,
            context: context
        )
        XCTAssertNotEqual(askSessionID, identitySessionID)
        XCTAssertTrue(
            try XCTUnwrap(store.session(id: identitySessionID)).turns.isEmpty
        )
    }

    @MainActor
    func testVersionThreeRelationshipSessionMigratesWithoutInventingScope() throws {
        let persistence = ToggleSaveAgentSessionPersistence()
        let person = try XCTUnwrap(PursuitWorkspaceSnapshot.preview.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let writer = AgentSessionStore(persistence: persistence)
        let sessionID = writer.record(
            sessionID: nil,
            objective: "What changed?",
            response: relationshipAskResponseFixture(),
            person: person,
            context: context
        )
        let currentData = try XCTUnwrap(persistence.data)
        var envelope = try XCTUnwrap(
            JSONSerialization.jsonObject(with: currentData) as? [String: Any]
        )
        envelope["version"] = 3
        var sessions = try XCTUnwrap(envelope["sessions"] as? [[String: Any]])
        sessions = sessions.map { session in
            var legacy = session
            legacy.removeValue(forKey: "scopeKind")
            legacy.removeValue(forKey: "identityResolutionCaseID")
            legacy.removeValue(forKey: "contactReceipts")
            return legacy
        }
        envelope["sessions"] = sessions
        persistence.data = try JSONSerialization.data(withJSONObject: envelope)

        let restored = AgentSessionStore(persistence: persistence)
        let session = try XCTUnwrap(restored.session(id: sessionID))
        XCTAssertEqual(session.personID, person.id)
        XCTAssertEqual(session.relationshipContextID, context.id)
        XCTAssertFalse(session.isIdentityReview)
        XCTAssertTrue(session.contactReceipts.isEmpty)
    }

    @MainActor
    func testContactProposalExpiresAtDraftRetentionBoundary() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "contact-proposal-retention-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let clock = AgentSessionTestClock(
            now: Date(timeIntervalSince1970: 1_780_000_000)
        )
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let store = AgentSessionStore(
            persistence: persistence,
            now: { clock.now }
        )
        let draft = try XCTUnwrap(
            ConversationContactIntake.propose("Add Maya Chen for product")
        )
        XCTAssertTrue(
            store.saveContactProposal(
                draft,
                idempotencyKey: "ios:contact:expires"
            )
        )

        clock.now.addTimeInterval(7 * 24 * 60 * 60)

        XCTAssertNil(store.contactProposalDraft)
        XCTAssertNil(store.contactProposalOperationKey)
        XCTAssertNil(
            AgentSessionStore(
                persistence: persistence,
                now: { clock.now }
            ).contactProposalDraft
        )
    }

    @MainActor
    func testContactProposalDismissalStaysOpenWhenProtectedClearFails() throws {
        let persistence = ToggleSaveAgentSessionPersistence()
        let store = AgentSessionStore(persistence: persistence)
        let draft = try XCTUnwrap(
            ConversationContactIntake.propose("Add Maya Chen for product")
        )
        XCTAssertTrue(
            store.saveContactProposal(
                draft,
                idempotencyKey: "ios:contact:clear-retry"
            )
        )

        persistence.failSave = true

        XCTAssertFalse(store.clearContactProposal())
        XCTAssertEqual(store.contactProposalDraft, draft)
        XCTAssertEqual(
            store.contactProposalOperationKey,
            "ios:contact:clear-retry"
        )
    }

    @MainActor
    func testPendingAskReusesOneIdempotencyKeyAfterRelaunch() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "pending-agent-ask-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let person = try XCTUnwrap(PursuitWorkspaceSnapshot.preview.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let persistence = FileAgentSessionPersistence(
            accountID: "account-one",
            rootURL: root
        )
        let first = AgentSessionStore(persistence: persistence)
        first.saveDraft(
            "What changed?",
            personID: person.id,
            relationshipContextID: context.id
        )
        let originalKey = first.beginAsk(
            "What changed?",
            personID: person.id,
            relationshipContextID: context.id,
            proposedIdempotencyKey: "ios:ask:original"
        )

        let relaunched = AgentSessionStore(persistence: persistence)
        let retriedKey = relaunched.beginAsk(
            "What changed?",
            personID: person.id,
            relationshipContextID: context.id,
            proposedIdempotencyKey: "ios:ask:duplicate"
        )
        XCTAssertEqual(originalKey, "ios:ask:original")
        XCTAssertEqual(retriedKey, originalKey)
        relaunched.clearDraft(
            personID: person.id,
            relationshipContextID: context.id
        )
        XCTAssertTrue(
            relaunched.draft(
                personID: person.id,
                relationshipContextID: context.id
            ).isEmpty
        )
    }

    @MainActor
    func testFailedDeletionTombstoneSuppressesRestoreAndRetries() throws {
        let persistence = FailingDeletionAgentSessionPersistence()
        let person = try XCTUnwrap(PursuitWorkspaceSnapshot.preview.people.first)
        let context = try XCTUnwrap(person.contexts.first)
        let writer = AgentSessionStore(persistence: persistence)
        _ = writer.record(
            sessionID: nil,
            objective: "Private question",
            response: relationshipAskResponseFixture(),
            person: person,
            context: context
        )

        XCTAssertFalse(writer.deleteAll())
        XCTAssertTrue(persistence.isDeletionPending)
        XCTAssertNotNil(persistence.data)
        let suppressed = AgentSessionStore(persistence: persistence)
        XCTAssertTrue(suppressed.sessions.isEmpty)
        XCTAssertNotNil(suppressed.persistenceNotice)

        persistence.failCompletion = false
        let retried = AgentSessionStore(persistence: persistence)
        XCTAssertTrue(retried.sessions.isEmpty)
        XCTAssertFalse(persistence.isDeletionPending)
        XCTAssertNil(persistence.data)
    }

    func testCitationObservedDateUsesTheSourceTimezone() {
        let citation = relationshipAskReadbackFixture().citations[0]
        XCTAssertTrue(citation.compactProvenance.hasPrefix("2026-08-24"))
        let boundary = RelationshipAskResponse.Citation(
            id: citation.id,
            dependencyType: citation.dependencyType,
            personID: citation.personID,
            relationshipContextID: citation.relationshipContextID,
            inclusionReason: citation.inclusionReason,
            authorizationScope: citation.authorizationScope,
            availability: citation.availability,
            unavailableReason: citation.unavailableReason,
            resourceID: citation.resourceID,
            sourceName: citation.sourceName,
            observedAt: "2026-08-24T17:33:00.000Z",
            sourceTimezone: "Asia/Shanghai",
            captureVersion: citation.captureVersion,
            fragmentKind: citation.fragmentKind,
            sequence: citation.sequence,
            exactExcerpt: citation.exactExcerpt,
            attribution: citation.attribution,
            reviewStatus: citation.reviewStatus,
            parser: citation.parser,
            contentHash: citation.contentHash,
            fragmentCreatedAt: citation.fragmentCreatedAt,
            lastReviewID: citation.lastReviewID,
            lastReviewedAt: citation.lastReviewedAt,
            lastReviewedBy: citation.lastReviewedBy
        )
        XCTAssertTrue(boundary.compactProvenance.hasPrefix("2026-08-25"))
        XCTAssertTrue(boundary.detailedObservedAt.contains("2026-08-25 01:33"))
        XCTAssertTrue(boundary.detailedObservedAt.contains("Asia/Shanghai"))
        XCTAssertTrue(
            boundary.detailedLastReviewedAt?.contains("2026-08-24 18:00") == true
        )
        XCTAssertTrue(
            boundary.detailedLastReviewedAt?.contains("Asia/Shanghai") == true
        )
    }

    func testOrdinaryLaunchOpensEditorialToday() {
        XCTAssertFalse(TalentSignalRootRoute.opensReviewWorkbench(arguments: []))
        XCTAssertFalse(
            TalentSignalRootRoute.opensReviewWorkbench(
                arguments: ["TalentSignal", "--force-dark"]
            )
        )
    }

    func testDeterministicReviewArgumentsOpenTheReviewWorkbench() {
        XCTAssertTrue(
            TalentSignalRootRoute.opensReviewWorkbench(
                arguments: ["TalentSignal", "--fixture-id", "TS-CORE-01"]
            )
        )
        XCTAssertTrue(
            TalentSignalRootRoute.opensReviewWorkbench(
                arguments: ["TalentSignal", "--scenario", "relationship-capture"]
            )
        )
        XCTAssertFalse(
            TalentSignalRootRoute.opensReviewWorkbench(
                arguments: [
                    "TalentSignal",
                    "--scenario", "relationship-capture-archive",
                    "--backend-url", "http://127.0.0.1:4317",
                    "--workspace-backend-url", "http://127.0.0.1:4317",
                ]
            )
        )
    }

    func testPreviewAttentionRanksWorkNotPeople() {
        let snapshot = PursuitWorkspaceSnapshot.preview

        XCTAssertEqual(snapshot.todayItems.count, 2)
        XCTAssertEqual(snapshot.todayItems[0].kind, .review)
        XCTAssertEqual(snapshot.todayItems[1].kind, .gap)
        XCTAssertEqual(Set(snapshot.todayItems.map(\.pursuitID)).count, 2)
        XCTAssertTrue(snapshot.todayItems.allSatisfy { !$0.title.isEmpty })
    }

    func testTodayOrdersReviewBeforeOwnedActionBeforeEvidenceGap() {
        let preview = PursuitWorkspaceSnapshot.preview
        let actionPursuit = copyPursuit(
            preview.pursuits[0],
            id: "30000000-0000-4000-8000-000000000003",
            title: "General Counsel search",
            gaps: [],
            actions: [
                WorkspaceAction(
                    id: "71000000-0000-4000-8000-000000000001",
                    gapID: nil,
                    title: "Prepare the client calibration question",
                    ownerUserID: preview.currentUserID,
                    ownerDisplayName: preview.currentUserName,
                    status: "drafted",
                    dueAt: "2026-08-25T09:00:00.000Z",
                    outcomeSummary: nil,
                    completedAt: nil,
                    externalEffects: [],
                    revision: 1
                )
            ]
        )
        let snapshot = PursuitWorkspaceSnapshot(
            workspaceID: preview.workspaceID,
            currentUserID: preview.currentUserID,
            currentUserName: preview.currentUserName,
            pursuits: [preview.pursuits[1], actionPursuit, preview.pursuits[0]],
            people: preview.people,
            proposals: preview.proposals,
            loadedAt: preview.loadedAt
        )

        XCTAssertEqual(snapshot.todayItems.map(\.kind), [.action, .review, .gap])
        XCTAssertEqual(Set(snapshot.todayItems.map(\.pursuitID)).count, 3)
        XCTAssertEqual(snapshot.todayItems[0].owner, preview.currentUserName)
        XCTAssertEqual(snapshot.todayItems[0].due, "Aug 25, 2026")
    }

    func testTodayDoesNotHideAttentionAfterThirdPursuit() {
        let preview = PursuitWorkspaceSnapshot.preview
        let pursuits = (1...4).map { index in
            copyPursuit(
                preview.pursuits[0],
                id: String(format: "30000000-0000-4000-8000-%012d", index),
                title: "Active search \(index)",
                gaps: [],
                actions: [
                    WorkspaceAction(
                        id: String(format: "71000000-0000-4000-8000-%012d", index),
                        gapID: nil,
                        title: "Complete owned step \(index)",
                        ownerUserID: preview.currentUserID,
                        ownerDisplayName: preview.currentUserName,
                        status: "in_progress",
                        dueAt: "2026-08-25T09:00:00.000Z",
                        outcomeSummary: nil,
                        completedAt: nil,
                        externalEffects: [],
                        revision: 1
                    )
                ]
            )
        }
        let snapshot = PursuitWorkspaceSnapshot(
            workspaceID: preview.workspaceID,
            currentUserID: preview.currentUserID,
            currentUserName: preview.currentUserName,
            pursuits: pursuits,
            people: preview.people,
            proposals: [],
            loadedAt: preview.loadedAt
        )

        XCTAssertEqual(snapshot.todayItems.count, 4)
        XCTAssertEqual(Set(snapshot.todayItems.map(\.pursuitID)).count, 4)
        XCTAssertEqual(snapshot.noActionPursuitCount, 0)
    }

    func testProposalDoesNotHideSamePursuitActionOrGapContext() {
        let preview = PursuitWorkspaceSnapshot.preview
        let combined = copyPursuit(
            preview.pursuits[0],
            id: preview.pursuits[0].id,
            title: preview.pursuits[0].title,
            gaps: [
                WorkspaceGap(
                    id: "71000000-0000-4000-8000-000000000002",
                    title: "Client availability remains unresolved",
                    status: "open",
                    basis: .init(
                        kind: "evidence_supported",
                        summary: "One reviewed message names the dependency.",
                        evidenceRefs: ["50000000-0000-4000-8000-000000000001"],
                        attributedByUserID: nil,
                        evidenceState: .availableOne
                    ),
                    closeCondition: "The client confirms a time"
                )
            ],
            actions: [
                WorkspaceAction(
                    id: "71000000-0000-4000-8000-000000000003",
                    gapID: "71000000-0000-4000-8000-000000000002",
                    title: "Ask the client for two times",
                    ownerUserID: preview.currentUserID,
                    ownerDisplayName: preview.currentUserName,
                    status: "in_progress",
                    dueAt: "2026-08-24T09:00:00.000Z",
                    outcomeSummary: nil,
                    completedAt: nil,
                    externalEffects: [],
                    revision: 2
                )
            ]
        )
        let snapshot = PursuitWorkspaceSnapshot(
            workspaceID: preview.workspaceID,
            currentUserID: preview.currentUserID,
            currentUserName: preview.currentUserName,
            pursuits: [combined],
            people: preview.people,
            proposals: preview.proposals,
            loadedAt: preview.loadedAt
        )

        let item = try! XCTUnwrap(snapshot.todayItems.first)
        XCTAssertEqual(item.kind, .action)
        XCTAssertNotNil(item.proposalID)
        XCTAssertEqual(item.proposedAction, "Ask the client for two times")
        XCTAssertTrue(item.blocker?.contains("Client availability") == true)
        XCTAssertEqual(item.owner, preview.currentUserName)
        XCTAssertFalse(item.targetOutcome.isEmpty)
    }

    func testTodayNoActionDoesNotInventWork() {
        let preview = PursuitWorkspaceSnapshot.preview
        let snapshot = PursuitWorkspaceSnapshot(
            workspaceID: preview.workspaceID,
            currentUserID: preview.currentUserID,
            currentUserName: preview.currentUserName,
            pursuits: [preview.pursuits[0]],
            people: preview.people,
            proposals: [],
            loadedAt: preview.loadedAt
        )

        XCTAssertTrue(snapshot.todayItems.isEmpty)
        XCTAssertEqual(snapshot.noActionPursuitCount, 1)
    }

    func testFractionalEvidenceTimestampIsLocalizedInsteadOfShownAsRawUTC() {
        let value = WorkspaceDate.evidenceFreshness(
            observedAt: "2026-08-24T02:57:08.067Z",
            sourceTimezone: "Asia/Shanghai"
        )

        XCTAssertTrue(value.contains("Asia/Shanghai"))
        XCTAssertTrue(value.contains("Aug 24, 2026 10:57 AM"))
        XCTAssertFalse(value.contains("T02:57:08.067Z"))
    }

    func testTodayNeverCallsPartialOrUnavailableAuthorityEvidenceBacked() {
        let preview = PursuitWorkspaceSnapshot.preview
        let gap = WorkspaceGap(
            id: "70000000-0000-4000-8000-000000000099",
            title: "A deleted source used to support this dependency",
            status: "open",
            basis: .init(
                kind: "evidence_supported",
                summary: "One of two governed sources remains available.",
                evidenceRefs: [
                    "50000000-0000-4000-8000-000000000098",
                    "50000000-0000-4000-8000-000000000099",
                ],
                attributedByUserID: nil,
                evidenceState: .init(
                    availability: "partial",
                    referenceCount: 2,
                    availableReferenceCount: 1,
                    unavailableReferenceCount: 1
                )
            ),
            closeCondition: "A new reviewed source records the current answer"
        )
        let pursuit = copyPursuit(
            preview.pursuits[1],
            id: preview.pursuits[1].id,
            title: preview.pursuits[1].title,
            gaps: [gap],
            actions: []
        )
        let snapshot = PursuitWorkspaceSnapshot(
            workspaceID: preview.workspaceID,
            currentUserID: preview.currentUserID,
            currentUserName: preview.currentUserName,
            pursuits: [pursuit],
            people: preview.people,
            proposals: [],
            loadedAt: preview.loadedAt
        )

        XCTAssertEqual(snapshot.todayItems.first?.eyebrow, "Evidence partly unavailable")
        XCTAssertFalse(snapshot.todayItems.first?.reason.contains("reviewed evidence") ?? true)
        XCTAssertEqual(
            WorkspaceEvidenceState(
                availability: "unavailable",
                referenceCount: 1,
                availableReferenceCount: 0,
                unavailableReferenceCount: 1
            ).attentionLabel,
            "Evidence unavailable"
        )
    }

    @MainActor
    func testCanonicalFailureNeverFallsBackToPreviewFacts() async {
        let store = PursuitWorkspaceStore(
            service: FailingPursuitWorkspaceService()
        )

        await store.load()

        XCTAssertNil(store.snapshot)
        XCTAssertEqual(store.completedReadCount, 1)
        XCTAssertFalse(store.isReadInFlight)
        guard case let .failed(message) = store.phase else {
            return XCTFail("Expected a failed canonical read.")
        }
        XCTAssertTrue(message.contains("offline"))
    }

    @MainActor
    func testCanonicalRefreshLabelsChangedAndRemovedPursuits() async {
        let initial = PursuitWorkspaceSnapshot.preview
        let changedPursuit = WorkspacePursuit(
            id: initial.pursuits[0].id,
            workspaceID: initial.pursuits[0].workspaceID,
            type: initial.pursuits[0].type,
            title: initial.pursuits[0].title,
            targetOutcome: initial.pursuits[0].targetOutcome,
            targetDate: initial.pursuits[0].targetDate,
            status: initial.pursuits[0].status,
            milestone: initial.pursuits[0].milestone,
            milestoneAuthority: initial.pursuits[0].milestoneAuthority,
            revision: initial.pursuits[0].revision + 1,
            roles: initial.pursuits[0].roles,
            criteria: initial.pursuits[0].criteria,
            gaps: initial.pursuits[0].gaps,
            actions: initial.pursuits[0].actions,
            updatedAt: initial.pursuits[0].updatedAt
        )
        let changed = PursuitWorkspaceSnapshot(
            workspaceID: initial.workspaceID,
            currentUserID: initial.currentUserID,
            currentUserName: initial.currentUserName,
            pursuits: [changedPursuit] + Array(initial.pursuits.dropFirst()),
            people: initial.people,
            proposals: initial.proposals,
            loadedAt: initial.loadedAt
        )
        let removed = PursuitWorkspaceSnapshot(
            workspaceID: initial.workspaceID,
            currentUserID: initial.currentUserID,
            currentUserName: initial.currentUserName,
            pursuits: Array(changed.pursuits.dropFirst()),
            people: initial.people,
            proposals: initial.proposals,
            loadedAt: initial.loadedAt
        )
        let store = PursuitWorkspaceStore(
            service: SequencedPursuitWorkspaceService(
                snapshots: [initial, changed, removed]
            )
        )

        await store.load()
        XCTAssertNil(store.refreshNotice)
        await store.load()
        XCTAssertEqual(
            store.refreshNotice,
            "A Pursuit changed in the canonical workspace. This view was refreshed."
        )
        await store.load()
        XCTAssertEqual(
            store.refreshNotice,
            "A Pursuit was removed from the canonical workspace. This view is current."
        )
    }

    @MainActor
    func testCanonicalRefreshFailureKeepsLastReadAndLabelsUncertainty() async {
        let initial = PursuitWorkspaceSnapshot.preview
        let store = PursuitWorkspaceStore(
            service: SuccessfulThenFailingPursuitWorkspaceService(
                snapshot: initial
            )
        )

        await store.load()
        await store.load()

        XCTAssertEqual(store.snapshot, initial)
        XCTAssertEqual(store.completedReadCount, 2)
        XCTAssertFalse(store.isReadInFlight)
        XCTAssertEqual(store.phase, .loaded(initial))
        XCTAssertEqual(
            store.refreshNotice,
            "Refresh failed. Showing the last canonical read; retry to confirm it is current. The canonical workspace is offline."
        )
    }

    @MainActor
    func testOwnedActionDraftSurvivesStoreRelaunchBeforeSubmission() async {
        let fixture = actionCompletionFixture()
        let persistence = MemoryActionCompletions()
        let first = PursuitWorkspaceStore(
            service: fixture.service,
            actionCompletions: persistence
        )
        await first.load()
        await first.prepareActionCompletion(
            pursuit: fixture.originalPursuit,
            action: fixture.originalAction
        )
        first.updateActionOutcomeDraft(
            pursuit: fixture.originalPursuit,
            action: fixture.originalAction,
            value: "Client supplied two final-conversation times."
        )

        let relaunched = PursuitWorkspaceStore(
            service: fixture.service,
            actionCompletions: persistence
        )
        await relaunched.load()
        await relaunched.prepareActionCompletion(
            pursuit: fixture.originalPursuit,
            action: fixture.originalAction
        )

        XCTAssertEqual(
            relaunched.actionOutcomeDrafts[fixture.originalAction.id],
            "Client supplied two final-conversation times."
        )
        XCTAssertEqual(
            relaunched.actionCompletionPhase(actionID: fixture.originalAction.id),
            .editing
        )
        XCTAssertEqual(fixture.service.completeCount, 0)
    }

    func testOwnedActionRecoveryIsAccountScopedExpiresAndDeletes() throws {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "action-recovery-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        var now = Date(timeIntervalSince1970: 1_787_650_000)
        let accountOne = FilePursuitActionCompletionStore(
            accountID: "account-one",
            rootURL: root,
            now: { now }
        )
        let entry = PersistedPursuitActionCompletion(
            workspaceID: "workspace-one",
            pursuitID: "pursuit-one",
            actionID: "action-one",
            expectedPursuitRevision: 1,
            expectedActionRevision: 1,
            outcomeSummary: "Client supplied two final-conversation times.",
            operationID: UUID(),
            receipt: nil,
            updatedAt: now
        )

        try accountOne.save(entry)
        XCTAssertEqual(try accountOne.entry(for: entry.actionID), entry)
        XCTAssertTrue(
            try FilePursuitActionCompletionStore(
                accountID: "account-two",
                rootURL: root,
                now: { now }
            ).allEntries().isEmpty
        )

        now = now.addingTimeInterval(31 * 24 * 60 * 60)
        XCTAssertTrue(try accountOne.allEntries().isEmpty)

        now = Date(timeIntervalSince1970: 1_787_650_000)
        try accountOne.save(entry)
        try accountOne.deleteAll()
        XCTAssertTrue(try accountOne.allEntries().isEmpty)
    }

    @MainActor
    func testOwnedActionDoesNotPostWhenOperationCannotBeProtected() async {
        let fixture = actionCompletionFixture()
        let persistence = FailingActionCompletions()
        let store = PursuitWorkspaceStore(
            service: fixture.service,
            actionCompletions: persistence
        )
        await store.load()
        store.updateActionOutcomeDraft(
            pursuit: fixture.originalPursuit,
            action: fixture.originalAction,
            value: fixture.outcome
        )

        await store.submitActionCompletion(
            pursuit: fixture.originalPursuit,
            action: fixture.originalAction
        )

        XCTAssertEqual(fixture.service.completeCount, 0)
        guard case let .failed(message) = store.actionCompletionPhase(
            actionID: fixture.originalAction.id
        ) else {
            return XCTFail("Expected a protected-persistence failure.")
        }
        XCTAssertTrue(message.contains("No outcome was sent"))
    }

    @MainActor
    func testOwnedActionResponseLossRelaunchReconcilesOnePersistedOperation() async {
        let operationID = UUID(uuidString: "77777777-7777-4777-8777-777777777777")!
        let fixture = actionCompletionFixture(operationID: operationID)
        fixture.service.completionError = URLError(.networkConnectionLost)
        fixture.service.snapshot = fixture.completedSnapshot
        fixture.service.readback = fixture.readback
        let persistence = MemoryActionCompletions()
        let first = PursuitWorkspaceStore(
            service: fixture.service,
            actionCompletions: persistence,
            operationIDFactory: { operationID }
        )
        fixture.service.snapshot = fixture.originalSnapshot
        await first.load()
        await first.prepareActionCompletion(
            pursuit: fixture.originalPursuit,
            action: fixture.originalAction
        )
        first.updateActionOutcomeDraft(
            pursuit: fixture.originalPursuit,
            action: fixture.originalAction,
            value: fixture.outcome
        )
        await first.submitActionCompletion(
            pursuit: fixture.originalPursuit,
            action: fixture.originalAction
        )
        XCTAssertEqual(
            first.actionCompletionPhase(actionID: fixture.originalAction.id),
            .unknownLocked(operationID: operationID)
        )
        XCTAssertEqual(fixture.service.completeCount, 1)
        XCTAssertEqual(
            persistence.entry(for: fixture.originalAction.id)?.operationID,
            operationID
        )

        fixture.service.snapshot = fixture.completedSnapshot
        let relaunched = PursuitWorkspaceStore(
            service: fixture.service,
            actionCompletions: persistence
        )
        await relaunched.load()

        guard case let .recorded(result) = relaunched.actionCompletionPhase(
            actionID: fixture.originalAction.id
        ) else {
            return XCTFail("Expected canonical action receipt after relaunch readback.")
        }
        XCTAssertEqual(result.receipt.operationID, operationID.uuidString.lowercased())
        XCTAssertEqual(result.pursuit.actions.first?.outcomeSummary, fixture.outcome)
        XCTAssertEqual(fixture.service.completeCount, 1)
        XCTAssertEqual(fixture.service.readOperationCount, 1)
        XCTAssertEqual(
            persistence.entry(for: fixture.originalAction.id)?.receipt,
            fixture.receipt
        )
    }

    @MainActor
    func testOwnedActionMismatchedReceiptRemainsUnknownLocked() async {
        let operationID = UUID()
        let fixture = actionCompletionFixture(operationID: operationID)
        let malformedReceipt = PursuitReviewReceipt(
            id: fixture.receipt.id,
            operationID: UUID().uuidString.lowercased(),
            workspaceID: fixture.receipt.workspaceID,
            operationKind: fixture.receipt.operationKind,
            status: fixture.receipt.status,
            proposalID: fixture.receipt.proposalID,
            actorUserID: fixture.receipt.actorUserID,
            outcome: fixture.receipt.outcome,
            entityRef: fixture.receipt.entityRef,
            changedFields: fixture.receipt.changedFields,
            externalEffects: fixture.receipt.externalEffects,
            summary: fixture.receipt.summary,
            occurredAt: fixture.receipt.occurredAt
        )
        fixture.service.completionResult = PursuitActionCompletionResult(
            pursuit: fixture.completedPursuit,
            receipt: malformedReceipt
        )
        let store = PursuitWorkspaceStore(
            service: fixture.service,
            actionCompletions: MemoryActionCompletions(),
            operationIDFactory: { operationID }
        )
        await store.load()
        await store.prepareActionCompletion(
            pursuit: fixture.originalPursuit,
            action: fixture.originalAction
        )
        store.updateActionOutcomeDraft(
            pursuit: fixture.originalPursuit,
            action: fixture.originalAction,
            value: fixture.outcome
        )
        await store.submitActionCompletion(
            pursuit: fixture.originalPursuit,
            action: fixture.originalAction
        )

        XCTAssertEqual(
            store.actionCompletionPhase(actionID: fixture.originalAction.id),
            .unknownLocked(operationID: operationID)
        )
    }

    func testAskReadbackBindsExactCitationBeforeSessionRecording() throws {
        let response = relationshipAskResponseFixture()
        let readback = relationshipAskReadbackFixture()

        let validated = try readback.validated(
            response,
            expectedAccountID: "account-1",
            expectedPersonID: "person-1",
            expectedRelationshipContextID: "context-1"
        )

        XCTAssertEqual(validated.citations.map(\.id), ["evidence-1"])
        XCTAssertEqual(
            validated.citations.first?.exactExcerpt,
            "The final conversation works next Tuesday."
        )
    }

    func testAskReadbackRejectsWrongPersonAndUnavailableCitation() {
        let response = relationshipAskResponseFixture()
        XCTAssertThrowsError(
            try relationshipAskReadbackFixture().validated(
                response,
                expectedAccountID: "account-1",
                expectedPersonID: "wrong-person",
                expectedRelationshipContextID: "context-1"
            )
        ) { error in
            XCTAssertEqual(
                error as? PursuitWorkspaceClientError,
                .askReadbackEnvelopeMismatch
            )
        }
        XCTAssertThrowsError(
            try relationshipAskReadbackFixture(
                citationAvailability: "deleted"
            ).validated(
                response,
                expectedAccountID: "account-1",
                expectedPersonID: "person-1",
                expectedRelationshipContextID: "context-1"
            )
        ) { error in
            XCTAssertEqual(
                error as? PursuitWorkspaceClientError,
                .citedEvidenceUnavailable
            )
        }
    }

    func testAskReadbackRejectsCitationScopeReviewAttributionAndExcerptMismatches() {
        let response = relationshipAskResponseFixture()
        let invalidReadbacks = [
            relationshipAskReadbackFixture(citationPersonID: "person-2"),
            relationshipAskReadbackFixture(
                citationRelationshipContextID: "context-2"
            ),
            relationshipAskReadbackFixture(
                citationAuthorizationScope: "person:person-2:relationship-context:context-2"
            ),
            relationshipAskReadbackFixture(citationReviewStatus: "rejected"),
            relationshipAskReadbackFixture(
                citationAttributionStatus: "proposed"
            ),
            relationshipAskReadbackFixture(citationAttributionStatus: "unknown"),
            relationshipAskReadbackFixture(citationExactExcerpt: nil),
        ]

        for readback in invalidReadbacks {
            XCTAssertThrowsError(
                try readback.validated(
                    response,
                    expectedAccountID: "account-1",
                    expectedPersonID: "person-1",
                    expectedRelationshipContextID: "context-1"
                )
            )
        }
    }
}

private func relationshipAskResponseFixture() -> RelationshipAskResponse {
    RelationshipAskResponse(
        contractVersion: TalentSignalAPIContract.version,
        taskID: "task-1",
        contextManifestID: "manifest-1",
        knowledgeSnapshotID: "snapshot-1",
        disposition: "answer",
        blocks: [
            .init(
                id: "block-1",
                kind: "source_receipt",
                title: "Governed source material",
                body: "One exact fragment is attached.",
                status: "needs_review",
                citationDependencyIDs: ["evidence-1"],
                requiresUserDecision: true
            ),
        ],
        createdAt: "2026-08-25T01:00:00.000Z"
    )
}

private final class AgentSessionTestClock {
    var now: Date

    init(now: Date) {
        self.now = now
    }
}

private final class FailingDeletionAgentSessionPersistence: AgentSessionPersisting {
    var data: Data?
    var isDeletionPending = false
    var failCompletion = true

    func load() throws -> Data? {
        data
    }

    func save(_ data: Data) throws {
        self.data = data
    }

    func deletionPending() throws -> Bool {
        isDeletionPending
    }

    func beginDeletion() throws {
        isDeletionPending = true
    }

    func completeDeletion() throws {
        if failCompletion {
            throw CocoaError(.fileWriteUnknown)
        }
        data = nil
        isDeletionPending = false
    }
}

private final class ToggleSaveAgentSessionPersistence: AgentSessionPersisting {
    var data: Data?
    var failSave = false
    var saveAttempts = 0

    func load() throws -> Data? { data }

    func save(_ data: Data) throws {
        saveAttempts += 1
        if failSave {
            throw CocoaError(.fileWriteNoPermission)
        }
        self.data = data
    }

    func deletionPending() throws -> Bool { false }
    func beginDeletion() throws {}
    func completeDeletion() throws { data = nil }
}

private func relationshipAskReadbackFixture(
    citationAvailability: String = "available",
    citationPersonID: String = "person-1",
    citationRelationshipContextID: String = "context-1",
    citationAuthorizationScope: String = "person:person-1:relationship-context:context-1",
    citationReviewStatus: String = "reviewed",
    citationAttributionStatus: String = "confirmed",
    citationExactExcerpt: String? = "The final conversation works next Tuesday.",
    citationLastReviewID: String? = "review-1"
) -> RelationshipAskReadback {
    RelationshipAskReadback(
        contractVersion: TalentSignalAPIContract.version,
        accountID: "account-1",
        taskID: "task-1",
        contextManifestID: "manifest-1",
        knowledgeSnapshotID: "snapshot-1",
        personID: "person-1",
        relationshipContextID: "context-1",
        manifestStatus: "active",
        snapshotStatus: "published",
        authorizationScope: "person:person-1:relationship-context:context-1",
        citations: [
            .init(
                id: "evidence-1",
                dependencyType: "evidence_fragment",
                personID: citationPersonID,
                relationshipContextID: citationRelationshipContextID,
                inclusionReason: "Exact reviewed source fragment.",
                authorizationScope: citationAuthorizationScope,
                availability: citationAvailability,
                unavailableReason: citationAvailability == "available"
                    ? nil
                    : "The source was deleted.",
                resourceID: "resource-1",
                sourceName: "Candidate message",
                observedAt: "2026-08-24T10:00:00.000Z",
                sourceTimezone: "Asia/Shanghai",
                captureVersion: 1,
                fragmentKind: "message",
                sequence: 0,
                exactExcerpt: citationAvailability == "available"
                    ? citationExactExcerpt
                    : nil,
                attribution: .init(
                    actorKind: "candidate",
                    status: citationAttributionStatus
                ),
                reviewStatus: citationReviewStatus,
                parser: .init(name: "fixture", version: "1.0.0"),
                contentHash: String(repeating: "0", count: 64),
                fragmentCreatedAt: "2026-08-24T10:00:01.000Z",
                lastReviewID: citationLastReviewID,
                lastReviewedAt: "2026-08-24T10:00:02.000Z",
                lastReviewedBy: "Recruiter"
            ),
        ],
        createdAt: "2026-08-25T01:00:00.000Z"
    )
}

private func copyPursuit(
    _ pursuit: WorkspacePursuit,
    id: String,
    title: String,
    gaps: [WorkspaceGap],
    actions: [WorkspaceAction]
) -> WorkspacePursuit {
    WorkspacePursuit(
        id: id,
        workspaceID: pursuit.workspaceID,
        type: pursuit.type,
        title: title,
        targetOutcome: pursuit.targetOutcome,
        targetDate: pursuit.targetDate,
        status: pursuit.status,
        milestone: pursuit.milestone,
        milestoneAuthority: pursuit.milestoneAuthority,
        revision: pursuit.revision,
        roles: pursuit.roles,
        criteria: pursuit.criteria,
        gaps: gaps,
        actions: actions,
        updatedAt: pursuit.updatedAt
    )
}

private struct FailingPursuitWorkspaceService: PursuitWorkspaceServing {
    func loadWorkspace() async throws -> PursuitWorkspaceSnapshot {
        throw FailingWorkspaceError.offline
    }
}

private actor SequencedPursuitWorkspaceService: PursuitWorkspaceServing {
    private var snapshots: [PursuitWorkspaceSnapshot]

    init(snapshots: [PursuitWorkspaceSnapshot]) {
        self.snapshots = snapshots
    }

    func loadWorkspace() async throws -> PursuitWorkspaceSnapshot {
        guard !snapshots.isEmpty else {
            throw FailingWorkspaceError.offline
        }
        return snapshots.removeFirst()
    }
}

private actor SuccessfulThenFailingPursuitWorkspaceService: PursuitWorkspaceServing {
    private let snapshot: PursuitWorkspaceSnapshot
    private var didReturnSnapshot = false

    init(snapshot: PursuitWorkspaceSnapshot) {
        self.snapshot = snapshot
    }

    func loadWorkspace() async throws -> PursuitWorkspaceSnapshot {
        guard !didReturnSnapshot else {
            throw FailingWorkspaceError.offline
        }
        didReturnSnapshot = true
        return snapshot
    }
}

private enum FailingWorkspaceError: LocalizedError {
    case offline

    var errorDescription: String? { "The canonical workspace is offline." }
}

private struct ActionCompletionFixture {
    let originalAction: WorkspaceAction
    let completedAction: WorkspaceAction
    let originalPursuit: WorkspacePursuit
    let completedPursuit: WorkspacePursuit
    let originalSnapshot: PursuitWorkspaceSnapshot
    let completedSnapshot: PursuitWorkspaceSnapshot
    let outcome: String
    let receipt: PursuitReviewReceipt
    let readback: PursuitActionOperationReadback
    let service: StubActionCompletionService
}

private func actionCompletionFixture(
    operationID: UUID = UUID(uuidString: "77777777-7777-4777-8777-777777777777")!
) -> ActionCompletionFixture {
    let preview = PursuitWorkspaceSnapshot.preview
    let base = preview.pursuits[0]
    let actionID = "71000000-0000-4000-8000-000000000777"
    let outcome = "Client supplied two final-conversation times."
    let originalAction = WorkspaceAction(
        id: actionID,
        gapID: nil,
        title: "Ask the client for two final-conversation times",
        ownerUserID: preview.currentUserID,
        ownerDisplayName: preview.currentUserName,
        status: "in_progress",
        dueAt: "2026-08-24T09:00:00.000Z",
        outcomeSummary: nil,
        completedAt: nil,
        externalEffects: [],
        revision: 2
    )
    let completedAction = WorkspaceAction(
        id: actionID,
        gapID: nil,
        title: originalAction.title,
        ownerUserID: originalAction.ownerUserID,
        ownerDisplayName: originalAction.ownerDisplayName,
        status: "completed",
        dueAt: originalAction.dueAt,
        outcomeSummary: outcome,
        completedAt: "2026-08-24T14:00:00.000Z",
        externalEffects: [],
        revision: 3
    )
    let originalPursuit = WorkspacePursuit(
        id: base.id,
        workspaceID: base.workspaceID,
        type: base.type,
        title: base.title,
        targetOutcome: base.targetOutcome,
        targetDate: base.targetDate,
        status: base.status,
        milestone: base.milestone,
        milestoneAuthority: base.milestoneAuthority,
        revision: 3,
        roles: base.roles,
        criteria: base.criteria,
        gaps: base.gaps,
        actions: [originalAction],
        updatedAt: base.updatedAt
    )
    let completedPursuit = WorkspacePursuit(
        id: base.id,
        workspaceID: base.workspaceID,
        type: base.type,
        title: base.title,
        targetOutcome: base.targetOutcome,
        targetDate: base.targetDate,
        status: base.status,
        milestone: base.milestone,
        milestoneAuthority: base.milestoneAuthority,
        revision: 4,
        roles: base.roles,
        criteria: base.criteria,
        gaps: base.gaps,
        actions: [completedAction],
        updatedAt: "2026-08-24T14:00:00.000Z"
    )
    let originalSnapshot = PursuitWorkspaceSnapshot(
        workspaceID: preview.workspaceID,
        currentUserID: preview.currentUserID,
        currentUserName: preview.currentUserName,
        pursuits: [originalPursuit],
        people: preview.people,
        proposals: [],
        loadedAt: preview.loadedAt
    )
    let completedSnapshot = PursuitWorkspaceSnapshot(
        workspaceID: preview.workspaceID,
        currentUserID: preview.currentUserID,
        currentUserName: preview.currentUserName,
        pursuits: [completedPursuit],
        people: preview.people,
        proposals: [],
        loadedAt: preview.loadedAt
    )
    let receipt = PursuitReviewReceipt(
        id: "66666666-6666-4666-8666-666666666777",
        operationID: operationID.uuidString.lowercased(),
        workspaceID: preview.workspaceID,
        operationKind: "revise_pursuit",
        status: "applied",
        proposalID: nil,
        actorUserID: preview.currentUserID,
        outcome: "canonical_applied",
        entityRef: .init(beforeRevision: 3, afterRevision: 4),
        changedFields: [
            "actions.\(actionID).status",
            "actions.\(actionID).outcome_summary",
        ],
        externalEffects: [],
        summary: "Owned internal action completed with an observed outcome.",
        occurredAt: "2026-08-24T14:00:00.000Z"
    )
    let result = PursuitActionCompletionResult(
        pursuit: completedPursuit,
        receipt: receipt
    )
    let readback = PursuitActionOperationReadback(
        contractVersion: TalentSignalAPIContract.version,
        operation: .init(
            id: operationID.uuidString.lowercased(),
            pursuitID: originalPursuit.id,
            proposalID: nil,
            operationKind: "revise_pursuit",
            status: "applied",
            beforeRevision: 3,
            afterRevision: 4
        ),
        receipt: receipt,
        pursuit: completedPursuit
    )
    let service = StubActionCompletionService(
        snapshot: originalSnapshot,
        completionResult: result,
        readback: readback
    )
    return ActionCompletionFixture(
        originalAction: originalAction,
        completedAction: completedAction,
        originalPursuit: originalPursuit,
        completedPursuit: completedPursuit,
        originalSnapshot: originalSnapshot,
        completedSnapshot: completedSnapshot,
        outcome: outcome,
        receipt: receipt,
        readback: readback,
        service: service
    )
}

private final class StubActionCompletionService: PursuitWorkspaceServing {
    var snapshot: PursuitWorkspaceSnapshot
    var completionResult: PursuitActionCompletionResult
    var completionError: Error?
    var readback: PursuitActionOperationReadback
    private(set) var completeCount = 0
    private(set) var readOperationCount = 0

    init(
        snapshot: PursuitWorkspaceSnapshot,
        completionResult: PursuitActionCompletionResult,
        readback: PursuitActionOperationReadback
    ) {
        self.snapshot = snapshot
        self.completionResult = completionResult
        self.readback = readback
    }

    func loadWorkspace() async throws -> PursuitWorkspaceSnapshot {
        snapshot
    }

    func completeAction(
        pursuitID: String,
        actionID: String,
        expectedPursuitRevision: Int,
        expectedActionRevision: Int,
        outcomeSummary: String,
        operationID: UUID
    ) async throws -> PursuitActionCompletionResult {
        completeCount += 1
        if let completionError { throw completionError }
        return completionResult
    }

    func readOperation(id: UUID) async throws -> PursuitActionOperationReadback {
        readOperationCount += 1
        return readback
    }
}

private final class MemoryActionCompletions: PursuitActionCompletionPersisting {
    private var values: [String: PersistedPursuitActionCompletion] = [:]

    func entry(for actionID: String) -> PersistedPursuitActionCompletion? {
        values[actionID]
    }

    func allEntries() -> [PersistedPursuitActionCompletion] {
        Array(values.values)
    }

    func save(_ entry: PersistedPursuitActionCompletion) {
        values[entry.actionID] = entry
    }

    func remove(actionID: String) {
        values.removeValue(forKey: actionID)
    }

    func deleteAll() {
        values = [:]
    }
}

private final class FailingActionCompletions: PursuitActionCompletionPersisting {
    private var entryValue: PersistedPursuitActionCompletion?

    func entry(for actionID: String) -> PersistedPursuitActionCompletion? {
        entryValue?.actionID == actionID ? entryValue : nil
    }

    func allEntries() -> [PersistedPursuitActionCompletion] {
        entryValue.map { [$0] } ?? []
    }

    func save(_ entry: PersistedPursuitActionCompletion) throws {
        if entry.operationID != nil {
            throw CocoaError(.fileWriteNoPermission)
        }
        entryValue = entry
    }

    func remove(actionID: String) {
        entryValue = nil
    }

    func deleteAll() {
        entryValue = nil
    }
}
