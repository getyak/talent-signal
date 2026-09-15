import Foundation
import CryptoKit

struct ScreenshotContactTask: Decodable, Equatable, Identifiable {
    struct Contact: Decodable, Equatable {
        let personID: String
        let relationshipContextID: String
        let displayName: String
        let disposition: String
        enum CodingKeys: String, CodingKey { case personID = "person_id", relationshipContextID = "relationship_context_id", displayName = "display_name", disposition }
    }
    struct Message: Decodable, Equatable, Identifiable {
        let messageID: String
        let sequence: Int
        let text: String
        let speakerSide: String
        let speakerLabel: String?
        let timeText: String?
        let sourceImageIndex: Int?
        var id: String { messageID }
        enum CodingKeys: String, CodingKey { case messageID = "message_id", sequence, text, speakerSide = "speaker_side", speakerLabel = "speaker_label", timeText = "time_text", sourceImageIndex = "source_image_index" }
    }
    struct IdentityClue: Decodable, Equatable {
        let kind: String; let value: String; let sourceExcerpt: String; let sourceImageIndex: Int?
        enum CodingKeys: String, CodingKey { case kind, value, sourceExcerpt = "source_excerpt", sourceImageIndex = "source_image_index" }
    }
    struct Extraction: Decodable, Equatable {
        let platform: String?; let contactName: String?; let identityClues: [IdentityClue]?
        let messages: [Message]; let uncertainties: [String]
        init(platform: String? = nil, contactName: String? = nil, identityClues: [IdentityClue]? = nil, messages: [Message], uncertainties: [String]) {
            self.platform = platform; self.contactName = contactName; self.identityClues = identityClues
            self.messages = messages; self.uncertainties = uncertainties
        }
        enum CodingKeys: String, CodingKey { case platform, contactName = "contact_name", identityClues = "identity_clues", messages, uncertainties }
    }
    struct ProfileDraft: Decodable, Equatable {
        struct Field: Decodable, Equatable, Identifiable {
            let clueIndex: Int; let kind: String; let value: String; let sourceExcerpt: String; let sourceImageIndex: Int
            var id: Int { clueIndex }
            enum CodingKeys: String, CodingKey { case clueIndex = "clue_index", kind, value, sourceExcerpt = "source_excerpt", sourceImageIndex = "source_image_index" }
        }
        let platform: String; let displayName: String; let fields: [Field]
        enum CodingKeys: String, CodingKey { case platform, displayName = "display_name", fields }
    }
    struct Finding: Decodable, Equatable {
        let kind: String; let text: String; let messageRefs: [String]; let sourceExcerpt: String; let epistemicStatus: String
        enum CodingKeys: String, CodingKey { case kind, text, messageRefs = "message_refs", sourceExcerpt = "source_excerpt", epistemicStatus = "epistemic_status" }
    }
    struct ProfileField: Decodable, Equatable {
        let field: String; let value: String; let sourceRefs: [String]; let sourceExcerpt: String; let epistemicStatus: String
        enum CodingKeys: String, CodingKey { case field, value, sourceRefs = "source_refs", sourceExcerpt = "source_excerpt", epistemicStatus = "epistemic_status" }
    }
    struct Source: Decodable, Equatable, Identifiable {
        let sourceID: String; let url: String; let title: String; let channel: String; let stage: String; let retrievedAt: String
        var id: String { sourceID }
        enum CodingKeys: String, CodingKey { case sourceID = "source_id", url, title, channel, stage, retrievedAt = "retrieved_at" }
    }
    struct Candidate: Decodable, Equatable, Identifiable {
        let personID: String; let relationshipContextID: String; let displayName: String; let relationshipLabel: String
        var id: String { "\(personID):\(relationshipContextID)" }
        enum CodingKeys: String, CodingKey { case personID = "person_id", relationshipContextID = "relationship_context_id", displayName = "display_name", relationshipLabel = "relationship_label" }
    }
    struct Event: Decodable, Equatable { let sequence: Int; let tool: String; let status: String }
    struct SourceImage: Decodable, Equatable {
        let imageIndex: Int
        enum CodingKeys: String, CodingKey { case imageIndex = "image_index" }
    }
    struct Preprocessing: Decodable, Equatable {
        struct Source: Decodable, Equatable {
            struct FollowUp: Decodable, Equatable {
                struct Region: Decodable, Equatable {
                    let left: Int; let top: Int; let width: Int; let height: Int
                }
                let reason: String; let field: String; let region: Region
            }
            let sourceImageIndex: Int
            let followUpRequired: Bool
            let followUpRegions: [FollowUp]
            enum CodingKeys: String, CodingKey {
                case sourceImageIndex = "source_image_index"
                case followUpRequired = "follow_up_required"
                case followUpRegions = "follow_up_regions"
            }
        }
        let sources: [Source]
    }
    let sourceImages: [SourceImage]?
    let taskID: String
    let revision: Int
    let status: String
    let contact: Contact?
    let captureID: String?
    let sourceResourceID: String?
    let messageCount: Int
    let extraction: Extraction?
    let preprocessing: Preprocessing?
    var contactDraft: ProfileDraft? = nil
    var reviewedProfile: ProfileDraft? = nil
    let summary: String
    let findings: [Finding]
    let profileFields: [ProfileField]
    let publicSources: [Source]
    let question: String?
    let candidates: [Candidate]
    let limitations: [String]
    let events: [Event]
    var id: String { taskID }
    enum CodingKeys: String, CodingKey {
        case sourceImages = "source_images", taskID = "task_id", revision, status, contact, captureID = "capture_id", sourceResourceID = "source_resource_id", messageCount = "message_count"
        case extraction, preprocessing, contactDraft = "contact_draft", reviewedProfile = "reviewed_profile", summary, findings, profileFields = "profile_fields", publicSources = "public_sources", question, candidates, limitations, events
    }
}

