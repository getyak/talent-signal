import Foundation

struct PersistedPursuitActionCompletion: Codable, Equatable {
    let workspaceID: String
    let pursuitID: String
    let actionID: String
    var expectedPursuitRevision: Int
    var expectedActionRevision: Int
    var outcomeSummary: String
    var operationID: UUID?
    var receipt: PursuitReviewReceipt?
    var updatedAt: Date
}

protocol PursuitActionCompletionPersisting: AnyObject {
    func entry(for actionID: String) -> PersistedPursuitActionCompletion?
    func save(_ entry: PersistedPursuitActionCompletion)
    func remove(actionID: String)
}

final class UserDefaultsPursuitActionCompletionStore: PursuitActionCompletionPersisting {
    private let defaults: UserDefaults
    private let key = "talent-signal.pursuit-action-completions.v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if ProcessInfo.processInfo.arguments.contains(
            "--reset-pursuit-action-completions"
        ) {
            defaults.removeObject(forKey: key)
        }
    }

    func entry(for actionID: String) -> PersistedPursuitActionCompletion? {
        entries[actionID]
    }

    func save(_ entry: PersistedPursuitActionCompletion) {
        var next = entries
        next[entry.actionID] = entry
        if let data = try? JSONEncoder().encode(next) {
            defaults.set(data, forKey: key)
        }
    }

    func remove(actionID: String) {
        var next = entries
        next.removeValue(forKey: actionID)
        if next.isEmpty {
            defaults.removeObject(forKey: key)
        } else if let data = try? JSONEncoder().encode(next) {
            defaults.set(data, forKey: key)
        }
    }

    private var entries: [String: PersistedPursuitActionCompletion] {
        guard let data = defaults.data(forKey: key),
              let value = try? JSONDecoder().decode(
                [String: PersistedPursuitActionCompletion].self,
                from: data
              ) else {
            return [:]
        }
        return value
    }
}

@MainActor
final class PursuitWorkspaceStore: ObservableObject {
    enum Phase: Equatable {
        case preview(PursuitWorkspaceSnapshot)
        case loading
        case loaded(PursuitWorkspaceSnapshot)
        case empty(PursuitWorkspaceSnapshot)
        case failed(String)
    }

    enum ActionCompletionPhase: Equatable {
        case idle
        case editing
        case confirming(operationID: UUID)
        case unknownLocked(operationID: UUID)
        case recorded(PursuitActionCompletionResult)
        case conflict(String)
        case failed(String)
    }

    @Published private(set) var phase: Phase
    @Published private(set) var lastCanonicalRevisionByPursuit: [String: Int] = [:]
    @Published private(set) var refreshNotice: String?
    @Published private(set) var isReadInFlight = false
    @Published private(set) var completedReadCount = 0
    @Published private(set) var actionCompletionPhases: [String: ActionCompletionPhase] = [:]
    @Published private(set) var actionOutcomeDrafts: [String: String] = [:]

    let isCanonical: Bool
    private let service: PursuitWorkspaceServing?
    private let actionCompletions: PursuitActionCompletionPersisting
    private let operationIDFactory: () -> UUID

    init(
        service: PursuitWorkspaceServing?,
        actionCompletions: PursuitActionCompletionPersisting = UserDefaultsPursuitActionCompletionStore(),
        operationIDFactory: @escaping () -> UUID = UUID.init
    ) {
        self.service = service
        self.actionCompletions = actionCompletions
        self.operationIDFactory = operationIDFactory
        isCanonical = service != nil
        phase = service == nil ? .preview(.preview) : .loading
    }

