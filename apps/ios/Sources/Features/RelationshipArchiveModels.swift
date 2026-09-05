import CryptoKit
import Foundation
import SwiftUI

enum RelationshipArchivePage: String, CaseIterable, Identifiable {
    case today = "Today"
    case sessions = "Sessions"
    case people = "People"

    var id: String { rawValue }

    var accessibilityIdentifier: String {
        rawValue.lowercased()
    }

    func title(in language: AppLanguage) -> String {
        switch self {
        case .today:
            return language.text("Today", zhHans: "今天")
        case .sessions:
            return language.text("Sessions", zhHans: "会话")
        case .people:
            return language.text("People", zhHans: "人物")
        }
    }
}

struct AgentSessionTurn: Identifiable, Equatable {
    let id: UUID
    let objective: String
    let response: RelationshipAskResponse
    let createdAt: Date
    let requiresRefresh: Bool
}

struct AgentContactReceipt: Identifiable, Equatable {
    enum Outcome: String, Codable, Equatable {
        case createdPerson = "created_person"
        case matchedExisting = "matched_existing"
        case identityReview = "identity_review"
    }

    let id: UUID
    let operationKey: String
    let outcome: Outcome
    let captureID: String
    let resourceID: String
    let duplicateOfResourceID: String?
    let personID: String?
    let relationshipContextID: String?
    let resolutionCaseID: String?
    let personDisplayLabel: String
    let contextDisplayLabel: String?
    let createdAt: Date
    let requiresRefresh: Bool

    var compactPreview: String {
        compactPreview(in: .english)
    }

    func compactPreview(in language: AppLanguage) -> String {
        let reference = resourceID.suffix(8)
        let preview: String
        switch outcome {
        case .createdPerson:
            preview = String(
                format: language.text("Created contact · receipt %@"),
                locale: language.locale,
                String(reference)
            )
        case .matchedExisting:
            preview = String(
                format: language.text("Added to existing contact · receipt %@"),
                locale: language.locale,
                String(reference)
            )
        case .identityReview:
            let caseReference = resolutionCaseID.map { String($0.suffix(8)) }
                ?? String(reference)
            preview = String(
                format: language.text("Saved for identity review · case %@"),
                locale: language.locale,
                caseReference
            )
        }
        guard requiresRefresh else { return preview }
        return String(
            format: language.text("Saved receipt · %@"),
            locale: language.locale,
            preview
        )
    }

    func currentPerson(in snapshot: PursuitWorkspaceSnapshot) -> WorkspacePerson? {
        guard let personID else { return nil }
        return snapshot.people.first { $0.id == personID }
    }
}

enum AgentSessionScope: Equatable {
    case unresolvedIntent
    case relationship(
        personID: String,
        relationshipContextID: String,
        personDisplayLabel: String,
        contextDisplayLabel: String
    )
    case identityReview(
        resolutionCaseID: String,
        personDisplayLabel: String
    )

    var personID: String? {
        guard case let .relationship(personID, _, _, _) = self else { return nil }
        return personID
    }

    var relationshipContextID: String? {
        guard case let .relationship(_, relationshipContextID, _, _) = self else {
            return nil
        }
        return relationshipContextID
    }

    var resolutionCaseID: String? {
        guard case let .identityReview(resolutionCaseID, _) = self else { return nil }
        return resolutionCaseID
    }

    var personDisplayLabel: String {
        switch self {
        case .unresolvedIntent:
            return "New session"
        case let .relationship(_, _, personDisplayLabel, _),
             let .identityReview(_, personDisplayLabel):
            return personDisplayLabel
        }
    }

    var contextDisplayLabel: String {
        switch self {
        case .unresolvedIntent:
            return "Finding relationship"
        case let .relationship(_, _, _, contextDisplayLabel):
            return contextDisplayLabel
        case .identityReview:
            return "Identity review"
        }
    }

    func matches(personID: String, relationshipContextID: String) -> Bool {
        self.personID == personID
            && self.relationshipContextID == relationshipContextID
    }
}

struct AgentSessionSeed: Equatable {
    let personID: String
    let relationshipContextID: String
    let suggestedObjective: String

    static func reviewedCapture(
        personID: String,
        relationshipContextID: String
    ) -> AgentSessionSeed {
        AgentSessionSeed(
            personID: personID,
            relationshipContextID: relationshipContextID,
            suggestedObjective:
                "What changed in this relationship, and what is the smallest safe next step?"
        )
    }

    static func meetingPreparation(
        personID: String,
        relationshipContextID: String,
        suggestedObjective: String
    ) -> AgentSessionSeed {
        AgentSessionSeed(
            personID: personID,
            relationshipContextID: relationshipContextID,
            suggestedObjective: suggestedObjective
        )
    }
}

enum AgentPreferredPersonScopeResolution: Equatable {
    case unavailable
    case exact
    case requiresSelection
}

enum AgentPreferredPersonScopePolicy {
    static func resolve(matchingScopeCount: Int) -> AgentPreferredPersonScopeResolution {
        switch matchingScopeCount {
        case 0:
            return .unavailable
        case 1:
            return .exact
        default:
            return .requiresSelection
        }
    }

}

struct AgentRelationshipRecallCandidate: Equatable, Identifiable {
    let person: WorkspacePerson
    let context: WorkspacePerson.Context
    let matchScore: Int
    let matchedPersonName: Bool
    let matchedContextName: Bool
    let matchedRecentSession: Bool

    var id: String { "\(person.id):\(context.id)" }
}

enum AgentLocalWorkspaceIntent: Equatable {
    case peopleCount
}

enum AgentLocalWorkspacePolicy {
    static func intent(for objective: String) -> AgentLocalWorkspaceIntent? {
        let normalized = objective
            .folding(
                options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
                locale: Locale(identifier: "en_US_POSIX")
            )
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return nil }

        let countSignals = [
            "how many contacts", "contact count",
            "number of contacts", "多少个联系人", "多少联系人",
            "联系人数量", "有多少位联系人",
        ]
        return countSignals.contains(where: normalized.contains)
            ? .peopleCount
            : nil
    }
}

enum AgentRelationshipRecallPolicy {
    static func recentCandidatesForReview(
        people: [WorkspacePerson],
        recentSessions: [AgentSession]
    ) -> [AgentRelationshipRecallCandidate] {
        let sessionScopes = Set(
            recentSessions.prefix(12).compactMap { session -> String? in
                guard let personID = session.personID,
                      let contextID = session.relationshipContextID else {
                    return nil
                }
                return "\(personID):\(contextID)"
            }
        )
        return recentCandidates(
            people: people,
            sessionScopes: sessionScopes
        )
    }

    private static func recentCandidates(
        people: [WorkspacePerson],
        sessionScopes: Set<String>
    ) -> [AgentRelationshipRecallCandidate] {
        let flattened = people.flatMap { person in
            person.contexts.map { context in
                candidate(
                    person: person,
                    context: context,
                    score: sessionScopes.contains("\(person.id):\(context.id)")
                        ? 1
                        : 0,
                    personMatch: false,
                    contextMatch: false,
                    sessionMatch: sessionScopes.contains(
                        "\(person.id):\(context.id)"
                    )
                )
            }
        }
        return flattened.sorted { lhs, rhs in
            if lhs.matchedRecentSession != rhs.matchedRecentSession {
                return lhs.matchedRecentSession
            }
            if lhs.context.lastActivityAt != rhs.context.lastActivityAt {
                return lhs.context.lastActivityAt > rhs.context.lastActivityAt
            }
            return lhs.id < rhs.id
        }
    }

    private static func candidate(
        person: WorkspacePerson,
        context: WorkspacePerson.Context,
        score: Int,
        personMatch: Bool,
        contextMatch: Bool,
        sessionMatch: Bool
    ) -> AgentRelationshipRecallCandidate {
        AgentRelationshipRecallCandidate(
            person: person,
            context: context,
            matchScore: score,
            matchedPersonName: personMatch,
            matchedContextName: contextMatch,
            matchedRecentSession: sessionMatch
        )
    }

}

struct AgentSession: Identifiable, Equatable {
    let id: UUID
    var scope: AgentSessionScope
    var title: String
    var turns: [AgentSessionTurn]
    var contactReceipts: [AgentContactReceipt]
    var pendingObjective: String? = nil
    var pendingUnscopedChatIdempotencyKey: String? = nil
    var pendingPersonResearchIdempotencyKey: String? = nil
    var pendingPersonResearchRequestIdentity: String? = nil
    var updatedAt: Date
    var isUnread: Bool

    var personID: String? { scope.personID }
    var relationshipContextID: String? { scope.relationshipContextID }
    var personDisplayLabel: String { scope.personDisplayLabel }
    var contextDisplayLabel: String { scope.contextDisplayLabel }
    var resolutionCaseID: String? { scope.resolutionCaseID }

    var isIdentityReview: Bool {
        if case .identityReview = scope { return true }
        return false
    }

    var isUnresolvedIntent: Bool {
        if case .unresolvedIntent = scope { return true }
        return false
    }

    var hasPendingPersonResearch: Bool {
        pendingPersonResearchIdempotencyKey != nil
            && pendingPersonResearchRequestIdentity != nil
    }

    var hasPendingUnscopedChat: Bool {
        pendingUnscopedChatIdempotencyKey != nil
    }

    var retrievalAttention: AgentSessionRetrievalAttention? {
        if let pendingObjective,
           !pendingObjective.trimmingCharacters(
                in: .whitespacesAndNewlines
           ).isEmpty {
            return .waitingToContinue
        }

        let latestTurn = turns.max { $0.createdAt < $1.createdAt }
        let latestReceipt = contactReceipts.max { $0.createdAt < $1.createdAt }
        if let latestReceipt,
           latestTurn.map({ latestReceipt.createdAt >= $0.createdAt }) ?? true {
            if latestReceipt.requiresRefresh { return .refreshNeeded }
            if latestReceipt.outcome == .identityReview { return .needsJudgment }
            return nil
        }

        if let latestTurn {
            if latestTurn.requiresRefresh { return .refreshNeeded }
            if latestTurn.response.blocks.contains(where: \.requiresUserDecision) {
                return .needsJudgment
            }
        }

        return isIdentityReview ? .needsJudgment : nil
    }

