import CryptoKit
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

struct PendingCaptureSummary: Identifiable, Equatable {
    let id: UUID
    let fileName: String
    let mediaType: String
    let createdAt: Date
    let origin: CaptureOrigin
    let originalAvailable: Bool
    let hasSavedProgress: Bool
    let sessionID: UUID?
    let processingState: CaptureSessionProcessingState
    let processingDetail: String?

    var needsAttention: Bool {
        processingState == .needsDecision || processingState == .failed
    }
}

enum CaptureSessionProcessingState: String, Codable, Equatable {
    case queued
    case processing
    case needsDecision = "needs_decision"
    case completed
    case failed
}

enum CaptureSessionResolution: Equatable {
    case completed
    case dismissed
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
    var speaker: TextSignalSpeaker?
    var displayNameHint: String
    var handleType: IdentityHandleType
    var handleValue: String
    var relationshipLabel: String
    var relationshipPurpose: String
    var relationshipRole: String
    var messageTimestamp: Date? = nil
    var messageTimestampInput: String? = nil
    var keepOriginalForReview: Bool? = nil
    var sourceByteCount: Int? = nil
    var sourceTimezone: String? = nil

    static let empty = RecognizedCaptureDraft(
        reviewedText: "",
        speaker: nil,
        displayNameHint: "",
        handleType: .phone,
        handleValue: "",
        relationshipLabel: "Candidate relationship",
        relationshipPurpose: "Maintain evidence for this recruiting relationship",
        relationshipRole: "Candidate"
    )

    var canSubmit: Bool {
        !reviewedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && reviewedText.count <= 20_000
            && (messageTimestampInput == nil || messageTimestamp != nil)
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

struct ResourceCaptureResult: Codable, Equatable {
    let captureID: String
    let identity: Identity
    let resource: Resource

    enum CodingKeys: String, CodingKey {
        case captureID = "capture_id"
        case identity
        case resource
    }

    struct Identity: Codable, Equatable {
        let status: String
        let personID: String?
        let relationshipContextID: String?
        let resolutionCaseID: String?
        let candidatePersonIDs: [String]
        var personDisplayLabel: String? = nil
        var relationshipDisplayLabel: String? = nil

        enum CodingKeys: String, CodingKey {
            case status
            case personID = "person_id"
            case relationshipContextID = "relationship_context_id"
            case resolutionCaseID = "resolution_case_id"
            case candidatePersonIDs = "candidate_person_ids"
            case personDisplayLabel = "person_display_label", relationshipDisplayLabel = "relationship_display_label"
        }
    }

    struct Resource: Codable, Equatable {
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
    case bindFromAgent(
        candidate: IdentityResolutionCandidate,
        context: RelationshipContextChoice
    )
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
    let captureID: String
    let personID: String?
    let personDisplayLabel: String?
    let relationshipContextID: String?
    let relationshipDisplayLabel: String?
    let resourceID: String
    let decision: String
    let wiki: WikiCompilationReceipt?
    var confirmedCount: Int = 0
    var unresolvedCount: Int = 0
    var dismissedCount: Int = 0
    var needsEvidenceReview: Bool = false

    var needsReview: Bool { isUnresolved || unresolvedCount > 0 || needsEvidenceReview }

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
    case loadingChanges
    case reviewingChanges
    case savingChange
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
        case changes
    }
}

struct CaptureChangeReview: Codable, Equatable {
    let resource: Resource
    let fragments: [Fragment]
    let claims: [Claim]
    enum CodingKeys: String, CodingKey { case resource, fragments; case claims = "claim_proposals" }

    struct Resource: Codable, Equatable {
        let id: String
        let captureID: String
        let authorization: String
        let processingState: String
        var captureVersion: Int = 1
        enum CodingKeys: String, CodingKey {
            case id; case captureID = "capture_id"
            case authorization = "source_authorization_state"
            case processingState = "processing_state"
            case captureVersion = "capture_version"
        }
    }
    struct Fragment: Codable, Equatable, Identifiable {
        let id: String
        let text: String?
        let attribution: Attribution
        let reviewStatus: String
        var lastReviewID: String? = nil
        enum CodingKeys: String, CodingKey { case id, text, attribution; case reviewStatus = "review_status"; case lastReviewID = "last_review_id" }
        struct Attribution: Codable, Equatable {
            let actor: String
            let status: String
            enum CodingKeys: String, CodingKey { case actor = "actor_kind"; case status }
        }
    }
    struct Claim: Codable, Equatable, Identifiable {
        let id: String
        let field: String
        let proposedValue: String?
        let priorValue: String?
        let quote: String?
        let reviewStatus: String
        let proposalStatus: String
        let version: Int
        let reviewToken: String?
        let blockers: [String]?
        var reviewedValue: String? = nil
        var lastDecisionID: String? = nil
        enum CodingKeys: String, CodingKey {
            case id, field, version
            case proposedValue = "proposed_value", priorValue = "prior_confirmed_value"
            case quote = "evidence_quote", reviewStatus = "review_status", proposalStatus = "proposal_status"
            case reviewToken = "review_token", blockers = "review_blockers"
            case reviewedValue = "reviewed_value", lastDecisionID = "last_decision_id"
        }
        var needsReview: Bool { ["pending", "unresolved"].contains(reviewStatus) }
        var requiresDate: Bool { field == "decision_deadline" || blockers?.contains("calendar_date_required") == true }
        var hasBlockingEvidence: Bool { blockers?.contains(where: { $0 != "calendar_date_required" }) == true }
    }
    var pendingCount: Int { claims.filter(\.needsReview).count }
    var confirmedCount: Int { claims.filter { $0.reviewStatus == "confirmed" }.count }
    var dismissedCount: Int { claims.filter { $0.reviewStatus == "dismissed" }.count }
    var needsEvidenceReview: Bool {
        resource.authorization != "authorized" || fragments.contains {
            $0.reviewStatus != "reviewed" || $0.attribution.status != "confirmed"
        }
    }
    var reviewFingerprint: String {
        var parts: [String] = ["capture:\(resource.captureVersion)", "authorization:\(resource.authorization)"]
        parts.append(contentsOf: fragments.map {
            "fragment:\($0.id):\($0.reviewStatus):\($0.lastReviewID ?? "none"):\($0.attribution.actor):\($0.attribution.status)"
        })
        parts.append(contentsOf: claims.map { "claim:\($0.id):\($0.version):\($0.reviewStatus)" })
        let basis = parts.sorted().joined(separator: "|")
        return SHA256.hash(data: Data(basis.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

struct CaptureClaimDecision: Codable, Equatable {
    let assertionID: String
    let idempotencyKey: String
    let version: Int
    let reviewToken: String
    let decision: String
    let correctedValue: String?
}

struct CaptureReviewRecovery: Codable, Equatable {
    var selectedCandidateID: String?
    var selectedContextID: String?
    var submittedDraft: RecognizedCaptureDraft?
    var capture: ResourceCaptureResult?
    var pendingClaim: CaptureClaimDecision?
    var pendingSpeaker: CaptureSpeakerDecision?
    var selectedClaimID: String?
    var claimEdits: [String: String] = [:]
    var submittedByAgent: Bool? = nil
}

struct CaptureSpeakerDecision: Codable, Equatable {
    let fragmentID: String
    let idempotencyKey: String
    let expectedStatus: String
    let expectedReviewID: String?
    let speaker: TextSignalSpeaker
}
