import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

protocol ConversationContactIntentInterpreting {
    func interpret(_ source: String) async -> ConversationContactInterpretation
}

protocol ConversationContactIntentModelGenerating {
    func generate(from source: String) async throws -> ConversationContactModelOutput
}

struct AdaptiveConversationContactIntentInterpreter: ConversationContactIntentInterpreting {
    private let model: (any ConversationContactIntentModelGenerating)?

    init(model: (any ConversationContactIntentModelGenerating)? = nil) {
        self.model = model
    }

    func interpret(_ source: String) async -> ConversationContactInterpretation {
        if ConversationContactIntake.isClearlyNonContactMutation(source) {
            return .notContact
        }
        if let draft = ConversationContactIntake.propose(source) {
            return .contact(draft)
        }

        do {
            let output: ConversationContactModelOutput
            if let model {
                output = try await model.generate(from: source)
            } else if #available(iOS 26.0, *) {
#if canImport(FoundationModels)
                guard SystemLanguageModel.default.availability == .available else {
                    return fallback(for: source)
                }
                output = try await FoundationModelConversationContactIntentModel()
                    .generate(from: source)
#else
                return fallback(for: source)
#endif
            } else {
                return fallback(for: source)
            }
            return ConversationContactIntake.validatedModelDraft(
                from: output,
                source: source
            )
        } catch is CancellationError {
            return .notContact
        } catch {
            return fallback(for: source)
        }
    }

    private func fallback(for source: String) -> ConversationContactInterpretation {
        ConversationContactIntake.requiresContactClarification(source)
            ? .needsClarification
            : .notContact
    }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
@Generable(description: "A bounded proposal for whether one message is contact intake.")
private struct GeneratedConversationContactIntent {
    @Guide(description: "True only when the recruiter intends to remember or add this person as a contact. Ordinary questions about a person are false.")
    var isContactIntent: Bool
    @Guide(description: "The person's name copied exactly from the source, or an empty string.")
    var name: String
    @Guide(description: "email, phone, linkedin_url, or none.")
    var identityType: String
    @Guide(description: "The identity value copied exactly from the source, or an empty string.")
    var identityValue: String
    @Guide(description: "A role, search, or relationship purpose copied exactly from the source, or an empty string.")
    var relationshipContext: String
}

@available(iOS 26.0, *)
private struct FoundationModelConversationContactIntentModel:
    ConversationContactIntentModelGenerating {
    func generate(from source: String) async throws -> ConversationContactModelOutput {
        let session = LanguageModelSession(
            instructions: """
            Classify one recruiter-authored message for a contact-intake proposal.
            A contact intent means the recruiter wants Talent Signal to remember or
            add one person for relationship work, even when they do not use a command.
            A question asking about an existing person is not contact intake.

            Copy the person's name, identity value, and relationship context only
            when those exact words are present in the source. Use identityType email,
            phone, linkedin_url, or none. Leave missing fields empty. Never infer
            identity, candidate quality, personality, protected traits, culture fit,
            acceptance probability, or authority to create, attach, or merge records.
            This output is only a proposal that a recruiter must review.
            """
        )
        let response = try await session.respond(
            to: "Source message:\n\(source)",
            generating: GeneratedConversationContactIntent.self
        )
        let generated = response.content
        return ConversationContactModelOutput(
            isContactIntent: generated.isContactIntent,
            name: generated.name,
            identityType: generated.identityType,
            identityValue: generated.identityValue,
            relationshipContext: generated.relationshipContext
        )
    }
}
#endif
