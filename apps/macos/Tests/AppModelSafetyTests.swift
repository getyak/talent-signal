import XCTest
@testable import TalentSignalMac

@MainActor
final class AppModelSafetyTests: XCTestCase {
    func testScopeMustBeExplicitlySelectedAndConfirmedBeforeSubmission() async {
        let model = AppModel(service: FixtureRelationshipService(initialMode: .ready))
        model.addSelectedText("Reviewed source fragment")
        let itemID = try! XCTUnwrap(model.capsule.items.first?.id)
        model.setAttribution(id: itemID, actorKind: .candidate)
        model.confirmAttribution(id: itemID)

        XCTAssertNil(model.selectedScopeOptionID)
        XCTAssertEqual(model.presentation.candidateName, "Choose a Person or keep identity unresolved")
        XCTAssertFalse(model.canSubmitCapsule)

        model.selectFirstRelationshipScopeFromKeyboard()
        XCTAssertFalse(model.canSubmitCapsule, "Selection is not confirmation.")

        await model.confirmRelationshipScope()
        XCTAssertTrue(model.canSubmitCapsule)

        model.keepRelationshipScopeUnresolved()
        XCTAssertNil(model.selectedScopeOptionID)
        XCTAssertFalse(model.canSubmitCapsule)
        XCTAssertEqual(model.mode, .ambiguousIdentity)
    }

    func testRemoteSignOutFailureStillClearsLocalAuthorityAndCapsule() async {
        let model = AppModel(
            service: FailingSignOutService(),
            initialMode: .ready,
            capsuleStore: DeletingCapsuleStore()
        )
        model.addSelectedText("Sensitive reviewed fragment")
        model.selectRelationshipScopeOption(id: "synthetic-scope")

        await model.signOutAndClearLocalData()

        XCTAssertTrue(model.isSignedOut)
        XCTAssertTrue(model.isPaused)
        XCTAssertTrue(model.capsule.items.isEmpty)
        XCTAssertTrue(model.relationshipScopeOptions.isEmpty)
        XCTAssertNil(model.selectedScopeOptionID)
        XCTAssertEqual(model.accountID, "signed-out")
        XCTAssertFalse(model.canSubmitCapsule)
        XCTAssertTrue(model.deletionReceipt?.contains("outcome-unknown") == true)
        XCTAssertTrue(model.deletionReceipt?.contains("Deleted encrypted Capsule recovery") == true)
        XCTAssertTrue(model.errorMessage?.contains("Signed out locally") == true)
    }

    func testStopIntakeDeletesOnlyLocalDraftAndDoesNotClaimCanonicalCancellation() {
        let model = AppModel(
            service: FixtureRelationshipService(initialMode: .ready),
            initialMode: .ready,
            capsuleStore: DeletingCapsuleStore()
        )
        model.addSelectedText("Unsubmitted local fragment")

        model.stopContextIntake()

        XCTAssertTrue(model.isPaused)
        XCTAssertTrue(model.capsule.items.isEmpty)
        XCTAssertEqual(model.mode, .deleted)
        XCTAssertTrue(model.intakeControlReceipt?.contains("deleted 1 visible local item") == true)
        XCTAssertTrue(model.intakeControlReceipt?.contains("No canonical Task was active") == true)
    }

    func testOpeningModelCreatesNoWindowCaptureAndExplicitPickerAddsOneLocalItem() async {
        let capture = StubWindowCapture(payload: .init(
            recognizedText: "Synthetic reviewed window text",
            imagePNG: Data([1, 2, 3, 4]),
            pixelWidth: 800,
            pixelHeight: 600,
            sourceFingerprint: "window-hash",
            localTextRecognition: .available
        ))
        let model = AppModel(
            service: FixtureRelationshipService(initialMode: .ready),
            windowCapture: capture
        )

        XCTAssertTrue(model.capsule.items.isEmpty)
        XCTAssertEqual(capture.callCount, 0)

        await model.addSystemSelectedWindow()

        XCTAssertEqual(capture.callCount, 1)
        XCTAssertEqual(model.capsule.items.count, 1)
        XCTAssertEqual(model.capsule.items[0].kind, .window)
        XCTAssertTrue(model.capsule.items[0].localOnly)
        XCTAssertTrue(model.windowCaptureReceipt?.contains("exactly one frame") == true)
        XCTAssertTrue(model.windowCaptureReceipt?.contains("No cursor or audio") == true)
    }

