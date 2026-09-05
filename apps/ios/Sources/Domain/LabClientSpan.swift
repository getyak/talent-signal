import Foundation

struct LabClientSpan: Codable, Identifiable {
    enum Kind: String, Codable {
        case workspaceRead, relationshipTask, conversationTask, imageResearch, mediaUpload
        case imagePreparation, captureReviewPreparation
        case audioSessionPreparation, audioPayloadFinalization, voiceTranscription
        case firstDisplayCallback
        case requestEncoding, responseDecoding, statePublished, healthProbe
        var title: String {
            switch self {
            case .workspaceRead: return "Workspace read"
            case .relationshipTask: return "Relationship task client"
            case .conversationTask: return "Conversation task client"
            case .imageResearch: return "Image research client"
            case .mediaUpload: return "Media upload client"
            case .imagePreparation: return "Image source preparation"
            case .captureReviewPreparation: return "Capture review preparation"
            case .audioSessionPreparation: return "Audio session preparation"
            case .audioPayloadFinalization: return "Audio payload finalization"
            case .voiceTranscription: return "Voice transcription client"
            case .firstDisplayCallback: return "First display callback after presentation"
            case .requestEncoding: return "Request body encoding"
            case .responseDecoding: return "Response JSON decoding"
            case .statePublished: return "Workspace state updated"
            case .healthProbe: return "Health probe client"
            }
        }
    }
    enum Outcome: String, Codable { case completed, failed, cancelled, unfinished, skipped; var title: String { rawValue.capitalized } }
    let id: UUID
    let parentID: UUID?
    let kind: Kind
    let offsetMilliseconds: Double
    var durationMilliseconds: Double?
    var outcome: Outcome = .unfinished
}
