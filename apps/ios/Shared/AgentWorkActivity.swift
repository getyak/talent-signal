import ActivityKit
import Foundation

enum AgentWorkExecution: String, Codable, Hashable, CaseIterable {
    case preparing
    case running
    case completed
    case partial
    case failed
    case unknown
    case cancelled

    var isTerminal: Bool {
        switch self {
        case .completed, .partial, .failed, .cancelled:
            return true
        case .preparing, .running, .unknown:
            return false
        }
    }
}

enum AgentWorkAttention: String, Codable, Hashable, CaseIterable {
    case none
    case observe
    case review
    case resolve
}

enum AgentWorkFreshness: String, Codable, Hashable, CaseIterable {
    case fresh
    case stale
}

enum AgentWorkStage: String, Codable, Hashable, CaseIterable {
    case received
    case readingEvidence
    case resolvingIdentity
    case preparingActions
    case readyForReview
    case reconcilingOutcome
    case ended
}

struct AgentWorkActivityAttributes: ActivityAttributes, Hashable {
    static let currentSchemaVersion = 1

    struct ContentState: Codable, Hashable {
        let execution: AgentWorkExecution
        let attention: AgentWorkAttention
        let freshness: AgentWorkFreshness
        let stage: AgentWorkStage
        let reviewActionCount: Int
        let eventRevision: Int64
        let updatedAt: Date
    }

    let schemaVersion: Int
    let scopeID: String
    let taskID: String
    let activityInstanceID: String
}

enum AgentWorkGlyph: String, Codable, Hashable {
    case received
    case evidence
    case identity
    case actions
    case review
    case partial
    case failed
    case unknown
    case ended

    var systemImageName: String {
        switch self {
        case .received: return "tray.and.arrow.down"
        case .evidence: return "text.page.badge.magnifyingglass"
        case .identity: return "person.text.rectangle"
        case .actions: return "wand.and.stars.inverse"
        case .review: return "checkmark.bubble"
        case .partial: return "doc.badge.ellipsis"
        case .failed: return "exclamationmark.triangle"
        case .unknown: return "questionmark.diamond"
        case .ended: return "minus.circle"
        }
    }
}

enum AgentWorkActivityAction: String, Codable, Hashable {
    case openStatus
    case openActions
    case resolve

    var title: String {
        switch self {
        case .openStatus: return "Open status"
        case .openActions: return "Review actions"
        case .resolve: return "Review issue"
        }
    }
}

struct AgentWorkActivityViewState: Equatable, Hashable {
    let eyebrow: String
    let title: String
    let supportingText: String
    let boundaryText: String
    let glyph: AgentWorkGlyph
    let action: AgentWorkActivityAction?
    let accessibilityLabel: String
    let isTerminal: Bool
    let isStale: Bool
}

enum AgentWorkActivityProjectionError: Error, Equatable {
    case unsupportedCombination(
        execution: AgentWorkExecution,
        attention: AgentWorkAttention,
        stage: AgentWorkStage
    )
    case invalidActionCount(Int)
}

