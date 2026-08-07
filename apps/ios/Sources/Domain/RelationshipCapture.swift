import Foundation

enum CaptureOrigin: String, Codable, Equatable {
    case photosPicker
    case appShortcut
    case deterministicTest

    var label: String {
        switch self {
        case .photosPicker:
            return "Photos"
        case .appShortcut:
            return "App Shortcut"
        case .deterministicTest:
            return "Test capture"
        }
    }
}

struct PendingCaptureSeed: Identifiable, Codable, Equatable {
    let id: UUID
    let imageData: Data
    let fileName: String
    let mediaType: String
    let createdAt: Date
    let origin: CaptureOrigin

    init(
        id: UUID = UUID(),
        imageData: Data,
        fileName: String,
        mediaType: String,
        createdAt: Date = Date(),
        origin: CaptureOrigin
    ) {
        self.id = id
        self.imageData = imageData
        self.fileName = fileName
        self.mediaType = mediaType
        self.createdAt = createdAt
        self.origin = origin
    }
}

enum IdentityHandleType: String, CaseIterable, Codable, Identifiable {
    case phone
    case email
    case wechat

    var id: String { rawValue }

    var label: String {
        switch self {
        case .phone:
            return "Phone"
        case .email:
            return "Email"
        case .wechat:
            return "WeChat"
        }
    }
}

struct RecognizedCaptureDraft: Codable, Equatable {
    var reviewedText: String
    var displayNameHint: String
    var handleType: IdentityHandleType
    var handleValue: String
    var relationshipLabel: String
    var relationshipPurpose: String
    var relationshipRole: String

    static let empty = RecognizedCaptureDraft(
        reviewedText: "",
        displayNameHint: "",
        handleType: .phone,
        handleValue: "",
        relationshipLabel: "Candidate relationship",
        relationshipPurpose: "Maintain evidence for this recruiting relationship",
        relationshipRole: "Candidate"
    )

