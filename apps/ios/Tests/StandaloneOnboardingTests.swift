import XCTest
@testable import TalentSignal

final class StandaloneOnboardingTests: XCTestCase {
    func testDefaultCalendarDisclosureIsExactlyFourteenUpcomingDays() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let now = Date(timeIntervalSince1970: 1_000_000)
        let state = StandaloneOnboardingState.fresh()
        let interval = state.calendarWindow.interval(now: now, calendar: calendar)

        XCTAssertEqual(state.calendarWindow, .upcoming)
        XCTAssertEqual(interval.start, now)
        XCTAssertEqual(interval.duration, 14 * 24 * 60 * 60)
        XCTAssertTrue(StandaloneCalendarWindow.recentAndUpcoming.rawValue.contains("28 days total"))
    }

    func testTodayCannotOpenBeforeVerifiedActivation() {
        var state = readyForSourceChoice()

        state.enterToday()

        XCTAssertFalse(state.introCompleted)
        XCTAssertEqual(state.route, .sourceChoice)
    }

    func testVoiceChoiceCreatesDraftBeforePermissionOrRecording() throws {
        var state = readyForSourceChoice()

        XCTAssertTrue(state.chooseSource(.voice, now: Date(timeIntervalSince1970: 10)))

        let draft = try XCTUnwrap(state.captureDraft)
        XCTAssertEqual(state.route, .capture)
        XCTAssertEqual(draft.state, .draftCreated)
        XCTAssertEqual(draft.sourceKind, .voice)
        XCTAssertFalse(draft.idempotencyKey.uuidString.isEmpty)
    }

    func testCalendarPermissionNeverActivatesOnboarding() {
        var state = readyForSourceChoice()
        XCTAssertTrue(state.chooseSource(.calendar))

        state.observeCalendar(.connectedWithMeetings)

        XCTAssertEqual(state.activationStatus, .notStarted)
        XCTAssertNil(state.progress)
    }

    func testUnknownOnlyReviewDoesNotCreateVerifiedProgress() throws {
        var state = try proposalReadyState()

        XCTAssertTrue(state.keepUnresolvedOnly())
        XCTAssertFalse(state.confirm())

        XCTAssertEqual(state.activationStatus, .proposalReviewed)
        XCTAssertNil(state.progress)
        XCTAssertEqual(state.route, .proposalReview)
    }

    func testConfirmedFactCreatesExactlyOneVerifiedProgress() throws {
        var state = try proposalReadyState()
        let proposal = try XCTUnwrap(state.proposal)
        let fact = try XCTUnwrap(proposal.facts.first)
        state.selectedFactIDs.removeAll()
        state.selectFact(fact.id, selected: true)
        let confirmationTime = Date(timeIntervalSince1970: 50)

        XCTAssertTrue(state.confirm(now: confirmationTime))
        let first = try XCTUnwrap(state.progress)
        XCTAssertEqual(state.activationStatus, .verifiedProgress)
        XCTAssertEqual(first.confirmedFacts.map(\.id), [fact.id])

        XCTAssertTrue(state.confirm(now: Date(timeIntervalSince1970: 80)))
        XCTAssertEqual(state.progress?.id, first.id)
        XCTAssertEqual(state.progress?.confirmedAt, confirmationTime)
    }

    func testProposalFactsRequireAnExplicitSelection() throws {
        let state = try proposalReadyState()

        XCTAssertTrue(state.selectedFactIDs.isEmpty)
        XCTAssertNil(state.progress)
        XCTAssertEqual(state.activationStatus, .notStarted)
    }

    func testUnsupportedModelFactBecomesUnknownInsteadOfConfirmableFact() throws {
        let state = try proposalReadyState()
        var proposal = try XCTUnwrap(state.proposal)
        proposal.facts.append(
            StandaloneProposalFact(
                id: UUID(),
                field: "Acceptance probability",
                proposedValue: "Likely to accept",
                evidenceExcerpt: "The candidate will definitely accept",
                confidenceBand: "Model proposal · review required"
            )
        )

        let grounded = proposal.enforcingEvidenceGrounding(
            in: try XCTUnwrap(state.captureDraft?.text)
        )

        XCTAssertFalse(grounded.facts.contains { $0.field == "Acceptance probability" })
        XCTAssertTrue(grounded.unknowns.contains { $0.question.contains("acceptance probability") })
    }

    func testDemoEngineRejectsArbitraryPrivateTextOutsideShowcaseFixture() async throws {
        var state = readyForSourceChoice()
        XCTAssertTrue(state.chooseSource(.text))
        state.updateDraftText("A private candidate note that is not the showcase fixture.")
        let draft = try XCTUnwrap(state.captureDraft)
        let pursuit = try XCTUnwrap(state.pursuit)

        do {
            _ = try await AdaptiveStandaloneProposalEngine(forceDemo: true)
                .generate(draft: draft, pursuit: pursuit)
            XCTFail("Arbitrary text must not receive deterministic Demo output")
        } catch let error as StandaloneProposalEngineError {
            XCTAssertEqual(error, .onDeviceIntelligenceUnavailable)
        }
    }

    func testDemoEngineAcceptsOnlyTheExplicitShowcaseFixture() async throws {
        var state = readyForSourceChoice()
        XCTAssertTrue(state.chooseSource(.text))
        state.updateDraftText(StandaloneDemoProposalCatalog.showcaseSignal)
        let draft = try XCTUnwrap(state.captureDraft)
        let pursuit = try XCTUnwrap(state.pursuit)

        let proposal = try await AdaptiveStandaloneProposalEngine(forceDemo: true)
            .generate(draft: draft, pursuit: pursuit)

        XCTAssertEqual(proposal.engineLabel, "Demo Engine · fixture v1")
    }

    func testExplicitlyAcceptedActionCanCreateProgressWhileUnknownRemains() throws {
        var state = try proposalReadyState()
        let proposal = try XCTUnwrap(state.proposal)
        state.selectedFactIDs.removeAll()
        let action = try XCTUnwrap(proposal.nextActions.first)
        state.acceptAction(action.id, accepted: true)

        XCTAssertTrue(state.confirm())

        XCTAssertEqual(state.progress?.acceptedActions.map(\.id), [action.id])
        XCTAssertFalse(state.progress?.unresolved.isEmpty ?? true)
    }

    func testStaleProcessingGenerationCannotReplaceCurrentProposal() throws {
        var state = readyForSourceChoice()
        XCTAssertTrue(state.chooseSource(.text))
        state.updateDraftText("Mina prefers remote.")
        let generation = try XCTUnwrap(state.beginProcessing())
        let draft = try XCTUnwrap(state.captureDraft)
        let pursuit = try XCTUnwrap(state.pursuit)
        let proposal = StandaloneDemoProposalCatalog.proposal(for: draft, pursuit: pursuit)

        XCTAssertFalse(state.receiveProposal(proposal, generation: generation - 1))
        XCTAssertNil(state.proposal)
        XCTAssertTrue(state.receiveProposal(proposal, generation: generation))
    }

    func testFilePersistenceRestoresExactRouteAndIdentifiers() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        let fileURL = directory.appending(path: "session.json")
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = FileStandaloneOnboardingStore(fileURL: fileURL)
        var state = readyForSourceChoice()
        XCTAssertTrue(state.chooseSource(.text))
        state.updateDraftText("A recoverable Signal")

        try persistence.save(state)
        let restored = try XCTUnwrap(persistence.load())

        XCTAssertEqual(restored.sessionID, state.sessionID)
        XCTAssertEqual(restored.account?.id, state.account?.id)
        XCTAssertEqual(restored.pursuit?.id, state.pursuit?.id)
        XCTAssertEqual(restored.captureDraft?.id, state.captureDraft?.id)
        XCTAssertEqual(restored.captureDraft?.idempotencyKey, state.captureDraft?.idempotencyKey)
        XCTAssertEqual(restored.captureDraft?.text, state.captureDraft?.text)
        XCTAssertEqual(restored.route, .capture)
    }

    func testRelaunchRecoversInterruptedProcessingWithoutLosingDraft() throws {
        var state = readyForSourceChoice()
        XCTAssertTrue(state.chooseSource(.text))
        state.updateDraftText("A recoverable Signal")
        _ = try XCTUnwrap(state.beginProcessing())
        let draftBeforeRelaunch = try XCTUnwrap(state.captureDraft)

        XCTAssertTrue(state.recoverInterruptedWorkAfterRelaunch())

        XCTAssertEqual(state.route, .capture)
        XCTAssertEqual(state.captureDraft?.id, draftBeforeRelaunch.id)
        XCTAssertEqual(state.captureDraft?.idempotencyKey, draftBeforeRelaunch.idempotencyKey)
        XCTAssertEqual(state.captureDraft?.text, draftBeforeRelaunch.text)
        XCTAssertEqual(state.captureDraft?.state, .failedRecoverable)
        XCTAssertNotNil(state.lastRecoverableError)
    }

    func testRelaunchRecoversEveryTransientCapturePhase() throws {
        for transientState in [
            StandaloneCaptureState.requestingPermission,
            .recording,
            .transcribing,
            .processing,
        ] {
            var state = readyForSourceChoice()
            XCTAssertTrue(state.chooseSource(.voice))
            state.updateCaptureState(transientState)
            let draftID = try XCTUnwrap(state.captureDraft?.id)

            XCTAssertTrue(state.recoverInterruptedWorkAfterRelaunch())
            XCTAssertEqual(state.route, .capture)
            XCTAssertEqual(state.captureDraft?.id, draftID)
            XCTAssertEqual(state.captureDraft?.state, .failedRecoverable)
        }
    }

    func testDiscardKeepsSignalDraftRecoverable() throws {
        var state = try proposalReadyState()
        let draftID = try XCTUnwrap(state.captureDraft?.id)

        state.discardProposal()

        XCTAssertNil(state.proposal)
        XCTAssertEqual(state.captureDraft?.id, draftID)
        XCTAssertEqual(state.captureDraft?.state, .readyToProcess)
        XCTAssertEqual(state.route, .capture)
    }

    func testEditSelectsCorrectedFactBeforeConfirmation() throws {
        var state = try proposalReadyState()
        let fact = try XCTUnwrap(state.proposal?.facts.first)
        state.selectedFactIDs.removeAll()

        state.editFact(fact.id, value: "  Remote within Europe  ")

        XCTAssertTrue(state.selectedFactIDs.contains(fact.id))
        XCTAssertTrue(state.confirm())
        XCTAssertEqual(state.progress?.confirmedFacts.first?.proposedValue, "Remote within Europe")
    }

    func testWrongPursuitWithdrawsProposalButPreservesSourceAndSignal() throws {
        var state = try proposalReadyState()
        let draft = try XCTUnwrap(state.captureDraft)

        state.markWrongPursuit()

        XCTAssertEqual(state.route, .pursuit)
        XCTAssertNil(state.proposal)
        XCTAssertEqual(state.captureDraft?.id, draft.id)
        XCTAssertEqual(state.captureDraft?.text, draft.text)
        XCTAssertEqual(state.captureDraft?.state, .readyToProcess)
        XCTAssertNotNil(state.selectedSource)
    }

    func testResetDeletesSessionAndRecordingsWithoutTouchingUnrelatedFiles() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        let recordings = directory.appending(path: "Recordings", directoryHint: .isDirectory)
        let fileURL = directory.appending(path: "session.json")
        let unrelatedURL = directory.appending(path: "keep-me.txt")
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: recordings, withIntermediateDirectories: true)
        try Data("audio".utf8).write(to: recordings.appending(path: "capture.m4a"))
        try Data("unrelated".utf8).write(to: unrelatedURL)
        let persistence = FileStandaloneOnboardingStore(fileURL: fileURL)
        try persistence.save(readyForSourceChoice())

        try persistence.reset()

        XCTAssertFalse(FileManager.default.fileExists(atPath: fileURL.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: recordings.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: unrelatedURL.path))
    }

    @MainActor
    func testPersistenceFailureNeverPublishesVerifiedProgressOrToday() throws {
        let persistence = ControlledStandalonePersistence(state: try proposalReadyState())
        let store = StandaloneOnboardingStore(persistence: persistence)
        let fact = try XCTUnwrap(store.state.proposal?.facts.first)
        store.selectFact(fact.id, selected: true)
        persistence.rejectSaves = true

        store.confirm()

        XCTAssertEqual(store.state.route, .proposalReview)
        XCTAssertNil(store.state.progress)
        XCTAssertEqual(store.state.activationStatus, .notStarted)
        XCTAssertNotNil(store.persistenceNotice)
        XCTAssertNil(persistence.state?.progress)
    }

    @MainActor
    func testResetSaveFailureDoesNotPublishAnUnsavedFreshState() {
        let originalState = readyForSourceChoice()
        let persistence = ControlledStandalonePersistence(state: originalState)
        let store = StandaloneOnboardingStore(persistence: persistence)
        persistence.rejectSaves = true

        store.resetDemoData()

        XCTAssertEqual(store.state.sessionID, originalState.sessionID)
        XCTAssertEqual(store.state.route, originalState.route)
        XCTAssertNotNil(store.persistenceNotice)
        XCTAssertNil(persistence.state)
    }

    func testSharedCaptureInboxAtomicallyQueuesImageTextAndURL() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = try SharedCaptureInbox(rootURL: directory)

        let image = try inbox.appendImage(
            data: Data("image".utf8),
            fileExtension: "png",
            mediaType: "image/png",
            note: "Candidate shared a written update.",
            now: Date(timeIntervalSince1970: 1)
        )
        let text = try inbox.appendText(
            "Remote preference confirmed.",
            now: Date(timeIntervalSince1970: 2)
        )
        let url = try inbox.appendURL(
            URL(string: "https://example.com/brief")!,
            now: Date(timeIntervalSince1970: 3)
        )

        XCTAssertEqual(try inbox.pending().map(\.id), [image.id, text.id, url.id])
        XCTAssertNotNil(inbox.payloadURL(for: image))
        let temporaryFiles = try FileManager.default.contentsOfDirectory(
            at: directory.appending(path: "Temporary"),
            includingPropertiesForKeys: nil
        )
        XCTAssertTrue(temporaryFiles.isEmpty)

        try inbox.markImported(image.id)
        XCTAssertEqual(try inbox.pending().map(\.id), [text.id, url.id])
    }

    func testSharedCaptureResetDeletesEnvelopesAndPayloads() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = try SharedCaptureInbox(rootURL: directory)
        _ = try inbox.appendImage(
            data: Data("synthetic-image".utf8),
            fileExtension: "png",
            mediaType: "image/png"
        )
        _ = try inbox.appendText("Synthetic candidate note")

        try inbox.reset()

        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.path))
    }

    func testSharedCaptureImportsIdempotentlyIntoTheSameReviewFlow() throws {
        var state = readyForSourceChoice()
        let envelope = SharedCaptureEnvelope(
            id: UUID(uuidString: "51515151-5151-4515-8515-515151515151")!,
            kind: .text,
            text: "Remote preference confirmed. Visa status remains unclear."
        )

        XCTAssertTrue(state.importSharedCapture(envelope))
        XCTAssertEqual(state.route, .capture)
        XCTAssertEqual(state.captureDraft?.sharedEnvelopeID, envelope.id)
        XCTAssertEqual(state.captureDraft?.idempotencyKey, envelope.id)
        XCTAssertFalse(state.importSharedCapture(envelope))

        let generation = try XCTUnwrap(state.beginProcessing())
        let draft = try XCTUnwrap(state.captureDraft)
        let pursuit = try XCTUnwrap(state.pursuit)
        let proposal = StandaloneDemoProposalCatalog.proposal(for: draft, pursuit: pursuit)
        XCTAssertTrue(state.receiveProposal(proposal, generation: generation))
        XCTAssertEqual(state.route, .proposalReview)
        XCTAssertTrue(proposal.sourceSummary.contains("Share Sheet"))
    }

    func testLiveActivityStopRequestIsDraftScopedAndConsumedOnce() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let requestedDraftID = UUID()

        try LiveActivityStopRequestBridge.write(
            draftID: requestedDraftID,
            rootURL: directory,
            now: Date(timeIntervalSince1970: 4)
        )

        XCTAssertFalse(
            try LiveActivityStopRequestBridge.consume(
                draftID: UUID(),
                rootURL: directory
            )
        )
        XCTAssertTrue(
            try LiveActivityStopRequestBridge.consume(
                draftID: requestedDraftID,
                rootURL: directory
            )
        )
        XCTAssertFalse(
            try LiveActivityStopRequestBridge.consume(
                draftID: requestedDraftID,
                rootURL: directory
            )
        )
    }

    func testLiveActivityStopRequestAtomicallyReplacesAnOlderRequest() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let first = UUID()
        let latest = UUID()

        try LiveActivityStopRequestBridge.write(draftID: first, rootURL: directory)
        try LiveActivityStopRequestBridge.write(draftID: latest, rootURL: directory)

        XCTAssertFalse(try LiveActivityStopRequestBridge.consume(draftID: first, rootURL: directory))
        XCTAssertTrue(try LiveActivityStopRequestBridge.consume(draftID: latest, rootURL: directory))
    }

    func testSystemCaptureUsesOneUnassignedInboxItemUntilPursuitExists() throws {
        var state = StandaloneOnboardingState.fresh()

        state.requestSystemCapture(.voice)
        let pendingID = try XCTUnwrap(state.unassignedSystemCaptureID)
        state.requestSystemCapture(.voice)
        XCTAssertEqual(state.unassignedSystemCaptureID, pendingID)
        XCTAssertNil(state.captureDraft)

        state.begin(displayName: "Recruiter", demoAccount: false)
        XCTAssertTrue(
            state.createPursuit(
                template: "Hire someone",
                outcome: "Hire a VP of Engineering",
                targetDate: nil
            )
        )
        state.requestSystemCapture(.voice)

        XCTAssertNil(state.unassignedSystemCaptureID)
        XCTAssertEqual(state.captureDraft?.sourceKind, .voice)
        XCTAssertEqual(state.captureDraft?.pursuitID, state.pursuit?.id)
        XCTAssertEqual(state.route, .capture)
    }

    private func readyForSourceChoice() -> StandaloneOnboardingState {
        var state = StandaloneOnboardingState.fresh()
        state.begin(displayName: "Recruiter", demoAccount: false)
        XCTAssertTrue(
            state.createPursuit(
                template: "Hire someone",
                outcome: "Hire a VP of Engineering",
                targetDate: nil
            )
        )
        state.finishProductDemo()
        return state
    }

    private func proposalReadyState() throws -> StandaloneOnboardingState {
        var state = readyForSourceChoice()
        XCTAssertTrue(state.chooseSource(.text))
        state.updateDraftText(
            "Mina prefers remote, could start in three weeks, and wants to understand the team size. Visa status is still unclear."
        )
        let generation = try XCTUnwrap(state.beginProcessing())
        let draft = try XCTUnwrap(state.captureDraft)
        let pursuit = try XCTUnwrap(state.pursuit)
        let proposal = StandaloneDemoProposalCatalog.proposal(for: draft, pursuit: pursuit)
        XCTAssertTrue(state.receiveProposal(proposal, generation: generation))
        return state
    }
}

private final class ControlledStandalonePersistence: StandaloneOnboardingPersisting {
    var state: StandaloneOnboardingState?
    var rejectSaves = false

    init(state: StandaloneOnboardingState?) {
        self.state = state
    }

    func load() throws -> StandaloneOnboardingState? { state }

    func save(_ state: StandaloneOnboardingState) throws {
        if rejectSaves { throw ControlledPersistenceError.saveRejected }
        self.state = state
    }

    func reset() throws { state = nil }
}

private enum ControlledPersistenceError: Error {
    case saveRejected
}