    func testLocalRecognitionLossKeepsRawCaptureLocalWithoutCloudFallback() async {
        let capture = StubWindowCapture(payload: .init(
            recognizedText: "",
            imagePNG: Data([7, 8, 9]),
            pixelWidth: 640,
            pixelHeight: 480,
            sourceFingerprint: "ocr-outage-window",
            localTextRecognition: .unavailable
        ))
        let model = AppModel(
            service: FixtureRelationshipService(initialMode: .ready),
            windowCapture: capture
        )

        await model.addSystemSelectedWindow()

        XCTAssertEqual(model.capsule.items.count, 1)
        XCTAssertTrue(model.capsule.items[0].localOnly)
        XCTAssertEqual(model.capsule.items[0].localAssetData, Data([7, 8, 9]))
        XCTAssertFalse(model.capsule.canSubmit)
        XCTAssertTrue(model.windowCaptureReceipt?.contains("Local text recognition was unavailable") == true)
        XCTAssertTrue(model.windowCaptureReceipt?.contains("no cloud fallback") == true)
    }

    func testClipboardFailureNeverClaimsCopiedOrSent() {
        let clipboard = StubPreparedDraftClipboard(result: false)
        let model = AppModel(
            service: FixtureRelationshipService(initialMode: .needsDecision),
            initialMode: .needsDecision,
            preparedDraftClipboard: clipboard
        )
        model.prepareLocalDraft()

        model.copyPreparedDraft()

        XCTAssertEqual(clipboard.callCount, 1)
        XCTAssertEqual(model.localDraftStatus, .prepared)
        XCTAssertTrue(model.errorMessage?.contains("did not confirm the clipboard write") == true)
        XCTAssertTrue(model.errorMessage?.contains("nothing was sent") == true)
    }

    func testClipboardSuccessClaimsCopiedButNeverSent() {
        let clipboard = StubPreparedDraftClipboard(result: true)
        let model = AppModel(
            service: FixtureRelationshipService(initialMode: .needsDecision),
            initialMode: .needsDecision,
            preparedDraftClipboard: clipboard
        )
        model.prepareLocalDraft()

        model.copyPreparedDraft()

        XCTAssertEqual(model.localDraftStatus, .copied)
        XCTAssertNil(model.errorMessage)
        XCTAssertTrue(clipboard.lastText?.contains("review before sending") == true)
    }

    func testFailureRecoveryReturnsToLocalReviewWithoutRetryAuthority() {
        let model = AppModel(
            service: FixtureRelationshipService(initialMode: .failed),
            initialMode: .failed
        )
        model.errorMessage = "Synthetic task failure."

        model.returnToCapsuleAfterFailure()

        XCTAssertEqual(model.mode, .empty)
        XCTAssertNil(model.errorMessage)
        XCTAssertTrue(model.intakeControlReceipt?.contains("No Task, decision, or external action was retried") == true)
    }

    func testAccountSwitchClearsPriorMemoryAndRecoversOnlyCurrentAccount() async {
        let store = AccountFixtureCapsuleStore()
        store.setDraft(Self.draft("Account A private excerpt"), for: "account-a")
        store.setDraft(Self.draft("Account B private excerpt"), for: "account-b")
        let service = SwitchingAccountService(accountIDs: ["account-a", "account-b", "account-a"])
        let model = AppModel(service: service, capsuleStore: store)

        await model.load()
        XCTAssertEqual(model.accountID, "account-a")
        XCTAssertEqual(model.capsule.items.first?.preview, "Account A private excerpt")

        await model.load()
        XCTAssertEqual(model.accountID, "account-b")
        XCTAssertEqual(model.capsule.items.first?.preview, "Account B private excerpt")
        XCTAssertFalse(model.capsule.items.contains { $0.preview.contains("Account A") })

        await model.load()
        XCTAssertEqual(model.accountID, "account-a")
        XCTAssertEqual(model.capsule.items.first?.preview, "Account A private excerpt")
        XCTAssertFalse(model.capsule.items.contains { $0.preview.contains("Account B") })
    }

