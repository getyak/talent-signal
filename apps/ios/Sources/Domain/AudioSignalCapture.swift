import Foundation

enum AudioSignalPermission: Equatable {
    case undetermined
    case denied
    case granted
}

struct AudioSignalLocalReceipt: Codable, Equatable, Identifiable {
    struct Authorization: Codable, Equatable {
        let basis: String
        let authorizingParty: String
        let attestedBy: String
        let scope: String
        let recordedAt: Date
    }

    let id: UUID
    let fileName: String
    let contentHash: String
    let byteCount: Int
    let durationSeconds: TimeInterval
    let createdAt: Date
    let purpose: String
    let authorization: Authorization
    let status: String
}

@MainActor
protocol AudioSignalRecordingServing: AnyObject {
    func permissionStatus() -> AudioSignalPermission
    func requestPermission() async -> AudioSignalPermission
    func start(
        recordID: UUID,
        purpose: String,
        authorization: AudioSignalLocalReceipt.Authorization
    ) throws
    func stop() throws -> AudioSignalLocalReceipt
    func discardActiveRecording() throws
    func latestReceipt() throws -> AudioSignalLocalReceipt?
    func delete(_ receipt: AudioSignalLocalReceipt) throws
}

struct AudioSignalCaptureSession: Equatable {
    let usesDeterministicRecorder: Bool

    static func configured(arguments: [String]) -> AudioSignalCaptureSession? {
#if DEBUG
        guard value(after: "--scenario", in: arguments) == "audio-signal-capture" else {
            return nil
        }
        return AudioSignalCaptureSession(usesDeterministicRecorder: true)
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

struct VoiceDictationPayload: Equatable, Sendable {
    let id: UUID
    let fileURL: URL
    let byteCount: Int
    let durationSeconds: TimeInterval
    let mimeType: String
}

struct VoiceTranscriptionDraft: Decodable, Equatable, Sendable {
    let audioDurationMilliseconds: Double?
    let clientRequestID: UUID
    let model: String
    let provider: String
    let providerRequestID: UUID
    let status: String
    let temporaryAudioStoredByTalentSignal: Bool
    let transcript: String

    enum CodingKeys: String, CodingKey {
        case audioDurationMilliseconds = "audio_duration_ms"
        case clientRequestID = "client_request_id"
        case model
        case provider
        case providerRequestID = "provider_request_id"
        case status
        case temporaryAudioStoredByTalentSignal =
            "temporary_audio_stored_by_talent_signal"
        case transcript
    }
}

@MainActor
protocol VoiceDictationRecordingServing: AnyObject {
    func permissionStatus() -> AudioSignalPermission
    func requestPermission() async -> AudioSignalPermission
    func prepareLiveTranscription(
        locale: Locale,
        onUpdate: @escaping (String) -> Void
    ) async
    func start(recordID: UUID) throws
    func stop() throws -> VoiceDictationPayload
    func cancel() throws
    func delete(_ payload: VoiceDictationPayload) throws
}

extension VoiceDictationRecordingServing {
    func prepareLiveTranscription(
        locale: Locale,
        onUpdate: @escaping (String) -> Void
    ) async {}
}

protocol VoiceTranscriptionServing: Sendable {
    func transcribe(_ payload: VoiceDictationPayload) async throws
        -> VoiceTranscriptionDraft
}