    var canSubmit: Bool {
        !reviewedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !relationshipLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !relationshipPurpose.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

enum TemporalIdentityRole: String, Equatable {
    case current
    case historical
    case uncertain

    var label: String {
        switch self {
        case .current:
            return "Current identity clue"
        case .historical:
            return "Historical identity clue"
        case .uncertain:
            return "Identity needs comparison"
        }
    }

    static func classify(matchReasons: [String]) -> TemporalIdentityRole {
        let joined = matchReasons.joined(separator: " ").lowercased()
        if joined.contains("current confirmed") {
            return .current
        }
        if joined.contains("expired") || joined.contains("historical") {
            return .historical
        }
        return .uncertain
    }
}

struct IdentityResolutionCandidate: Identifiable, Decodable, Equatable {
    let personID: String
    let displayLabel: String
    let contextCount: Int
    let captureCount: Int
    let relationshipContexts: [RelationshipContextChoice]
    let matchReasons: [String]

    var id: String { personID }
    var temporalRole: TemporalIdentityRole {
        TemporalIdentityRole.classify(matchReasons: matchReasons)
    }

    enum CodingKeys: String, CodingKey {
        case personID = "person_id"
        case displayLabel = "display_label"
        case contextCount = "context_count"
        case captureCount = "capture_count"
        case relationshipContexts = "relationship_contexts"
        case matchReasons = "match_reasons"
    }
}

struct RelationshipContextChoice: Identifiable, Decodable, Equatable {
    let id: String
    let displayLabel: String

    enum CodingKeys: String, CodingKey {
        case id
        case displayLabel = "display_label"
    }
}

struct IdentityResolutionCase: Decodable, Equatable {
    let id: String
    let status: String
    let version: Int
    let reason: String
    let displayNameHint: String?
    let source: SourceSummary
    let candidates: [IdentityResolutionCandidate]
    let resolvedPersonID: String?
    let resolvedRelationshipContextID: String?

    var hasCurrentCandidate: Bool {
        candidates.contains { $0.temporalRole == .current }
    }

    enum CodingKeys: String, CodingKey {
        case id
        case status
        case version
        case reason
        case displayNameHint = "display_name_hint"
        case source
        case candidates
        case resolvedPersonID = "resolved_person_id"
        case resolvedRelationshipContextID = "resolved_relationship_context_id"
    }

    struct SourceSummary: Decodable, Equatable {
        let resourceID: String
        let kind: String
        let displayName: String
        let observedAt: String
        let excerpt: String
        let fragmentCount: Int

        enum CodingKeys: String, CodingKey {
            case resourceID = "resource_id"
            case kind
            case displayName = "display_name"
            case observedAt = "observed_at"
            case excerpt
            case fragmentCount = "fragment_count"
        }
    }
}

struct ResourceCaptureResult: Decodable, Equatable {
    let captureID: String
    let identity: Identity
    let resource: Resource

    enum CodingKeys: String, CodingKey {
        case captureID = "capture_id"
        case identity
        case resource
    }

    struct Identity: Decodable, Equatable {
        let status: String
        let personID: String?
        let relationshipContextID: String?
        let resolutionCaseID: String?
        let candidatePersonIDs: [String]

        enum CodingKeys: String, CodingKey {
            case status
            case personID = "person_id"
            case relationshipContextID = "relationship_context_id"
            case resolutionCaseID = "resolution_case_id"
            case candidatePersonIDs = "candidate_person_ids"
        }
    }

    struct Resource: Decodable, Equatable {
        let id: String
        let processingState: String
        let duplicateOfResourceID: String?
        let fragmentCount: Int

        enum CodingKeys: String, CodingKey {
            case id
            case processingState = "processing_state"
            case duplicateOfResourceID = "duplicate_of_resource_id"
            case fragmentCount = "fragment_count"
        }
    }
}

enum IdentityDecision: Equatable {
    case bind(candidate: IdentityResolutionCandidate, context: RelationshipContextChoice?)
    case createNew
    case leaveUnresolved
}

struct IdentityDecisionResult: Decodable, Equatable {
    let decision: String
    let identityStatus: String
    let personID: String?
    let relationshipContextID: String?
    let resourceProcessingState: String

    enum CodingKeys: String, CodingKey {
        case decision
        case identityStatus = "identity_status"
        case personID = "person_id"
        case relationshipContextID = "relationship_context_id"
        case resourceProcessingState = "resource_processing_state"
    }
}

struct WikiCompilationReceipt: Decodable, Equatable {
    let id: String
    let personID: String
    let relationshipContextID: String?
    let status: String
    let blocks: [WikiBlockReceipt]
    let quality: WikiQualityReceipt

    enum CodingKeys: String, CodingKey {
        case id
        case personID = "person_id"
        case relationshipContextID = "relationship_context_id"
        case status
        case blocks
        case quality
    }
}

struct WikiBlockReceipt: Decodable, Equatable {
    let id: String
    let type: String
    let content: Content

    var title: String { content.headline }

    struct Content: Decodable, Equatable {
        let headline: String
        let summary: String?
        let items: [String]
    }
}

struct WikiQualityReceipt: Decodable, Equatable {
    let verdict: String
    let reasons: [String]
}

struct RelationshipCaptureCompletion: Equatable {
    let personID: String?
    let relationshipContextID: String?
    let resourceID: String
    let decision: String
    let wiki: WikiCompilationReceipt?

    var isUnresolved: Bool {
        personID == nil || relationshipContextID == nil
    }
}

enum RelationshipCaptureStage: Equatable {
    case recognizing
    case reviewing
    case submitting
    case resolvingIdentity
    case decidingIdentity
    case compilingWiki
    case completed(RelationshipCaptureCompletion)
    case failed(RelationshipCaptureFailure)
}

struct RelationshipCaptureFailure: Equatable {
    let title: String
    let message: String
    let recoveryStage: RecoveryStage

    enum RecoveryStage: Equatable {
        case recognition
        case submission
        case identity
        case compilation
    }
}