    func load() async {
        guard let service else { return }
        guard !isReadInFlight else { return }
        isReadInFlight = true
        defer {
            isReadInFlight = false
            completedReadCount += 1
        }
        let currentSnapshot = snapshot
        let isRetryingFailure: Bool
        if case .failed = phase {
            isRetryingFailure = true
        } else {
            isRetryingFailure = false
        }
        if currentSnapshot == nil && !isRetryingFailure {
            refreshNotice = nil
            phase = .loading
        }
        do {
            let snapshot = try await service.loadWorkspace()
            refreshNotice = nil
            let nextRevisions = Dictionary(
                uniqueKeysWithValues: snapshot.pursuits.map { ($0.id, $0.revision) }
            )
            if !lastCanonicalRevisionByPursuit.isEmpty {
                let removedCount = lastCanonicalRevisionByPursuit.keys.filter {
                    nextRevisions[$0] == nil
                }.count
                let changedCount = lastCanonicalRevisionByPursuit.filter { current in
                    nextRevisions[current.key].map { nextRevision in
                        nextRevision != current.value
                    } ?? false
                }.count
                if removedCount > 0 {
                    refreshNotice = removedCount == 1
                        ? "A Pursuit was removed from the canonical workspace. This view is current."
                        : "\(removedCount) Pursuits were removed from the canonical workspace. This view is current."
                } else if changedCount > 0 {
                    refreshNotice = changedCount == 1
                        ? "A Pursuit changed in the canonical workspace. This view was refreshed."
                        : "\(changedCount) Pursuits changed in the canonical workspace. This view was refreshed."
                }
            }
            lastCanonicalRevisionByPursuit = nextRevisions
            phase = snapshot.pursuits.isEmpty && snapshot.people.isEmpty
                ? .empty(snapshot)
                : .loaded(snapshot)
        } catch {
            let message = (error as? LocalizedError)?.errorDescription
                ?? "The canonical workspace could not be loaded."
            if let currentSnapshot {
                refreshNotice = "Refresh failed. Showing the last canonical read; retry to confirm it is current. \(message)"
                phase = currentSnapshot.pursuits.isEmpty && currentSnapshot.people.isEmpty
                    ? .empty(currentSnapshot)
                    : .loaded(currentSnapshot)
            } else {
                phase = .failed(message)
            }
        }
    }

    func ask(
        objective: String,
        personID: String,
        relationshipContextID: String,
        idempotencyKey: String
    ) async throws -> RelationshipAskResponse {
        guard let service else {
            throw PursuitWorkspaceClientError.askUnavailable
        }
        return try await service.ask(
            objective: objective,
            personID: personID,
            relationshipContextID: relationshipContextID,
            idempotencyKey: idempotencyKey
        )
    }

    func revalidateAsk(
        response: RelationshipAskResponse,
        personID: String,
        relationshipContextID: String
    ) async throws {
        guard let service else {
            throw PursuitWorkspaceClientError.askUnavailable
        }
        try await service.revalidateAsk(
            response: response,
            personID: personID,
            relationshipContextID: relationshipContextID
        )
    }

    func rejectEvidence(
        fragmentID: String,
        expectedReviewStatus: String,
        reason: String,
        idempotencyKey: String
    ) async throws {
        guard let service else {
            throw PursuitWorkspaceClientError.askUnavailable
        }
        try await service.rejectEvidence(
            fragmentID: fragmentID,
            expectedReviewStatus: expectedReviewStatus,
            reason: reason,
            idempotencyKey: idempotencyKey
        )
        await load()
    }

    func prepareActionCompletion(
        pursuit: WorkspacePursuit,
        action: WorkspaceAction
    ) async {
        guard let entry = actionCompletions.entry(for: action.id),
              entry.workspaceID == pursuit.workspaceID,
              entry.pursuitID == pursuit.id else {
            actionOutcomeDrafts[action.id] = ""
            actionCompletionPhases[action.id] = .editing
            return
        }
        actionOutcomeDrafts[action.id] = entry.outcomeSummary
        if let receipt = entry.receipt {
            let result = PursuitActionCompletionResult(
                pursuit: pursuit,
                receipt: receipt
            )
            if trustedCompletion(
                result,
                entry: entry,
                currentUserID: snapshot?.currentUserID
            ) {
                actionCompletionPhases[action.id] = .recorded(result)
            } else if let operationID = entry.operationID {
                actionCompletionPhases[action.id] = .unknownLocked(
                    operationID: operationID
                )
                await reconcileActionCompletion(actionID: action.id)
            }
        } else if let operationID = entry.operationID {
            actionCompletionPhases[action.id] = .unknownLocked(operationID: operationID)
            await reconcileActionCompletion(actionID: action.id)
        } else {
            actionCompletionPhases[action.id] = .editing
        }
    }