struct ScreenshotContactTaskSummary: Decodable, Identifiable {
    let taskID: String; let status: String; let contact: ScreenshotContactTask.Contact?; let summary: String
    var id: String { taskID }
    enum CodingKeys: String, CodingKey { case taskID = "task_id", status, contact, summary }
}
struct ScreenshotContactTaskList: Decodable { let tasks: [ScreenshotContactTaskSummary] }
struct ContactIntelligenceEnvelope: Decodable { let tasks: [ScreenshotContactTask] }

struct ScreenshotContactTaskBody: Encodable {
    struct Image: Encodable {
        let mediaType: String; let byteSize: Int; let contentHash: String; let dataBase64: String
        init(data: Data, mediaType: String) {
            self.mediaType = mediaType; byteSize = data.count
            contentHash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            dataBase64 = data.base64EncodedString()
        }
        enum CodingKeys: String, CodingKey { case mediaType = "media_type", byteSize = "byte_size", contentHash = "content_hash", dataBase64 = "data_base64" }
    }
    let idempotencyKey: String
    let objective: String
    let image: Image
    let additionalImages: [Image]?
    let selectedPersonID: String?
    let selectedRelationshipContextID: String?
    let allowPublicResearch: Bool
    let preprocessOnly: Bool?
    let capturedAt: String
    init(idempotencyKey: String, objective: String, data: Data, mediaType: String, personID: String?, contextID: String?, capturedAt: Date = Date(), preprocessOnly: Bool = false, allowPublicResearch: Bool = true) {
        self.init(idempotencyKey: idempotencyKey, objective: objective, images: [Image(data: data, mediaType: mediaType)], personID: personID, contextID: contextID, capturedAt: capturedAt, preprocessOnly: preprocessOnly, allowPublicResearch: allowPublicResearch)
    }
    init(idempotencyKey: String, objective: String, images: [Image], personID: String?, contextID: String?, capturedAt: Date = Date(), preprocessOnly: Bool = false, allowPublicResearch: Bool = true) {
        precondition(!images.isEmpty && images.count <= 10)
        self.idempotencyKey = idempotencyKey; self.objective = objective
        image = images[0]; additionalImages = images.count > 1 ? Array(images.dropFirst()) : nil
        selectedPersonID = personID; selectedRelationshipContextID = contextID; self.allowPublicResearch = allowPublicResearch
        self.preprocessOnly = preprocessOnly ? true : nil
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        // PendingCaptureInbox persists ISO-8601 dates at second precision. Use
        // the same precision on the first request so a retry after an app
        // restart keeps the idempotency request hash identical.
        let stableCapturedAt = Date(
            timeIntervalSince1970: floor(capturedAt.timeIntervalSince1970)
        )
        self.capturedAt = formatter.string(from: stableCapturedAt)
    }
    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key", objective, image, additionalImages = "additional_images", selectedPersonID = "selected_person_id", selectedRelationshipContextID = "selected_relationship_context_id", allowPublicResearch = "allow_public_research", preprocessOnly = "preprocess_only", capturedAt = "captured_at"
    }
}

struct ScreenshotContactResumeBody: Encodable {
    let expectedRevision: Int
    var selectedPersonID: String? = nil
    var selectedRelationshipContextID: String? = nil
    var newContactName: String? = nil
    var image: ScreenshotContactTaskBody.Image? = nil
    // Local dispatch only; the explicit decision is sent to its dedicated endpoint.
    var profileConfirmation: ScreenshotContactProfileConfirmation? = nil
    enum CodingKeys: String, CodingKey { case expectedRevision = "expected_revision", selectedPersonID = "selected_person_id", selectedRelationshipContextID = "selected_relationship_context_id", newContactName = "new_contact_name", image }
}

struct ScreenshotContactProfileConfirmation: Encodable {
    struct Field: Encodable {
        let clueIndex: Int; let value: String
        enum CodingKeys: String, CodingKey { case clueIndex = "clue_index", value }
    }
    let expectedRevision: Int
    let decision = "save_reviewed_profile"
    let displayName: String
    let fields: [Field]
    let selectedPersonID: String?
    let selectedRelationshipContextID: String?
    enum CodingKeys: String, CodingKey {
        case expectedRevision = "expected_revision", decision, displayName = "display_name", fields
        case selectedPersonID = "selected_person_id", selectedRelationshipContextID = "selected_relationship_context_id"
    }
}
