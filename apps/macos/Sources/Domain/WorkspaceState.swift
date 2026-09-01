import Foundation

enum RelationshipScopeReviewStatus: String, Sendable {
    case proposed
    case confirmed
    case unresolved
}

struct RelationshipScopeSelection: Equatable, Sendable {
    let pursuitID: String
    let personID: String
    let relationshipContextID: String
}

struct SessionSignOutReceipt: Sendable {
    let sessionID: String
    let revokedAt: String
}

enum WorkspaceMode: String, CaseIterable, Identifiable, Sendable {
    case empty
    case ready
    case working
    case needsDecision = "needs-decision"
    case noAction = "no-action"
    case receipt
    case clarification
    case ambiguousIdentity = "ambiguous-identity"
    case identityReviewSaved = "identity-review-saved"
    case stale
    case failed
    case outcomeUnknown = "outcome-unknown"
    case deleted

    var id: String { rawValue }

    var title: String {
        switch self {
        case .empty: "No context yet"
        case .ready: "Ready for review"
        case .working: "Working"
        case .needsDecision: "Needs decision"
        case .noAction: "No action"
        case .receipt: "Receipt verified"
        case .clarification: "Clarification needed"
        case .ambiguousIdentity: "Identity unresolved"
        case .identityReviewSaved: "Identity review saved"
        case .stale: "Source changed"
        case .failed: "Failed"
        case .outcomeUnknown: "Outcome unknown"
        case .deleted: "Local context deleted"
        }
    }

    var systemImage: String {
        switch self {
        case .empty, .ready: "circle"
        case .working: "hourglass"
        case .needsDecision: "diamond"
        case .noAction: "checkmark.circle"
        case .receipt: "checkmark.seal"
        case .clarification: "calendar.badge.questionmark"
        case .ambiguousIdentity: "person.2.badge.questionmark"
        case .identityReviewSaved: "person.crop.circle.badge.checkmark"
        case .stale: "clock.arrow.circlepath"
        case .failed: "exclamationmark.triangle"
        case .outcomeUnknown: "questionmark.circle"
        case .deleted: "trash"
        }
    }

    static func argumentValue(_ value: String) -> WorkspaceMode? {
        if let exact = WorkspaceMode(rawValue: value) { return exact }
        let normalized = value.replacingOccurrences(of: "_", with: "-")
        return WorkspaceMode(rawValue: normalized)
    }
}

enum ActionProjectionStatus: String, Sendable {
    case awaitingDecision
    case active
    case verified
    case failed
    case outcomeUnknown
    case stale
    case reversible

    var title: String {
        switch self {
        case .awaitingDecision: "Awaiting your decision"
        case .active: "In progress"
        case .verified: "Verified receipt"
        case .failed: "Execution failed"
        case .outcomeUnknown: "Outcome unknown — reconcile before retry"
        case .stale: "Source changed — review again"
        case .reversible: "Verified — reversal available"
        }
    }

    var icon: String {
        switch self {
        case .awaitingDecision: "diamond"
        case .active: "hourglass"
        case .verified: "checkmark.seal"
        case .failed: "exclamationmark.triangle"
        case .outcomeUnknown: "questionmark.circle"
        case .stale: "clock.arrow.circlepath"
        case .reversible: "arrow.uturn.backward.circle"
        }
    }
}

struct ActionProjection: Identifiable, Sendable {
    let id: String
    let objectName: String
    let consequence: String
    let authority: String
    let status: ActionProjectionStatus
    let nextOperation: String
    let route: ActionProjectionRoute
}

enum ActionProjectionRoute: String, Sendable {
    case reviewDecision
    case reconcileOperation
    case openReceipt
    case reviewStaleSource
    case openCurrent
}

struct WorkspacePresentation: Sendable {
    let candidateName: String
    let pursuitTitle: String
    let relationshipContext: String
    let changedSummary: String
    let evidenceQuote: String
    let evidenceSource: String
    let dependency: String
    let proposal: String
    let actionProjections: [ActionProjection]

    static let cleared = WorkspacePresentation(
        candidateName: "No relationship details displayed",
        pursuitTitle: "Local context cleared",
        relationshipContext: "The account remains connected; add new explicit context when ready.",
        changedSummary: "Local Capsule content and in-memory decision projections were removed.",
        evidenceQuote: "No local evidence is displayed.",
        evidenceSource: "Local deletion receipt",
        dependency: "Canonical history was not silently rewritten.",
        proposal: "No action is authorized.",
        actionProjections: []
    )
}

enum CanonicalDecisionChoice: String, CaseIterable, Identifiable, Sendable {
    case accept
    case reject
    case keepUnresolved = "keep_unresolved"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .accept: "Confirm"
        case .reject: "Reject"
        case .keepUnresolved: "Keep unresolved"
        }
    }
}

struct CanonicalProposalReview: Sendable {
    let bundleID: String
    let taskID: String
    let taskRevision: Int
    let bundleRevision: Int
    let proposalID: String
    let baseRevision: Int
    let summary: String
    let dependency: String
    let expiresAt: String
    let evidence: [Evidence]
    let items: [Item]

    struct Evidence: Identifiable, Sendable {
        let id: String
        let text: String
        let source: String
        let observedAt: String
        let attributedActor: String
        let attributionStatus: String
        let reviewStatus: String
    }

    struct Item: Identifiable, Sendable {
        /// Agent Decision Bundle item ID. This is the only ID accepted by the
        /// atomic bundle-resolution endpoint.
        let id: String
        let domainItemID: String
        let key: String
        let changeKind: String
        let beforeValue: String
        let proposedValue: String
        let reason: String
        let effectSummary: String
        let epistemicStatus: String
        let evidenceAvailability: String
        let evidenceRefs: [String]
    }
}

struct CanonicalDecisionRequest: Sendable {
    let bundleID: String
    let taskID: String
    let taskRevision: Int
    let bundleRevision: Int
    let proposalID: String
    let baseRevision: Int
    let reason: String
    let decisions: [Decision]

    struct Decision: Sendable {
        let itemID: String
        let choice: CanonicalDecisionChoice
    }
}

struct CanonicalPursuitReceipt: Sendable {
    let id: String
    let operationID: String
    let workspaceID: String
    let pursuitID: String
    let proposalID: String
    let outcome: String
    let summary: String
    let beforeRevision: Int
    let afterRevision: Int
    let changedFields: [String]
    let externalEffects: [String]
    let occurredAt: String
}

struct IdentityReviewReceipt: Sendable {
    let id: String
    let taskID: String?
    let summary: String
    let occurredAt: Date
}

enum FactReviewStatus: String, Sendable {
    case proposed
    case confirmed
    case dismissed
}

enum LocalDraftStatus: String, Sendable {
    case awaitingDecision
    case prepared
    case copied
}
