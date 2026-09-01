import CryptoKit
import Foundation

/// A local, reversible reading of deliberately selected text. This type never
/// grants relationship-state or external-action authority; it exists only to
/// make the first useful review available before scope is confirmed.
struct ProvisionalFollowUpInsight: Equatable, Sendable {
    static let compilerVersion = "candidate-follow-up-local-v4"

    enum ContentLanguage: String, Equatable, Sendable {
        case english
        case chinese
    }

    enum Status: Equatable, Sendable {
        case ready
        case needsReview
        case noSignal
    }

    enum Modality: String, Equatable, Sendable {
        case explicitStatement = "Explicit statement"
        case preference = "Preference"
        case constraint = "Constraint"
        case commitment = "Commitment"
        case openQuestion = "Open question"
        case uncertain = "Uncertain wording"
    }

    enum SuggestedAction: Equatable, Sendable {
        case prepareClientQuestion
        case prepareCandidateFollowUp
        case createReminder
    }

    let sourceItemID: UUID
    let sourceDigest: String
    let derivationVersion: String
    let capturedAt: Date
    let language: ContentLanguage
    let status: Status
    let change: String
    let before: String
    let proposed: String
    let exactEvidence: String
    let modality: Modality
    /// The one unresolved dependency that most directly controls the proposed
    /// next step. Remaining provenance and ambiguity checks stay available in
    /// `unresolved` for progressive review.
    let primaryUnresolved: String
    let unresolved: [String]
    let smallestNextStep: String?
    let suggestedAction: SuggestedAction?
    let editableDraft: String?
    let clientQuestionDraft: String?

    var canPrepareAction: Bool {
        status != .noSignal && suggestedAction != nil
    }

    var modalityTitle: String {
        guard language == .chinese else { return modality.rawValue }
        return switch modality {
        case .explicitStatement: "明确表述"
        case .preference: "偏好"
        case .constraint: "约束"
        case .commitment: "承诺"
        case .openQuestion: "待回答问题"
        case .uncertain: "不确定表述"
        }
    }
}

enum EvidenceSupportJudgment: String, Equatable, Sendable {
    case supported
    case unsupported
    case unsure
}

enum ChangeUnderstandingJudgment: String, Equatable, Sendable {
    case yes
    case no
    case unsure
}

enum CompanionTrialCompletion: String, Equatable, Hashable, Sendable {
    case draftCopied = "draft_copied"
    case mailDraftOpened = "mail_draft_opened"
    case reminderVerified = "reminder_verified"
    case relationshipReviewed = "relationship_reviewed"
}

enum CompanionReuseIntent: String, Equatable, Sendable {
    case yes
    case no
    case unsure
}

struct CompanionTrialMetrics: Equatable, Sendable {
    let sessionID: UUID
    let inputAcceptedAt: Date
    var firstValueMilliseconds: Double?
    var draftPreparedMilliseconds: Double?
    var scopeReviewStartedMilliseconds: Double?
    var scopeConfirmedMilliseconds: Double?
    var reminderVerifiedMilliseconds: Double?
    var relationshipReviewCompletedMilliseconds: Double?
    var consequenceReviewAbandonedMilliseconds: Double?
    var changeUnderstanding: ChangeUnderstandingJudgment?
    var evidenceSupport: EvidenceSupportJudgment?
    var actionWasProposed = false
    var actionWasEdited = false
    var completedActions: Set<CompanionTrialCompletion> = []
    var reuseIntent: CompanionReuseIntent?

    init(sessionID: UUID = UUID(), inputAcceptedAt: Date = Date()) {
        self.sessionID = sessionID
        self.inputAcceptedAt = inputAcceptedAt
    }
}