    var latestPreview: String {
        let latestTurn = turns.max { $0.createdAt < $1.createdAt }
        let latestReceipt = contactReceipts.max { $0.createdAt < $1.createdAt }
        if let latestReceipt {
            if let latestTurn {
                if latestReceipt.createdAt >= latestTurn.createdAt {
                    return latestReceipt.compactPreview
                }
            } else {
                return latestReceipt.compactPreview
            }
        }
        guard let turn = latestTurn else {
            if let pendingObjective,
               !pendingObjective.trimmingCharacters(
                    in: .whitespacesAndNewlines
               ).isEmpty {
                return "Waiting to continue · \(pendingObjective)"
            }
            return isUnresolvedIntent
                ? "Finding the relevant relationship."
                : "No Agent response has been recorded in this session."
        }
        let preview = turn.response.blocks.first?.body
            ?? "No Agent response has been recorded in this session."
        return turn.requiresRefresh ? "Needs refresh · \(preview)" : preview
    }

    func displayTitle(in language: AppLanguage) -> String {
        guard let receipt = contactReceipts.max(by: {
            $0.createdAt < $1.createdAt
        }) else { return title }
        let key: String
        switch receipt.outcome {
        case .createdPerson:
            key = "Added %@"
        case .matchedExisting:
            key = "Updated %@"
        case .identityReview:
            key = "Review %@’s identity"
        }
        return String(
            format: language.text(key),
            locale: language.locale,
            receipt.personDisplayLabel
        )
    }

    func displayContextLabel(in language: AppLanguage) -> String {
        if isUnresolvedIntent {
            if turns.contains(where: { turn in
                turn.response.blocks.contains { $0.kind == "person_research" }
            }) {
                return language.text("Public profile research")
            }
            if turns.contains(where: {
                $0.response.contextManifestID == "none-unbound-conversation"
            }) {
                return language.text("Agent conversation")
            }
            return language.text("Finding relationship")
        }
        return isIdentityReview
            ? language.text("Identity review")
            : contextDisplayLabel
    }

    func latestPreview(in language: AppLanguage) -> String {
        let latestTurn = turns.max { $0.createdAt < $1.createdAt }
        let latestReceipt = contactReceipts.max { $0.createdAt < $1.createdAt }
        guard let latestReceipt else { return latestPreview }
        if let latestTurn, latestReceipt.createdAt < latestTurn.createdAt {
            return latestPreview
        }
        return latestReceipt.compactPreview(in: language)
    }

    func retrievalSubtitle(in language: AppLanguage) -> String {
        let latestTurn = turns.max { $0.createdAt < $1.createdAt }
        let latestReceipt = contactReceipts.max { $0.createdAt < $1.createdAt }
        if let latestReceipt,
           latestTurn.map({ latestReceipt.createdAt >= $0.createdAt }) ?? true {
            let result: String
            switch latestReceipt.outcome {
            case .createdPerson:
                result = language.text("Contact created")
            case .matchedExisting:
                result = language.text("Contact updated")
            case .identityReview:
                result = language.text("Identity needs review")
            }
            return latestReceipt.requiresRefresh
                ? "\(result) · \(language.text("Refresh needed"))"
                : result
        }

        if let pendingObjective,
           !pendingObjective.trimmingCharacters(
                in: .whitespacesAndNewlines
           ).isEmpty {
            return "\(personDisplayLabel) · \(language.text("Waiting to continue"))"
        }

        if latestTurn?.requiresRefresh == true {
            return "\(personDisplayLabel) · \(language.text("Refresh needed"))"
        }

        if isIdentityReview {
            return language.text("Identity needs review")
        }
        if isUnresolvedIntent {
            return language.text("No person linked")
        }
        return personDisplayLabel
    }
}

enum AgentSessionRetrievalAttention: Equatable {
    case needsJudgment
    case waitingToContinue
    case refreshNeeded
}

struct AgentSessionValidationTarget: Equatable {
    let taskID: String
    let personID: String
    let relationshipContextID: String
    let response: RelationshipAskResponse
}

struct AgentSessionDraft: Codable, Equatable {
    let personID: String
    let relationshipContextID: String
    var text: String
    var updatedAt: Date
    var pendingIdempotencyKey: String?
    var requestIdentity: String? = nil
}

private struct AgentGlobalDraft: Codable, Equatable {
    var text: String
    var updatedAt: Date
}

struct AgentEvidenceReviewOperation: Codable, Equatable, Identifiable {
    enum State: String, Codable, Equatable {
        case pending
        case outcomeUnknown = "outcome_unknown"
        case failed
        case superseded
        case applied
    }

    let idempotencyKey: String
    let taskID: String
    let fragmentID: String
    let resourceID: String
    let sourceName: String
    let personID: String
    let personDisplayName: String
    let relationshipContextID: String
    let relationshipContextDisplayName: String
    let expectedReviewStatus: String
    let authorityReviewID: String?
    let decision: String
    let reason: String
    var resultingReviewID: String?
    var canonicalDecidedAt: String?
    var state: State
    var statusMessage: String?
    var updatedAt: Date

    var id: String { idempotencyKey }
}

