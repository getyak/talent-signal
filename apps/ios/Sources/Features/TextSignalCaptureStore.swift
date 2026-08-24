import Foundation

@MainActor
final class TextSignalCaptureStore: ObservableObject {
    enum Phase: Equatable {
        case loadingScopes
        case editing
        case savedLocal
        case queued
        case uploading
        case synced(TextSignalSyncReceipt)
        case stagedForReview(TextSignalSyncReceipt)
        case failed(String)
        case deleting
        case deleted(TextSignalDeletionReceipt?)
    }

    @Published var text: String
    @Published var purpose: String
    @Published var speaker: TextSignalSpeaker?
    @Published var selectedScopeID: String?
    @Published var proposedMilestone: String
    @Published var proposalReason: String
    @Published private(set) var scopes: [TextSignalScope] = []
    @Published private(set) var phase: Phase = .loadingScopes
    @Published private(set) var workspaceVerification: TextSignalWorkspaceVerification?

    let recordID: UUID

    private let outbox: TextSignalOutboxPersisting
    private let service: TextSignalSyncServing
    private let createdAt: Date
    private var record: TextSignalOutboxRecord?
    private var pendingInitialRecord: TextSignalOutboxRecord?
    private var activeWorkspaceID: String?
    private var task: Task<Void, Never>?

    init(
        recordID: UUID = UUID(),
        initialRecord: TextSignalOutboxRecord? = nil,
        outbox: TextSignalOutboxPersisting = TextSignalOutbox.shared,
        service: TextSignalSyncServing
    ) {
        self.recordID = initialRecord?.id ?? recordID
        self.outbox = outbox
        self.service = service
        pendingInitialRecord = initialRecord
        createdAt = initialRecord?.createdAt ?? Date()
        text = ""
        purpose = "Preserve recruiter-reviewed conversation evidence for this Pursuit"
        speaker = nil
        selectedScopeID = nil
        proposedMilestone = ""
        proposalReason = ""
    }

    deinit { task?.cancel() }

    var selectedScope: TextSignalScope? {
        scopes.first { $0.id == selectedScopeID }
            ?? record?.scope.flatMap { scope in
                scope.workspaceID == activeWorkspaceID ? scope : nil
            }
    }

    func selectProposedMilestone(_ value: String) {
        guard isDraftEditable else { return }
        proposedMilestone = value
        guard let choice = TextSignalMilestoneChoice(rawValue: value) else {
            proposalReason = ""
            return
        }
        proposalReason = "The recruiter selected \(choice.label.lowercased()) after reviewing the exact candidate-attributed Signal. Canonical state still requires item review."
    }

    var canSaveLocally: Bool {
        isDraftEditable && draftRecord(state: .savedLocal).canSaveLocally
    }

    var isDraftEditable: Bool {
        guard !isBusy, (record?.attemptCount ?? 0) == 0 else { return false }
        if case .deleted = phase { return false }
        return true
    }

    var offersInitialSync: Bool {
        guard (record?.attemptCount ?? 0) == 0 else { return false }
        switch phase {
        case .editing, .savedLocal, .queued:
            return true
        default:
            return false
        }
    }

    var isDeleted: Bool {
        if case .deleted = phase { return true }
        return false
    }

