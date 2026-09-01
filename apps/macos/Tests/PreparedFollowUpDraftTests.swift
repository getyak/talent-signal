import XCTest
@testable import TalentSignalMac

final class PreparedFollowUpDraftTests: XCTestCase {
    func testAllFourPurposesProduceEditableEvidenceBoundDraftsWithoutCopyingTheQuote() throws {
        let privateQuote = "I need PRIVATE_SOURCE_SENTINEL and the exact remote policy before September 3, 2026."
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: privateQuote,
            acquisition: "Explicit text entry"
        )
        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        let drafts = try PreparedDraftKind.allCases.map { kind in
            try XCTUnwrap(EvidenceBoundDraftComposer.compose(kind: kind, insight: insight))
        }

        XCTAssertEqual(drafts.map(\.kind), PreparedDraftKind.allCases)
        XCTAssertTrue(drafts.allSatisfy { !$0.body.isEmpty && !$0.subject.isEmpty })
        XCTAssertTrue(drafts.allSatisfy { !$0.body.contains("PRIVATE_SOURCE_SENTINEL") })
        XCTAssertEqual(
            drafts.first(where: { $0.kind == .clientQuestion })?.body,
            insight.clientQuestionDraft
        )
        XCTAssertTrue(
            drafts.first(where: { $0.kind == .meetingQuestion })?.body.hasPrefix("For the next meeting:") == true
        )
        XCTAssertTrue(
            drafts.first(where: { $0.kind == .clientUpdate })?.body.hasPrefix("Quick update:") == true
        )
    }

    func testCandidateFollowUpUsesTheSupportedCandidateFacingDraftWhenAvailable() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "I can start on September 21, 2026.",
            acquisition: "Explicit text entry"
        )
        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        let draft = try XCTUnwrap(EvidenceBoundDraftComposer.compose(kind: .candidateFollowUp, insight: insight))

        XCTAssertEqual(insight.suggestedAction, .prepareCandidateFollowUp)
        XCTAssertEqual(draft.body, insight.editableDraft)
    }

    func testNoSignalCannotBeTurnedIntoAnyCommunicationDraft() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "Thanks again for the conversation.",
            acquisition: "Explicit text entry"
        )
        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.status, .noSignal)
        XCTAssertTrue(PreparedDraftKind.allCases.allSatisfy {
            EvidenceBoundDraftComposer.compose(kind: $0, insight: insight) == nil
        })
    }

    func testChineseEvidenceProducesFourChinesePurposesWithoutCopyingTheQuote() throws {
        let privateQuote = "PRIVATE_SOURCE_SENTINEL：另一个流程推进很快，我需要周三前决定，远程办公很重要。"
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: privateQuote,
            acquisition: "Explicit text entry"
        )
        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        let drafts = try PreparedDraftKind.allCases.map { kind in
            try XCTUnwrap(EvidenceBoundDraftComposer.compose(kind: kind, insight: insight))
        }

        XCTAssertEqual(insight.language, .chinese)
        XCTAssertEqual(drafts.map(\.subject), ["候选人跟进", "客户澄清", "会前问题", "候选人进展更新"])
        XCTAssertTrue(drafts.allSatisfy { !$0.body.contains("PRIVATE_SOURCE_SENTINEL") })
        XCTAssertTrue(drafts.first(where: { $0.kind == .candidateFollowUp })?.body.contains("得到确认后会跟进") == true)
        XCTAssertTrue(drafts.first(where: { $0.kind == .meetingQuestion })?.body.hasPrefix("下次会议需要确认：") == true)
        XCTAssertTrue(drafts.first(where: { $0.kind == .clientUpdate })?.body.hasPrefix("简短更新：") == true)
        XCTAssertEqual(PreparedDraftKind.inferred(from: "客户澄清"), .clientQuestion)
    }
}