    func testMenuBarPrivacyCopyNeverContainsRelationshipOrEvidenceContent() {
        let model = AppModel(
            service: FixtureRelationshipService(initialMode: .needsDecision),
            initialMode: .needsDecision
        )
        model.addSelectedText("PRIVATE_NOTIFICATION_SENTINEL candidate compensation evidence")
        let copy = model.menuBarPrivacySummary.lowercased()

        XCTAssertFalse(copy.contains(model.presentation.candidateName.lowercased()))
        XCTAssertFalse(copy.contains(model.presentation.pursuitTitle.lowercased()))
        XCTAssertFalse(copy.contains(model.presentation.evidenceQuote.lowercased()))
        XCTAssertFalse(copy.contains("remote-work"))
        XCTAssertFalse(copy.contains("private_notification_sentinel"))
        XCTAssertFalse(copy.contains("compensation"))
        XCTAssertTrue(copy.contains("no private source content"))
    }

    func testStaleAuthorityBecomesRefreshStateInsteadOfGenericFailure() async {
        let model = AppModel(
            service: StaleDecisionService(),
            initialMode: .needsDecision
        )

        await model.load()
        model.decideNextCanonicalItem(.accept)
        await model.resolveCanonicalDecision()

        XCTAssertEqual(model.mode, .stale)
        XCTAssertNil(model.pendingDecision)
        XCTAssertTrue(model.errorMessage?.contains("no longer has current authority") == true)
        XCTAssertTrue(model.presentation.actionProjections.allSatisfy {
            $0.status == .stale && $0.route == .reviewStaleSource
        })
    }

    private static func draft(_ text: String) -> ContextCapsuleDraft {
        var draft = ContextCapsuleDraft()
        draft.addSelectedText(text)
        return draft
    }
}

private struct StaleDecisionService: MacRelationshipServing {
    func loadWorkspace() async throws -> MacRelationshipServiceResponse {
        .syntheticFixture(FixtureRelationshipService.fixture(mode: .needsDecision))
    }

    func confirmScope(_ selection: RelationshipScopeSelection) async throws { }

    func submit(manifest: SubmittedContextManifest) async throws -> MacRelationshipServiceResponse {
        .syntheticFixture(FixtureRelationshipService.fixture(mode: .needsDecision))
    }

    func resolveDecision(_ request: CanonicalDecisionRequest) async throws -> MacRelationshipServiceResponse {
        throw RelationshipServiceError.staleAuthority("Synthetic source version changed. No decision was sent.")
    }

    func reconcileDecisionOutcome() async throws -> MacRelationshipServiceResponse {
        throw RelationshipServiceError.invalidResponse("No unknown operation exists.")
    }

    func openProjection(_ projection: CanonicalProjectionRequest) async throws -> MacRelationshipServiceResponse {
        .syntheticFixture(FixtureRelationshipService.fixture(mode: .stale))
    }

    func signOut() async throws -> SessionSignOutReceipt {
        .init(sessionID: "stale-test", revokedAt: "2026-08-31T00:00:00Z")
    }
}

private enum AppModelSafetyTestError: LocalizedError {
    case unavailable

    var errorDescription: String? { "Synthetic transport loss." }
}

private struct FailingSignOutService: MacRelationshipServing {
    func loadWorkspace() async throws -> MacRelationshipServiceResponse { throw AppModelSafetyTestError.unavailable }
    func confirmScope(_ selection: RelationshipScopeSelection) async throws { }
    func submit(manifest: SubmittedContextManifest) async throws -> MacRelationshipServiceResponse { throw AppModelSafetyTestError.unavailable }
    func resolveDecision(_ request: CanonicalDecisionRequest) async throws -> MacRelationshipServiceResponse { throw AppModelSafetyTestError.unavailable }
    func reconcileDecisionOutcome() async throws -> MacRelationshipServiceResponse { throw AppModelSafetyTestError.unavailable }
    func openProjection(_ projection: CanonicalProjectionRequest) async throws -> MacRelationshipServiceResponse { throw AppModelSafetyTestError.unavailable }
    func signOut() async throws -> SessionSignOutReceipt { throw AppModelSafetyTestError.unavailable }
}

