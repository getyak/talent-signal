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
        mutate { imported = $0.importSharedCapture(envelope) }
        return imported
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
                    "The Signal is still saved. Edit it or retry with the visible Demo Engine: \(error.localizedDescription)",
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
        do {
            try persistence.reset()
            state = .fresh()
            persistenceNotice = nil
            try persistence.save(state)
        } catch {
            persistenceNotice = "Demo data could not be fully reset: \(error.localizedDescription)"
        }
    }

    private func beginProcessing() -> Int? {
        var next = state
        guard let generation = next.beginProcessing() else {
            state = next
            persist()
            return nil
        }
        state = next
        persist()
        return generation
    }

    private func mutate(_ change: (inout StandaloneOnboardingState) -> Void) {
        var next = state
        change(&next)
        state = next
        persist()
    }

    private func persist() {
        do {
            try persistence.save(state)
            persistenceNotice = nil
        } catch {
            persistenceNotice = "This step is visible but has not been durably saved: \(error.localizedDescription)"
        }
    }
}
