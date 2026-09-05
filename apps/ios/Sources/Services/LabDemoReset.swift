import CryptoKit
import Foundation

struct LabDemoResetTarget: Codable, Equatable {
    let sessionID: UUID
    let revision: String
}

/// Legacy onboarding can mix fixtures with user-authored capture. Only a
/// recognizable, unedited synthetic projection is eligible for Demo reset.
enum LabDemoReset {
    static func target(_ state: StandaloneOnboardingState?) throws -> LabDemoResetTarget? {
        guard let state, state.version == StandaloneOnboardingState.flowVersion,
              state.account?.isDemo == true,
              let pursuit = state.pursuit, pursuit.template == "Hire someone",
              pursuit.outcome == "Hire a VP of Engineering", pursuit.targetDate == nil,
              let draft = state.captureDraft, draft.pursuitID == pursuit.id,
              draft.sourceKind == .text, draft.audioFileName == nil,
              draft.sharedEnvelopeID == nil, draft.sharedPayloadKind == nil,
              draft.sharedPayloadFileName == nil, draft.sharedSourceText == nil,
              draft.sharedRecruiterNote == nil, draft.sharedSourceURL == nil,
              draft.meeting == nil, state.selectedMeeting == nil,
              ![.requestingPermission, .recording, .transcribing, .processing].contains(draft.state),
              [StandaloneDemoProposalCatalog.firstProgressSignal, StandaloneDemoProposalCatalog.showcaseSignal].contains(draft.text)
        else { return nil }
        let expected = StandaloneDemoProposalCatalog.proposal(for: draft, pursuit: pursuit)
        if let proposal = state.proposal {
            guard proposal.matchedPursuitID == pursuit.id,
                  proposal.sourceSummary == expected.sourceSummary,
                  facts(proposal.facts) == facts(expected.facts),
                  proposal.inferences.map({ [$0.statement, $0.basis] }) == expected.inferences.map({ [$0.statement, $0.basis] }),
                  proposal.unknowns.map({ [$0.question, $0.whyUnresolved] }) == expected.unknowns.map({ [$0.question, $0.whyUnresolved] }),
                  proposal.nextActions.map({ [$0.title, $0.rationale] }) == expected.nextActions.map({ [$0.title, $0.rationale] })
            else { return nil }
        }
        if let progress = state.progress {
            guard progress.pursuitID == pursuit.id, progress.sourceSummary == expected.sourceSummary,
                  facts(progress.confirmedFacts).allSatisfy(facts(expected.facts).contains),
                  progress.acceptedActions.allSatisfy({ action in expected.nextActions.contains { $0.title == action.title && $0.rationale == action.rationale } }),
                  progress.unresolved.allSatisfy({ unknown in expected.unknowns.contains { $0.question == unknown.question && $0.whyUnresolved == unknown.whyUnresolved } })
            else { return nil }
        }
        let encoded = try JSONEncoder().encode(state)
        var object = try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
        // Codable Set iteration order is not stable across processes.
        for key in ["selectedFactIDs", "acceptedActionIDs", "importedSharedEnvelopeIDs"] {
            if let values = object[key] as? [String] { object[key] = values.sorted() }
        }
        let canonical = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        let digest = SHA256.hash(data: canonical).map { String(format: "%02x", $0) }.joined()
        return .init(sessionID: state.sessionID, revision: digest)
    }

    static func perform(operation: LabResetOperation, persistence: any StandaloneOnboardingPersisting) throws -> LabResetStepResult {
        guard let reviewed = operation.context.demoTarget, let current = try persistence.load() else { throw LabResetError.unavailable }
        // The atomic state replacement is its own recovery marker. A lost
        // journal receipt never authorizes resetting a subsequently edited Demo.
        if current.sessionID == operation.id { return .init(verified: true, receiptID: operation.id) }
        guard try target(current) == reviewed else { throw LabResetError.contextChanged }
        var next = StandaloneOnboardingState.fresh()
        next.sessionID = operation.id
        next.importedSharedEnvelopeIDs = current.importedSharedEnvelopeIDs
        next.unassignedSystemCaptureID = current.unassignedSystemCaptureID
        next.selectedCalendarIDs = current.selectedCalendarIDs
        next.lastObservedCalendarPermission = current.lastObservedCalendarPermission
        next.calendarWindow = current.calendarWindow
        try persistence.save(next)
        guard try persistence.load() == next else { throw LabResetError.verification }
        return .init(verified: true, receiptID: operation.id)
    }

    private static func facts(_ values: [StandaloneProposalFact]) -> [[String]] {
        values.map { [$0.field, $0.proposedValue, $0.evidenceExcerpt, $0.confidenceBand] }
    }
}