/// Deliberately content-free field-trial output. It excludes source text,
/// names, relationship identifiers, draft text, and external object IDs.
struct CompanionTrialExport: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let sessionID: String
    let firstValueMilliseconds: Double?
    let draftPreparedMilliseconds: Double?
    let scopeReviewStartedMilliseconds: Double?
    let scopeConfirmedMilliseconds: Double?
    let reminderVerifiedMilliseconds: Double?
    let relationshipReviewCompletedMilliseconds: Double?
    let consequenceReviewAbandonedMilliseconds: Double?
    let changeUnderstanding: String?
    let evidenceSupport: String?
    let actionWasProposed: Bool
    let actionWasEdited: Bool
    let actionWasAdopted: Bool
    let completedActions: [String]
    let reuseIntent: String?

    init(metrics: CompanionTrialMetrics) {
        schemaVersion = 2
        sessionID = metrics.sessionID.uuidString.lowercased()
        firstValueMilliseconds = Self.rounded(metrics.firstValueMilliseconds)
        draftPreparedMilliseconds = Self.rounded(metrics.draftPreparedMilliseconds)
        scopeReviewStartedMilliseconds = Self.rounded(metrics.scopeReviewStartedMilliseconds)
        scopeConfirmedMilliseconds = Self.rounded(metrics.scopeConfirmedMilliseconds)
        reminderVerifiedMilliseconds = Self.rounded(metrics.reminderVerifiedMilliseconds)
        relationshipReviewCompletedMilliseconds = Self.rounded(metrics.relationshipReviewCompletedMilliseconds)
        consequenceReviewAbandonedMilliseconds = Self.rounded(metrics.consequenceReviewAbandonedMilliseconds)
        changeUnderstanding = metrics.changeUnderstanding?.rawValue
        evidenceSupport = metrics.evidenceSupport?.rawValue
        actionWasProposed = metrics.actionWasProposed
        actionWasEdited = metrics.actionWasEdited
        actionWasAdopted = !metrics.completedActions.isEmpty
        completedActions = metrics.completedActions.map(\.rawValue).sorted()
        reuseIntent = metrics.reuseIntent?.rawValue
    }

    private static func rounded(_ value: Double?) -> Double? {
        value.map { max(0, ($0 * 10).rounded() / 10) }
    }
}

@MainActor
protocol CompanionTrialExportCopying {
    func copyTrialExport(_ text: String) -> Bool
}

/// Deliberately narrow and deterministic. Unsupported content fails closed to
/// `noSignal` instead of inventing a candidate state or next action.
enum CandidateFollowUpCompiler {
    private enum SignalKind {
        case timing
        case competingProcess
        case workArrangement
        case compensation
        case availability
        case openQuestion
        case commitment
    }

    static func compile(items: [ContextCapsuleItem], now: Date = Date()) -> ProvisionalFollowUpInsight? {
        guard let item = items.reversed().first(where: { $0.hasReviewedTextDerivative }) else {
            return nil
        }
        return compile(item: item, now: now)
    }