enum AgentWorkActivityProjector {
    static func project(
        _ state: AgentWorkActivityAttributes.ContentState
    ) throws -> AgentWorkActivityViewState {
        guard (0 ... 9).contains(state.reviewActionCount) else {
            throw AgentWorkActivityProjectionError.invalidActionCount(
                state.reviewActionCount
            )
        }
        let isStale = state.freshness == .stale

        switch (state.execution, state.attention, state.stage) {
        case (.preparing, .observe, .received):
            return viewState(
                eyebrow: "SIGNAL RECEIVED",
                title: "Preparing a safe workspace",
                supportingText: "You can leave",
                boundaryText: "Nothing applied yet",
                glyph: .received,
                action: .openStatus,
                isTerminal: false,
                isStale: isStale
            )
        case (.running, .observe, .readingEvidence):
            return viewState(
                eyebrow: "READING EVIDENCE",
                title: "Reading selected evidence",
                supportingText: "You can leave",
                boundaryText: "Only the source you chose",
                glyph: .evidence,
                action: .openStatus,
                isTerminal: false,
                isStale: isStale
            )
        case (.running, .observe, .resolvingIdentity):
            return viewState(
                eyebrow: "CHECKING IDENTITY",
                title: "Checking the right person",
                supportingText: "You can leave",
                boundaryText: "No contact changed",
                glyph: .identity,
                action: .openStatus,
                isTerminal: false,
                isStale: isStale
            )
        case (.running, .observe, .preparingActions):
            return viewState(
                eyebrow: "PREPARING ACTIONS",
                title: "Preparing review actions",
                supportingText: "You can leave",
                boundaryText: "Nothing runs automatically",
                glyph: .actions,
                action: .openStatus,
                isTerminal: false,
                isStale: isStale
            )
        case (.completed, .review, .readyForReview):
            guard state.reviewActionCount > 0 else {
                throw AgentWorkActivityProjectionError.invalidActionCount(0)
            }
            return viewState(
                eyebrow: "ACTIONS READY",
                title: "Actions ready to review",
                supportingText: actionCountText(state.reviewActionCount),
                boundaryText: "Nothing applied yet",
                glyph: .review,
                action: .openActions,
                isTerminal: true,
                isStale: isStale
            )
        case (.completed, .none, .readyForReview):
            guard state.reviewActionCount == 0 else {
                throw AgentWorkActivityProjectionError.invalidActionCount(
                    state.reviewActionCount
                )
            }
            return viewState(
                eyebrow: "NO ACTION",
                title: "No action needed",
                supportingText: "The signal remains in history",
                boundaryText: "Nothing was changed",
                glyph: .ended,
                action: nil,
                isTerminal: true,
                isStale: isStale
            )
        case (.partial, .review, .readyForReview):
            guard state.reviewActionCount > 0 else {
                throw AgentWorkActivityProjectionError.invalidActionCount(0)
            }
            return viewState(
                eyebrow: "PARTIAL RESULT",
                title: "Some actions need review",
                supportingText: actionCountText(state.reviewActionCount),
                boundaryText: "Incomplete evidence is marked",
                glyph: .partial,
                action: .openActions,
                isTerminal: true,
                isStale: isStale
            )
        case (.failed, .resolve, .reconcilingOutcome):
            return viewState(
                eyebrow: "NEEDS YOU",
                title: "Processing needs attention",
                supportingText: "Open Talent Signal to resolve",
                boundaryText: "No outcome assumed",
                glyph: .failed,
                action: .resolve,
                isTerminal: true,
                isStale: isStale
            )
        case (.unknown, .resolve, .reconcilingOutcome):
            return viewState(
                eyebrow: "CHECK STATUS",
                title: "Result needs confirmation",
                supportingText: "Open Talent Signal to reconcile",
                boundaryText: "No outcome assumed",
                glyph: .unknown,
                action: .resolve,
                isTerminal: false,
                isStale: isStale
            )
        case (.cancelled, .none, .ended):
            return viewState(
                eyebrow: "ENDED",
                title: "Processing ended",
                supportingText: "No review is pending",
                boundaryText: "Nothing was changed",
                glyph: .ended,
                action: nil,
                isTerminal: true,
                isStale: isStale
            )
        default:
            throw AgentWorkActivityProjectionError.unsupportedCombination(
                execution: state.execution,
                attention: state.attention,
                stage: state.stage
            )
        }
    }

    private static func actionCountText(_ count: Int) -> String {
        count == 1 ? "1 suggested action" : "\(count) suggested actions"
    }

    private static func viewState(
        eyebrow: String,
        title: String,
        supportingText: String,
        boundaryText: String,
        glyph: AgentWorkGlyph,
        action: AgentWorkActivityAction?,
        isTerminal: Bool,
        isStale: Bool
    ) -> AgentWorkActivityViewState {
        let staleText = isStale ? " Last update delayed." : ""
        let accessibilityLabel = [
            "Talent Signal Agent",
            title,
            supportingText,
            boundaryText,
        ].joined(separator: ". ") + staleText
        return AgentWorkActivityViewState(
            eyebrow: eyebrow,
            title: title,
            supportingText: supportingText,
            boundaryText: boundaryText,
            glyph: glyph,
            action: action,
            accessibilityLabel: accessibilityLabel,
            isTerminal: isTerminal,
            isStale: isStale
        )
    }
}

