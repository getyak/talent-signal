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

    @MainActor
    func testLiveActivityActiveStateHasABoundedStaleDeadline() {
        let start = Date(timeIntervalSince1970: 100)

        XCTAssertEqual(
            StandaloneRecordingActivityCoordinator.activeStaleDate(from: start),
            Date(timeIntervalSince1970: 700)
        )
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
        XCTAssertTrue(first.acceptedActions.isEmpty)

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

    func testManualNoModelRouteCompletesArbitraryTextWithoutFoundationModels() async throws {
        var state = readyForSourceChoice()
        XCTAssertTrue(state.chooseSource(.text))
        let exactSignal = "Candidate requested a four-day week; compensation remains unresolved."
        state.updateDraftText(exactSignal)
        let generation = try XCTUnwrap(state.beginProcessing())
        let draft = try XCTUnwrap(state.captureDraft)
        let pursuit = try XCTUnwrap(state.pursuit)

        let proposal = try await ManualStandaloneProposalEngine()
            .generate(draft: draft, pursuit: pursuit)

        XCTAssertEqual(proposal.engineLabel, "Manual structure · no model")
        XCTAssertTrue(proposal.inferences.isEmpty)
        XCTAssertTrue(proposal.nextActions.isEmpty)
        XCTAssertEqual(proposal.facts.first?.proposedValue, exactSignal)
        XCTAssertEqual(proposal.facts.first?.evidenceExcerpt, exactSignal)
        XCTAssertTrue(state.receiveProposal(proposal, generation: generation))
        let fact = try XCTUnwrap(state.proposal?.facts.first)
        state.selectFact(fact.id, selected: true)
        XCTAssertTrue(state.confirm())
        XCTAssertEqual(state.activationStatus, .verifiedProgress)
        XCTAssertEqual(state.progress?.confirmedFacts.first?.proposedValue, exactSignal)
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

    func testFilePersistenceRestoresExplicitCalendarScope() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        let fileURL = directory.appending(path: "session.json")
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = FileStandaloneOnboardingStore(fileURL: fileURL)
        var state = readyForSourceChoice()
        state.observeCalendar(
            .connectedWithMeetings,
            selectedCalendarIDs: ["work-calendar", "search-calendar"]
        )

        try persistence.save(state)
        let restored = try XCTUnwrap(persistence.load())

        XCTAssertEqual(restored.selectedCalendarIDs, ["work-calendar", "search-calendar"])
    }

    func testFilePersistenceProtectsSensitiveSessionWhileDeviceIsLocked() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        let fileURL = directory.appending(path: "session.json")
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = FileStandaloneOnboardingStore(fileURL: fileURL)
        var state = readyForSourceChoice()
        XCTAssertTrue(state.chooseSource(.text))
        state.updateDraftText("Synthetic private Signal")

        try persistence.save(state)

        let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
        let protection = attributes[.protectionKey] as? FileProtectionType
#if targetEnvironment(simulator)
        XCTAssertTrue(
            protection == nil || protection == .complete,
            "Simulator filesystems may not expose the device Data Protection class."
        )
#else
        XCTAssertEqual(protection, .complete)
#endif
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

    @MainActor
    func testLaunchResetFailureHidesPriorEvidenceAndSurfacesRecovery() {
        let prior = readyForSourceChoice()
        let persistence = ControlledStandalonePersistence(state: prior)
        persistence.rejectResets = true

        let store = StandaloneOnboardingStore(persistence: persistence, reset: true)

        XCTAssertEqual(store.state.route, .welcome)
        XCTAssertNil(store.state.pursuit)
        XCTAssertEqual(persistence.state?.sessionID, prior.sessionID)
        XCTAssertTrue(store.persistenceNotice?.contains("Prior evidence is hidden") == true)
    }

    @MainActor
    func testResetDemoDataPreservesUserAuthoredShareCapturesAndPayloads() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = try SharedCaptureInbox(rootURL: directory)
        let capture = try inbox.appendImage(
            data: Data("synthetic-user-image".utf8),
            fileExtension: "png",
            mediaType: "image/png",
            sourceText: "Synthetic source text"
        )
        let persistence = ControlledStandalonePersistence(state: readyForSourceChoice())
        let resetter = ControlledDemoDataResetter()
        let store = StandaloneOnboardingStore(
            persistence: persistence,
            demoDataResetter: resetter
        )

        store.resetDemoData()

        XCTAssertEqual(resetter.resetCount, 1)
        XCTAssertEqual(try inbox.pending().map(\.id), [capture.id])
        XCTAssertNotNil(inbox.payloadURL(for: capture))
        XCTAssertNil(store.persistenceNotice)
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
            sourceText: "Candidate says remote only.",
            note: "Candidate shared a written update.",
            now: Date(timeIntervalSince1970: 1)
        )
        let text = try inbox.appendText(
            "Remote preference confirmed.",
            note: "Recruiter should verify the working location.",
            now: Date(timeIntervalSince1970: 2)
        )
        let url = try inbox.appendURL(
            URL(string: "https://example.com/brief")!,
            note: "Recruiter-provided context",
            now: Date(timeIntervalSince1970: 3)
        )

        XCTAssertEqual(try inbox.pending().map(\.id), [image.id, text.id, url.id])
        XCTAssertEqual(image.sourceText, "Candidate says remote only.")
        XCTAssertEqual(image.recruiterNote, "Candidate shared a written update.")
        XCTAssertEqual(text.sourceText, "Remote preference confirmed.")
        XCTAssertEqual(text.recruiterNote, "Recruiter should verify the working location.")
        XCTAssertNil(url.sourceText)
        XCTAssertEqual(url.recruiterNote, "Recruiter-provided context")
        XCTAssertNotNil(inbox.payloadURL(for: image))
        let temporaryFiles = try FileManager.default.contentsOfDirectory(
            at: directory.appending(path: "Temporary"),
            includingPropertiesForKeys: nil
        )
        XCTAssertTrue(temporaryFiles.isEmpty)

        try inbox.markImported(image.id)
        XCTAssertEqual(try inbox.pending().map(\.id), [text.id, url.id])
    }

    func testShortcutScreenshotStagesIntoStandaloneInboxWithStableIdentity() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = try SharedCaptureInbox(rootURL: directory)
        let seed = PendingCaptureSeed(
            id: UUID(uuidString: "81818181-8181-4818-8818-818181818181")!,
            imageData: Data("synthetic-shortcut-image".utf8),
            fileName: "conversation.png",
            mediaType: "image/png",
            createdAt: Date(timeIntervalSince1970: 42),
            origin: .appShortcut
        )

        let first = try StandaloneShortcutCaptureBridge.stage(seed, in: inbox)
        let retry = try StandaloneShortcutCaptureBridge.stage(seed, in: inbox)

        XCTAssertEqual(first.id, seed.id)
        XCTAssertEqual(retry, first)
        XCTAssertEqual(first.sourceApplication, "App Shortcut")
        XCTAssertEqual(try inbox.pending().map(\.id), [seed.id])
        XCTAssertNotNil(inbox.payloadURL(for: first))
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

    func testScopedSharedCaptureDeletionCommitsEnvelopeAndPayloadOnly() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = try SharedCaptureInbox(rootURL: directory)
        let image = try inbox.appendImage(
            data: Data("synthetic-image".utf8),
            fileExtension: "png",
            mediaType: "image/png"
        )
        let retainedText = try inbox.appendText("Retain this separate capture")
        try inbox.markImported(image.id)

        let transaction = try inbox.stageDeletion(image.id)
        try inbox.commitDeletion(transaction)

        XCTAssertNil(try inbox.envelope(id: image.id))
        XCTAssertNil(inbox.payloadURL(for: image))
        XCTAssertEqual(try inbox.pending().map(\.id), [retainedText.id])
    }

    func testInterruptedScopedDeletionRollsBackOnInboxRecovery() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = try SharedCaptureInbox(rootURL: directory)
        let image = try inbox.appendImage(
            data: Data("synthetic-image".utf8),
            fileExtension: "png",
            mediaType: "image/png"
        )
        try inbox.markImported(image.id)
        _ = try inbox.stageDeletion(image.id)

        let recovered = try SharedCaptureInbox(rootURL: directory)

        let restoredEnvelope = try XCTUnwrap(recovered.envelope(id: image.id))
        XCTAssertEqual(restoredEnvelope.id, image.id)
        XCTAssertEqual(restoredEnvelope.payloadFileName, image.payloadFileName)
        XCTAssertEqual(restoredEnvelope.mediaType, image.mediaType)
        XCTAssertNotNil(recovered.payloadURL(for: image))
    }

    func testDiscardImportedCaptureRemovesAllDerivedLocalState() async throws {
        var state = readyForSourceChoice()
        let envelope = SharedCaptureEnvelope(
            id: UUID(uuidString: "91919191-9191-4919-8919-919191919191")!,
            kind: .text,
            sourceText: "Synthetic source evidence"
        )
        XCTAssertTrue(state.importSharedCapture(envelope))
        let generation = try XCTUnwrap(state.beginProcessing())
        let draft = try XCTUnwrap(state.captureDraft)
        let pursuit = try XCTUnwrap(state.pursuit)
        let proposal = try await ManualStandaloneProposalEngine()
            .generate(draft: draft, pursuit: pursuit)
        XCTAssertTrue(state.receiveProposal(proposal, generation: generation))
        let fact = try XCTUnwrap(state.proposal?.facts.first)
        state.selectFact(fact.id, selected: true)
        XCTAssertTrue(state.confirm())

        XCTAssertTrue(state.discardImportedCapture(envelope.id))

        XCTAssertNil(state.captureDraft)
        XCTAssertNil(state.proposal)
        XCTAssertNil(state.progress)
        XCTAssertEqual(state.activationStatus, .notStarted)
        XCTAssertEqual(state.actionPracticeState, .notOffered)
        XCTAssertEqual(state.route, .sourceChoice)
        XCTAssertFalse(state.importedSharedEnvelopeIDs.contains(envelope.id))
    }

    @MainActor
    func testImportedCaptureDeletionRollsBackFilesWhenSessionSaveFails() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = try SharedCaptureInbox(rootURL: directory)
        let envelope = try inbox.appendImage(
            data: Data("synthetic-private-image".utf8),
            fileExtension: "png",
            mediaType: "image/png",
            sourceText: "Synthetic private evidence"
        )
        var importedState = readyForSourceChoice()
        XCTAssertTrue(importedState.importSharedCapture(envelope))
        try inbox.markImported(envelope.id)
        let persistence = ControlledStandalonePersistence(state: importedState)
        let store = StandaloneOnboardingStore(persistence: persistence)
        persistence.rejectSaves = true

        store.deleteImportedCapture(using: inbox)

        XCTAssertEqual(store.state.captureDraft?.sharedEnvelopeID, envelope.id)
        XCTAssertNotNil(try inbox.envelope(id: envelope.id))
        XCTAssertNotNil(inbox.payloadURL(for: envelope))
        XCTAssertNotNil(store.persistenceNotice)
    }

    @MainActor
    func testImportedCaptureDeletionCommitsFilesAndDerivedStateTogether() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = try SharedCaptureInbox(rootURL: directory)
        let envelope = try inbox.appendImage(
            data: Data("synthetic-private-image".utf8),
            fileExtension: "png",
            mediaType: "image/png",
            sourceText: "Synthetic private evidence"
        )
        var importedState = readyForSourceChoice()
        XCTAssertTrue(importedState.importSharedCapture(envelope))
        try inbox.markImported(envelope.id)
        let persistence = ControlledStandalonePersistence(state: importedState)
        let store = StandaloneOnboardingStore(persistence: persistence)

        store.deleteImportedCapture(using: inbox)

        XCTAssertNil(store.state.captureDraft)
        XCTAssertNil(store.state.proposal)
        XCTAssertNil(store.state.progress)
        XCTAssertNil(try inbox.envelope(id: envelope.id))
        XCTAssertNil(inbox.payloadURL(for: envelope))
        XCTAssertNil(store.persistenceNotice)
    }

    func testSharedImageTransactionRecoversEnvelopeAndPayloadAfterInterruption() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        _ = try SharedCaptureInbox(rootURL: directory)
        let id = UUID(uuidString: "61616161-6161-4616-8616-616161616161")!
        let payloadFileName = "\(id.uuidString.lowercased()).png"
        let envelope = SharedCaptureEnvelope(
            id: id,
            kind: .image,
            recruiterNote: "Synthetic recovery note",
            payloadFileName: payloadFileName,
            mediaType: "image/png"
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let temporaryDirectory = directory.appending(path: "Temporary", directoryHint: .isDirectory)
        try encoder.encode(envelope).write(
            to: temporaryDirectory.appending(path: "\(id.uuidString.lowercased()).json.tmp"),
            options: .atomic
        )
        try Data([0x89, 0x50, 0x4E, 0x47]).write(
            to: temporaryDirectory.appending(path: "\(payloadFileName).tmp"),
            options: .atomic
        )

        let recoveredInbox = try SharedCaptureInbox(rootURL: directory)
        let recovered = try XCTUnwrap(recoveredInbox.pending().first)

        XCTAssertEqual(recovered.id, envelope.id)
        XCTAssertEqual(recovered.kind, envelope.kind)
        XCTAssertEqual(recovered.recruiterNote, envelope.recruiterNote)
        XCTAssertEqual(recovered.payloadFileName, envelope.payloadFileName)
        XCTAssertEqual(recovered.mediaType, envelope.mediaType)
        XCTAssertNotNil(recoveredInbox.payloadURL(for: recovered))
        XCTAssertTrue(
            try FileManager.default.contentsOfDirectory(
                at: temporaryDirectory,
                includingPropertiesForKeys: nil
            ).isEmpty
        )
    }

    func testCorruptSharedEnvelopeIsVisibleInsteadOfSilentlyDiscarded() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = try SharedCaptureInbox(rootURL: directory)
        let corruptURL = directory
            .appending(path: "Inbox", directoryHint: .isDirectory)
            .appending(path: "corrupt.json")
        try Data("not-json".utf8).write(to: corruptURL, options: .atomic)

        XCTAssertThrowsError(try inbox.pending()) { error in
            guard case let SharedCaptureInboxError.corruptEnvelope(fileName) = error else {
                return XCTFail("Unexpected error: \(error)")
            }
            XCTAssertEqual(fileName, "corrupt.json")
            XCTAssertTrue(FileManager.default.fileExists(atPath: corruptURL.path))
        }
    }

    func testUnsupportedSharedEnvelopeRemainsVisibleForRecoveryOrReset() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = try SharedCaptureInbox(rootURL: directory)
        let envelopeURL = directory
            .appending(path: "Inbox", directoryHint: .isDirectory)
            .appending(path: "future.json")
        let futureEnvelope = """
        {"schemaVersion":999,"id":"71717171-7171-4717-8717-717171717171","kind":"text","createdAt":"2026-08-28T00:00:00Z","sourceText":"Future schema evidence"}
        """
        try Data(futureEnvelope.utf8).write(to: envelopeURL, options: .atomic)

        XCTAssertThrowsError(try inbox.pending()) { error in
            guard case SharedCaptureInboxError.unsupportedSchema(999) = error else {
                return XCTFail("Expected unsupported schema error, got \(error)")
            }
        }
        XCTAssertTrue(FileManager.default.fileExists(atPath: envelopeURL.path))
    }

    func testSharedCaptureImportsIdempotentlyIntoTheSameReviewFlow() throws {
        var state = readyForSourceChoice()
        let envelope = SharedCaptureEnvelope(
            id: UUID(uuidString: "51515151-5151-4515-8515-515151515151")!,
            kind: .text,
            sourceText: "Remote preference confirmed. Visa status remains unclear.",
            recruiterNote: "Recruiter wants to confirm the work-authorization detail."
        )

        XCTAssertTrue(state.importSharedCapture(envelope))
        XCTAssertEqual(state.route, .capture)
        XCTAssertEqual(state.captureDraft?.sharedEnvelopeID, envelope.id)
        XCTAssertEqual(state.captureDraft?.idempotencyKey, envelope.id)
        XCTAssertEqual(state.captureDraft?.sharedSourceText, envelope.sourceText)
        XCTAssertEqual(state.captureDraft?.sharedRecruiterNote, envelope.recruiterNote)
        XCTAssertEqual(state.captureDraft?.text, envelope.sourceText)
        XCTAssertFalse(state.captureDraft?.text.contains("Recruiter wants") == true)
        XCTAssertFalse(state.importSharedCapture(envelope))

        let generation = try XCTUnwrap(state.beginProcessing())
        let draft = try XCTUnwrap(state.captureDraft)
        let pursuit = try XCTUnwrap(state.pursuit)
        let proposal = StandaloneDemoProposalCatalog.proposal(for: draft, pursuit: pursuit)
        XCTAssertTrue(state.receiveProposal(proposal, generation: generation))
        XCTAssertEqual(state.route, .proposalReview)
        XCTAssertTrue(proposal.sourceSummary.contains("Share Sheet"))
    }

    func testSharedImageUsesExtractedSourceTextWithoutMergingRecruiterNote() throws {
        var state = readyForSourceChoice()
        let envelope = SharedCaptureEnvelope(
            kind: .image,
            sourceText: "Candidate prefers remote work.",
            recruiterNote: "Recruiter should confirm time zone.",
            payloadFileName: "synthetic.png",
            mediaType: "image/png"
        )

        XCTAssertTrue(state.importSharedCapture(envelope))

        XCTAssertEqual(state.captureDraft?.text, "Candidate prefers remote work.")
        XCTAssertEqual(state.captureDraft?.sharedSourceText, "Candidate prefers remote work.")
        XCTAssertEqual(state.captureDraft?.sharedRecruiterNote, "Recruiter should confirm time zone.")
        XCTAssertFalse(state.captureDraft?.text.contains("Recruiter should") == true)
    }

    func testLegacySharedCapturePreservesTheOnlyRecoverableProvenanceRole() throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let legacyText = Data("""
        {
          "id": "51515151-5151-4515-8515-515151515152",
          "schemaVersion": 1,
          "kind": "text",
          "createdAt": "1970-01-01T00:00:00Z",
          "text": "Legacy shared source"
        }
        """.utf8)
        let legacyImage = Data("""
        {
          "id": "51515151-5151-4515-8515-515151515153",
          "schemaVersion": 1,
          "kind": "image",
          "createdAt": "1970-01-01T00:00:00Z",
          "text": "Legacy recruiter note",
          "payloadFileName": "legacy.png",
          "mediaType": "image/png"
        }
        """.utf8)

        let textEnvelope = try decoder.decode(SharedCaptureEnvelope.self, from: legacyText)
        let imageEnvelope = try decoder.decode(SharedCaptureEnvelope.self, from: legacyImage)

        XCTAssertEqual(textEnvelope.sourceText, "Legacy shared source")
        XCTAssertNil(textEnvelope.recruiterNote)
        XCTAssertNil(imageEnvelope.sourceText)
        XCTAssertEqual(imageEnvelope.recruiterNote, "Legacy recruiter note")
    }

    func testMismatchedLiveActivityStopRequestIsDiscardedAsStale() throws {
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
        XCTAssertFalse(
            try LiveActivityStopRequestBridge.consume(
                draftID: requestedDraftID,
                rootURL: directory
            )
        )
        XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: directory.path).isEmpty)
    }

    func testMatchingLiveActivityStopRequestIsConsumedOnce() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let draftID = UUID()

        try LiveActivityStopRequestBridge.write(draftID: draftID, rootURL: directory)

        XCTAssertTrue(try LiveActivityStopRequestBridge.consume(draftID: draftID, rootURL: directory))
        XCTAssertFalse(try LiveActivityStopRequestBridge.consume(draftID: draftID, rootURL: directory))
    }

    func testLiveActivityStopRequestAtomicallyReplacesAnOlderRequest() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let first = UUID()
        let latest = UUID()

        try LiveActivityStopRequestBridge.write(draftID: first, rootURL: directory)
        try LiveActivityStopRequestBridge.write(draftID: latest, rootURL: directory)

        XCTAssertTrue(try LiveActivityStopRequestBridge.consume(draftID: latest, rootURL: directory))
        XCTAssertFalse(try LiveActivityStopRequestBridge.consume(draftID: first, rootURL: directory))
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
    var rejectResets = false

    init(state: StandaloneOnboardingState?) {
        self.state = state
    }

    func load() throws -> StandaloneOnboardingState? { state }

    func save(_ state: StandaloneOnboardingState) throws {
        if rejectSaves { throw ControlledPersistenceError.saveRejected }
        self.state = state
    }

    func reset() throws {
        if rejectResets { throw ControlledPersistenceError.resetRejected }
        state = nil
    }
}

private final class ControlledDemoDataResetter: StandaloneDemoDataResetting {
    private(set) var resetCount = 0

    func resetAncillaryDemoData() throws {
        resetCount += 1
    }
}

private enum ControlledPersistenceError: Error {
    case resetRejected
    case saveRejected
}
