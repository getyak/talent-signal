import XCTest
@testable import TalentSignal

final class RelationshipArchiveTests: XCTestCase {
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
        await relaunched.prepareActionCompletion(
            pursuit: fixture.completedPursuit,
            action: fixture.completedAction
        )

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

private func relationshipAskReadbackFixture(
    citationAvailability: String = "available",
    citationPersonID: String = "person-1",
    citationRelationshipContextID: String = "context-1",
    citationAuthorizationScope: String = "person:person-1:relationship-context:context-1",
    citationReviewStatus: String = "reviewed",
    citationAttributionStatus: String = "confirmed",
    citationExactExcerpt: String? = "The final conversation works next Tuesday."
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

    func save(_ entry: PersistedPursuitActionCompletion) {
        values[entry.actionID] = entry
    }

    func remove(actionID: String) {
        values.removeValue(forKey: actionID)
    }
}
