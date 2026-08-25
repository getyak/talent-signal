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

struct AgentSession: Identifiable, Equatable {
    let id: UUID
    let personID: String
    let relationshipContextID: String
    let personDisplayLabel: String
    let contextDisplayLabel: String
    var title: String
    var turns: [AgentSessionTurn]
    var updatedAt: Date
    var isUnread: Bool

    var latestPreview: String {
        guard let turn = turns.last else {
            return "No Agent response has been recorded in this session."
        }
        let preview = turn.response.blocks.first?.body
            ?? "No Agent response has been recorded in this session."
        return turn.requiresRefresh ? "Needs refresh · \(preview)" : preview
    }
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

    init(accountID: String, rootURL: URL? = nil) {
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
    }

    func load() throws -> Data? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return nil
        }
        return try Data(contentsOf: fileURL)
    }

    func save(_ data: Data) throws {
        try writeProtected(data, to: fileURL)
    }

    func deletionPending() throws -> Bool {
        FileManager.default.fileExists(atPath: deletionTombstoneURL.path)
    }

    func beginDeletion() throws {
        try writeProtected(Data("pending".utf8), to: deletionTombstoneURL)
    }

    func completeDeletion() throws {
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
    let evidenceReviews: [AgentEvidenceReviewOperation]?
}

private struct PersistedAgentSession: Codable {
    let id: UUID
    let personID: String
    let relationshipContextID: String
    let personDisplayLabel: String
    let contextDisplayLabel: String
    let title: String
    let turns: [PersistedAgentSessionTurn]
    let updatedAt: Date
    let isUnread: Bool

    init(_ value: AgentSession) {
        id = value.id
        personID = value.personID
        relationshipContextID = value.relationshipContextID
        personDisplayLabel = value.personDisplayLabel
        contextDisplayLabel = value.contextDisplayLabel
        title = value.title
        turns = value.turns.map(PersistedAgentSessionTurn.init)
        updatedAt = value.updatedAt
        isUnread = value.isUnread
    }

    var value: AgentSession {
        AgentSession(
            id: id,
            personID: personID,
            relationshipContextID: relationshipContextID,
            personDisplayLabel: personDisplayLabel,
            contextDisplayLabel: contextDisplayLabel,
            title: title,
            turns: turns.map(\.value),
            updatedAt: updatedAt,
            isUnread: isUnread
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
    let createdAt: String

    init(_ value: RelationshipAskResponse) {
        contractVersion = value.contractVersion
        taskID = value.taskID
        contextManifestID = value.contextManifestID
        knowledgeSnapshotID = value.knowledgeSnapshotID
        disposition = value.disposition
        createdAt = value.createdAt
    }

    var value: RelationshipAskResponse {
        RelationshipAskResponse(
            contractVersion: contractVersion,
            taskID: taskID,
            contextManifestID: contextManifestID,
            knowledgeSnapshotID: knowledgeSnapshotID,
            disposition: disposition,
            blocks: [
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
            createdAt: createdAt,
            citations: []
        )
    }
}

@MainActor
final class AgentSessionStore: ObservableObject {
    private static let sessionRetention: TimeInterval = 30 * 24 * 60 * 60
    private static let draftRetention: TimeInterval = 7 * 24 * 60 * 60
    @Published private var storedSessions: [AgentSession]
    @Published private var storedEvidenceReviews: [AgentEvidenceReviewOperation]
    @Published private(set) var activeEvidenceReviewKeys: Set<String>
    @Published private(set) var transientSupersededEvidenceReviewKeys: Set<String>
    @Published private(set) var evidenceReviewAuthorityReadbackKeys: Set<String>
    @Published private(set) var persistenceNotice: String?
    private var drafts: [AgentSessionDraft]
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
            guard [1, 2].contains(envelope.version) else {
                throw AgentSessionPersistenceError.unsupportedVersion
            }
            storedSessions = envelope.sessions
                .map(\.value)
                .sorted { $0.updatedAt > $1.updatedAt }
            drafts = envelope.drafts
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
        let resolvedID = sessionID ?? UUID()

        if let index = storedSessions.firstIndex(where: { $0.id == resolvedID }) {
            storedSessions[index].turns.append(turn)
            storedSessions[index].updatedAt = createdAt
            storedSessions[index].isUnread = false
        } else {
            storedSessions.append(
                AgentSession(
                    id: resolvedID,
                    personID: person.id,
                    relationshipContextID: context.id,
                    personDisplayLabel: person.displayLabel,
                    contextDisplayLabel: context.displayLabel,
                    title: Self.sessionTitle(from: objective),
                    turns: [turn],
                    updatedAt: createdAt,
                    isUnread: false
                )
            )
        }
        sortSessions()
        persist()
        return resolvedID
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

    func delete(_ id: UUID) {
        _ = pruneExpiredState()
        storedSessions.removeAll { $0.id == id }
        persist()
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
                        : nil
                )
            )
        }
        persist()
    }

    func beginAsk(
        _ text: String,
        personID: String,
        relationshipContextID: String,
        proposedIdempotencyKey: String
    ) -> String {
        _ = pruneExpiredState()
        if let pending = drafts.first(where: {
            $0.personID == personID
                && $0.relationshipContextID == relationshipContextID
                && $0.text == text
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
                pendingIdempotencyKey: proposedIdempotencyKey
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
                      !turn.response.citations.isEmpty else {
                    return nil
                }
                return AgentSessionValidationTarget(
                    taskID: turn.response.taskID,
                    personID: session.personID,
                    relationshipContextID: session.relationshipContextID,
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
                version: 2,
                sessions: storedSessions.map(PersistedAgentSession.init),
                drafts: drafts,
                evidenceReviews: storedEvidenceReviews
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
        let retainedEvidenceReviews = storedEvidenceReviews.filter {
            $0.updatedAt > sessionCutoff
        }
        let didChange = retainedSessions.count != storedSessions.count
            || retainedDrafts.count != drafts.count
            || retainedEvidenceReviews.count != storedEvidenceReviews.count
        guard didChange else { return false }
        storedSessions = retainedSessions
        drafts = retainedDrafts
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
        let evidenceReviewExpirations = storedEvidenceReviews.map {
            $0.updatedAt.addingTimeInterval(Self.sessionRetention)
        }
        guard let nextExpiration = (
            sessionExpirations + draftExpirations + evidenceReviewExpirations
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
    case deletionCouldNotBeVerified
    case evidenceReviewRecoveryUnavailable
    case evidenceReviewSuperseded
    case evidenceReviewAuthorityReadbackRequired

    var errorDescription: String? {
        switch self {
        case .unsupportedVersion:
            "Saved Agent sessions use an unsupported version."
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
    static func preview(snapshot: PursuitWorkspaceSnapshot) -> AgentSessionStore {
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
            personID: first.id,
            relationshipContextID: firstContext.id,
            personDisplayLabel: first.displayLabel,
            contextDisplayLabel: firstContext.displayLabel,
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
            updatedAt: now,
            isUnread: false
        )

        guard people.count > 1,
              let secondContext = people[1].contexts.first else {
            return AgentSessionStore(sessions: [primary])
        }
        let secondary = AgentSession(
            id: UUID(uuidString: "90000000-0000-4000-8000-000000000002")!,
            personID: people[1].id,
            relationshipContextID: secondContext.id,
            personDisplayLabel: people[1].displayLabel,
            contextDisplayLabel: secondContext.displayLabel,
            title: "Prepare the next conversation",
            turns: [],
            updatedAt: now.addingTimeInterval(-7_200),
            isUnread: false
        )
        return AgentSessionStore(sessions: [primary, secondary])
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
