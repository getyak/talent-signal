import Foundation

protocol StandaloneAccountClient {
    func localAccount(displayName: String, isDemo: Bool) -> StandaloneAccount
}

struct LocalStandaloneAccountClient: StandaloneAccountClient {
    func localAccount(displayName: String, isDemo: Bool) -> StandaloneAccount {
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        return StandaloneAccount(
            id: UUID(),
            displayName: trimmed.isEmpty ? "Recruiter" : trimmed,
            isDemo: isDemo
        )
    }
}

protocol StandaloneProposalGenerating {
    func generate(
        draft: StandaloneCaptureDraft,
        pursuit: StandalonePursuit
    ) async throws -> StandaloneProposal
}

struct DeterministicStandaloneProposalEngine: StandaloneProposalGenerating {
    let label: String

    init(label: String = "Demo Engine · fixture v1") {
        self.label = label
    }

    func generate(
        draft: StandaloneCaptureDraft,
        pursuit: StandalonePursuit
    ) async throws -> StandaloneProposal {
        StandaloneDemoProposalCatalog.proposal(
            for: draft,
            pursuit: pursuit,
            engineLabel: label
        )
    }
}

@MainActor
final class StandaloneOnboardingStore: ObservableObject {
    @Published private(set) var state: StandaloneOnboardingState
    @Published private(set) var persistenceNotice: String?

    private let persistence: StandaloneOnboardingPersisting
    private let accountClient: StandaloneAccountClient

    init(
        persistence: StandaloneOnboardingPersisting = FileStandaloneOnboardingStore(),
        accountClient: StandaloneAccountClient = LocalStandaloneAccountClient(),
        reset: Bool = false
    ) {
        self.persistence = persistence
        self.accountClient = accountClient
        if reset { try? persistence.reset() }
        do {
            if var restored = try persistence.load(),
               restored.version == StandaloneOnboardingState.flowVersion {
                let recoveredInterruptedWork = restored.recoverInterruptedWorkAfterRelaunch()
                state = restored
                if recoveredInterruptedWork {
                    do {
                        try persistence.save(restored)
                    } catch {
                        persistenceNotice = "The interrupted Draft was recovered in memory but could not be saved again: \(error.localizedDescription)"
                    }
                }
            } else {
                state = .fresh()
            }
        } catch {
            state = .fresh()
            persistenceNotice = "The previous local onboarding session could not be verified. A new local session was started."
        }
    }

    func begin(displayName: String, demoAccount: Bool) {
        let account = accountClient.localAccount(
            displayName: displayName,
            isDemo: demoAccount
        )
        mutate { $0.begin(account: account) }
    }

    func showIdentity() {
        mutate { $0.showIdentity() }
    }

    func createPursuit(template: String, outcome: String, targetDate: Date?) {
        mutate { _ = $0.createPursuit(template: template, outcome: outcome, targetDate: targetDate) }
    }

    func finishProductDemo() {
        mutate { $0.finishProductDemo() }
    }

    func returnToSourceChoice() {
        mutate { $0.returnToSourceChoice() }
    }

    func showMeetingSelection() {
        mutate { $0.showMeetingSelection() }
    }

    func chooseSource(_ source: StandaloneSourceKind) {
        mutate { _ = $0.chooseSource(source) }
    }

    func observeCalendar(
        _ permission: StandaloneCalendarPermission,
        selectedCalendarIDs: [String]? = nil
    ) {
        mutate { $0.observeCalendar(permission, selectedCalendarIDs: selectedCalendarIDs) }
    }

    func selectCalendarWindow(_ window: StandaloneCalendarWindow) {
        mutate { $0.selectCalendarWindow(window) }
    }

    func chooseMeeting(_ meeting: StandaloneMeeting) {
        mutate { _ = $0.chooseMeeting(meeting) }
    }

    func updateDraftText(_ text: String) {
        mutate { $0.updateDraftText(text) }
    }

    @discardableResult
    func importSharedCapture(_ envelope: SharedCaptureEnvelope) -> Bool {
        var imported = false
        let durablySaved = mutate { imported = $0.importSharedCapture(envelope) }
        return imported && durablySaved
    }

