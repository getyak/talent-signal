import XCTest
@testable import TalentSignalMac

final class ProvisionalFollowUpInsightTests: XCTestCase {
    func testWorkArrangementPreferenceUsesExactSelectedEvidence() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "Thanks for the update. I'd prefer a hybrid setup, ideally two days from home.",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.status, .ready)
        XCTAssertEqual(insight.change, "A work-arrangement factor surfaced")
        XCTAssertEqual(insight.modality, .preference)
        XCTAssertEqual(insight.exactEvidence, "I'd prefer a hybrid setup, ideally two days from home.")
        XCTAssertTrue(item.preview.contains(insight.exactEvidence))
        XCTAssertEqual(insight.suggestedAction, .prepareClientQuestion)
        XCTAssertNotNil(insight.editableDraft)
        XCTAssertEqual(insight.editableDraft, insight.clientQuestionDraft)
        XCTAssertEqual(
            insight.primaryUnresolved,
            "Whether the role can meet this work-arrangement point is not confirmed."
        )
    }

    func testUnsupportedTextFailsClosedWithoutInventingWork() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "Thanks again for the thoughtful conversation. Speak soon.",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.status, .noSignal)
        XCTAssertEqual(insight.proposed, "Leave relationship state unchanged.")
        XCTAssertEqual(insight.primaryUnresolved, insight.unresolved.first)
        XCTAssertNil(insight.smallestNextStep)
        XCTAssertNil(insight.suggestedAction)
        XCTAssertNil(insight.editableDraft)
        XCTAssertNil(insight.clientQuestionDraft)
        XCTAssertFalse(insight.canPrepareAction)
    }

    func testRelativeDecisionDateStaysReviewableAndCannotBecomeExactSilently() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "I need to decide by Friday, but I'm not sure whether the other process will finish first.",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.status, .needsReview)
        XCTAssertEqual(insight.modality, .uncertain)
        XCTAssertEqual(insight.suggestedAction, .createReminder)
        XCTAssertTrue(insight.unresolved.contains { $0.contains("relative") })
        XCTAssertTrue(insight.unresolved.contains { $0.contains("tentative") })
    }

    func testConstraintIsNotPresentedAsPreference() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "I can only accept if the role is fully remote.",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.modality, .constraint)
        XCTAssertFalse(insight.proposed.lowercased().contains("confirmed"))
    }

    func testCompilerUsesMostRecentDeliberatelyAddedTextItem() throws {
        let older = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Older selection",
            preview: "I prefer remote work.",
            acquisition: "Explicit text entry"
        )
        let newer = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Newer selection",
            preview: "Could you confirm the interview format?",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(items: [older, newer]))

        XCTAssertEqual(insight.sourceItemID, newer.id)
        XCTAssertEqual(insight.modality, .openQuestion)
        XCTAssertEqual(insight.suggestedAction, .prepareCandidateFollowUp)
    }

    func testOneEvidenceExcerptCanSurfaceSeparateSignalsWithoutMergingThemIntoFact() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "I need clarity on the remote policy before Friday because the other process has accelerated.",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(
            insight.change,
            "Separate follow-up signals surfaced: Decision timing · a work-arrangement factor · another hiring process"
        )
        XCTAssertTrue(insight.proposed.contains("separate reviewed signals"))
        XCTAssertTrue(insight.unresolved.contains { $0.contains("exact policy") })
        XCTAssertTrue(insight.unresolved.contains { $0.contains("exact stage") })
        XCTAssertEqual(insight.exactEvidence, item.preview)
        XCTAssertEqual(insight.suggestedAction, .prepareClientQuestion)
        XCTAssertEqual(
            insight.smallestNextStep,
            "Ask the client to confirm the exact remote-work policy before the candidate's decision point."
        )
        XCTAssertEqual(
            insight.clientQuestionDraft,
            "Can we confirm the role's exact remote-work policy before the candidate's decision point?"
        )
        XCTAssertEqual(
            insight.primaryUnresolved,
            "The role's exact remote-work policy is not confirmed."
        )
    }

    func testConfirmedCandidateAttributionClearsOnlyTheSpeakerUnknown() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "I prefer a hybrid setup.",
            acquisition: "Explicit text entry",
            actorKind: .candidate,
            attributionConfirmedAt: Date()
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertFalse(insight.unresolved.contains { $0.contains("Who said") })
        XCTAssertEqual(insight.modality, .preference)
    }

    func testRetractionAbstainsInsteadOfKeepingTheEarlierSignalCurrent() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "I prefer fully remote. I take that back; it no longer applies.",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.status, .needsReview)
        XCTAssertTrue(insight.proposed.contains("unchanged"))
        XCTAssertNil(insight.suggestedAction)
        XCTAssertNil(insight.editableDraft)
    }

    func testQuotedSpeechAbstainsBeforeCandidateAttribution() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "She said the role must be fully remote.",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.status, .needsReview)
        XCTAssertTrue(insight.unresolved[0].contains("someone else"))
        XCTAssertFalse(insight.canPrepareAction)
    }

    func testConflictingPreferencesStayUnresolvedWithoutAction() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "I prefer remote work. I also prefer on-site work for this role.",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.status, .needsReview)
        XCTAssertTrue(insight.unresolved[0].contains("Conflicting"))
        XCTAssertNil(insight.smallestNextStep)
    }

    func testConfirmedRecruiterSourceCannotBecomeCandidateStateOrAction() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "I prefer fully remote work.",
            acquisition: "Explicit text entry",
            actorKind: .recruiter,
            attributionConfirmedAt: Date()
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.status, .needsReview)
        XCTAssertTrue(insight.unresolved[0].contains("other than the candidate"))
        XCTAssertNil(insight.suggestedAction)
        XCTAssertFalse(insight.canPrepareAction)
    }

    func testCroppedSelectionWithoutConfirmedCandidateSpeakerAbstains() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "…need the role to be fully remote…",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.status, .needsReview)
        XCTAssertTrue(insight.unresolved[0].contains("appears cropped"))
        XCTAssertNil(insight.smallestNextStep)
    }

    func testGroupChatWithMultipleSpeakerLabelsRequiresSeparatedCandidateMessage() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "Alex: I prefer remote work.\nMia: The client requires three office days.",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.status, .needsReview)
        XCTAssertTrue(insight.unresolved[0].contains("Multiple explicit speakers"))
        XCTAssertNil(insight.suggestedAction)
    }

    func testVisibleRecruiterSpeakerLabelCannotBeInvertedIntoCandidateState() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "Recruiter: I prefer a hybrid setup for this search.",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.status, .needsReview)
        XCTAssertTrue(insight.unresolved[0].contains("recruiter, client, or hiring manager"))
        XCTAssertFalse(insight.canPrepareAction)
    }

    func testExpiredExplicitDeadlineRequiresCurrentOutcomeBeforeNewAction() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "I need to decide by 2026-08-20.",
            acquisition: "Explicit text entry"
        )
        let now = Date(timeIntervalSince1970: 1_788_192_000) // 2026-09-01 UTC

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item, now: now))

        XCTAssertEqual(insight.status, .needsReview)
        XCTAssertTrue(insight.unresolved[0].contains("already passed"))
        XCTAssertNil(insight.suggestedAction)
    }

    func testChineseMixedConversationProducesChineseSeparateSignalsAndExactEvidence() throws {
        let source = "另一个流程推进得比较快，我需要周三前做决定，remote 对我很重要。"
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: source,
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.language, .chinese)
        XCTAssertEqual(insight.status, .needsReview)
        XCTAssertTrue(insight.change.contains("决策时间"))
        XCTAssertTrue(insight.change.contains("工作方式因素"))
        XCTAssertTrue(insight.change.contains("其他招聘流程"))
        XCTAssertEqual(insight.exactEvidence, source)
        XCTAssertTrue(insight.unresolved.contains { $0.contains("相对日期") })
        XCTAssertTrue(insight.unresolved.contains { $0.contains("准确政策") })
        XCTAssertTrue(insight.unresolved.contains { $0.contains("准确阶段") })
        XCTAssertTrue(insight.smallestNextStep?.contains("向客户确认") == true)
        XCTAssertEqual(insight.suggestedAction, .prepareClientQuestion)
        XCTAssertTrue(insight.clientQuestionDraft?.contains("我们能否") == true)
        XCTAssertEqual(insight.modalityTitle, "约束")
        XCTAssertEqual(insight.primaryUnresolved, "岗位的准确远程办公政策尚未确认。")
    }

    func testChineseNoSignalFailsClosedInChinese() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "谢谢，今天聊得很有收获。",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.language, .chinese)
        XCTAssertEqual(insight.status, .noSignal)
        XCTAssertEqual(insight.proposed, "保持关系状态不变。")
        XCTAssertNil(insight.suggestedAction)
    }

    func testChineseFullWidthSpeakerLabelsAbstain() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "候选人：我希望远程办公。\n招聘方：客户要求每周到岗三天。",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.status, .needsReview)
        XCTAssertTrue(insight.unresolved[0].contains("多个明确说话人"))
        XCTAssertNil(insight.suggestedAction)
    }

    func testExpiredChineseDeadlineRequiresCurrentOutcomeBeforeNewAction() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "我需要在2026年8月20日前决定。",
            acquisition: "Explicit text entry"
        )
        let now = Date(timeIntervalSince1970: 1_788_192_000) // 2026-09-01 UTC

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item, now: now))

        XCTAssertEqual(insight.status, .needsReview)
        XCTAssertTrue(insight.unresolved[0].contains("已经过去"))
        XCTAssertNil(insight.suggestedAction)
    }

    func testMostlyEnglishConversationWithChineseNameKeepsEnglishPresentation() throws {
        let item = ContextCapsuleItem(
            kind: .selectedText,
            displayName: "Selected conversation",
            preview: "Alex 陈嘉宁 needs the exact remote policy before Friday.",
            acquisition: "Explicit text entry"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertEqual(insight.language, .english)
        XCTAssertEqual(insight.modalityTitle, insight.modality.rawValue)
        XCTAssertTrue(insight.change.contains("follow-up signals"))
    }
}
