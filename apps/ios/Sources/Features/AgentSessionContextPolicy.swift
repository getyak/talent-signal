import Foundation

/// Saved and copied messages retain readable context, never live action authority.
enum AgentSessionContextPolicy {
    static func readOnlyBlock(_ block: RelationshipAskResponse.Block) -> RelationshipAskResponse.Block {
        .init(id: block.id, kind: block.kind, title: block.title, body: block.body, status: block.status,
              citationDependencyIDs: [], requiresUserDecision: false, targetRef: nil,
              publicSources: block.publicSources)
    }

    static func readOnlyResponse(_ response: RelationshipAskResponse) -> RelationshipAskResponse {
        .init(contractVersion: response.contractVersion, taskID: response.taskID,
              contextManifestID: response.contextManifestID, knowledgeSnapshotID: response.knowledgeSnapshotID,
              disposition: response.disposition, blocks: response.blocks.map(readOnlyBlock), media: [],
              createdAt: response.createdAt, sessionTitle: response.sessionTitle, citations: [])
    }

    static func exportMarkdown(_ session: AgentSession, language: AppLanguage) -> String {
        var lines = ["# \(session.displayTitle(in: language))", ""]
        if session.originSessionID != nil {
            lines += [language.text("Copied conversation context; sources need refresh."), ""]
        }
        struct Entry {
            let date: Date
            let order: Int
            let text: [String]
        }
        let turns = session.turns.enumerated().map { index, turn in
            var text = ["## \(language.text("You"))", "", turn.objective, "",
                        "## \(language.text("Agent"))", ""]
            text += turn.response.blocks.flatMap { [$0.title, "", $0.body, ""] }
            if turn.requiresRefresh {
                text += [language.text("Saved context — verify current sources before acting."), ""]
            }
            return Entry(date: turn.createdAt, order: index, text: text)
        }
        let receipts = session.contactReceipts.enumerated().map { index, receipt in
            let label: String
            switch receipt.outcome {
            case .createdPerson: label = language.text("Contact created")
            case .matchedExisting: label = language.text("Contact updated")
            case .identityReview: label = language.text("Identity needs review")
            }
            return Entry(date: receipt.createdAt, order: session.turns.count + index,
                         text: ["## \(label)", "", receipt.personDisplayLabel, ""])
        }
        lines += (turns + receipts).sorted {
            $0.date == $1.date ? $0.order < $1.order : $0.date < $1.date
        }.flatMap(\.text)
        if let pending = session.pendingObjective {
            lines += ["## \(language.text("Waiting to continue"))", "", pending, ""]
        }
        return lines.joined(separator: "\n")
    }
}

/// The two copies a recruiter may deliberately export from a Session.
///
/// The default is always the bounded summary card. The readable conversation
/// requires an explicit second choice and is never offered for identity-review
/// Sessions.
enum AgentSessionShareScope: String, CaseIterable, Identifiable, Equatable {
    case summary
    case conversation

    var id: String { rawValue }
}

/// A static, bounded copy of a Session built only from safe saved answers.
///
/// It carries no pending objective, no contact execution metadata, no action or
/// target block, no citation/media, and no identifier or authority. Generated
/// copies can never continue a conversation or trigger an external write.
struct AgentSessionShareSnapshot: Equatable {
    let scope: AgentSessionShareScope
    let title: String
    let contextLabel: String
    let excerpt: String
    let updatedLabel: String
    let statusLabel: String
    let conversationLines: [AgentSessionShareConversationLine]

    var isSummary: Bool { scope == .summary }
}

struct AgentSessionShareConversationLine: Equatable, Identifiable {
    let id: String
    let isObjective: Bool
    let text: String
}

/// Pure snapshot and export policy for the GET-27 Session sharing slice.
///
/// It sits beside `AgentSessionContextPolicy` so a shared artifact can never
/// promote interpretation to authority, widen candidate-data exposure, or lose
/// the boundary that nothing here mutates Session state.
enum AgentSessionSharePolicy {
    /// Bounded visible excerpt so a card cannot silently carry a whole answer.
    static let excerptLimit = 280

    /// Kinds that may appear in a shared copy. Anything projected as a live
    /// action, proposal, processing state, or research result is excluded.
    static let safeBlockKind = "answer"

    /// The only block shape that may be copied: a plain answer that asks for no
    /// decision and points at no external target.
    static func isSafeAnswerBlock(_ block: RelationshipAskResponse.Block) -> Bool {
        block.kind == safeBlockKind
            && !block.requiresUserDecision
            && block.targetRef == nil
    }

    /// Identity review never discloses the person label and never offers the
    /// readable conversation, even after an explicit choice.
    static func allowsConversation(_ session: AgentSession) -> Bool {
        !session.isIdentityReview
    }

    static func isShareable(_ session: AgentSession) -> Bool {
        latestSafeAnswer(in: session) != nil
    }

    static func availability(
        for session: AgentSession,
        scope: AgentSessionShareScope,
        language: AppLanguage
    ) -> AgentSessionShareAvailability {
        guard isShareable(session) else {
            return .unavailable(
                language.text(
                    "This Session has no saved answer to share yet.",
                    zhHans: "此会话还没有可分享的已保存回答。"
                )
            )
        }
        if scope == .conversation, !allowsConversation(session) {
            return .unavailable(
                language.text(
                    "Identity-review Sessions cannot share the conversation.",
                    zhHans: "身份审阅会话不能分享完整对话。"
                )
            )
        }
        return .available(snapshot(for: session, scope: scope, language: language))
    }