    func updateCaptureState(
        _ captureState: StandaloneCaptureState,
        audioFileName: String? = nil,
        error: String? = nil
    ) {
        mutate {
            $0.updateCaptureState(
                captureState,
                audioFileName: audioFileName,
                error: error
            )
        }
    }

    func process(using engine: StandaloneProposalGenerating) async {
        guard let pursuit = state.pursuit,
              let generation = beginProcessing(),
              let draft = state.captureDraft else { return }
        do {
            let proposal = try await engine.generate(draft: draft, pursuit: pursuit)
            let groundedProposal = proposal.enforcingEvidenceGrounding(in: draft.text)
            mutate { _ = $0.receiveProposal(groundedProposal, generation: generation) }
        } catch {
            mutate {
                $0.failProcessing(
                    "The Signal is still saved. \(error.localizedDescription)",
                    generation: generation
                )
            }
        }
    }

    func selectFact(_ id: UUID, selected: Bool) {
        mutate { $0.selectFact(id, selected: selected) }
    }

    func acceptAction(_ id: UUID, accepted: Bool) {
        mutate { $0.acceptAction(id, accepted: accepted) }
    }

    func editFact(_ id: UUID, value: String) {
        mutate { $0.editFact(id, value: value) }
    }

    func keepUnresolvedOnly() {
        mutate { _ = $0.keepUnresolvedOnly() }
    }

    func confirm() {
        mutate { _ = $0.confirm() }
    }

    func discardProposal() {
        mutate { $0.discardProposal() }
    }

    func showLatestProposal() {
        mutate { $0.showLatestProposal() }
    }

    func requestSystemCapture(_ source: StandaloneSourceKind) {
        mutate { $0.requestSystemCapture(source) }
    }

    func openPursuit(id: String) {
        mutate { $0.openPursuit(id: id) }
    }

    func markWrongPursuit() {
        mutate { $0.markWrongPursuit() }
    }

    func showActionButtonOffer() {
        mutate { $0.showActionButtonOffer() }
    }

    func openPractice() {
        mutate { $0.openPractice() }
    }

    func completePractice(simulated: Bool) {
        mutate { $0.completePractice(simulated: simulated) }
    }

    func skipPractice() {
        mutate { $0.skipPractice() }
    }

    func enterToday() {
        mutate { $0.enterToday() }
    }

    func replayOnboarding() {
        mutate { $0.replayOnboarding() }
    }

    func resetDemoData() {
        var resetErrors: [String] = []

        do {
            try persistence.reset()
        } catch {
            resetErrors.append("local session: \(error.localizedDescription)")
        }

#if DEBUG
        do {
            try SharedCaptureInbox().reset()
        } catch {
            resetErrors.append("shared captures: \(error.localizedDescription)")
        }
        do {
            try LiveActivityStopRequestBridge.reset()
        } catch {
            resetErrors.append("Live Activity requests: \(error.localizedDescription)")
        }
#endif

        guard resetErrors.isEmpty else {
            persistenceNotice = "Demo data could not be fully reset (\(resetErrors.joined(separator: "; "))). Retry before leaving this device."
            return
        }

        do {
            let freshState = StandaloneOnboardingState.fresh()
            try persistence.save(freshState)
            state = freshState
            persistenceNotice = nil
        } catch {
            persistenceNotice = "Demo data could not be fully reset: \(error.localizedDescription)"
        }
    }

    private func beginProcessing() -> Int? {
        var next = state
        guard let generation = next.beginProcessing() else {
            _ = commit(next)
            return nil
        }
        return commit(next) ? generation : nil
    }

    @discardableResult
    private func mutate(_ change: (inout StandaloneOnboardingState) -> Void) -> Bool {
        var next = state
        change(&next)
        return commit(next)
    }

    @discardableResult
    private func commit(_ next: StandaloneOnboardingState) -> Bool {
        do {
            try persistence.save(next)
            state = next
            persistenceNotice = nil
            return true
        } catch {
            persistenceNotice = "This step was not applied because it could not be durably saved. Retry when local storage is available: \(error.localizedDescription)"
            return false
        }
    }
}
