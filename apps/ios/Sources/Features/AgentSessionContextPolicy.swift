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
              createdAt: response.createdAt, citations: [])
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