    static func compile(item: ContextCapsuleItem, now: Date = Date()) -> ProvisionalFollowUpInsight? {
        let source = item.preview.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !source.isEmpty else { return nil }
        let language = contentLanguage(for: source)

        if let abstention = safetyAbstention(for: source, item: item, now: now, language: language) {
            return abstention
        }

        let sentences = sentenceExcerpts(in: source)
        let match = sentences.compactMap { sentence -> (SignalKind, String)? in
            detectSignal(in: sentence).map { ($0, sentence) }
        }.first

        guard let (kind, evidence) = match else {
            return ProvisionalFollowUpInsight(
                sourceItemID: item.id,
                sourceDigest: digest(source),
                derivationVersion: ProvisionalFollowUpInsight.compilerVersion,
                capturedAt: item.capturedAt,
                language: language,
                status: .noSignal,
                change: localized(
                    "No decision-relevant change detected",
                    "未发现与当前决策相关的变化",
                    language: language
                ),
                before: localized(
                    "No reviewed relationship update from this selection.",
                    "这段选择内容尚未形成经审核的关系更新。",
                    language: language
                ),
                proposed: localized(
                    "Leave relationship state unchanged.",
                    "保持关系状态不变。",
                    language: language
                ),
                exactEvidence: excerpt(source),
                modality: .explicitStatement,
                primaryUnresolved: localized(
                    "This limited local preview did not recognize a supported follow-up signal. Review the exact text rather than inferring one.",
                    "当前本地预览未识别到支持范围内的跟进信号；请检查原文，不要据此推断。",
                    language: language
                ),
                unresolved: [localized(
                    "This limited local preview did not recognize a supported follow-up signal. Review the exact text rather than inferring one.",
                    "当前本地预览未识别到支持范围内的跟进信号；请检查原文，不要据此推断。",
                    language: language
                )],
                smallestNextStep: nil,
                suggestedAction: nil,
                editableDraft: nil,
                clientQuestionDraft: nil
            )
        }

        let modality = modality(in: evidence, kind: kind)
        let hasRelativeDate = containsAny(
            evidence,
            terms: [
                "today", "tomorrow", "tonight", "this week", "next week",
                "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
                "今天", "明天", "今晚", "本周", "这周", "下周", "周一", "周二", "周三", "周四", "周五", "周六", "周日", "星期"
            ]
        )
        let uncertain = modality == .uncertain
        var unresolved: [String] = []
        if item.actorKind == .candidate, item.hasConfirmedAttribution {
            // Attribution is reviewed independently from the provisional
            // interpretation, so it can be removed from the unresolved list.
        } else if let actor = item.actorKind, item.hasConfirmedAttribution {
            unresolved.append(localized(
                "This excerpt is attributed to the \(actor.title.lowercased()), not the candidate; do not use it as candidate state.",
                "这段内容已确认来自\(chineseTitle(for: actor))，而不是候选人；不要把它作为候选人状态。",
                language: language
            ))
        } else {
            unresolved.append(localized(
                "Who said this has not been confirmed yet.",
                "这段话的说话人尚未确认。",
                language: language
            ))
        }
        if hasRelativeDate {
            unresolved.append(localized(
                "The date is relative; confirm the exact date and time before creating a reminder.",
                "这里使用了相对日期；创建提醒前请确认准确日期和时间。",
                language: language
            ))
        }
        if uncertain {
            unresolved.append(localized(
                "The wording is tentative; do not promote it to confirmed relationship state.",
                "这段表述仍不确定；不要把它提升为已确认的关系状态。",
                language: language
            ))
        }

        let content = presentation(for: kind, language: language)
        var primaryUnresolved = content.unresolved
        unresolved.insert(content.unresolved, at: 0)
        var change = content.change
        var proposed = content.proposed
        var smallestNextStep = content.nextStep
        var suggestedAction = content.action
        var editableDraft = content.draft
        var clientQuestionDraft = content.clientQuestion
        let alsoHasWorkArrangement = kind != .workArrangement && containsAny(
            source,
            terms: ["remote", "hybrid", "on-site", "onsite", "work from home", "office days", "远程", "混合办公", "居家", "到岗", "坐班"]
        )
        let alsoHasCompetingProcess = kind != .competingProcess && containsAny(
            source,
            terms: ["another process", "other process", "final interview", "other offer", "competing offer", "另一流程", "另一个流程", "其他流程", "终面", "另一个 offer", "其他机会", "流程推进"]
        )
        if alsoHasWorkArrangement || alsoHasCompetingProcess {
            var surfaced = [content.signalLabel]
            if alsoHasWorkArrangement {
                surfaced.append(localized("a work-arrangement factor", "工作方式因素", language: language))
            }
            if alsoHasCompetingProcess {
                surfaced.append(localized("another hiring process", "其他招聘流程", language: language))
            }
            change = localized(
                "Separate follow-up signals surfaced: \(surfaced.joined(separator: " · "))",
                "发现了多个需要分别审核的跟进信号：\(surfaced.joined(separator: " · "))",
                language: language
            )
            proposed = localized(
                "Keep these as separate reviewed signals; save none until their wording, speaker, and timing are confirmed.",
                "将这些信号分别保留为待审核内容；在措辞、说话人和时间确认前不要保存为当前状态。",
                language: language
            )
        }
        let hasWorkArrangementSignal = kind == .workArrangement || alsoHasWorkArrangement
        let hasCompetingProcessSignal = kind == .competingProcess || alsoHasCompetingProcess
        if hasWorkArrangementSignal && hasCompetingProcessSignal {
            let remotePolicy = containsAny(source, terms: ["remote", "work from home", "远程", "居家"])
            let policy = language == .chinese
                ? (remotePolicy ? "远程办公政策" : "工作方式边界")
                : (remotePolicy ? "remote-work policy" : "work-arrangement boundaries")
            primaryUnresolved = localized(
                "The role's exact \(policy) is not confirmed.",
                "岗位的准确\(policy)尚未确认。",
                language: language
            )
            unresolved.insert(primaryUnresolved, at: 0)
            smallestNextStep = localized(
                "Ask the client to confirm the exact \(policy) before the candidate's decision point.",
                "在候选人的决策时间点之前，向客户确认准确的\(policy)。",
                language: language
            )
            suggestedAction = .prepareClientQuestion
            clientQuestionDraft = localized(
                "Can we confirm the role's exact \(policy) before the candidate's decision point?",
                "我们能否在候选人的决策时间点之前，确认这个岗位准确的\(policy)？",
                language: language
            )
            editableDraft = clientQuestionDraft
        }
        if alsoHasWorkArrangement {
            unresolved.append(localized(
                "The conversation names a work-arrangement dependency but does not provide the role's exact policy.",
                "对话提到了工作方式依赖，但没有给出岗位的准确政策。",
                language: language
            ))
        }
        if alsoHasCompetingProcess {
            unresolved.append(localized(
                "The other hiring process is mentioned, but its exact stage and timing are not confirmed.",
                "对话提到了其他招聘流程，但其准确阶段和时间尚未确认。",
                language: language
            ))
        }
        if unresolved.isEmpty {
            unresolved.append(localized(
                "Whether this should change the relationship record remains a recruiter decision.",
                "是否据此更新关系记录，仍需招聘者决定。",
                language: language
            ))
        }
        return ProvisionalFollowUpInsight(
            sourceItemID: item.id,
            sourceDigest: digest(source),
            derivationVersion: ProvisionalFollowUpInsight.compilerVersion,
            capturedAt: item.capturedAt,
            language: language,
            status: hasRelativeDate || uncertain ? .needsReview : .ready,
            change: change,
            before: localized(
                "Not established from this selected conversation.",
                "这段选择内容此前未建立该状态。",
                language: language
            ),
            proposed: proposed,
            exactEvidence: evidence,
            modality: modality,
            primaryUnresolved: primaryUnresolved,
            unresolved: unresolved,
            smallestNextStep: smallestNextStep,
            suggestedAction: suggestedAction,
            editableDraft: editableDraft,
            clientQuestionDraft: clientQuestionDraft
        )
    }

