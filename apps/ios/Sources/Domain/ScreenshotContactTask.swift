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
        let text: String
        let speakerSide: String
        let timeText: String?
        let sourceImageIndex: Int?
        var id: String { messageID }
        enum CodingKeys: String, CodingKey { case messageID = "message_id", text, speakerSide = "speaker_side", timeText = "time_text", sourceImageIndex = "source_image_index" }
    }
    struct Extraction: Decodable, Equatable { let messages: [Message]; let uncertainties: [String] }
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
    let sourceImages: [SourceImage]?
    let taskID: String
    let revision: Int
    let status: String
    let contact: Contact?
    let captureID: String?
    let sourceResourceID: String?
    let messageCount: Int
    let extraction: Extraction?
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
        case extraction, summary, findings, profileFields = "profile_fields", publicSources = "public_sources", question, candidates, limitations, events
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
    let capturedAt: String
    init(idempotencyKey: String, objective: String, data: Data, mediaType: String, personID: String?, contextID: String?, capturedAt: Date = Date()) {
        self.init(idempotencyKey: idempotencyKey, objective: objective, images: [Image(data: data, mediaType: mediaType)], personID: personID, contextID: contextID, capturedAt: capturedAt)
    }
    init(idempotencyKey: String, objective: String, images: [Image], personID: String?, contextID: String?, capturedAt: Date = Date()) {
        precondition(!images.isEmpty && images.count <= 10)
        self.idempotencyKey = idempotencyKey; self.objective = objective
        image = images[0]; additionalImages = images.count > 1 ? Array(images.dropFirst()) : nil
        selectedPersonID = personID; selectedRelationshipContextID = contextID; allowPublicResearch = true
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        self.capturedAt = formatter.string(from: capturedAt)
    }
    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key", objective, image, additionalImages = "additional_images", selectedPersonID = "selected_person_id", selectedRelationshipContextID = "selected_relationship_context_id", allowPublicResearch = "allow_public_research", capturedAt = "captured_at"
    }
}

struct ScreenshotContactResumeBody: Encodable {
    let expectedRevision: Int
    var selectedPersonID: String? = nil
    var selectedRelationshipContextID: String? = nil
    var newContactName: String? = nil
    var image: ScreenshotContactTaskBody.Image? = nil
    enum CodingKeys: String, CodingKey { case expectedRevision = "expected_revision", selectedPersonID = "selected_person_id", selectedRelationshipContextID = "selected_relationship_context_id", newContactName = "new_contact_name", image }
}