    func updateActionOutcomeDraft(
        pursuit: WorkspacePursuit,
        action: WorkspaceAction,
        value: String
    ) {
        guard !isActionCompletionLocked(actionID: action.id) else { return }
        let bounded = String(value.prefix(1_000))
        actionOutcomeDrafts[action.id] = bounded
        actionCompletions.save(
            PersistedPursuitActionCompletion(
                workspaceID: pursuit.workspaceID,
                pursuitID: pursuit.id,
                actionID: action.id,
                expectedPursuitRevision: pursuit.revision,
                expectedActionRevision: action.revision,
                outcomeSummary: bounded,
                operationID: nil,
                receipt: nil,
                updatedAt: Date()
            )
        )
        actionCompletionPhases[action.id] = .editing
    }

    func cancelActionCompletion(actionID: String) {
        guard !isActionCompletionLocked(actionID: actionID) else { return }
        actionCompletions.remove(actionID: actionID)
        actionOutcomeDrafts.removeValue(forKey: actionID)
        actionCompletionPhases[actionID] = .idle
    }

    func submitActionCompletion(
        pursuit: WorkspacePursuit,
        action: WorkspaceAction
    ) async {
        guard let service else {
            actionCompletionPhases[action.id] = .failed(
                PursuitWorkspaceClientError.actionCompletionUnavailable.localizedDescription
            )
            return
        }
        let outcome = (actionOutcomeDrafts[action.id] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !outcome.isEmpty, !isActionCompletionLocked(actionID: action.id) else {
            return
        }
        let operationID = operationIDFactory()
        var entry = PersistedPursuitActionCompletion(
            workspaceID: pursuit.workspaceID,
            pursuitID: pursuit.id,
            actionID: action.id,
            expectedPursuitRevision: pursuit.revision,
            expectedActionRevision: action.revision,
            outcomeSummary: outcome,
            operationID: operationID,
            receipt: nil,
            updatedAt: Date()
        )
        actionCompletions.save(entry)
        actionCompletionPhases[action.id] = .confirming(operationID: operationID)
        do {
            let result = try await service.completeAction(
                pursuitID: pursuit.id,
                actionID: action.id,
                expectedPursuitRevision: pursuit.revision,
                expectedActionRevision: action.revision,
                outcomeSummary: outcome,
                operationID: operationID
            )
            guard trustedCompletion(
                result,
                entry: entry,
                currentUserID: snapshot?.currentUserID
            ) else {
                actionCompletionPhases[action.id] = .unknownLocked(
                    operationID: operationID
                )
                return
            }
            entry.receipt = result.receipt
            entry.updatedAt = Date()
            actionCompletions.save(entry)
            actionOutcomeDrafts[action.id] = outcome
            actionCompletionPhases[action.id] = .recorded(result)
            await load()
        } catch let error as PursuitWorkspaceClientError {
            if case let .backend(code, message) = error {
                entry.operationID = nil
                entry.updatedAt = Date()
                actionCompletions.save(entry)
                actionCompletionPhases[action.id] = .conflict("\(message) (\(code))")
            } else {
                actionCompletionPhases[action.id] = .unknownLocked(
                    operationID: operationID
                )
            }
        } catch {
            actionCompletionPhases[action.id] = .unknownLocked(operationID: operationID)
        }
    }

    func reconcileActionCompletion(actionID: String) async {
        guard let service,
              var entry = actionCompletions.entry(for: actionID),
              let operationID = entry.operationID else { return }
        actionCompletionPhases[actionID] = .unknownLocked(operationID: operationID)
        do {
            let readback = try await service.readOperation(id: operationID)
            if readback.operation.status == "applied",
               let receipt = readback.receipt,
               trustedReconciliation(readback, entry: entry, receipt: receipt) {
                entry.receipt = receipt
                entry.updatedAt = Date()
                actionCompletions.save(entry)
                actionOutcomeDrafts[actionID] = entry.outcomeSummary
                actionCompletionPhases[actionID] = .recorded(
                    PursuitActionCompletionResult(
                        pursuit: readback.pursuit,
                        receipt: receipt
                    )
                )
                await load()
            } else if readback.operation.status == "conflict" {
                entry.operationID = nil
                entry.updatedAt = Date()
                actionCompletions.save(entry)
                actionCompletionPhases[actionID] = .conflict(
                    "Canonical state changed before this outcome could be recorded. Review the current action."
                )
                await load()
            } else if readback.operation.status == "failed" {
                entry.operationID = nil
                entry.updatedAt = Date()
                actionCompletions.save(entry)
                actionCompletionPhases[actionID] = .failed(
                    "Canonical readback proves that this outcome was not recorded. The draft remains available."
                )
                await load()
            }
        } catch let error as PursuitWorkspaceClientError {
            if case let .backend(code, _) = error, code == "OPERATION_NOT_FOUND" {
                entry.operationID = nil
                entry.updatedAt = Date()
                actionCompletions.save(entry)
                actionCompletionPhases[actionID] = .editing
                refreshNotice = "Canonical readback found no action operation. The saved draft is safe to submit again."
                await load()
            } else {
                actionCompletionPhases[actionID] = .unknownLocked(
                    operationID: operationID
                )
            }
        } catch {
            actionCompletionPhases[actionID] = .unknownLocked(operationID: operationID)
        }
    }

    func actionCompletionPhase(actionID: String) -> ActionCompletionPhase {
        actionCompletionPhases[actionID] ?? .idle
    }

    func hasSavedActionCompletion(actionID: String) -> Bool {
        actionCompletions.entry(for: actionID) != nil
    }

    private func isActionCompletionLocked(actionID: String) -> Bool {
        switch actionCompletionPhase(actionID: actionID) {
        case .confirming, .unknownLocked, .recorded:
            return true
        case .idle, .editing, .conflict, .failed:
            return false
        }
    }

    private func trustedCompletion(
        _ result: PursuitActionCompletionResult,
        entry: PersistedPursuitActionCompletion,
        currentUserID: String?
    ) -> Bool {
        guard let operationID = entry.operationID?.uuidString.lowercased(),
              let action = result.pursuit.actions.first(where: {
                $0.id == entry.actionID
              }) else { return false }
        return result.pursuit.id == entry.pursuitID
            && result.pursuit.workspaceID == entry.workspaceID
            && result.receipt.workspaceID == entry.workspaceID
            && result.receipt.operationID == operationID
            && result.receipt.operationKind == "revise_pursuit"
            && result.receipt.status == "applied"
            && result.receipt.proposalID == nil
            && result.receipt.actorUserID == currentUserID
            && result.receipt.outcome == "canonical_applied"
            && result.receipt.entityRef.beforeRevision == entry.expectedPursuitRevision
            && result.receipt.entityRef.afterRevision == entry.expectedPursuitRevision + 1
            && result.receipt.entityRef.afterRevision == result.pursuit.revision
            && Set(result.receipt.changedFields) == Set([
                "actions.\(entry.actionID).status",
                "actions.\(entry.actionID).outcome_summary",
            ])
            && result.receipt.externalEffects.isEmpty
            && action.ownerUserID == currentUserID
            && action.status == "completed"
            && action.revision == entry.expectedActionRevision + 1
            && action.outcomeSummary == entry.outcomeSummary
            && action.externalEffects.isEmpty
    }

    private func trustedReconciliation(
        _ readback: PursuitActionOperationReadback,
        entry: PersistedPursuitActionCompletion,
        receipt: PursuitReviewReceipt
    ) -> Bool {
        guard let operationID = entry.operationID?.uuidString.lowercased(),
              let action = readback.pursuit.actions.first(where: {
                $0.id == entry.actionID
              }) else { return false }
        let result = PursuitActionCompletionResult(
            pursuit: readback.pursuit,
            receipt: receipt
        )
        return readback.operation.id == operationID
            && readback.operation.pursuitID == entry.pursuitID
            && readback.operation.proposalID == nil
            && readback.operation.operationKind == "revise_pursuit"
            && readback.operation.status == "applied"
            && readback.operation.beforeRevision == entry.expectedPursuitRevision
            && readback.operation.afterRevision == receipt.entityRef.afterRevision
            && action.ownerUserID == receipt.actorUserID
            && trustedCompletion(
                result,
                entry: entry,
                currentUserID: receipt.actorUserID
            )
    }

    var snapshot: PursuitWorkspaceSnapshot? {
        switch phase {
        case let .preview(snapshot), let .loaded(snapshot), let .empty(snapshot):
            return snapshot
        case .loading, .failed:
            return nil
        }
    }
}