    var syncBlockingMessage: String? {
        guard activeWorkspaceID != nil else {
            return "Open a verified workspace before saving or syncing this Signal."
        }
        let draft = draftRecord(state: .queued)
        guard draft.canSaveLocally else {
            return "Enter the exact text and keep a purpose before syncing."
        }
        guard draft.scope != nil else {
            return "Choose the canonical Pursuit and Person role."
        }
        guard let speaker = draft.speaker else {
            return "Choose who authored the text, or explicitly keep attribution unresolved."
        }
        if draft.stagesProposal {
            guard speaker == .candidate else {
                return "A milestone Proposal can cite only explicitly candidate-attributed text in this slice."
            }
            guard draft.proposedMilestone.trimmingCharacters(in: .whitespacesAndNewlines)
                != draft.scope?.currentMilestone else {
                return "The proposed milestone must differ from current canonical state."
            }
            guard !draft.proposalReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return "Explain exactly why this evidence may support the proposed milestone."
            }
        } else if !draft.proposalReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Clear the Proposal reason when no milestone is proposed."
        }
        return nil
    }

    var canSync: Bool {
        syncBlockingMessage == nil && !isBusy
    }

    var canDelete: Bool {
        guard !isBusy else { return false }
        guard !isDeleted else { return false }
        if record?.captureID != nil { return true }
        return (record?.attemptCount ?? 0) == 0
    }

    var deletionBlockingMessage: String? {
        guard !isDeleted else { return nil }
        guard !canDelete, !isBusy else { return nil }
        return "A sync attempt may have reached the server. Retry with the same Signal ID to reconcile before deletion."
    }

    var isBusy: Bool {
        phase == .uploading || phase == .deleting || phase == .loadingScopes
    }

    func load() {
        task?.cancel()
        let existingPhase = phase
        if existingPhase == .editing { phase = .loadingScopes }
        task = Task { [weak self] in
            guard let self else { return }
            var restoredFromDisk = false
            do {
                let catalog = try await service.loadScopes()
                try Task.checkCancellation()
                guard !catalog.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      catalog.scopes.allSatisfy({ $0.workspaceID == catalog.workspaceID }) else {
                    throw TextSignalSyncError.workspaceReadbackMismatch
                }
                activeWorkspaceID = catalog.workspaceID
                scopes = catalog.scopes
                workspaceVerification = catalog.verification

                if let initial = pendingInitialRecord {
                    guard initial.workspaceID == catalog.workspaceID,
                          initial.scope?.workspaceID == nil
                            || initial.scope?.workspaceID == catalog.workspaceID else {
                        throw TextSignalSyncError.workspaceReadbackMismatch
                    }
                    apply(initial)
                    pendingInitialRecord = nil
                    restoredFromDisk = true
                } else if record == nil,
                          let restored = try await outbox.record(
                              id: recordID,
                              workspaceID: catalog.workspaceID
                          ) {
                    apply(restored)
                    restoredFromDisk = true
                }
                if var interrupted = record, interrupted.state == .uploading {
                    interrupted.state = .queued
                    interrupted.lastError = "Upload was interrupted. Retry reuses the same idempotency key."
                    interrupted.updatedAt = Date()
                    try await outbox.save(interrupted)
                    record = interrupted
                    phase = .queued
                }
                if selectedScopeID == nil, catalog.scopes.count == 1 {
                    selectedScopeID = catalog.scopes[0].id
                }
                if (existingPhase == .loadingScopes || existingPhase == .editing)
                    && !restoredFromDisk {
                    phase = .editing
                }
            } catch is CancellationError {
                return
            } catch {
                scopes = []
                activeWorkspaceID = nil
                workspaceVerification = nil
                phase = .failed(
                    "Workspace verification failed. No saved Signal payload was opened: \(error.localizedDescription)"
                )
            }
        }
    }

    func saveLocally() {
        guard canSaveLocally, !isBusy else { return }
        task?.cancel()
        task = Task { [weak self] in
            guard let self else { return }
            do {
                var saved = draftRecord(state: .savedLocal)
                saved.lastError = nil
                try await outbox.save(saved)
                record = saved
                phase = .savedLocal
            } catch {
                phase = .failed("The Signal could not be saved locally: \(error.localizedDescription)")
            }
        }
    }

    func queueAndSync() {
        guard canSync else { return }
        task?.cancel()
        task = Task { [weak self] in
            guard let self else { return }
            var queued = draftRecord(state: .queued)
            do {
                try await outbox.save(queued)
                record = queued
                phase = .queued

                queued.state = .uploading
                queued.attemptCount += 1
                queued.updatedAt = Date()
                try await outbox.save(queued)
                record = queued
                phase = .uploading

                let receipt = try await service.sync(queued)
                try Task.checkCancellation()
                queued.captureID = receipt.captureID
                queued.resourceID = receipt.resourceID
                queued.evidenceFragmentID = receipt.evidenceFragmentID
                queued.proposalID = receipt.proposalID
                queued.state = receipt.proposalID == nil ? .synced : .stagedForReview
                queued.lastError = nil
                queued.updatedAt = Date()
                try await outbox.save(queued)
                record = queued
                phase = receipt.proposalID == nil
                    ? .synced(receipt)
                    : .stagedForReview(receipt)
            } catch is CancellationError {
                return
            } catch {
                queued.state = .failed
                queued.lastError = error.localizedDescription
                queued.updatedAt = Date()
                try? await outbox.save(queued)
                record = queued
                phase = .failed(error.localizedDescription)
            }
        }
    }

    func retry() {
        switch phase {
        case .failed, .queued:
            break
        default:
            return
        }
        queueAndSync()
    }

    func delete() {
        guard canDelete else { return }
        task?.cancel()
        task = Task { [weak self] in
            guard let self else { return }
            phase = .deleting
            do {
                var deletionReceipt: TextSignalDeletionReceipt?
                if let captureID = record?.captureID {
                    var deleting = record ?? draftRecord(state: .deleting)
                    deleting.state = .deleting
                    deleting.updatedAt = Date()
                    try await outbox.save(deleting)
                    record = deleting
                    deletionReceipt = try await service.deleteCapture(
                        id: captureID,
                        recordID: recordID
                    )
                    guard deletionReceipt?.status == "deleted",
                          deletionReceipt?.captureID == captureID else {
                        throw TextSignalSyncError.invalidResponse
                    }
                }
                guard let workspaceID = record?.workspaceID ?? activeWorkspaceID else {
                    throw TextSignalSyncError.workspaceReadbackMismatch
                }
                try await outbox.remove(id: recordID, workspaceID: workspaceID)
                record = nil
                text = ""
                purpose = ""
                speaker = nil
                selectedScopeID = nil
                proposedMilestone = ""
                proposalReason = ""
                phase = .deleted(deletionReceipt)
            } catch {
                if var retained = record {
                    retained.state = .failed
                    retained.lastError = "Deletion did not complete: \(error.localizedDescription)"
                    retained.updatedAt = Date()
                    try? await outbox.save(retained)
                    record = retained
                }
                phase = .failed("Deletion did not complete: \(error.localizedDescription)")
            }
        }
    }

    private func draftRecord(state: TextSignalOutboxState) -> TextSignalOutboxRecord {
        TextSignalOutboxRecord(
            id: recordID,
            workspaceID: activeWorkspaceID ?? record?.workspaceID ?? "unbound",
            text: String(text.prefix(40_000)),
            purpose: String(purpose.prefix(240)),
            speaker: speaker,
            scope: selectedScope,
            proposedMilestone: String(proposedMilestone.prefix(120)),
            proposalReason: String(proposalReason.prefix(1_000)),
            createdAt: createdAt,
            updatedAt: Date(),
            state: state,
            attemptCount: record?.attemptCount ?? 0,
            captureID: record?.captureID,
            resourceID: record?.resourceID,
            evidenceFragmentID: record?.evidenceFragmentID,
            proposalID: record?.proposalID,
            lastError: record?.lastError
        )
    }

    private func apply(_ restored: TextSignalOutboxRecord) {
        record = restored
        text = restored.text
        purpose = restored.purpose
        speaker = restored.speaker
        selectedScopeID = restored.scope?.id
        proposedMilestone = restored.proposedMilestone
        proposalReason = restored.proposalReason
        switch restored.state {
        case .savedLocal: phase = .savedLocal
        case .queued, .uploading: phase = .queued
        case .synced:
            phase = Self.receipt(from: restored).map(Phase.synced)
                ?? .failed("Saved canonical identifiers are incomplete. Retry canonical readback.")
        case .stagedForReview:
            phase = Self.receipt(from: restored).map(Phase.stagedForReview)
                ?? .failed("Saved Proposal identifiers are incomplete. Retry canonical readback.")
        case .failed:
            phase = .failed(restored.lastError ?? "Sync stopped before canonical readback.")
        case .deleting:
            phase = .failed("Deletion was interrupted. Retry deletion before removing local text.")
        }
    }

    private static func receipt(from record: TextSignalOutboxRecord) -> TextSignalSyncReceipt? {
        guard let captureID = record.captureID,
              let resourceID = record.resourceID,
              let evidenceFragmentID = record.evidenceFragmentID else {
            return nil
        }
        return TextSignalSyncReceipt(
            workspaceID: record.workspaceID,
            pursuitID: record.scope?.pursuitID ?? "",
            roleID: record.scope?.roleID ?? "",
            personID: record.scope?.personID ?? "",
            relationshipContextID: record.scope?.relationshipContextID,
            captureID: captureID,
            resourceID: resourceID,
            evidenceFragmentID: evidenceFragmentID,
            proposalID: record.proposalID
        )
    }
}
