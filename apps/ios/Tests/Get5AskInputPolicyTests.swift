import XCTest
@testable import TalentSignal

final class Get5AskInputPolicyTests: XCTestCase {
    private let editor = CGRect(x: 30, y: 80, width: 240, height: 140)
    private let voice = CGRect(x: 280, y: 230, width: 44, height: 44)

    func testEveryPartOfTheEmptyEditorCanBeginVoice() {
        for point in [CGPoint(x: 31, y: 81), CGPoint(x: 150, y: 150), CGPoint(x: 269, y: 219), CGPoint(x: 300, y: 250)] {
            XCTAssertTrue(canBegin(at: point))
        }
    }

    func testToolbarAndAttachmentControlsDoNotBeginVoice() {
        XCTAssertFalse(canBegin(at: CGPoint(x: 60, y: 250)))
        XCTAssertFalse(canBegin(at: CGPoint(x: 12, y: 100)))
    }

    func testTypedWhitespaceAndMarkedTextRetainEditingOwnership() {
        XCTAssertFalse(canBegin(draft: "Keep this note"))
        XCTAssertFalse(canBegin(draft: " \n"))
        XCTAssertFalse(canBegin(isComposing: true))
    }

    func testAttachmentsAndBusyStateBlockVoice() {
        XCTAssertFalse(canBegin(hasAttachments: true))
        XCTAssertFalse(canBegin(isDisabled: true))
    }

    private func canBegin(
        at point: CGPoint = CGPoint(x: 150, y: 150),
        draft: String = "", hasAttachments: Bool = false,
        isComposing: Bool = false, isDisabled: Bool = false
    ) -> Bool {
        AskVoiceHoldPolicy.canBegin(
            location: point, inputFrame: editor, voiceControlFrame: voice,
            draft: draft, hasAttachments: hasAttachments,
            isComposing: isComposing, isDisabled: isDisabled
        )
    }
}