enum AgentWorkActivityPayloadViolation: Error, Equatable {
    case unsupportedSchema(Int)
    case invalidOpaqueIdentifier(field: String)
    case invalidRevision(Int64)
    case exceedsMaximumBytes(Int)
}

enum AgentWorkActivityPayloadContract {
    static let maximumEncodedBytes = 4_096
    private static let maximumIdentifierLength = 96
    private static let opaqueIdentifierCharacters = CharacterSet(
        charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."
    )

    private struct PayloadEnvelope: Codable {
        let attributes: AgentWorkActivityAttributes
        let contentState: AgentWorkActivityAttributes.ContentState
    }

    static func validate(
        attributes: AgentWorkActivityAttributes,
        contentState: AgentWorkActivityAttributes.ContentState
    ) throws {
        guard attributes.schemaVersion == AgentWorkActivityAttributes.currentSchemaVersion else {
            throw AgentWorkActivityPayloadViolation.unsupportedSchema(
                attributes.schemaVersion
            )
        }
        try validateOpaque(attributes.scopeID, field: "scopeID")
        try validateOpaque(attributes.taskID, field: "taskID")
        try validateOpaque(
            attributes.activityInstanceID,
            field: "activityInstanceID"
        )
        guard contentState.eventRevision > 0 else {
            throw AgentWorkActivityPayloadViolation.invalidRevision(
                contentState.eventRevision
            )
        }
        _ = try AgentWorkActivityProjector.project(contentState)

        let encoded = try JSONEncoder().encode(
            PayloadEnvelope(attributes: attributes, contentState: contentState)
        )
        guard encoded.count <= maximumEncodedBytes else {
            throw AgentWorkActivityPayloadViolation.exceedsMaximumBytes(
                encoded.count
            )
        }
    }

    static func encodedByteCount(
        attributes: AgentWorkActivityAttributes,
        contentState: AgentWorkActivityAttributes.ContentState
    ) throws -> Int {
        try JSONEncoder().encode(
            PayloadEnvelope(attributes: attributes, contentState: contentState)
        ).count
    }

    static func isValidOpaqueIdentifier(_ value: String) -> Bool {
        !value.isEmpty
            && value.count <= maximumIdentifierLength
            && value.unicodeScalars.allSatisfy(opaqueIdentifierCharacters.contains)
    }

    private static func validateOpaque(_ value: String, field: String) throws {
        guard isValidOpaqueIdentifier(value) else {
            throw AgentWorkActivityPayloadViolation.invalidOpaqueIdentifier(
                field: field
            )
        }
    }
}

enum AgentWorkActivityTransitionDecision: Equatable {
    case apply
    case noOp
    case ignoreOlder
    case identityMismatch
    case sameRevisionConflict
    case terminalRegression
}

enum AgentWorkActivityTransitionPolicy {
    static func decision(
        currentAttributes: AgentWorkActivityAttributes,
        currentState: AgentWorkActivityAttributes.ContentState,
        proposedAttributes: AgentWorkActivityAttributes,
        proposedState: AgentWorkActivityAttributes.ContentState
    ) -> AgentWorkActivityTransitionDecision {
        guard currentAttributes == proposedAttributes else {
            return .identityMismatch
        }
        if proposedState.eventRevision < currentState.eventRevision {
            return .ignoreOlder
        }
        if proposedState.eventRevision == currentState.eventRevision {
            return proposedState == currentState ? .noOp : .sameRevisionConflict
        }
        if currentState.execution.isTerminal && !proposedState.execution.isTerminal {
            return .terminalRegression
        }
        return .apply
    }
}
