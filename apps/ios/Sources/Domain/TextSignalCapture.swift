import Foundation

struct TextSignalCaptureSession: Equatable {
    let baseURL: URL
    let recordID: UUID

    static func configured(arguments: [String]) -> TextSignalCaptureSession? {
#if DEBUG
        guard value(after: "--scenario", in: arguments) == "text-signal-capture",
              let backend = value(after: "--backend-url", in: arguments),
              let baseURL = URL(string: backend),
              URLFixtureLoader.isLoopback(baseURL),
              let rawID = value(after: "--text-signal-seed", in: arguments),
              let recordID = UUID(uuidString: rawID) else {
            return nil
        }
        return TextSignalCaptureSession(baseURL: baseURL, recordID: recordID)
#else
        return nil
#endif
    }

    private static func value(after argument: String, in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: argument),
              arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }
}

enum TextSignalSpeaker: String, Codable, CaseIterable, Identifiable {
    case candidate
    case recruiter
    case client
    case unknown

    var id: String { rawValue }

    var label: String {
        switch self {
        case .candidate: return "Candidate"
        case .recruiter: return "Recruiter"
        case .client: return "Client"
        case .unknown: return "Unresolved"
        }
    }

    var attributionStatus: String {
        self == .unknown ? "unknown" : "confirmed"
    }
}

enum TextSignalMilestoneChoice: String, CaseIterable, Identifiable {
    case shortlistReview = "shortlist_review"
    case referenceCheck = "reference_check"
    case finalConversation = "final_conversation"
    case offerReview = "offer_review"
    case decisionPending = "decision_pending"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .shortlistReview: return "Shortlist review"
        case .referenceCheck: return "Reference check"
        case .finalConversation: return "Final conversation"
        case .offerReview: return "Offer review"
        case .decisionPending: return "Decision pending"
        }
    }
}

enum TextSignalOutboxState: String, Codable, Equatable {
    case savedLocal = "saved_local"
    case queued
    case uploading
    case synced
    case stagedForReview = "staged_for_review"
    case failed
    case deleting
}

struct TextSignalScope: Identifiable, Codable, Equatable {
    let workspaceID: String
    let pursuitID: String
    let pursuitTitle: String
    let pursuitRevision: Int
    let currentMilestone: String
    let roleID: String
    let roleType: String
    let personID: String
    let personDisplayLabel: String
    let relationshipContextID: String?
    let relationshipContextLabel: String?

    var id: String { "\(workspaceID):\(pursuitID):\(roleID)" }

    var identityClue: String {
        if let relationshipContextLabel,
           !relationshipContextLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return relationshipContextLabel
        }
        return "Person record \(personID.prefix(8))"
    }

    var pickerLabel: String {
        "\(personDisplayLabel) · \(identityClue) · \(pursuitTitle)"
    }

    var accessibilityLabel: String {
        "\(personDisplayLabel), Person record \(personID.prefix(8)), relationship context \(identityClue), \(roleType), Pursuit \(pursuitTitle)"
    }
}

enum TextSignalWorkspaceVerification: Equatable {
    case online
    case cachedOffline
}

struct TextSignalScopeCatalog: Equatable {
    let workspaceID: String
    let scopes: [TextSignalScope]
    let verification: TextSignalWorkspaceVerification

    init(
        workspaceID: String,
        scopes: [TextSignalScope],
        verification: TextSignalWorkspaceVerification = .online
    ) {
        self.workspaceID = workspaceID
        self.scopes = scopes
        self.verification = verification
    }
}

struct TextSignalOutboxRecord: Identifiable, Codable, Equatable {
    let id: UUID
    let workspaceID: String
    var text: String
    var purpose: String
    var speaker: TextSignalSpeaker?
    var scope: TextSignalScope?
    var proposedMilestone: String
    var proposalReason: String
    let createdAt: Date
    var updatedAt: Date
    var state: TextSignalOutboxState
    var attemptCount: Int
    var captureID: String?
    var resourceID: String?
    var evidenceFragmentID: String?
    var proposalID: String?
    var lastError: String?

    init(
        id: UUID = UUID(),
        workspaceID: String,
        text: String,
        purpose: String,
        speaker: TextSignalSpeaker?,
        scope: TextSignalScope?,
        proposedMilestone: String,
        proposalReason: String,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        state: TextSignalOutboxState = .savedLocal,
        attemptCount: Int = 0,
        captureID: String? = nil,
        resourceID: String? = nil,
        evidenceFragmentID: String? = nil,
        proposalID: String? = nil,
        lastError: String? = nil
    ) {
        self.id = id
        self.workspaceID = workspaceID
        self.text = text
        self.purpose = purpose
        self.speaker = speaker
        self.scope = scope
        self.proposedMilestone = proposedMilestone
        self.proposalReason = proposalReason
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.state = state
        self.attemptCount = attemptCount
        self.captureID = captureID
        self.resourceID = resourceID
        self.evidenceFragmentID = evidenceFragmentID
        self.proposalID = proposalID
        self.lastError = lastError
    }

    var canSaveLocally: Bool {
        !workspaceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && workspaceID != "unbound"
            && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !purpose.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var canQueueForSync: Bool {
        guard canSaveLocally, speaker != nil, scope != nil else { return false }
        if proposedMilestone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return proposalReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        return speaker == .candidate
            && !proposalReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var stagesProposal: Bool {
        !proposedMilestone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct TextSignalSyncReceipt: Equatable {
    let workspaceID: String
    let pursuitID: String
    let roleID: String
    let personID: String
    let relationshipContextID: String?
    let captureID: String
    let resourceID: String
    let evidenceFragmentID: String
    let proposalID: String?
}

struct TextSignalDeletionReceipt: Decodable, Equatable {
    let deletionID: String
    let captureID: String
    let status: String
    let derivativesDeleted: Int

    enum CodingKeys: String, CodingKey {
        case deletionID = "deletion_id"
        case captureID = "capture_id"
        case status
        case derivativesDeleted = "derivatives_deleted"
    }
}