    private static func detectSignal(in text: String) -> SignalKind? {
        let rules: [(SignalKind, [String])] = [
            (.timing, ["decide by", "decision by", "deadline", "by friday", "by monday", "before friday", "before monday", "决定", "截止", "最晚", "之前答复"]),
            (.competingProcess, ["another process", "other process", "final interview", "other offer", "competing offer", "另一流程", "另一个流程", "其他流程", "终面", "另一个 offer", "其他机会", "流程推进"]),
            (.workArrangement, ["remote", "hybrid", "on-site", "onsite", "work from home", "office days", "远程", "混合办公", "居家", "到岗", "坐班"]),
            (.compensation, ["salary", "compensation", "base pay", "package", "equity", "薪资", "薪酬", "年薪", "月薪", "股权"]),
            (.availability, ["start date", "notice period", "available from", "can start", "入职时间", "到岗时间", "通知期", "离职期", "可以入职"]),
            (.openQuestion, ["?", "？"]),
            (.commitment, ["i'll send", "i will send", "i'll share", "i will share", "i'll confirm", "i will confirm", "我会发", "我将发", "我会确认", "我再确认"])
        ]
        return rules.first(where: { containsAny(text, terms: $0.1) })?.0
    }

    private static func safetyAbstention(
        for source: String,
        item: ContextCapsuleItem,
        now: Date,
        language: ProvisionalFollowUpInsight.ContentLanguage
    ) -> ProvisionalFollowUpInsight? {
        let isConfirmedNonCandidate = item.hasConfirmedAttribution && item.actorKind != .candidate
        let hasRetraction = containsAny(
            source,
            terms: [
                "i take that back", "ignore what i said", "no longer applies", "scratch that",
                "收回", "忽略我刚才", "不再适用", "刚才的不算"
            ]
        )
        let hasQuotedOrForwardedSpeech = containsAny(
            source,
            terms: [
                "she said", "he said", "they said", "forwarded message", "wrote:",
                "她说", "他说", "他们说", "候选人说", "招聘方说", "客户说", "用人经理说", "转发消息", "转发："
            ]
        )
        let hasConflictingWorkPreference = containsAny(
            source,
            terms: ["prefer remote", "prefer fully remote", "倾向远程", "希望远程"]
        ) && containsAny(
            source,
            terms: ["prefer on-site", "prefer onsite", "prefer the office", "倾向到岗", "希望坐班"]
        )
        let trimmed = source.trimmingCharacters(in: .whitespacesAndNewlines)
        let hasCroppedBoundary = !(item.actorKind == .candidate && item.hasConfirmedAttribution) && (
            trimmed.hasPrefix("…") || trimmed.hasPrefix("...") ||
                trimmed.hasSuffix("…") || trimmed.hasSuffix("...")
        )
        let speakerLabels = explicitSpeakerLabels(in: source)
        let hasMultipleExplicitSpeakers = Set(speakerLabels).count > 1
        let hasNonCandidateSpeakerLabel = speakerLabels.contains {
            ["recruiter", "client", "hiring manager", "招聘方", "客户", "用人经理"].contains($0)
        }
        let hasExpiredDate = containsExpiredExplicitDate(source, now: now)
        guard isConfirmedNonCandidate || hasRetraction || hasQuotedOrForwardedSpeech ||
                hasConflictingWorkPreference || hasCroppedBoundary ||
                hasMultipleExplicitSpeakers || hasNonCandidateSpeakerLabel || hasExpiredDate else {
            return nil
        }

        let reason: String
        if isConfirmedNonCandidate {
            reason = localized(
                "This source is confirmed as someone other than the candidate; do not promote it to candidate state or prepare a candidate action.",
                "这段来源已确认并非候选人所说；不要把它提升为候选人状态，也不要准备候选人动作。",
                language: language
            )
        } else if hasExpiredDate {
            reason = localized(
                "The selected text contains an explicit date that has already passed; establish the current outcome before proposing a new follow-up.",
                "选择内容中的明确日期已经过去；提出新的跟进前，请先确认当前结果。",
                language: language
            )
        } else if hasMultipleExplicitSpeakers {
            reason = localized(
                "Multiple explicit speakers are present; separate the exact candidate message before proposing any change.",
                "内容中存在多个明确说话人；提出任何变化前，请先单独选择候选人的原话。",
                language: language
            )
        } else if hasNonCandidateSpeakerLabel {
            reason = localized(
                "The visible speaker label belongs to a recruiter, client, or hiring manager; do not treat this as candidate state.",
                "可见的说话人标签属于招聘者、客户或用人经理；不要把它作为候选人状态。",
                language: language
            )
        } else if hasCroppedBoundary {
            reason = localized(
                "The selection appears cropped and its speaker is not confirmed; include the identifying context before proposing any change.",
                "选择内容似乎被截断且说话人未确认；提出任何变化前，请补充可识别上下文。",
                language: language
            )
        } else if hasRetraction {
            reason = localized(
                "A possible retraction is present; identify which statement is current before proposing any change.",
                "内容中可能存在撤回或更正；提出任何变化前，请先确认哪项表述仍然有效。",
                language: language
            )
        } else if hasQuotedOrForwardedSpeech {
            reason = localized(
                "Quoted or forwarded speech may belong to someone else; confirm the exact speaker before proposing any change.",
                "引用或转发内容可能来自其他人；提出任何变化前，请确认准确说话人。",
                language: language
            )
        } else {
            reason = localized(
                "Conflicting work-arrangement statements are present; preserve both until the current preference is clarified.",
                "内容中存在互相冲突的工作方式表述；在当前偏好澄清前，请保留两者。",
                language: language
            )
        }
        return ProvisionalFollowUpInsight(
            sourceItemID: item.id,
            sourceDigest: digest(source),
            derivationVersion: ProvisionalFollowUpInsight.compilerVersion,
            capturedAt: item.capturedAt,
            language: language,
            status: .needsReview,
            change: localized(
                "Conflicting or superseding evidence needs review",
                "矛盾或被后续信息取代的证据需要审核",
                language: language
            ),
            before: localized(
                "No safe current state can be established from this selection.",
                "无法从这段选择内容安全地确定当前状态。",
                language: language
            ),
            proposed: localized(
                "Keep relationship state unchanged until the conflict is resolved.",
                "在冲突解决前保持关系状态不变。",
                language: language
            ),
            exactEvidence: excerpt(source),
            modality: .uncertain,
            primaryUnresolved: reason,
            unresolved: [reason],
            smallestNextStep: nil,
            suggestedAction: nil,
            editableDraft: nil,
            clientQuestionDraft: nil
        )
    }

