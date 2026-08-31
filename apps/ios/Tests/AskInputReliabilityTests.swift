import XCTest
@testable import TalentSignal

final class AskInputReliabilityTests: XCTestCase {
    func testMarkedTextCannotBeSubmittedUntilCommitted() {
        XCTAssertFalse(
            AskInputCommitPolicy.canSubmit(
                hasCommittedInput: true,
                isComposing: true
            )
        )
        XCTAssertTrue(
            AskInputCommitPolicy.canSubmit(
                hasCommittedInput: true,
                isComposing: false
            )
        )
        XCTAssertFalse(
            AskInputCommitPolicy.canSubmit(
                hasCommittedInput: false,
                isComposing: false
            )
        )
    }

    func testDiagnosticsUseClosedVocabularyWithoutUserContent() {
        XCTAssertEqual(
            AskInputDiagnostics.VoiceState.requestingPermission.rawValue,
            "requesting_permission"
        )
        XCTAssertEqual(
            AskInputDiagnostics.SubmissionState.requestingWorkspace.rawValue,
            "requesting_workspace"
        )
    }
}
