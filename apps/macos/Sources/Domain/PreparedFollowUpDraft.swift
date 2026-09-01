import Foundation

enum PreparedDraftKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case candidateFollowUp = "candidate_follow_up"
    case clientQuestion = "client_question"
    case meetingQuestion = "meeting_question"
    case clientUpdate = "client_update"

    var id: String { rawValue }

    var title: String {
        title(language: .english)
    }

    func title(language: ProvisionalFollowUpInsight.ContentLanguage) -> String {
        if language == .chinese {
            switch self {
            case .candidateFollowUp: return "候选人跟进"
            case .clientQuestion: return "客户澄清"
            case .meetingQuestion: return "会前问题"
            case .clientUpdate: return "客户短更新"
            }
        }
        return switch self {
        case .candidateFollowUp: "Candidate follow-up"
        case .clientQuestion: "Client clarification"
        case .meetingQuestion: "Meeting question"
        case .clientUpdate: "Client update"
        }
    }

    var mailSubject: String {
        mailSubject(language: .english)
    }

    func mailSubject(language: ProvisionalFollowUpInsight.ContentLanguage) -> String {
        if language == .chinese {
            switch self {
            case .candidateFollowUp: return "候选人跟进"
            case .clientQuestion: return "客户澄清"
            case .meetingQuestion: return "会前问题"
            case .clientUpdate: return "候选人进展更新"
            }
        }
        return switch self {
        case .candidateFollowUp: "Candidate follow-up"
        case .clientQuestion: "Client clarification"
        case .meetingQuestion: "Meeting question"
        case .clientUpdate: "Candidate update"
        }
    }

    static func inferred(from subject: String) -> PreparedDraftKind? {
        let normalized = subject.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalized.contains("meeting") || normalized.contains("会前") { return .meetingQuestion }
        if normalized.contains("update") || normalized.contains("进展更新") || normalized.contains("客户短更新") { return .clientUpdate }
        if normalized.contains("client") || normalized.contains("clarification") || normalized.contains("客户澄清") { return .clientQuestion }
        if normalized.contains("candidate") || normalized.contains("follow-up") || normalized.contains("候选人跟进") { return .candidateFollowUp }
        return nil
    }
}

struct PreparedFollowUpDraft: Equatable, Sendable {
    let kind: PreparedDraftKind
    let subject: String
    let body: String
}

/// Produces bounded, local-only communication drafts from the reviewed
/// provisional interpretation. Exact conversation text is deliberately not
/// copied into a message by default; the recruiter sees it in the evidence
/// card and decides what, if anything, belongs in the editable draft.
enum EvidenceBoundDraftComposer {
    static func compose(
        kind: PreparedDraftKind,
        insight: ProvisionalFollowUpInsight
    ) -> PreparedFollowUpDraft? {
        guard insight.canPrepareAction else { return nil }

        let chinese = insight.language == .chinese
        let clientQuestion = insight.clientQuestionDraft?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let body: String
        switch kind {
        case .candidateFollowUp:
            if insight.suggestedAction == .prepareCandidateFollowUp,
               let suggested = insight.editableDraft?.trimmingCharacters(in: .whitespacesAndNewlines),
               !suggested.isEmpty {
                body = suggested
            } else {
                body = chinese
                    ? "谢谢你说明这一点。我正在确认对话中提到的准确信息，得到确认后会跟进。"
                    : "Thanks for sharing this. I’m checking the exact detail raised in our conversation and will follow up once I have a confirmed answer."
            }
        case .clientQuestion:
            guard let clientQuestion, !clientQuestion.isEmpty else { return nil }
            body = clientQuestion
        case .meetingQuestion:
            guard let clientQuestion, !clientQuestion.isEmpty else { return nil }
            body = chinese
                ? "下次会议需要确认：\n\n\(clientQuestion)"
                : "For the next meeting:\n\n\(clientQuestion)"
        case .clientUpdate:
            guard let clientQuestion, !clientQuestion.isEmpty else { return nil }
            body = chinese
                ? "简短更新：\(sentence(insight.change))\n\n下次跟进候选人前：\n\(clientQuestion)"
                : "Quick update: \(sentence(insight.change))\n\nBefore the next candidate follow-up:\n\(clientQuestion)"
        }

        return PreparedFollowUpDraft(
            kind: kind,
            subject: kind.mailSubject(language: insight.language),
            body: body
        )
    }

    private static func sentence(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let last = trimmed.last, !".!?。！？".contains(last) else { return trimmed }
        return trimmed + "."
    }
}