enum AgentEvidenceReviewIntent {
    static func idempotencyKey(
        fragmentID: String,
        expectedReviewStatus: String,
        authorityToken: String,
        decision: String,
        reason: String
    ) -> String {
        let material = [
            fragmentID,
            expectedReviewStatus,
            authorityToken,
            decision,
            reason.trimmingCharacters(in: .whitespacesAndNewlines),
        ].joined(separator: "|")
        let digest = SHA256.hash(data: Data(material.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return "ios:evidence-review:\(digest)"
    }
}

protocol AgentSessionPersisting {
    func load() throws -> Data?
    func save(_ data: Data) throws
    func deletionPending() throws -> Bool
    func beginDeletion() throws
    func completeDeletion() throws
}

final class FileAgentSessionPersistence: AgentSessionPersisting {
    private let fileURL: URL
    private let deletionTombstoneURL: URL
    private let migrationError: Error?

    init(accountID: String, rootURL: URL? = nil, legacyAccountID: String? = nil) {
        let digest = SHA256.hash(data: Data(accountID.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        let root = rootURL ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        fileURL = root
            .appending(path: "TalentSignal/AgentSessions", directoryHint: .isDirectory)
            .appending(path: "\(digest).json")
        deletionTombstoneURL = fileURL.appendingPathExtension("deletion-pending")
        do {
            try RuntimeLegacyBindings.migrateFile(legacyAccountID: legacyAccountID, scope: accountID,
                directory: fileURL.deletingLastPathComponent(), destination: fileURL)
            migrationError = nil
        } catch { migrationError = error }
    }

    func load() throws -> Data? {
        if let migrationError { throw migrationError }
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return nil
        }
        return try Data(contentsOf: fileURL)
    }

    func save(_ data: Data) throws {
        if let migrationError { throw migrationError }
        try writeProtected(data, to: fileURL)
    }

    func deletionPending() throws -> Bool {
        if let migrationError { throw migrationError }
        return FileManager.default.fileExists(atPath: deletionTombstoneURL.path)
    }

    func beginDeletion() throws {
        if let migrationError { throw migrationError }
        try writeProtected(Data("pending".utf8), to: deletionTombstoneURL)
    }

    func completeDeletion() throws {
        if let migrationError { throw migrationError }
        if FileManager.default.fileExists(atPath: fileURL.path) {
            try FileManager.default.removeItem(at: fileURL)
        }
        guard !FileManager.default.fileExists(atPath: fileURL.path) else {
            throw AgentSessionPersistenceError.deletionCouldNotBeVerified
        }
        if FileManager.default.fileExists(atPath: deletionTombstoneURL.path) {
            try FileManager.default.removeItem(at: deletionTombstoneURL)
        }
    }

    private func writeProtected(_ data: Data, to destination: URL) throws {
        let directory = destination.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var protectedDirectory = directory
        try protectedDirectory.setResourceValues(values)
        try data.write(
            to: destination,
            options: [.atomic, .completeFileProtectionUnlessOpen]
        )
    }
}

private struct PersistedAgentSessionEnvelope: Codable {
    let version: Int
    let sessions: [PersistedAgentSession]
    let drafts: [AgentSessionDraft]
    let globalDraft: AgentGlobalDraft?
    let evidenceReviews: [AgentEvidenceReviewOperation]?
    let contactProposal: AgentContactProposalDraft?
}

struct AgentContactProposalDraft: Codable, Equatable {
    let draft: ConversationContactDraft
    let idempotencyKey: String
    let capturedAt: Date?
    let pendingTarget: ConversationContactTarget?
    let pendingConfirmIdentityClue: Bool?
    let updatedAt: Date
}

private struct PersistedAgentSession: Codable {
    let id: UUID
    let scopeKind: String?
    let personID: String?
    let relationshipContextID: String?
    let identityResolutionCaseID: String?
    let personDisplayLabel: String
    let contextDisplayLabel: String
    let title: String
    let turns: [PersistedAgentSessionTurn]
    let contactReceipts: [PersistedAgentContactReceipt]?
    let pendingObjective: String?
    let pendingUnscopedChatIdempotencyKey: String?
    let pendingPersonResearchIdempotencyKey: String?
    let pendingPersonResearchRequestIdentity: String?
    let updatedAt: Date
    let isUnread: Bool

    init(_ value: AgentSession) {
        id = value.id
        scopeKind = value.isUnresolvedIntent
            ? "unresolved_intent"
            : value.isIdentityReview ? "identity_review" : "relationship"
        personID = value.personID
        relationshipContextID = value.relationshipContextID
        identityResolutionCaseID = value.resolutionCaseID
        personDisplayLabel = value.personDisplayLabel
        contextDisplayLabel = value.contextDisplayLabel
        title = value.title
        turns = value.turns.map(PersistedAgentSessionTurn.init)
        contactReceipts = value.contactReceipts.map(PersistedAgentContactReceipt.init)
        pendingObjective = value.pendingObjective
        pendingUnscopedChatIdempotencyKey = value.pendingUnscopedChatIdempotencyKey
        pendingPersonResearchIdempotencyKey = value.pendingPersonResearchIdempotencyKey
        pendingPersonResearchRequestIdentity = value.pendingPersonResearchRequestIdentity
        updatedAt = value.updatedAt
        isUnread = value.isUnread
    }

    func value() throws -> AgentSession {
        let scope: AgentSessionScope
        if scopeKind == "unresolved_intent" {
            scope = .unresolvedIntent
        } else if scopeKind == "identity_review" {
            guard let identityResolutionCaseID else {
                throw AgentSessionPersistenceError.invalidSessionScope
            }
            scope = .identityReview(
                resolutionCaseID: identityResolutionCaseID,
                personDisplayLabel: personDisplayLabel
            )
        } else {
            guard let personID, let relationshipContextID else {
                throw AgentSessionPersistenceError.invalidSessionScope
            }
            scope = .relationship(
                personID: personID,
                relationshipContextID: relationshipContextID,
                personDisplayLabel: personDisplayLabel,
                contextDisplayLabel: contextDisplayLabel
            )
        }
        return AgentSession(
            id: id,
            scope: scope,
            title: title,
            turns: turns.map(\.value),
            contactReceipts: (contactReceipts ?? []).map(\.value),
            pendingObjective: pendingObjective,
            pendingUnscopedChatIdempotencyKey: pendingUnscopedChatIdempotencyKey,
            pendingPersonResearchIdempotencyKey: pendingPersonResearchIdempotencyKey,
            pendingPersonResearchRequestIdentity: pendingPersonResearchRequestIdentity,
            updatedAt: updatedAt,
            isUnread: isUnread
        )
    }
}

private struct PersistedAgentContactReceipt: Codable {
    let id: UUID
    let operationKey: String
    let outcome: AgentContactReceipt.Outcome
    let captureID: String
    let resourceID: String
    let duplicateOfResourceID: String?
    let personID: String?
    let relationshipContextID: String?
    let resolutionCaseID: String?
    let personDisplayLabel: String
    let contextDisplayLabel: String?
    let createdAt: Date

    init(_ value: AgentContactReceipt) {
        id = value.id
        operationKey = value.operationKey
        outcome = value.outcome
        captureID = value.captureID
        resourceID = value.resourceID
        duplicateOfResourceID = value.duplicateOfResourceID
        personID = value.personID
        relationshipContextID = value.relationshipContextID
        resolutionCaseID = value.resolutionCaseID
        personDisplayLabel = value.personDisplayLabel
        contextDisplayLabel = value.contextDisplayLabel
        createdAt = value.createdAt
    }

    var value: AgentContactReceipt {
        AgentContactReceipt(
            id: id,
            operationKey: operationKey,
            outcome: outcome,
            captureID: captureID,
            resourceID: resourceID,
            duplicateOfResourceID: duplicateOfResourceID,
            personID: personID,
            relationshipContextID: relationshipContextID,
            resolutionCaseID: resolutionCaseID,
            personDisplayLabel: personDisplayLabel,
            contextDisplayLabel: contextDisplayLabel,
            createdAt: createdAt,
            requiresRefresh: true
        )
    }
}

private struct PersistedAgentSessionTurn: Codable {
    let id: UUID
    let objective: String
    let response: PersistedRelationshipAskResponse
    let createdAt: Date

    init(_ value: AgentSessionTurn) {
        id = value.id
        objective = value.objective
        response = PersistedRelationshipAskResponse(value.response)
        createdAt = value.createdAt
    }

    var value: AgentSessionTurn {
        AgentSessionTurn(
            id: id,
            objective: objective,
            response: response.value,
            createdAt: createdAt,
            requiresRefresh: true
        )
    }
}

private struct PersistedRelationshipAskResponse: Codable {
    let contractVersion: String
    let taskID: String
    let contextManifestID: String
    let knowledgeSnapshotID: String
    let disposition: String
    let unboundPersonResearchBlocks: [RelationshipAskResponse.Block]?
    let unboundConversationBlocks: [RelationshipAskResponse.Block]?
    let media: [ChatMediaAsset]?
    let createdAt: String
    let labFeatureReceipt: LabFeatureAdoptionReceipt?

    init(_ value: RelationshipAskResponse) {
        contractVersion = value.contractVersion
        taskID = value.taskID
        contextManifestID = value.contextManifestID
        knowledgeSnapshotID = value.knowledgeSnapshotID
        disposition = value.disposition
        unboundPersonResearchBlocks = value.contextManifestID
            == "none-unbound-person-research"
            ? value.blocks
            : nil
        unboundConversationBlocks = value.contextManifestID
            == "none-unbound-conversation"
            ? value.blocks
            : nil
        media = value.media
        createdAt = value.createdAt
        labFeatureReceipt = value.labFeatureReceipt
    }

    var value: RelationshipAskResponse {
        RelationshipAskResponse(
            contractVersion: contractVersion,
            taskID: taskID,
            contextManifestID: contextManifestID,
            knowledgeSnapshotID: knowledgeSnapshotID,
            disposition: disposition,
            blocks: unboundPersonResearchBlocks ?? unboundConversationBlocks ?? [
                .init(
                    id: "restored-\(taskID)",
                    kind: "continuity",
                    title: "Saved response needs refresh",
                    body: "Ask again to read current evidence.",
                    status: "needs_review",
                    citationDependencyIDs: [],
                    requiresUserDecision: false
                ),
            ],
            media: media ?? [],
            createdAt: createdAt,
            citations: [],
            labFeatureReceipt: labFeatureReceipt
        )
    }
}

@MainActor
final class AgentSessionStore: ObservableObject {
    private static let sessionRetention: TimeInterval = 30 * 24 * 60 * 60
    private static let draftRetention: TimeInterval = 7 * 24 * 60 * 60

    private static func stableContactCaptureDate(_ date: Date) -> Date {
        Date(timeIntervalSince1970: date.timeIntervalSince1970.rounded())
    }
    @Published private var storedSessions: [AgentSession]
    @Published private var storedEvidenceReviews: [AgentEvidenceReviewOperation]
    @Published private(set) var activeEvidenceReviewKeys: Set<String>
    @Published private(set) var transientSupersededEvidenceReviewKeys: Set<String>
    @Published private(set) var evidenceReviewAuthorityReadbackKeys: Set<String>
    @Published private(set) var persistenceNotice: String?
    private var drafts: [AgentSessionDraft]
    private var storedGlobalDraft: AgentGlobalDraft?
    private var storedContactProposal: AgentContactProposalDraft?
    private let persistence: AgentSessionPersisting?
    private let now: () -> Date
    private var expirationTask: Task<Void, Never>?

    init(
        sessions: [AgentSession] = [],
        persistence: AgentSessionPersisting? = nil,
        now: @escaping () -> Date = Date.init
    ) {
        self.persistence = persistence
        self.now = now
        expirationTask = nil
        persistenceNotice = nil
        drafts = []
        storedGlobalDraft = nil
        storedContactProposal = nil
        activeEvidenceReviewKeys = []
        transientSupersededEvidenceReviewKeys = []
        evidenceReviewAuthorityReadbackKeys = []
        storedEvidenceReviews = []
        storedSessions = sessions.sorted { $0.updatedAt > $1.updatedAt }
        defer { scheduleNextExpiration() }
        guard sessions.isEmpty, let persistence else { return }
        do {
            if try persistence.deletionPending() {
                do {
                    try persistence.completeDeletion()
                } catch {
                    persistenceNotice = "Saved Agent sessions are pending deletion and remain unavailable."
                }
                return
            }
            guard let data = try persistence.load() else { return }
            let envelope = try JSONDecoder.agentSession.decode(
                PersistedAgentSessionEnvelope.self,
                from: data
            )
            guard [1, 2, 3, 4, 5, 6, 7].contains(envelope.version) else {
                throw AgentSessionPersistenceError.unsupportedVersion
            }
            storedSessions = try envelope.sessions
                .map { try $0.value() }
                .sorted { $0.updatedAt > $1.updatedAt }
            drafts = envelope.drafts
            storedGlobalDraft = envelope.globalDraft
            storedContactProposal = envelope.contactProposal
            storedEvidenceReviews = envelope.evidenceReviews ?? []
            evidenceReviewAuthorityReadbackKeys = Set(
                storedEvidenceReviews.lazy
                    .filter {
                        [.pending, .outcomeUnknown, .failed].contains($0.state)
                    }
                    .map(\.idempotencyKey)
            )
            persist()
        } catch {
            storedSessions = []
            drafts = []
            storedGlobalDraft = nil
            storedContactProposal = nil
            storedEvidenceReviews = []
            evidenceReviewAuthorityReadbackKeys = []
            persistenceNotice = "Saved Agent sessions could not be restored on this device."
        }
    }

    var sessions: [AgentSession] {
        pruneExpired()
        return storedSessions
    }

    var unreadSessions: [AgentSession] {
        pruneExpired()
        return storedSessions.filter(\.isUnread)
    }

    func session(id: UUID?) -> AgentSession? {
        pruneExpired()
        guard let id else { return nil }
        return storedSessions.first { $0.id == id }
    }

    @discardableResult
    func beginUnscopedSession(
        objective: String,
        id: UUID = UUID(),
        createdAt: Date? = nil
    ) -> UUID? {
        _ = pruneExpiredState()
        let session = AgentSession(
            id: id,
            scope: .unresolvedIntent,
            title: Self.sessionTitle(from: objective),
            turns: [],
            contactReceipts: [],
            pendingObjective: objective,
            updatedAt: createdAt ?? now(),
            isUnread: false
        )
        let priorSessions = storedSessions
        storedSessions.append(session)
        sortSessions()
        guard persist() else {
            storedSessions = priorSessions
            scheduleNextExpiration()
            return nil
        }
        return session.id
    }

    func beginUnscopedPersonResearch(
        sessionID: UUID,
        objective: String,
        requestIdentity: String,
        proposedIdempotencyKey: String
    ) -> String? {
        _ = pruneExpiredState()
        guard let index = storedSessions.firstIndex(where: {
            $0.id == sessionID && $0.isUnresolvedIntent
        }) else { return nil }
        if storedSessions[index].pendingObjective == objective,
           storedSessions[index].pendingPersonResearchRequestIdentity == requestIdentity,
           let pending = storedSessions[index]
                .pendingPersonResearchIdempotencyKey {
            return pending
        }
        let prior = storedSessions[index]
        storedSessions[index].pendingObjective = objective
        storedSessions[index].pendingUnscopedChatIdempotencyKey = nil
        storedSessions[index].pendingPersonResearchIdempotencyKey = proposedIdempotencyKey
        storedSessions[index].pendingPersonResearchRequestIdentity = requestIdentity
        storedSessions[index].updatedAt = now()
        guard persist() else {
            storedSessions[index] = prior
            scheduleNextExpiration()
            return nil
        }
        return proposedIdempotencyKey
    }

    func beginUnscopedChat(
        sessionID: UUID,
        objective: String,
        proposedIdempotencyKey: String
    ) -> String? {
        _ = pruneExpiredState()
        guard let index = storedSessions.firstIndex(where: {
            $0.id == sessionID && $0.isUnresolvedIntent
        }) else { return nil }
        if storedSessions[index].pendingObjective == objective,
           let pending = storedSessions[index]
                .pendingUnscopedChatIdempotencyKey {
            return pending
        }
        let prior = storedSessions[index]
        storedSessions[index].pendingObjective = objective
        storedSessions[index].pendingUnscopedChatIdempotencyKey = proposedIdempotencyKey
        storedSessions[index].pendingPersonResearchIdempotencyKey = nil
        storedSessions[index].pendingPersonResearchRequestIdentity = nil
        storedSessions[index].updatedAt = now()
        guard persist() else {
            storedSessions[index] = prior
            scheduleNextExpiration()
            return nil
        }
        return proposedIdempotencyKey
    }

    @discardableResult
    func recordUnscopedPersonResearch(
        sessionID: UUID,
        objective: String,
        response: RelationshipAskResponse,
        createdAt: Date = Date()
    ) -> Bool {
        recordUnscopedResponse(
            sessionID: sessionID,
            objective: objective,
            response: response,
            createdAt: createdAt
        )
    }

    @discardableResult
    func recordUnscopedChat(
        sessionID: UUID,
        objective: String,
        response: RelationshipAskResponse,
        createdAt: Date = Date()
    ) -> Bool {
        recordUnscopedResponse(
            sessionID: sessionID,
            objective: objective,
            response: response,
            createdAt: createdAt
        )
    }

    private func recordUnscopedResponse(
        sessionID: UUID,
        objective: String,
        response: RelationshipAskResponse,
        createdAt: Date
    ) -> Bool {
        _ = pruneExpiredState()
        guard let index = storedSessions.firstIndex(where: {
            $0.id == sessionID && $0.isUnresolvedIntent
        }) else { return false }
        let prior = storedSessions[index]
        storedSessions[index].turns.append(
            AgentSessionTurn(
                id: UUID(),
                objective: objective,
                response: response,
                createdAt: createdAt,
                requiresRefresh: false
            )
        )
        storedSessions[index].pendingObjective = nil
        storedSessions[index].pendingUnscopedChatIdempotencyKey = nil
        storedSessions[index].pendingPersonResearchIdempotencyKey = nil
        storedSessions[index].pendingPersonResearchRequestIdentity = nil
        storedSessions[index].updatedAt = createdAt
        storedSessions[index].isUnread = false
        sortSessions()
        guard persist() else {
            if let rollbackIndex = storedSessions.firstIndex(where: {
                $0.id == sessionID
            }) {
                storedSessions[rollbackIndex] = prior
                sortSessions()
            }
            scheduleNextExpiration()
            return false
        }
        return true
    }

    @discardableResult
    func bindUnscopedSession(
        id: UUID,
        person: WorkspacePerson,
        context: WorkspacePerson.Context
    ) -> Bool {
        _ = pruneExpiredState()
        guard let index = storedSessions.firstIndex(where: { $0.id == id }),
              storedSessions[index].turns.allSatisfy({
                  $0.response.contextManifestID == "none-unbound-conversation"
              }),
              storedSessions[index].contactReceipts.isEmpty else {
            return false
        }
        let prior = storedSessions[index]
        storedSessions[index].scope = .relationship(
            personID: person.id,
            relationshipContextID: context.id,
            personDisplayLabel: person.displayLabel,
            contextDisplayLabel: context.displayLabel
        )
        storedSessions[index].pendingPersonResearchIdempotencyKey = nil
        storedSessions[index].pendingPersonResearchRequestIdentity = nil
        storedSessions[index].pendingUnscopedChatIdempotencyKey = nil
        storedSessions[index].updatedAt = now()
        guard persist() else {
            storedSessions[index] = prior
            scheduleNextExpiration()
            return false
        }
        return true
    }

    @discardableResult
    func record(
        sessionID: UUID?,
        objective: String,
        response: RelationshipAskResponse,
        person: WorkspacePerson,
        context: WorkspacePerson.Context,
        createdAt: Date = Date()
    ) -> UUID {
        _ = pruneExpiredState()
        let turn = AgentSessionTurn(
            id: UUID(),
            objective: objective,
            response: response,
            createdAt: createdAt,
            requiresRefresh: false
        )
        let existingIndex = sessionID.flatMap { proposedID in
            storedSessions.firstIndex {
                $0.id == proposedID
                    && ($0.isUnresolvedIntent
                        || $0.scope.matches(
                            personID: person.id,
                            relationshipContextID: context.id
                        ))
            }
        }
        let resolvedID = existingIndex.map { storedSessions[$0].id } ?? UUID()

        if let index = existingIndex {
            if storedSessions[index].isUnresolvedIntent {
                storedSessions[index].scope = .relationship(
                    personID: person.id,
                    relationshipContextID: context.id,
                    personDisplayLabel: person.displayLabel,
                    contextDisplayLabel: context.displayLabel
                )
            }
            storedSessions[index].pendingObjective = nil
            storedSessions[index].pendingUnscopedChatIdempotencyKey = nil
            storedSessions[index].pendingPersonResearchIdempotencyKey = nil
            storedSessions[index].pendingPersonResearchRequestIdentity = nil
            storedSessions[index].turns.append(turn)
            storedSessions[index].updatedAt = createdAt
            storedSessions[index].isUnread = false
        } else {
            storedSessions.append(
                AgentSession(
                    id: resolvedID,
                    scope: .relationship(
                        personID: person.id,
                        relationshipContextID: context.id,
                        personDisplayLabel: person.displayLabel,
                        contextDisplayLabel: context.displayLabel
                    ),
                    title: Self.sessionTitle(from: objective),
                    turns: [turn],
                    contactReceipts: [],
                    updatedAt: createdAt,
                    isUnread: false
                )
            )
        }
        sortSessions()
        persist()
        return resolvedID
    }

    @discardableResult
    func recordContactReceipt(
        operationKey: String,
        outcome: AgentContactReceipt.Outcome,
        result: ResourceCaptureResult,
        personDisplayLabel: String,
        contextDisplayLabel: String?,
        createdAt: Date? = nil
    ) -> UUID? {
        _ = pruneExpiredState()
        for session in storedSessions {
            guard let existing = session.contactReceipts.first(where: {
                $0.operationKey == operationKey
                    || $0.captureID == result.captureID
            }) else { continue }
            guard existing.operationKey == operationKey,
                  existing.outcome == outcome,
                  existing.captureID == result.captureID,
                  existing.resourceID == result.resource.id,
                  existing.personID == result.identity.personID,
                  existing.relationshipContextID
                    == result.identity.relationshipContextID,
                  existing.resolutionCaseID == result.identity.resolutionCaseID else {
                persistenceNotice = "The retried contact receipt did not match the protected canonical references."
                return nil
            }
            return session.id
        }

        let scope: AgentSessionScope
        switch outcome {
        case .createdPerson, .matchedExisting:
            guard let personID = result.identity.personID,
                  let relationshipContextID = result.identity.relationshipContextID,
                  result.identity.resolutionCaseID == nil,
                  let contextDisplayLabel else {
                persistenceNotice = "The canonical contact receipt did not include a usable relationship scope."
                return nil
            }
            scope = .relationship(
                personID: personID,
                relationshipContextID: relationshipContextID,
                personDisplayLabel: personDisplayLabel,
                contextDisplayLabel: contextDisplayLabel
            )
        case .identityReview:
            guard let resolutionCaseID = result.identity.resolutionCaseID,
                  result.identity.personID == nil,
                  result.identity.relationshipContextID == nil else {
                persistenceNotice = "The canonical contact receipt did not include an identity review case."
                return nil
            }
            scope = .identityReview(
                resolutionCaseID: resolutionCaseID,
                personDisplayLabel: personDisplayLabel
            )
        }

        let receiptDate = createdAt ?? now()
        let receipt = AgentContactReceipt(
            id: UUID(),
            operationKey: operationKey,
            outcome: outcome,
            captureID: result.captureID,
            resourceID: result.resource.id,
            duplicateOfResourceID: result.resource.duplicateOfResourceID,
            personID: result.identity.personID,
            relationshipContextID: result.identity.relationshipContextID,
            resolutionCaseID: result.identity.resolutionCaseID,
            personDisplayLabel: personDisplayLabel,
            contextDisplayLabel: contextDisplayLabel,
            createdAt: receiptDate,
            requiresRefresh: false
        )
        let session = AgentSession(
            id: UUID(),
            scope: scope,
            title: Self.contactSessionTitle(
                outcome: outcome,
                personDisplayLabel: personDisplayLabel
            ),
            turns: [],
            contactReceipts: [receipt],
            updatedAt: receiptDate,
            isUnread: false
        )
        let priorSessions = storedSessions
        storedSessions.append(session)
        sortSessions()
        guard persist() else {
            storedSessions = priorSessions
            scheduleNextExpiration()
            return nil
        }
        return session.id
    }

    func markRead(_ id: UUID) {
        _ = pruneExpiredState()
        guard let index = storedSessions.firstIndex(where: { $0.id == id }) else { return }
        storedSessions[index].isUnread = false
        persist()
    }

    func markUnread(_ id: UUID) {
        _ = pruneExpiredState()
        guard let index = storedSessions.firstIndex(where: { $0.id == id }) else { return }
        storedSessions[index].isUnread = true
        persist()
    }

    @discardableResult
    func delete(_ id: UUID) -> Bool {
        _ = pruneExpiredState()
        guard storedSessions.contains(where: { $0.id == id }) else {
            return true
        }
        let priorSessions = storedSessions
        storedSessions.removeAll { $0.id == id }
        guard persist() else {
            storedSessions = priorSessions
            scheduleNextExpiration()
            return false
        }
        return true
    }

    func draft(personID: String, relationshipContextID: String) -> String {
        pruneExpired()
        return drafts.first {
            $0.personID == personID
                && $0.relationshipContextID == relationshipContextID
        }?.text ?? ""
    }

    func saveDraft(
        _ text: String,
        personID: String,
        relationshipContextID: String
    ) {
        _ = pruneExpiredState()
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let existing = drafts.first {
            $0.personID == personID
                && $0.relationshipContextID == relationshipContextID
        }
        drafts.removeAll {
            $0.personID == personID
                && $0.relationshipContextID == relationshipContextID
        }
        if !trimmed.isEmpty {
            drafts.append(
                AgentSessionDraft(
                    personID: personID,
                    relationshipContextID: relationshipContextID,
                    text: text,
                    updatedAt: now(),
                    pendingIdempotencyKey: existing?.text == text
                        ? existing?.pendingIdempotencyKey
                        : nil,
                    requestIdentity: existing?.text == text
                        ? existing?.requestIdentity
                        : nil
                )
            )
        }
        persist()
    }

    func globalDraft() -> String {
        pruneExpired()
        return storedGlobalDraft?.text ?? ""
    }

    func saveGlobalDraft(_ text: String) {
        _ = pruneExpiredState()
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        storedGlobalDraft = trimmed.isEmpty
            ? nil
            : AgentGlobalDraft(text: text, updatedAt: now())
        persist()
    }

    @discardableResult
    func promoteGlobalDraft(
        _ text: String,
        personID: String,
        relationshipContextID: String
    ) -> Bool {
        _ = pruneExpiredState()
        let priorDrafts = drafts
        let priorGlobalDraft = storedGlobalDraft
        let existing = drafts.first {
            $0.personID == personID
                && $0.relationshipContextID == relationshipContextID
        }
        drafts.removeAll {
            $0.personID == personID
                && $0.relationshipContextID == relationshipContextID
        }
        if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            drafts.append(
                AgentSessionDraft(
                    personID: personID,
                    relationshipContextID: relationshipContextID,
                    text: text,
                    updatedAt: now(),
                    pendingIdempotencyKey: existing?.text == text
                        ? existing?.pendingIdempotencyKey
                        : nil,
                    requestIdentity: existing?.text == text
                        ? existing?.requestIdentity
                        : nil
                )
            )
        }
        storedGlobalDraft = nil
        guard persist() else {
            drafts = priorDrafts
            storedGlobalDraft = priorGlobalDraft
            scheduleNextExpiration()
            return false
        }
        return true
    }

    func beginAsk(
        _ text: String,
        personID: String,
        relationshipContextID: String,
        proposedIdempotencyKey: String,
        requestIdentity: String? = nil
    ) -> String {
        _ = pruneExpiredState()
        if let pending = drafts.first(where: {
            $0.personID == personID
                && $0.relationshipContextID == relationshipContextID
                && $0.text == text
                && $0.requestIdentity == requestIdentity
        })?.pendingIdempotencyKey {
            return pending
        }
        drafts.removeAll {
            $0.personID == personID
                && $0.relationshipContextID == relationshipContextID
        }
        drafts.append(
            AgentSessionDraft(
                personID: personID,
                relationshipContextID: relationshipContextID,
                text: text,
                updatedAt: now(),
                pendingIdempotencyKey: proposedIdempotencyKey,
                requestIdentity: requestIdentity
            )
        )
        persist()
        return proposedIdempotencyKey
    }

    func clearDraft(personID: String, relationshipContextID: String) {
        _ = pruneExpiredState()
        drafts.removeAll {
            $0.personID == personID
                && $0.relationshipContextID == relationshipContextID
        }
        persist()
    }

    var contactProposalDraft: ConversationContactDraft? {
        pruneExpired()
        return storedContactProposal?.draft
    }

    var contactProposalOperationKey: String? {
        pruneExpired()
        return storedContactProposal?.idempotencyKey
    }

    var contactProposalCapturedAt: Date? {
        pruneExpired()
        return storedContactProposal?.capturedAt
    }

    var contactProposalPendingTarget: ConversationContactTarget? {
        pruneExpired()
        return storedContactProposal?.pendingTarget
    }

    var contactProposalPendingConfirmIdentityClue: Bool? {
        pruneExpired()
        return storedContactProposal?.pendingConfirmIdentityClue
    }

    @discardableResult
    func saveContactProposal(
        _ draft: ConversationContactDraft,
        idempotencyKey: String,
        pendingTarget: ConversationContactTarget? = nil,
        pendingConfirmIdentityClue: Bool? = nil,
        clearingGlobalDraft: Bool = false
    ) -> Bool {
        _ = pruneExpiredState()
        let priorContactProposal = storedContactProposal
        let priorGlobalDraft = storedGlobalDraft
        let capturedAt = Self.stableContactCaptureDate(storedContactProposal.flatMap {
            $0.idempotencyKey == idempotencyKey ? $0.capturedAt : nil
        } ?? now())
        storedContactProposal = AgentContactProposalDraft(
            draft: draft,
            idempotencyKey: idempotencyKey,
            capturedAt: capturedAt,
            pendingTarget: pendingTarget,
            pendingConfirmIdentityClue: pendingConfirmIdentityClue,
            updatedAt: now()
        )
        if clearingGlobalDraft {
            storedGlobalDraft = nil
        }
        guard persist() else {
            storedContactProposal = priorContactProposal
            storedGlobalDraft = priorGlobalDraft
            scheduleNextExpiration()
            return false
        }
        return true
    }

    @discardableResult
    func promoteUnscopedChatToContactProposal(
        sessionID: UUID,
        objective: String,
        unscopedChatIdempotencyKey: String,
        draft: ConversationContactDraft,
        proposalIdempotencyKey: String,
        clearingGlobalDraft: Bool = false
    ) -> Bool {
        _ = pruneExpiredState()
        guard let index = storedSessions.firstIndex(where: {
            $0.id == sessionID && $0.isUnresolvedIntent
        }), storedSessions[index].pendingObjective == objective,
        storedSessions[index].pendingUnscopedChatIdempotencyKey
            == unscopedChatIdempotencyKey else {
            return false
        }

        let priorSessions = storedSessions
        let priorContactProposal = storedContactProposal
        let priorGlobalDraft = storedGlobalDraft
        let capturedAt = Self.stableContactCaptureDate(
            storedContactProposal.flatMap {
                $0.idempotencyKey == proposalIdempotencyKey
                    ? $0.capturedAt
                    : nil
            } ?? now()
        )
        storedContactProposal = AgentContactProposalDraft(
            draft: draft,
            idempotencyKey: proposalIdempotencyKey,
            capturedAt: capturedAt,
            pendingTarget: nil,
            pendingConfirmIdentityClue: nil,
            updatedAt: now()
        )
        if clearingGlobalDraft {
            storedGlobalDraft = nil
        }

        if storedSessions[index].turns.isEmpty,
           storedSessions[index].contactReceipts.isEmpty {
            storedSessions.remove(at: index)
        } else {
            storedSessions[index].pendingObjective = nil
            storedSessions[index].pendingUnscopedChatIdempotencyKey = nil
            storedSessions[index].pendingPersonResearchIdempotencyKey = nil
            storedSessions[index].pendingPersonResearchRequestIdentity = nil
            storedSessions[index].updatedAt = now()
            storedSessions[index].isUnread = false
            sortSessions()
        }

        guard persist() else {
            storedSessions = priorSessions
            storedContactProposal = priorContactProposal
            storedGlobalDraft = priorGlobalDraft
            scheduleNextExpiration()
            return false
        }
        return true
    }

    @discardableResult
    func clearContactProposal() -> Bool {
        _ = pruneExpiredState()
        let prior = storedContactProposal
        storedContactProposal = nil
        guard persist() else {
            storedContactProposal = prior
            scheduleNextExpiration()
            return false
        }
        return true
    }

    @discardableResult
    func beginEvidenceReview(
        idempotencyKey: String,
        taskID: String,
        citation: RelationshipAskResponse.Citation,
        personDisplayName: String,
        relationshipContextDisplayName: String,
        expectedReviewStatus: String,
        decision: String,
        reason: String
    ) throws -> AgentEvidenceReviewOperation {
        _ = pruneExpiredState()
        if let existing = storedEvidenceReviews.first(where: {
            $0.idempotencyKey == idempotencyKey
        }) {
            return existing
        }
        let operation = AgentEvidenceReviewOperation(
            idempotencyKey: idempotencyKey,
            taskID: taskID,
            fragmentID: citation.id,
            resourceID: citation.resourceID,
            sourceName: citation.sourceName,
            personID: citation.personID ?? "unavailable",
            personDisplayName: personDisplayName,
            relationshipContextID: citation.relationshipContextID ?? "unavailable",
            relationshipContextDisplayName: relationshipContextDisplayName,
            expectedReviewStatus: expectedReviewStatus,
            authorityReviewID: citation.lastReviewID,
            decision: decision,
            reason: reason,
            resultingReviewID: nil,
            canonicalDecidedAt: nil,
            state: .pending,
            statusMessage: nil,
            updatedAt: now()
        )
        storedEvidenceReviews.append(operation)
        guard persist() else {
            storedEvidenceReviews.removeAll {
                $0.idempotencyKey == idempotencyKey
            }
            scheduleNextExpiration()
            throw AgentSessionPersistenceError.evidenceReviewRecoveryUnavailable
        }
        return operation
    }

    @discardableResult
    func beginEvidenceReview(
        idempotencyKey: String,
        basedOn prior: AgentEvidenceReviewOperation,
        expectedReviewStatus: String,
        authorityReviewID: String,
        decision: String,
        reason: String
    ) throws -> AgentEvidenceReviewOperation {
        _ = pruneExpiredState()
        if let existing = storedEvidenceReviews.first(where: {
            $0.idempotencyKey == idempotencyKey
        }) {
            return existing
        }
        let operation = AgentEvidenceReviewOperation(
            idempotencyKey: idempotencyKey,
            taskID: prior.taskID,
            fragmentID: prior.fragmentID,
            resourceID: prior.resourceID,
            sourceName: prior.sourceName,
            personID: prior.personID,
            personDisplayName: prior.personDisplayName,
            relationshipContextID: prior.relationshipContextID,
            relationshipContextDisplayName: prior.relationshipContextDisplayName,
            expectedReviewStatus: expectedReviewStatus,
            authorityReviewID: authorityReviewID,
            decision: decision,
            reason: reason,
            resultingReviewID: nil,
            canonicalDecidedAt: nil,
            state: .pending,
            statusMessage: nil,
            updatedAt: now()
        )
        storedEvidenceReviews.append(operation)
        guard persist() else {
            storedEvidenceReviews.removeAll {
                $0.idempotencyKey == idempotencyKey
            }
            scheduleNextExpiration()
            throw AgentSessionPersistenceError.evidenceReviewRecoveryUnavailable
        }
        return operation
    }

    func markEvidenceReviewPending(_ idempotencyKey: String) throws {
        guard !isEvidenceReviewSuperseded(idempotencyKey) else {
            throw AgentSessionPersistenceError.evidenceReviewSuperseded
        }
        guard !evidenceReviewAuthorityReadbackKeys.contains(idempotencyKey) else {
            throw AgentSessionPersistenceError.evidenceReviewAuthorityReadbackRequired
        }
        guard updateEvidenceReview(idempotencyKey, update: {
            $0.state = .pending
            $0.statusMessage = nil
        }) else {
            throw AgentSessionPersistenceError.evidenceReviewRecoveryUnavailable
        }
    }

    @discardableResult
    func markEvidenceReviewApplied(
        _ idempotencyKey: String,
        result: PursuitEvidenceReviewResult
    ) -> Bool {
        updateEvidenceReview(idempotencyKey) {
            $0.state = .applied
            $0.statusMessage = nil
            $0.resultingReviewID = result.reviewID
            $0.canonicalDecidedAt = result.decidedAt
        }
    }

    @discardableResult
    func markEvidenceReviewUnknown(
        _ idempotencyKey: String,
        message: String
    ) -> Bool {
        updateEvidenceReview(idempotencyKey) {
            $0.state = .outcomeUnknown
            $0.statusMessage = message
        }
    }

    @discardableResult
    func markEvidenceReviewFailed(
        _ idempotencyKey: String,
        message: String
    ) -> Bool {
        updateEvidenceReview(idempotencyKey) {
            $0.state = .failed
            $0.statusMessage = message
        }
    }

    @discardableResult
    func markEvidenceReviewSuperseded(
        _ idempotencyKey: String,
        message: String
    ) -> Bool {
        guard storedEvidenceReviews.contains(where: {
            $0.idempotencyKey == idempotencyKey
        }) else { return false }
        let didPersist = updateEvidenceReview(
            idempotencyKey,
            allowSupersededMutation: true
        ) {
            $0.state = .superseded
            $0.statusMessage = message
        }
        if didPersist {
            transientSupersededEvidenceReviewKeys.remove(idempotencyKey)
        } else {
            transientSupersededEvidenceReviewKeys.insert(idempotencyKey)
        }
        evidenceReviewAuthorityReadbackKeys.remove(idempotencyKey)
        return didPersist
    }

    func isEvidenceReviewSuperseded(_ idempotencyKey: String) -> Bool {
        transientSupersededEvidenceReviewKeys.contains(idempotencyKey)
            || storedEvidenceReviews.contains {
                $0.idempotencyKey == idempotencyKey
                    && $0.state == .superseded
            }
    }

    func requiresEvidenceReviewAuthorityReadback(_ idempotencyKey: String) -> Bool {
        evidenceReviewAuthorityReadbackKeys.contains(idempotencyKey)
    }

    func revalidateEvidenceReviewAuthority(
        citations: [RelationshipAskResponse.Citation],
        supersededMessage: String
    ) {
        for idempotencyKey in Array(evidenceReviewAuthorityReadbackKeys) {
            guard let operation = storedEvidenceReviews.first(where: {
                $0.idempotencyKey == idempotencyKey
            }), let citation = citations.first(where: {
                $0.id == operation.fragmentID
            }) else {
                continue
            }
            if citation.availability == "available",
               citation.reviewStatus == operation.expectedReviewStatus,
               citation.lastReviewID == operation.authorityReviewID {
                evidenceReviewAuthorityReadbackKeys.remove(idempotencyKey)
            } else {
                _ = markEvidenceReviewSuperseded(
                    idempotencyKey,
                    message: supersededMessage
                )
            }
        }
    }

    @discardableResult
    func claimEvidenceReview(_ idempotencyKey: String) -> Bool {
        guard !activeEvidenceReviewKeys.contains(idempotencyKey),
              !isEvidenceReviewSuperseded(idempotencyKey),
              !evidenceReviewAuthorityReadbackKeys.contains(idempotencyKey) else {
            return false
        }
        activeEvidenceReviewKeys.insert(idempotencyKey)
        return true
    }

    func releaseEvidenceReview(_ idempotencyKey: String) {
        activeEvidenceReviewKeys.remove(idempotencyKey)
    }

    func latestEvidenceReviews(taskID: String) -> [AgentEvidenceReviewOperation] {
        let matching = evidenceReviewHistory(taskID: taskID)
        var seen = Set<String>()
        return matching.filter { operation in
            seen.insert(operation.fragmentID).inserted
        }
    }

    func evidenceReviewHistory(taskID: String) -> [AgentEvidenceReviewOperation] {
        pruneExpired()
        return storedEvidenceReviews.enumerated()
            .filter { $0.element.taskID == taskID }
            .sorted { lhs, rhs in
                lhs.element.updatedAt == rhs.element.updatedAt
                    ? lhs.offset > rhs.offset
                    : lhs.element.updatedAt > rhs.element.updatedAt
            }
            .map(\.element)
    }

    func markCitationStale(_ citationID: String) {
        _ = pruneExpiredState()
        var didChange = false
        storedSessions = storedSessions.map { session in
            var next = session
            next.turns = session.turns.map { turn in
                guard !turn.requiresRefresh,
                      turn.response.citations.contains(where: {
                          $0.id == citationID
                      }) else {
                    return turn
                }
                didChange = true
                return AgentSessionTurn(
                    id: turn.id,
                    objective: turn.objective,
                    response: turn.response,
                    createdAt: turn.createdAt,
                    requiresRefresh: true
                )
            }
            return next
        }
        if didChange { persist() }
    }

    func markTaskStale(_ taskID: String) {
        _ = pruneExpiredState()
        var didChange = false
        storedSessions = storedSessions.map { session in
            var next = session
            next.turns = session.turns.map { turn in
                guard !turn.requiresRefresh,
                      turn.response.taskID == taskID else {
                    return turn
                }
                didChange = true
                return AgentSessionTurn(
                    id: turn.id,
                    objective: turn.objective,
                    response: turn.response,
                    createdAt: turn.createdAt,
                    requiresRefresh: true
                )
            }
            return next
        }
        if didChange { persist() }
    }

    func validationTargets() -> [AgentSessionValidationTarget] {
        pruneExpired()
        return storedSessions.flatMap { session in
            session.turns.compactMap { turn in
                guard !turn.requiresRefresh,
                      !turn.response.citations.isEmpty,
                      let personID = session.personID,
                      let relationshipContextID = session.relationshipContextID else {
                    return nil
                }
                return AgentSessionValidationTarget(
                    taskID: turn.response.taskID,
                    personID: personID,
                    relationshipContextID: relationshipContextID,
                    response: turn.response
                )
            }
        }
    }

    func pruneExpired() {
        if pruneExpiredState() {
            persistCurrentState()
        }
        scheduleNextExpiration()
    }

    @discardableResult
    func deleteAll() -> Bool {
        guard let persistence else {
            expirationTask?.cancel()
            activeEvidenceReviewKeys = []
            transientSupersededEvidenceReviewKeys = []
            evidenceReviewAuthorityReadbackKeys = []
            storedSessions = []
            drafts = []
            storedGlobalDraft = nil
            storedContactProposal = nil
            storedEvidenceReviews = []
            persistenceNotice = nil
            return true
        }
        do {
            try persistence.beginDeletion()
        } catch {
            persistenceNotice = "Sign out paused because protected Agent history could not be scheduled for deletion."
            return false
        }
        expirationTask?.cancel()
        activeEvidenceReviewKeys = []
        transientSupersededEvidenceReviewKeys = []
        evidenceReviewAuthorityReadbackKeys = []
        storedSessions = []
        drafts = []
        storedGlobalDraft = nil
        storedContactProposal = nil
        storedEvidenceReviews = []
        do {
            try persistence.completeDeletion()
            persistenceNotice = nil
            return true
        } catch {
            persistenceNotice = "Sign out paused. Agent history remains unavailable while deletion is retried."
            return false
        }
    }

    private func sortSessions() {
        storedSessions.sort { $0.updatedAt > $1.updatedAt }
    }

    @discardableResult
    private func persist() -> Bool {
        _ = pruneExpiredState()
        let didPersist = persistCurrentState()
        scheduleNextExpiration()
        return didPersist
    }

    @discardableResult
    private func persistCurrentState() -> Bool {
        guard let persistence else { return true }
        do {
            let envelope = PersistedAgentSessionEnvelope(
                version: 7,
                sessions: storedSessions.map(PersistedAgentSession.init),
                drafts: drafts,
                globalDraft: storedGlobalDraft,
                evidenceReviews: storedEvidenceReviews,
                contactProposal: storedContactProposal
            )
            try persistence.save(try JSONEncoder.agentSession.encode(envelope))
            persistenceNotice = nil
            return true
        } catch {
            persistenceNotice = "Agent session changes are not saved on this device."
            return false
        }
    }

    private func pruneExpiredState() -> Bool {
        let sessionCutoff = now().addingTimeInterval(-Self.sessionRetention)
        let draftCutoff = now().addingTimeInterval(-Self.draftRetention)
        let retainedSessions = storedSessions.filter { $0.updatedAt > sessionCutoff }
        let retainedDrafts = drafts.filter { $0.updatedAt > draftCutoff }
        let retainedGlobalDraft = storedGlobalDraft.flatMap {
            $0.updatedAt > draftCutoff ? $0 : nil
        }
        let retainedEvidenceReviews = storedEvidenceReviews.filter {
            $0.updatedAt > sessionCutoff
        }
        let retainedContactProposal = storedContactProposal.flatMap {
            $0.updatedAt > draftCutoff ? $0 : nil
        }
        let didChange = retainedSessions.count != storedSessions.count
            || retainedDrafts.count != drafts.count
            || retainedGlobalDraft != storedGlobalDraft
            || retainedEvidenceReviews.count != storedEvidenceReviews.count
            || retainedContactProposal != storedContactProposal
        guard didChange else { return false }
        storedSessions = retainedSessions
        drafts = retainedDrafts
        storedGlobalDraft = retainedGlobalDraft
        storedContactProposal = retainedContactProposal
        storedEvidenceReviews = retainedEvidenceReviews
        let retainedReviewKeys = Set(
            retainedEvidenceReviews.map(\.idempotencyKey)
        )
        activeEvidenceReviewKeys.formIntersection(retainedReviewKeys)
        transientSupersededEvidenceReviewKeys.formIntersection(
            retainedReviewKeys
        )
        evidenceReviewAuthorityReadbackKeys.formIntersection(
            retainedReviewKeys
        )
        return true
    }

    private func scheduleNextExpiration() {
        expirationTask?.cancel()
        let sessionExpirations = storedSessions.map {
            $0.updatedAt.addingTimeInterval(Self.sessionRetention)
        }
        let draftExpirations = drafts.map {
            $0.updatedAt.addingTimeInterval(Self.draftRetention)
        }
        let globalDraftExpirations = storedGlobalDraft.map {
            [$0.updatedAt.addingTimeInterval(Self.draftRetention)]
        } ?? []
        let evidenceReviewExpirations = storedEvidenceReviews.map {
            $0.updatedAt.addingTimeInterval(Self.sessionRetention)
        }
        let contactProposalExpirations = storedContactProposal.map {
            [$0.updatedAt.addingTimeInterval(Self.draftRetention)]
        } ?? []
        guard let nextExpiration = (
            sessionExpirations + draftExpirations + globalDraftExpirations
                + evidenceReviewExpirations
                + contactProposalExpirations
        ).min() else {
            expirationTask = nil
            return
        }
        let delay = max(0, nextExpiration.timeIntervalSince(now()))
        let nanoseconds = UInt64(min(delay * 1_000_000_000, Double(UInt64.max)))
        expirationTask = Task { @MainActor [weak self] in
            do {
                try await Task.sleep(nanoseconds: nanoseconds)
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            self?.pruneExpired()
        }
    }

    private static func sessionTitle(from objective: String) -> String {
        let firstLine = objective
            .split(whereSeparator: \.isNewline)
            .first
            .map(String.init) ?? objective
        let bounded = String(firstLine.prefix(54)).trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        return bounded.count < firstLine.count ? "\(bounded)…" : bounded
    }

    private static func contactSessionTitle(
        outcome: AgentContactReceipt.Outcome,
        personDisplayLabel: String
    ) -> String {
        switch outcome {
        case .createdPerson:
            return "Added \(personDisplayLabel)"
        case .matchedExisting:
            return "Updated \(personDisplayLabel)"
        case .identityReview:
            return "Review \(personDisplayLabel)’s identity"
        }
    }

    @discardableResult
    private func updateEvidenceReview(
        _ idempotencyKey: String,
        allowSupersededMutation: Bool = false,
        update: (inout AgentEvidenceReviewOperation) -> Void
    ) -> Bool {
        _ = pruneExpiredState()
        guard let index = storedEvidenceReviews.firstIndex(where: {
            $0.idempotencyKey == idempotencyKey
        }) else { return false }
        let prior = storedEvidenceReviews[index]
        guard allowSupersededMutation
                || (prior.state != .superseded
                    && !transientSupersededEvidenceReviewKeys.contains(
                        idempotencyKey
                    )) else {
            return false
        }
        update(&storedEvidenceReviews[index])
        storedEvidenceReviews[index].updatedAt = now()
        guard persist() else {
            storedEvidenceReviews[index] = prior
            scheduleNextExpiration()
            return false
        }
        return true
    }
}

enum AgentSessionPersistenceError: LocalizedError, Equatable {
    case unsupportedVersion
    case invalidSessionScope
    case deletionCouldNotBeVerified
    case evidenceReviewRecoveryUnavailable
    case evidenceReviewSuperseded
    case evidenceReviewAuthorityReadbackRequired

    var errorDescription: String? {
        switch self {
        case .unsupportedVersion:
            "Saved Agent sessions use an unsupported version."
        case .invalidSessionScope:
            "Saved Agent session scope is incomplete."
        case .deletionCouldNotBeVerified:
            "Saved Agent sessions could not be deleted safely."
        case .evidenceReviewRecoveryUnavailable:
            "Source review was not attempted because protected recovery could not be saved. No canonical source change was sent."
        case .evidenceReviewSuperseded:
            "A newer source decision is current. This older operation cannot be retried."
        case .evidenceReviewAuthorityReadbackRequired:
            "Check current source authority before retrying this restored operation."
        }
    }
}

private extension JSONEncoder {
    static let agentSession: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}

private extension JSONDecoder {
    static let agentSession: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

extension AgentSessionStore {
    static func preview(
        snapshot: PursuitWorkspaceSnapshot,
        sessionCount: Int = 2
    ) -> AgentSessionStore {
        let people = snapshot.people
        guard let first = people.first,
              let firstContext = first.contexts.first else {
            return AgentSessionStore()
        }

        let response = RelationshipAskResponse(
            contractVersion: "preview",
            taskID: "preview-session-task",
            contextManifestID: "preview-session-manifest",
            knowledgeSnapshotID: "preview-session-snapshot",
            disposition: "proposal_only",
            blocks: [
                .init(
                    id: "preview-session-block",
                    kind: "brief",
                    title: "What changed",
                    body: "The location model is still unresolved. One cited Proposal needs recruiter review before it can change the Pursuit.",
                    status: "needs_review",
                    citationDependencyIDs: ["preview-evidence"],
                    requiresUserDecision: true
                ),
            ],
            createdAt: "2026-08-25T08:30:00.000Z",
            citations: [
                .init(
                    id: "preview-evidence",
                    dependencyType: "evidence_fragment",
                    personID: "preview",
                    relationshipContextID: "preview",
                    inclusionReason: "Exact preview fragment for this relationship question.",
                    authorizationScope: "person:preview:relationship-context:preview",
                    availability: "available",
                    unavailableReason: nil,
                    resourceID: "preview-resource",
                    sourceName: "WhatsApp screenshot",
                    observedAt: "2026-08-24T10:30:00.000Z",
                    sourceTimezone: "Asia/Singapore",
                    captureVersion: 1,
                    fragmentKind: "message",
                    sequence: 0,
                    exactExcerpt: "I could do Singapore, but not full-time relocation.",
                    attribution: .init(actorKind: "candidate", status: "confirmed"),
                    reviewStatus: "reviewed",
                    parser: .init(name: "preview", version: "1"),
                    contentHash: String(repeating: "0", count: 64),
                    fragmentCreatedAt: "2026-08-24T10:31:00.000Z",
                    lastReviewID: "preview-review",
                    lastReviewedAt: "2026-08-24T10:35:00.000Z",
                    lastReviewedBy: "Preview recruiter"
                ),
            ]
        )
        let now = Date(timeIntervalSince1970: 1_787_645_400)
        let primary = AgentSession(
            id: UUID(uuidString: "90000000-0000-4000-8000-000000000001")!,
            scope: .relationship(
                personID: first.id,
                relationshipContextID: firstContext.id,
                personDisplayLabel: first.displayLabel,
                contextDisplayLabel: firstContext.displayLabel
            ),
            title: "What changed with the location model?",
            turns: [
                AgentSessionTurn(
                    id: UUID(uuidString: "91000000-0000-4000-8000-000000000001")!,
                    objective: "What changed with the location model?",
                    response: response,
                    createdAt: now,
                    requiresRefresh: false
                ),
            ],
            contactReceipts: [],
            updatedAt: now,
            isUnread: false
        )

        guard people.count > 1,
              let secondContext = people[1].contexts.first else {
            return AgentSessionStore(sessions: [primary])
        }
        let secondary = AgentSession(
            id: UUID(uuidString: "90000000-0000-4000-8000-000000000002")!,
            scope: .relationship(
                personID: people[1].id,
                relationshipContextID: secondContext.id,
                personDisplayLabel: people[1].displayLabel,
                contextDisplayLabel: secondContext.displayLabel
            ),
            title: "Prepare the next conversation",
            turns: [],
            contactReceipts: [],
            updatedAt: now.addingTimeInterval(-7_200),
            isUnread: false
        )
        var sessions = [primary, secondary]
        if sessionCount > sessions.count {
            sessions.append(contentsOf: (sessions.count..<sessionCount).map { index in
                let sequence = index + 1
                return AgentSession(
                    id: UUID(
                        uuidString: String(
                            format: "90000000-0000-4000-8000-%012d",
                            sequence
                        )
                    )!,
                    scope: secondary.scope,
                    title: String(format: "Continuity session %02d", sequence),
                    turns: [],
                    contactReceipts: [],
                    updatedAt: now.addingTimeInterval(Double(-3_600 * sequence)),
                    isUnread: sequence.isMultiple(of: 3)
                )
            })
        }
        return AgentSessionStore(sessions: sessions)
    }
}

enum RelationshipAttentionState: String {
    case changed = "Changed"
    case needsReview = "Needs review"
    case waiting = "Waiting"
    case noAction = "No action"
    case identityReview = "Identity review"
}

struct RelationshipArchivePerson: Identifiable, Hashable {
    let id: String
    let name: String
    let initials: String
    let role: String
    let company: String
    let relationship: String
    let dependency: String
    let recency: String
    let state: RelationshipAttentionState
    let evidence: String
    let provenance: String
    let previousState: String
    let proposedState: String
    let nextStep: String
}

extension RelationshipArchivePerson {
    static let leila = RelationshipArchivePerson(
        id: "leila",
        name: "Leila Hartmann",
        initials: "LH",
        role: "VP Product",
        company: "Meridian Labs",
        relationship: "Chief Product Officer search",
        dependency: "Remote policy waits on the client.",
        recency: "2h",
        state: .changed,
        evidence: "I could do Singapore, but not full-time relocation.",
        provenance: "Leila / WhatsApp screenshot / Thu 22:18 / Recruiter reviewed",
        previousState: "Remote policy assumed flexible",
        proposedState: "Full-time relocation unresolved",
        nextStep: "Ask the client one exact remote-policy question."
    )

    static let nia = RelationshipArchivePerson(
        id: "nia",
        name: "Nia Williams",
        initials: "NW",
        role: "Independent board director",
        company: "Portfolio relationship",
        relationship: "Board search",
        dependency: "Two sources disagree on travel limits.",
        recency: "5h",
        state: .needsReview,
        evidence: "Monthly travel is workable, but I would not want a weekly international cadence.",
        provenance: "Nia / Call note / Today 08:40 / Conflicts with earlier email",
        previousState: "Quarterly travel",
        proposedState: "Current travel cadence unresolved",
        nextStep: "Ask Nia which travel cadence is current."
    )

    static let maya = RelationshipArchivePerson(
        id: "maya",
        name: "Maya Ortiz",
        initials: "MO",
        role: "Operating Partner",
        company: "Northlight Capital",
        relationship: "Fractional CFO search",
        dependency: "Founder meeting is ready to schedule.",
        recency: "1d",
        state: .waiting,
        evidence: "I can meet the founder next Tuesday if we settle the timezone.",
        provenance: "Maya / Recruiter note / Yesterday 17:20 / Draft context",
        previousState: "Meeting not scheduled",
        proposedState: "Tuesday offered; timezone unresolved",
        nextStep: "Confirm one timezone before scheduling."
    )

    static let amir = RelationshipArchivePerson(
        id: "amir",
        name: "Amir Okafor",
        initials: "AO",
        role: "VP Engineering",
        company: "Rubicon Health",
        relationship: "CTO succession",
        dependency: "Stay quiet until the board responds.",
        recency: "4d",
        state: .noAction,
        evidence: "The board will come back after its succession session.",
        provenance: "Amir / Recruiter note / Monday 09:10 / Recruiter reviewed",
        previousState: "Follow-up timing unknown",
        proposedState: "No action until board response",
        nextStep: "No action. Return when the board responds."
    )

    static let wei = RelationshipArchivePerson(
        id: "wei",
        name: "张伟 / Wei Zhang-Sørensen",
        initials: "伟",
        role: "Chief People Officer",
        company: "Independent",
        relationship: "Leadership network",
        dependency: "Identity evidence is not sufficient.",
        recency: "2w",
        state: .identityReview,
        evidence: "This source contains a handle previously associated with another person.",
        provenance: "Imported screenshot / Historical clue / Identity unresolved",
        previousState: "No current owner selected",
        proposedState: "Preserve for identity review",
        nextStep: "Compare current and historical evidence without preselection."
    )

    static let samples: [RelationshipArchivePerson] = [
        .leila,
        .nia,
        .maya,
        .amir,
        .wei,
    ]
}

enum RelationshipArchiveSheet: Identifiable {
    case review(RelationshipArchivePerson)
    case resume(RelationshipArchivePerson)
    case detail(RelationshipArchivePerson)
    case pursuit(WorkspacePursuit)
    case workspacePerson(WorkspacePerson, [WorkspacePersonRole])
    case proposal(WorkspaceProposal)
    case agentStudio
    case menu

    var id: String {
        switch self {
        case let .review(person):
            return "review-\(person.id)"
        case let .resume(person):
            return "resume-\(person.id)"
        case let .detail(person):
            return "detail-\(person.id)"
        case let .pursuit(pursuit):
            return "pursuit-\(pursuit.id)"
        case let .workspacePerson(person, _):
            return "workspace-person-\(person.id)"
        case let .proposal(proposal):
            return "proposal-\(proposal.id)"
        case .agentStudio:
            return "agent-studio"
        case .menu:
            return "menu"
        }
    }
}

struct WorkspacePersonRole: Equatable, Identifiable {
    let pursuitID: String
    let pursuitTitle: String
    let roleID: String
    let roleType: String
    let status: String
    let confidence: String
    let evidenceCount: Int
    let evidenceState: WorkspaceEvidenceState

    var id: String { "\(pursuitID)-\(roleID)" }
}

struct WorkspacePersonRetrievalMetadata: Equatable {
    let headline: String?
    let roleType: String?
    let pursuitTitle: String?
    let lastActivityAt: Date?
}

enum WorkspacePeopleScope: Equatable, Identifiable {
    case all
    case pursuit(id: String, title: String)
    case unassigned

    var id: String {
        switch self {
        case .all: return "all"
        case let .pursuit(id, _): return "pursuit-\(id)"
        case .unassigned: return "unassigned"
        }
    }

    func displayLabel(in language: AppLanguage) -> String {
        switch self {
        case .all: return language.text("All people")
        case let .pursuit(_, title): return title
        case .unassigned: return language.text("Not in a Pursuit")
        }
    }
}

enum WorkspacePeopleRetrievalPolicy {
    static func filteredPeople(
        in snapshot: PursuitWorkspaceSnapshot,
        query: String,
        scope: WorkspacePeopleScope
    ) -> [WorkspacePerson] {
        let normalizedQuery = normalize(
            query.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        let assignedPersonIDs = Set(
            snapshot.pursuits.flatMap { pursuit in
                pursuit.personRoles.map(\.subjectRef.id)
            }
        )

        return snapshot.people.filter { person in
            let isInScope: Bool
            switch scope {
            case .all:
                isInScope = true
            case let .pursuit(id, _):
                isInScope = snapshot.pursuit(id: id)?.personRoles.contains {
                    $0.subjectRef.id == person.id
                } == true
            case .unassigned:
                isInScope = !assignedPersonIDs.contains(person.id)
            }
            guard isInScope else { return false }
            guard !normalizedQuery.isEmpty else { return true }

            let roleSearchValues = snapshot.pursuits.flatMap { pursuit in
                pursuit.personRoles
                    .filter { $0.subjectRef.id == person.id }
                    .flatMap {
                        [
                            pursuit.title,
                            $0.roleType.replacingOccurrences(of: "_", with: " "),
                        ]
                    }
            }
            let searchableValues = [
                person.displayLabel,
                person.profile?.headline,
            ].compactMap { $0 }
                + person.contexts.map(\.displayLabel)
                + roleSearchValues
            return searchableValues.contains {
                normalize($0).contains(normalizedQuery)
            }
        }
    }

    static func metadata(
        for person: WorkspacePerson,
        in snapshot: PursuitWorkspaceSnapshot,
        scope: WorkspacePeopleScope
    ) -> WorkspacePersonRetrievalMetadata {
        let matches: [(pursuit: WorkspacePursuit, role: WorkspaceRole)] =
            snapshot.pursuits.flatMap { pursuit in
                pursuit.personRoles
                    .filter { $0.subjectRef.id == person.id }
                    .map { (pursuit, $0) }
            }
        let scopedMatches: [(pursuit: WorkspacePursuit, role: WorkspaceRole)]
        switch scope {
        case let .pursuit(id, _):
            scopedMatches = matches.filter { $0.pursuit.id == id }
        case .all, .unassigned:
            scopedMatches = matches
        }
        let selectedMatch = scopedMatches.first(where: {
            $0.role.status == "active"
        }) ?? scopedMatches.first
        let headline = person.profile?.headline.trimmingCharacters(
            in: .whitespacesAndNewlines
        )

        return WorkspacePersonRetrievalMetadata(
            headline: headline?.isEmpty == false ? headline : nil,
            roleType: selectedMatch?.role.roleType,
            pursuitTitle: selectedMatch?.pursuit.title,
            lastActivityAt: parseDate(person.lastActivityAt)
        )
    }

    static func hasUnassignedPeople(in snapshot: PursuitWorkspaceSnapshot) -> Bool {
        let assignedPersonIDs = Set(
            snapshot.pursuits.flatMap { pursuit in
                pursuit.personRoles.map(\.subjectRef.id)
            }
        )
        return snapshot.people.contains { !assignedPersonIDs.contains($0.id) }
    }

    private static func normalize(_ value: String) -> String {
        value.folding(
            options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
            locale: Locale(identifier: "en_US_POSIX")
        )
    }

    private static let fractionalDateParser: ISO8601DateFormatter = {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional
    }()

    private static let standardDateParser: ISO8601DateFormatter = {
        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard
    }()

    private static func parseDate(_ value: String) -> Date? {
        fractionalDateParser.date(from: value) ?? standardDateParser.date(from: value)
    }
}
