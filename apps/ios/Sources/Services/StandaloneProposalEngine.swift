import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

struct AdaptiveStandaloneProposalEngine: StandaloneProposalGenerating {
    let forceDemo: Bool

    func generate(
        draft: StandaloneCaptureDraft,
        pursuit: StandalonePursuit
    ) async throws -> StandaloneProposal {
        if !forceDemo, #available(iOS 26.0, *) {
#if canImport(FoundationModels)
            if SystemLanguageModel.default.availability == .available {
                return try await FoundationModelStandaloneProposalEngine().generate(
                    draft: draft,
                    pursuit: pursuit
                )
            }
#endif
        }
        guard forceDemo,
              StandaloneDemoProposalCatalog.isShowcaseFixture(draft.text) else {
            throw StandaloneProposalEngineError.onDeviceIntelligenceUnavailable
        }
        return StandaloneDemoProposalCatalog.proposal(
            for: draft,
            pursuit: pursuit,
            engineLabel: "Demo Engine · fixture v1"
        )
    }
}

struct ManualStandaloneProposalEngine: StandaloneProposalGenerating {
    func generate(
        draft: StandaloneCaptureDraft,
        pursuit: StandalonePursuit
    ) async throws -> StandaloneProposal {
        let signal = draft.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !signal.isEmpty else { throw StandaloneProposalEngineError.emptySignal }
        return StandaloneProposal(
            id: UUID(),
            sourceSummary: StandaloneProposalSource.summary(for: draft),
            matchedPursuitID: pursuit.id,
            facts: [
                .init(
                    id: UUID(),
                    field: "Recruiter-authored Signal",
                    proposedValue: signal,
                    evidenceExcerpt: signal,
                    confidenceBand: "Direct local text · review required"
                ),
            ],
            inferences: [],
            unknowns: [
                .init(
                    id: UUID(),
                    question: "Should this Signal be split into narrower facts before it becomes current state?",
                    whyUnresolved: "No model interpreted the text. Confirm, edit, or leave the proposal unresolved yourself."
                ),
            ],
            nextActions: [],
            engineLabel: "Manual structure · no model",
            modelDisclaimer: "No model interpreted this Signal. The exact local text is proposed as one editable item; you decide whether any of it becomes current Pursuit state.",
            createdAt: Date()
        )
    }
}

enum StandaloneProposalEngineError: LocalizedError, Equatable {
    case emptySignal
    case onDeviceIntelligenceUnavailable

    var errorDescription: String? {
        switch self {
        case .emptySignal:
            return "Add Signal text before creating a Proposal."
        case .onDeviceIntelligenceUnavailable:
            return "On-device intelligence is unavailable. The Draft remains saved; continue editing or use the explicitly labeled showcase fixture."
        }
    }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
@Generable(description: "One proposed fact grounded in an exact evidence excerpt.")
private struct GeneratedStandaloneFact {
    @Guide(description: "Short field name such as Work preference or Availability")
    var field: String
    @Guide(description: "The proposed current value, without adding unsupported detail")
    var value: String
    @Guide(description: "An exact short excerpt copied from the Signal")
    var evidenceExcerpt: String
}

@available(iOS 26.0, *)
@Generable(description: "A visible interpretation that is not a fact.")
private struct GeneratedStandaloneInference {
    var statement: String
    var basis: String
}

@available(iOS 26.0, *)
@Generable(description: "An unresolved question that the current evidence cannot answer.")
private struct GeneratedStandaloneUnknown {
    var question: String
    var whyUnresolved: String
}

@available(iOS 26.0, *)
@Generable(description: "One internal next action proposal; it does not send or write externally.")
private struct GeneratedStandaloneAction {
    var title: String
    var rationale: String
}

@available(iOS 26.0, *)
@Generable(description: "A proposal that keeps facts, inference, unknowns, and action separate.")
private struct GeneratedStandaloneProposal {
    var sourceSummary: String
    var facts: [GeneratedStandaloneFact]
    var inferences: [GeneratedStandaloneInference]
    var unknowns: [GeneratedStandaloneUnknown]
    var nextActions: [GeneratedStandaloneAction]
}

@available(iOS 26.0, *)
private struct FoundationModelStandaloneProposalEngine: StandaloneProposalGenerating {
    func generate(
        draft: StandaloneCaptureDraft,
        pursuit: StandalonePursuit
    ) async throws -> StandaloneProposal {
        let session = LanguageModelSession(
            instructions: """
            You organize a recruiter-authored Signal into a reviewable proposal.
            Copy exact evidence for facts. Never infer protected traits, candidate
            worth, culture fit, acceptance probability, or authority to act.
            Preserve ambiguity as unknown. Propose at most one small internal next
            action. A proposal never sends a message or changes Calendar.
            """
        )
        let response = try await session.respond(
            to: """
            Pursuit outcome: \(pursuit.outcome)
            Source type: \(draft.sourceKind.rawValue)
            Signal: \(draft.text)
            """,
            generating: GeneratedStandaloneProposal.self
        )
        let generated = response.content
        return StandaloneProposal(
            id: UUID(),
            sourceSummary: StandaloneProposalSource.summary(for: draft),
            matchedPursuitID: pursuit.id,
            facts: generated.facts.map {
                .init(
                    id: UUID(),
                    field: $0.field,
                    proposedValue: $0.value,
                    evidenceExcerpt: $0.evidenceExcerpt,
                    confidenceBand: "Model proposal · review required"
                )
            },
            inferences: generated.inferences.map {
                .init(id: UUID(), statement: $0.statement, basis: $0.basis)
            },
            unknowns: generated.unknowns.map {
                .init(id: UUID(), question: $0.question, whyUnresolved: $0.whyUnresolved)
            },
            nextActions: generated.nextActions.prefix(1).map {
                .init(id: UUID(), title: $0.title, rationale: $0.rationale)
            },
            engineLabel: "On-device Apple Intelligence",
            modelDisclaimer: "On-device intelligence proposed this structure. You decide what becomes current Pursuit state.",
            createdAt: Date()
        )
    }
}
#endif