    private static func explicitSpeakerLabels(in source: String) -> [String] {
        let pattern = "(?m)^\\s*([\\p{L}][\\p{L}\\p{N} ._-]{0,39})[：:]\\s*"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(source.startIndex..<source.endIndex, in: source)
        return regex.matches(in: source, range: range).compactMap { match in
            guard match.numberOfRanges > 1,
                  let labelRange = Range(match.range(at: 1), in: source) else { return nil }
            return source[labelRange]
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
                .lowercased()
        }
    }

    private static func containsExpiredExplicitDate(_ source: String, now: Date) -> Bool {
        let patterns = [
            ("\\b20[0-9]{2}-[0-9]{2}-[0-9]{2}\\b", "yyyy-MM-dd"),
            ("20[0-9]{2}年[0-9]{1,2}月[0-9]{1,2}日", "yyyy年M月d日"),
            ("\\b20[0-9]{2}/[0-9]{1,2}/[0-9]{1,2}\\b", "yyyy/M/d"),
            ("\\b20[0-9]{2}\\.[0-9]{1,2}\\.[0-9]{1,2}\\b", "yyyy.M.d")
        ]
        let sourceRange = NSRange(source.startIndex..<source.endIndex, in: source)
        let today = Calendar.current.startOfDay(for: now)
        return patterns.contains { entry in
            let (pattern, dateFormat) = entry
            guard let regex = try? NSRegularExpression(pattern: pattern) else { return false }
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = .current
            formatter.isLenient = false
            formatter.dateFormat = dateFormat
            return regex.matches(in: source, range: sourceRange).contains { match in
                guard let swiftRange = Range(match.range, in: source),
                      let date = formatter.date(from: String(source[swiftRange])) else { return false }
                return date < today
            }
        }
    }