private struct DeletingCapsuleStore: LocalCapsulePersisting {
    func load(accountID: String, now: Date) throws -> CapsuleRecoveryResult {
        .init(draft: ContextCapsuleDraft(), expiredItemCount: 0)
    }

    func save(_ draft: ContextCapsuleDraft, accountID: String, now: Date) throws { }

    func clear(accountID: String, deleteKey: Bool) throws -> LocalCapsuleDeletionReceipt {
        .init(deletedFile: true, deletedKey: deleteKey)
    }
}

@MainActor
private final class StubWindowCapture: WindowCapturing {
    let payload: WindowCapturePayload
    var callCount = 0

    init(payload: WindowCapturePayload) {
        self.payload = payload
    }

    func captureOneWindow() async throws -> WindowCapturePayload {
        callCount += 1
        return payload
    }
}

@MainActor
private final class StubPreparedDraftClipboard: PreparedDraftCopying {
    let result: Bool
    var callCount = 0
    var lastText: String?

    init(result: Bool) {
        self.result = result
    }

    func copyPreparedDraft(_ text: String) -> Bool {
        callCount += 1
        lastText = text
        return result
    }
}

private final class AccountFixtureCapsuleStore: LocalCapsulePersisting, @unchecked Sendable {
    private var drafts: [String: ContextCapsuleDraft] = [:]

    func setDraft(_ draft: ContextCapsuleDraft, for accountID: String) {
        drafts[accountID] = draft
    }

    func load(accountID: String, now: Date) throws -> CapsuleRecoveryResult {
        .init(draft: drafts[accountID] ?? ContextCapsuleDraft(), expiredItemCount: 0)
    }

    func save(_ draft: ContextCapsuleDraft, accountID: String, now: Date) throws {
        drafts[accountID] = draft
    }

    func clear(accountID: String, deleteKey: Bool) throws -> LocalCapsuleDeletionReceipt {
        .init(deletedFile: drafts.removeValue(forKey: accountID) != nil, deletedKey: deleteKey)
    }
}

private actor SwitchingAccountService: MacRelationshipServing {
    private let accountIDs: [String]
    private var index = 0

    init(accountIDs: [String]) {
        self.accountIDs = accountIDs
    }

    func loadWorkspace() async throws -> MacRelationshipServiceResponse {
        let accountID = accountIDs[min(index, accountIDs.count - 1)]
        index += 1
        let option = RelationshipScopeOption(
            id: "scope-\(accountID)",
            pursuitID: "pursuit-\(accountID)",
            pursuitRevision: 1,
            pursuitTitle: "Synthetic Pursuit",
            personID: "person-\(accountID)",
            personDisplayLabel: "Synthetic Person",
            relationshipContextID: "context-\(accountID)",
            relationshipContextLabel: "Synthetic relationship"
        )
        return .connected(.init(
            workspaceID: accountID,
            accountID: accountID,
            options: [option],
            presentation: option.presentation
        ))
    }

    func confirmScope(_ selection: RelationshipScopeSelection) async throws { }
    func submit(manifest: SubmittedContextManifest) async throws -> MacRelationshipServiceResponse { throw AppModelSafetyTestError.unavailable }
    func resolveDecision(_ request: CanonicalDecisionRequest) async throws -> MacRelationshipServiceResponse { throw AppModelSafetyTestError.unavailable }
    func reconcileDecisionOutcome() async throws -> MacRelationshipServiceResponse { throw AppModelSafetyTestError.unavailable }
    func openProjection(_ projection: CanonicalProjectionRequest) async throws -> MacRelationshipServiceResponse { throw AppModelSafetyTestError.unavailable }
    func signOut() async throws -> SessionSignOutReceipt { throw AppModelSafetyTestError.unavailable }
}