    static func snapshot(
        for session: AgentSession,
        scope: AgentSessionShareScope,
        language: AppLanguage
    ) -> AgentSessionShareSnapshot {
        let answer = latestSafeAnswer(in: session) ?? ""
        return AgentSessionShareSnapshot(
            scope: scope,
            title: safeTitle(for: session, language: language),
            contextLabel: safeContextLabel(for: session, language: language),
            excerpt: boundedExcerpt(answer),
            updatedLabel: updatedLabel(for: session, language: language),
            statusLabel: statusLabel(for: session, language: language),
            conversationLines: scope == .conversation
                ? conversationLines(for: session)
                : []
        )
    }

    /// Plain-text alternate description handed to the system share sheet
    /// alongside the rendered card image.
    static func alternateText(
        _ snapshot: AgentSessionShareSnapshot,
        language: AppLanguage
    ) -> String {
        var lines = [snapshot.title, snapshot.contextLabel, ""]
        if snapshot.isSummary {
            lines += [
                language.text("Static copy — sources, pending decisions, and action authority are omitted.",
                              zhHans: "静态副本 — 已省略来源、待定决策与行动权限。"),
                "",
                snapshot.excerpt,
                "",
                "\(snapshot.updatedLabel) · \(snapshot.statusLabel)"
            ]
        } else {
            lines += snapshot.conversationLines.map { line in
                line.isObjective
                    ? "\(language.text("You")): \(line.text)"
                    : "\(language.text("Agent")): \(line.text)"
            }
            lines += ["", snapshot.updatedLabel, snapshot.statusLabel]
        }
        return lines.joined(separator: "\n")
    }

    static func boundedExcerpt(_ body: String) -> String {
        let collapsed = body
            .replacingOccurrences(of: "\r\n", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard collapsed.count > excerptLimit else { return collapsed }
        let end = collapsed.index(collapsed.startIndex, offsetBy: excerptLimit)
        return String(collapsed[..<end]).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }

    /// Chronological user objectives plus only safe answer bodies.
    private static func conversationLines(
        for session: AgentSession
    ) -> [AgentSessionShareConversationLine] {
        var lines: [AgentSessionShareConversationLine] = []
        for (index, turn) in chronologicalTurns(session).enumerated() {
            let objective = turn.objective.trimmingCharacters(in: .whitespacesAndNewlines)
            if !objective.isEmpty {
                lines.append(.init(id: "objective-\(index)", isObjective: true, text: objective))
            }
            for (blockIndex, block) in turn.response.blocks.enumerated()
            where isSafeAnswerBlock(block) {
                let body = block.body.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !body.isEmpty else { continue }
                lines.append(.init(id: "answer-\(index)-\(blockIndex)", isObjective: false, text: body))
            }
        }
        return lines
    }

    /// Latest saved answer the user can safely stand behind.
    private static func latestSafeAnswer(in session: AgentSession) -> String? {
        for turn in chronologicalTurns(session).reversed() {
            let safeBodies = turn.response.blocks
                .filter(isSafeAnswerBlock)
                .map(\.body)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            if let body = safeBodies.last { return body }
        }
        return nil
    }

    private static func chronologicalTurns(_ session: AgentSession) -> [AgentSessionTurn] {
        session.turns.enumerated().sorted { lhs, rhs in
            lhs.element.createdAt == rhs.element.createdAt
                ? lhs.offset < rhs.offset
                : lhs.element.createdAt < rhs.element.createdAt
        }.map(\.element)
    }

    private static func safeTitle(for session: AgentSession, language: AppLanguage) -> String {
        if session.isIdentityReview {
            return language.text("Identity review session", zhHans: "身份审阅会话")
        }
        let trimmed = session.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty
            ? language.text("Session", zhHans: "会话")
            : trimmed
    }

    private static func safeContextLabel(for session: AgentSession, language: AppLanguage) -> String {
        if session.isIdentityReview {
            return language.text("Identity review", zhHans: "身份审阅")
        }
        return session.displayContextLabel(in: language)
    }

    private static func updatedLabel(for session: AgentSession, language: AppLanguage) -> String {
        let formatter = DateFormatter()
        formatter.locale = language.locale
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.setLocalizedDateFormatFromTemplate("yMMMdjm")
        return String(
            format: language.text("Updated %@", zhHans: "更新于 %@"),
            locale: language.locale,
            formatter.string(from: session.updatedAt)
        )
    }

    private static func statusLabel(for session: AgentSession, language: AppLanguage) -> String {
        if session.turns.contains(where: \.requiresRefresh) {
            return language.text(
                "Saved copy · sources may need refresh",
                zhHans: "已保存副本 · 来源可能需要刷新"
            )
        }
        if session.originSessionID != nil {
            return language.text("Forked copy", zhHans: "分叉副本")
        }
        return language.text("Saved copy", zhHans: "已保存副本")
    }
}

enum AgentSessionShareAvailability: Equatable {
    case available(AgentSessionShareSnapshot)
    case unavailable(String)

    var snapshot: AgentSessionShareSnapshot? {
        if case let .available(snapshot) = self { return snapshot }
        return nil
    }

    var unavailableReason: String? {
        if case let .unavailable(reason) = self { return reason }
        return nil
    }
}