    private static func modality(in text: String, kind: SignalKind) -> ProvisionalFollowUpInsight.Modality {
        if containsAny(text, terms: ["maybe", "possibly", "perhaps", "not sure", "might", "可能", "也许", "或许", "不确定", "说不好"]) {
            return .uncertain
        }
        if containsAny(text, terms: ["prefer", "preference", "ideally", "would like", "倾向", "希望", "最好", "更想"]) {
            return .preference
        }
        if containsAny(text, terms: ["must", "need to", "cannot", "can't", "only if", "only accept", "require", "必须", "需要", "不能", "只能", "前提是"]) {
            return .constraint
        }
        if kind == .commitment { return .commitment }
        if kind == .openQuestion { return .openQuestion }
        return .explicitStatement
    }

    private static func presentation(
        for kind: SignalKind,
        language: ProvisionalFollowUpInsight.ContentLanguage
    ) -> (
        signalLabel: String,
        change: String,
        proposed: String,
        unresolved: String,
        nextStep: String,
        action: ProvisionalFollowUpInsight.SuggestedAction,
        draft: String,
        clientQuestion: String
    ) {
        switch kind {
        case .timing:
            if language == .chinese {
                return (
                    "决策时间",
                    "出现了新的决策时间",
                    "仅在日期和说话人审核后记录决策时间信号。",
                    "准确决策日期和剩余关键问题尚未确认。",
                    "在这项时间信息失效前创建跟进提醒。",
                    .createReminder,
                    "跟进选择内容中提到的决策时间，并在期限前确认仍未解决的问题。",
                    "我们能否在候选人对话中提到的时间点之前，确认剩余的关键问题？"
                )
            }
            return (
                "Decision timing",
                "Decision timing surfaced",
                "Record a decision-timing signal only after its date and speaker are reviewed.",
                "The exact decision date and remaining decision-critical point are not confirmed.",
                "Create a follow-up reminder before the stated timing becomes stale.",
                .createReminder,
                "Follow up on the decision timing from the selected conversation. Confirm the remaining point before the stated window closes.",
                "Can we confirm the remaining decision-critical point before the timing mentioned in the candidate conversation?"
            )
        case .competingProcess:
            if language == .chinese {
                return (
                    "其他招聘流程",
                    "出现了其他招聘流程信号",
                    "说话人审核后再记录其他招聘流程为活跃信号。",
                    "其他招聘流程的准确阶段和时间尚未确认。",
                    "在其他流程继续推进前创建跟进提醒。",
                    .createReminder,
                    "跟进对话中提到的其他招聘流程，并澄清下一步需要解决的问题。",
                    "我们能否在候选人的其他招聘流程继续推进前，确认剩余的岗位信息？"
                )
            }
            return (
                "Another hiring process",
                "Another hiring process surfaced",
                "Record an active competing-process signal after attribution is reviewed.",
                "The other hiring process's exact stage and timing are not confirmed.",
                "Create a follow-up reminder before the other process advances.",
                .createReminder,
                "Check in on the other hiring process mentioned in the conversation and clarify what needs to be resolved next.",
                "Can we confirm the remaining role detail before the candidate's other hiring process advances?"
            )
        case .workArrangement:
            if language == .chinese {
                return (
                    "工作方式因素",
                    "出现了工作方式因素",
                    "审核后再将原话记录为偏好或约束。",
                    "岗位能否满足这项工作方式要求尚未确认。",
                    "准备一个客户问题，确认岗位是否满足这一点。",
                    .prepareClientQuestion,
                    "在我跟进候选人前，我们能否确认这个岗位准确的工作方式边界？",
                    "在我跟进候选人前，我们能否确认这个岗位准确的工作方式边界？"
                )
            }
            return (
                "A work-arrangement factor",
                "A work-arrangement factor surfaced",
                "Record the wording as a preference or constraint only after review.",
                "Whether the role can meet this work-arrangement point is not confirmed.",
                "Prepare a client question that tests the role against this point.",
                .prepareClientQuestion,
                "Can we confirm the role's work-arrangement boundaries before I follow up with the candidate?",
                "Can we confirm the role's work-arrangement boundaries before I follow up with the candidate?"
            )
        case .compensation:
            if language == .chinese {
                return (
                    "薪酬因素",
                    "出现了薪酬因素",
                    "审核后仅记录明确表达的薪酬因素；不要推断接受概率。",
                    "这个岗位已批准的薪酬边界尚未确认。",
                    "准备一个客户问题，澄清已批准的薪酬边界。",
                    .prepareClientQuestion,
                    "在我跟进候选人前，我们能否确认这个岗位已批准的薪酬边界？",
                    "在我跟进候选人前，我们能否确认这个岗位已批准的薪酬边界？"
                )
            }
            return (
                "A compensation factor",
                "A compensation factor surfaced",
                "Record only the stated compensation factor after review; do not infer acceptance likelihood.",
                "The role's approved compensation boundary is not confirmed.",
                "Prepare a client question that clarifies the approved compensation boundary.",
                .prepareClientQuestion,
                "Can we confirm the approved compensation boundary for this role before I follow up with the candidate?",
                "Can we confirm the approved compensation boundary for this role before I follow up with the candidate?"
            )
        case .availability:
            if language == .chinese {
                return (
                    "可入职时间",
                    "出现了可入职时间因素",
                    "仅在日期和说话人审核后记录明确表达的可入职时间。",
                    "准确可行的入职日期尚未确认。",
                    "准备一次跟进，确认准确可行的入职日期。",
                    .prepareCandidateFollowUp,
                    "你能否确认对你可行的准确入职日期？",
                    "在我跟进候选人前，我们能否确认这个岗位最晚可接受的入职日期？"
                )
            }
            return (
                "An availability factor",
                "An availability factor surfaced",
                "Record the stated availability only after its date and speaker are reviewed.",
                "The exact workable start date is not confirmed.",
                "Prepare a follow-up that confirms the exact feasible start date.",
                .prepareCandidateFollowUp,
                "Could you confirm the exact start date that would be workable for you?",
                "Can we confirm the latest workable start date for this role before I follow up with the candidate?"
            )
        case .openQuestion:
            if language == .chinese {
                return (
                    "待回答问题",
                    "出现了一个待回答问题",
                    "在获得经审核的答案前，将这个问题保持为未解决。",
                    "这个问题还没有经过审核的答案。",
                    "准备一条回复，回应原文中的准确问题。",
                    .prepareCandidateFollowUp,
                    "谢谢你提出这个问题。我正在确认准确答案，确认后会跟进。",
                    "在我跟进候选人前，我们能否确认候选人所问问题的答案？"
                )
            }
            return (
                "An open question",
                "An open question surfaced",
                "Keep the question unresolved until a reviewed answer exists.",
                "No reviewed answer exists for this question yet.",
                "Prepare a reply that addresses the exact open question.",
                .prepareCandidateFollowUp,
                "Thanks for raising this. I’m checking the exact answer and will follow up once it is confirmed.",
                "Can we confirm the answer to the candidate's open question before I follow up?"
            )
        case .commitment:
            if language == .chinese {
                return (
                    "跟进承诺",
                    "出现了跟进承诺",
                    "仅在说话人和时间审核后记录这项承诺。",
                    "承诺的跟进是否已经发生尚未确认。",
                    "创建提醒，检查承诺的跟进是否已经发生。",
                    .createReminder,
                    "检查选择内容中承诺的跟进是否已经发生，再决定最小下一步。",
                    "在等待承诺的跟进期间，客户侧是否还有需要解决的依赖？"
                )
            }
            return (
                "A follow-up commitment",
                "A follow-up commitment surfaced",
                "Record the commitment only after the speaker and timing are reviewed.",
                "Whether the promised follow-up occurred is not confirmed.",
                "Create a reminder to check whether the promised follow-up arrived.",
                .createReminder,
                "Check whether the follow-up promised in the selected conversation has arrived, then decide the smallest next step.",
                "Is there any client-side dependency we should resolve while the promised follow-up is pending?"
            )
        }
    }

    private static func contentLanguage(for source: String) -> ProvisionalFollowUpInsight.ContentLanguage {
        let counts = source.unicodeScalars.reduce(into: (han: 0, latin: 0)) { counts, scalar in
            switch scalar.value {
            case 0x3400...0x4DBF, 0x4E00...0x9FFF, 0xF900...0xFAFF:
                counts.han += 1
            case 0x41...0x5A, 0x61...0x7A:
                counts.latin += 1
            default:
                break
            }
        }
        return counts.han >= 4 && counts.han * 2 >= counts.latin ? .chinese : .english
    }

    private static func localized(
        _ english: String,
        _ chinese: String,
        language: ProvisionalFollowUpInsight.ContentLanguage
    ) -> String {
        language == .chinese ? chinese : english
    }

    private static func chineseTitle(for actor: CapsuleActorKind) -> String {
        switch actor {
        case .candidate: "候选人"
        case .recruiter: "招聘者"
        case .client: "客户"
        case .documentAuthor: "文档作者"
        }
    }

    private static func sentenceExcerpts(in source: String) -> [String] {
        let pattern = "[^.!?。！？\\n]+[.!?。！？]?"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [excerpt(source)] }
        let range = NSRange(source.startIndex..<source.endIndex, in: source)
        let matches = regex.matches(in: source, range: range).compactMap { match -> String? in
            guard let swiftRange = Range(match.range, in: source) else { return nil }
            let sentence = source[swiftRange].trimmingCharacters(in: .whitespacesAndNewlines)
            return sentence.isEmpty ? nil : excerpt(String(sentence))
        }
        return matches.isEmpty ? [excerpt(source)] : matches
    }

    private static func excerpt(_ text: String, limit: Int = 360) -> String {
        guard text.count > limit else { return text }
        let end = text.index(text.startIndex, offsetBy: limit)
        return String(text[..<end]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func containsAny(_ text: String, terms: [String]) -> Bool {
        let folded = text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        return terms.contains {
            folded.contains($0.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current))
        }
    }

    private static func digest(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
