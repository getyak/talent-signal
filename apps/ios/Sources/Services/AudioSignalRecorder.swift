import AVFAudio
import CryptoKit
import Foundation

@MainActor
final class AudioSignalRecorder: NSObject, AudioSignalRecordingServing {
    private let recordsDirectoryURL: URL
    private let audioSession: AVAudioSession
    private var recorder: AVAudioRecorder?
    private var activeRecordID: UUID?
    private var activePurpose: String?
    private var activeAuthorization: AudioSignalLocalReceipt.Authorization?

    init(
        directoryURL: URL? = nil,
        audioSession: AVAudioSession = .sharedInstance()
    ) {
        let root = directoryURL
            ?? FileManager.default.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            )[0].appending(path: "AudioSignalOutbox", directoryHint: .isDirectory)
        recordsDirectoryURL = root.appending(
            path: "local-unassigned/records",
            directoryHint: .isDirectory
        )
        self.audioSession = audioSession
        super.init()
    }

    func permissionStatus() -> AudioSignalPermission {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted: return .granted
            case .denied: return .denied
            default: return .undetermined
            }
        }
        switch audioSession.recordPermission {
        case .granted: return .granted
        case .denied: return .denied
        default: return .undetermined
        }
    }

    func requestPermission() async -> AudioSignalPermission {
        let granted = await withCheckedContinuation { continuation in
            if #available(iOS 17.0, *) {
                AVAudioApplication.requestRecordPermission { value in
                    continuation.resume(returning: value)
                }
            } else {
                audioSession.requestRecordPermission { value in
                    continuation.resume(returning: value)
                }
            }
        }
        return granted ? .granted : .denied
    }

    func start(
        recordID: UUID,
        purpose: String,
        authorization: AudioSignalLocalReceipt.Authorization
    ) throws {
        guard recorder == nil else { throw AudioSignalRecorderError.alreadyRecording }
        guard permissionStatus() == .granted else {
            throw AudioSignalRecorderError.permissionUnavailable
        }
        guard audioSession.isInputAvailable else {
            throw AudioSignalRecorderError.inputUnavailable
        }
        try prepareDirectory()
        let audioURL = self.audioURL(for: recordID)
        if FileManager.default.fileExists(atPath: audioURL.path) {
            try FileManager.default.removeItem(at: audioURL)
        }
        do {
            try audioSession.setCategory(.record, mode: .spokenAudio)
            try audioSession.setActive(true)
            let candidate = try AVAudioRecorder(
                url: audioURL,
                settings: [
                    AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                    AVSampleRateKey: 44_100,
                    AVNumberOfChannelsKey: 1,
                    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
                ]
            )
            guard candidate.prepareToRecord(), candidate.record() else {
                throw AudioSignalRecorderError.startFailed
            }
            try protect(audioURL)
            recorder = candidate
            activeRecordID = recordID
            activePurpose = purpose
            activeAuthorization = authorization
        } catch {
            try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            try? removeIfPresent(audioURL)
            recorder = nil
            activeRecordID = nil
            activePurpose = nil
            activeAuthorization = nil
            throw error
        }
    }

    func stop() throws -> AudioSignalLocalReceipt {
        guard let recorder, recorder.isRecording,
              let recordID = activeRecordID,
              let purpose = activePurpose,
              let authorization = activeAuthorization else {
            throw AudioSignalRecorderError.notRecording
        }
        let duration = recorder.currentTime
        recorder.stop()
        self.recorder = nil
        activeRecordID = nil
        activePurpose = nil
        activeAuthorization = nil
        try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)

        let url = audioURL(for: recordID)
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        let byteCount = (attributes[.size] as? NSNumber)?.intValue ?? 0
        guard byteCount > 0 else {
            try? removeIfPresent(url)
            throw AudioSignalRecorderError.emptyRecording
        }
        try protect(url)
        let receipt = AudioSignalLocalReceipt(
            id: recordID,
            fileName: url.lastPathComponent,
            contentHash: try sha256(url),
            byteCount: byteCount,
            durationSeconds: duration,
            createdAt: Date(),
            purpose: purpose,
            authorization: authorization,
            status: "saved_local"
        )
        let metadataURL = self.metadataURL(for: recordID)
        try JSONEncoder.audioSignalEncoder.encode(receipt).write(
            to: metadataURL,
            options: [.atomic, .completeFileProtection]
        )
        try protect(metadataURL)
        return receipt
    }

    func discardActiveRecording() throws {
        guard let recorder else { return }
        let recordID = activeRecordID
        if recorder.isRecording { recorder.stop() }
        self.recorder = nil
        activeRecordID = nil
        activePurpose = nil
        activeAuthorization = nil
        try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        if let recordID { try removeIfPresent(audioURL(for: recordID)) }
    }

    func latestReceipt() throws -> AudioSignalLocalReceipt? {
        try prepareDirectory()
        return try FileManager.default.contentsOfDirectory(
            at: recordsDirectoryURL,
            includingPropertiesForKeys: nil
        )
        .filter { $0.lastPathComponent.hasSuffix(".metadata.json") }
        .compactMap { url in
            try? JSONDecoder.audioSignalDecoder.decode(
                AudioSignalLocalReceipt.self,
                from: Data(contentsOf: url)
            )
        }
        .sorted {
            if $0.createdAt == $1.createdAt {
                return $0.id.uuidString < $1.id.uuidString
            }
            return $0.createdAt > $1.createdAt
        }
        .first
    }

    func delete(_ receipt: AudioSignalLocalReceipt) throws {
        guard receipt.status == "saved_local" else {
            throw AudioSignalRecorderError.invalidReceipt
        }
        try prepareDirectory()
        try removeIfPresent(audioURL(for: receipt.id))
        try removeIfPresent(metadataURL(for: receipt.id))
    }

    private func prepareDirectory() throws {
        try FileManager.default.createDirectory(
            at: recordsDirectoryURL,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
    }

    private func audioURL(for id: UUID) -> URL {
        recordsDirectoryURL.appending(path: "\(id.uuidString.lowercased()).m4a")
    }

    private func metadataURL(for id: UUID) -> URL {
        recordsDirectoryURL.appending(path: "\(id.uuidString.lowercased()).metadata.json")
    }

    private func protect(_ url: URL) throws {
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: url.path
        )
    }

    private func removeIfPresent(_ url: URL) throws {
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        try FileManager.default.removeItem(at: url)
    }

    private func sha256(_ url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var digest = SHA256()
        while let data = try handle.read(upToCount: 64 * 1_024), !data.isEmpty {
            digest.update(data: data)
        }
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }
}

enum AudioSignalRecorderError: LocalizedError, Equatable {
    case alreadyRecording
    case permissionUnavailable
    case inputUnavailable
    case startFailed
    case notRecording
    case emptyRecording
    case invalidReceipt

    var errorDescription: String? {
        switch self {
        case .alreadyRecording:
            return "A foreground recording is already active."
        case .permissionUnavailable:
            return "Microphone permission is unavailable. No recording started."
        case .inputUnavailable:
            return "No microphone input is available. No recording started."
        case .startFailed:
            return "The audio session could not start. No recording is active."
        case .notRecording:
            return "There is no active recording to stop."
        case .emptyRecording:
            return "The recording contained no audio payload and was not saved."
        case .invalidReceipt:
            return "The local recording receipt could not be verified."
        }
    }
}

private extension JSONEncoder {
    static let audioSignalEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()
}

private extension JSONDecoder {
    static let audioSignalDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

#if DEBUG
@MainActor
final class DeterministicAudioSignalRecorder: AudioSignalRecordingServing {
    private var recording = false
    private var receipt: AudioSignalLocalReceipt?
    private var recordID: UUID?
    private var purpose = ""
    private var authorization: AudioSignalLocalReceipt.Authorization?

    func permissionStatus() -> AudioSignalPermission { .granted }
    func requestPermission() async -> AudioSignalPermission { .granted }

    func start(
        recordID: UUID,
        purpose: String,
        authorization: AudioSignalLocalReceipt.Authorization
    ) throws {
        guard !recording else { throw AudioSignalRecorderError.alreadyRecording }
        recording = true
        self.recordID = recordID
        self.purpose = purpose
        self.authorization = authorization
    }

    func stop() throws -> AudioSignalLocalReceipt {
        guard recording, let recordID, let authorization else {
            throw AudioSignalRecorderError.notRecording
        }
        recording = false
        let value = AudioSignalLocalReceipt(
            id: recordID,
            fileName: "\(recordID.uuidString.lowercased()).m4a",
            contentHash: String(repeating: "a", count: 64),
            byteCount: 4_096,
            durationSeconds: 3.2,
            createdAt: Date(),
            purpose: purpose,
            authorization: authorization,
            status: "saved_local"
        )
        receipt = value
        return value
    }

    func discardActiveRecording() throws {
        recording = false
        authorization = nil
    }
    func latestReceipt() throws -> AudioSignalLocalReceipt? { receipt }
    func delete(_ receipt: AudioSignalLocalReceipt) throws {
        guard self.receipt == receipt else { throw AudioSignalRecorderError.invalidReceipt }
        self.receipt = nil
    }
}

@MainActor
final class DeterministicVoiceDictationRecorder:
    VoiceDictationRecordingServing {
    private var activeID: UUID?

    func permissionStatus() -> AudioSignalPermission { .granted }
    func requestPermission() async -> AudioSignalPermission { .granted }

    func start(recordID: UUID) throws {
        guard activeID == nil else {
            throw VoiceDictationRecorderError.alreadyRecording
        }
        activeID = recordID
    }

    func stop() throws -> VoiceDictationPayload {
        guard let activeID else {
            throw VoiceDictationRecorderError.notRecording
        }
        self.activeID = nil
        return VoiceDictationPayload(
            id: activeID,
            fileURL: URL(
                fileURLWithPath: "/tmp/\(activeID.uuidString.lowercased()).wav"
            ),
            byteCount: 1_024,
            durationSeconds: 1.2,
            mimeType: "audio/wav"
        )
    }

    func cancel() throws { activeID = nil }
    func delete(_ payload: VoiceDictationPayload) throws {}
}

actor DeterministicVoiceTranscriber: VoiceTranscriptionServing {
    func transcribe(
        _ payload: VoiceDictationPayload
    ) async throws -> VoiceTranscriptionDraft {
        try await Task.sleep(for: .milliseconds(250))
        return VoiceTranscriptionDraft(
            audioDurationMilliseconds: 1_200,
            clientRequestID: payload.id,
            model: "deterministic-bigmodel",
            provider: "doubao",
            providerRequestID: UUID(),
            status: "draft",
            temporaryAudioStoredByTalentSignal: false,
            transcript: "What changed in this search?"
        )
    }
}
#endif

@MainActor
final class VoiceDictationRecorder: NSObject, VoiceDictationRecordingServing {
    private let recordsDirectoryURL: URL
    private let audioSession: AVAudioSession
    private var recorder: AVAudioRecorder?
    private var activeRecordID: UUID?

    init(
        directoryURL: URL? = nil,
        audioSession: AVAudioSession = .sharedInstance()
    ) {
        recordsDirectoryURL = directoryURL
            ?? FileManager.default.temporaryDirectory.appending(
                path: "TalentSignalVoiceInput",
                directoryHint: .isDirectory
            )
        self.audioSession = audioSession
        super.init()
    }

    func permissionStatus() -> AudioSignalPermission {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted: return .granted
            case .denied: return .denied
            default: return .undetermined
            }
        }
        switch audioSession.recordPermission {
        case .granted: return .granted
        case .denied: return .denied
        default: return .undetermined
        }
    }

    func requestPermission() async -> AudioSignalPermission {
        let granted = await withCheckedContinuation { continuation in
            if #available(iOS 17.0, *) {
                AVAudioApplication.requestRecordPermission { value in
                    continuation.resume(returning: value)
                }
            } else {
                audioSession.requestRecordPermission { value in
                    continuation.resume(returning: value)
                }
            }
        }
        return granted ? .granted : .denied
    }

    func start(recordID: UUID) throws {
        guard recorder == nil else {
            throw VoiceDictationRecorderError.alreadyRecording
        }
        guard permissionStatus() == .granted else {
            throw VoiceDictationRecorderError.permissionUnavailable
        }
        guard audioSession.isInputAvailable else {
            throw VoiceDictationRecorderError.inputUnavailable
        }
        try prepareDirectory()
        let url = audioURL(for: recordID)
        try removeIfPresent(url)
        do {
            try audioSession.setCategory(.record, mode: .spokenAudio)
            try audioSession.setActive(true)
            let candidate = try AVAudioRecorder(
                url: url,
                settings: [
                    AVFormatIDKey: Int(kAudioFormatLinearPCM),
                    AVSampleRateKey: 16_000,
                    AVNumberOfChannelsKey: 1,
                    AVLinearPCMBitDepthKey: 16,
                    AVLinearPCMIsBigEndianKey: false,
                    AVLinearPCMIsFloatKey: false,
                    AVLinearPCMIsNonInterleaved: false,
                ]
            )
            guard candidate.prepareToRecord(), candidate.record() else {
                throw VoiceDictationRecorderError.startFailed
            }
            try protect(url)
            recorder = candidate
            activeRecordID = recordID
        } catch {
            try? audioSession.setActive(
                false,
                options: .notifyOthersOnDeactivation
            )
            try? removeIfPresent(url)
            recorder = nil
            activeRecordID = nil
            throw error
        }
    }

    func stop() throws -> VoiceDictationPayload {
        guard let recorder, recorder.isRecording, let activeRecordID else {
            throw VoiceDictationRecorderError.notRecording
        }
        let duration = recorder.currentTime
        recorder.stop()
        self.recorder = nil
        self.activeRecordID = nil
        try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)

        let url = audioURL(for: activeRecordID)
        let attributes = try FileManager.default.attributesOfItem(
            atPath: url.path
        )
        let byteCount = (attributes[.size] as? NSNumber)?.intValue ?? 0
        guard byteCount > 44 else {
            try? removeIfPresent(url)
            throw VoiceDictationRecorderError.emptyRecording
        }
        try protect(url)
        return VoiceDictationPayload(
            id: activeRecordID,
            fileURL: url,
            byteCount: byteCount,
            durationSeconds: duration,
            mimeType: "audio/wav"
        )
    }

    func cancel() throws {
        let recordID = activeRecordID
        if recorder?.isRecording == true { recorder?.stop() }
        recorder = nil
        activeRecordID = nil
        try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        if let recordID { try removeIfPresent(audioURL(for: recordID)) }
    }

    func delete(_ payload: VoiceDictationPayload) throws {
        guard payload.fileURL.deletingLastPathComponent().standardizedFileURL
            == recordsDirectoryURL.standardizedFileURL else {
            throw VoiceDictationRecorderError.invalidPayload
        }
        try removeIfPresent(payload.fileURL)
    }

    private func prepareDirectory() throws {
        try FileManager.default.createDirectory(
            at: recordsDirectoryURL,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
    }

    private func audioURL(for id: UUID) -> URL {
        recordsDirectoryURL.appending(
            path: "\(id.uuidString.lowercased()).wav"
        )
    }

    private func protect(_ url: URL) throws {
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: url.path
        )
    }

    private func removeIfPresent(_ url: URL) throws {
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        try FileManager.default.removeItem(at: url)
    }
}

enum VoiceDictationRecorderError: LocalizedError, Equatable {
    case alreadyRecording
    case emptyRecording
    case inputUnavailable
    case invalidPayload
    case notRecording
    case permissionUnavailable
    case startFailed

    var errorDescription: String? {
        switch self {
        case .alreadyRecording:
            return "Voice input is already listening."
        case .emptyRecording:
            return "No voice was recorded. Try one short phrase."
        case .inputUnavailable:
            return "No microphone input is available."
        case .invalidPayload:
            return "The temporary voice recording could not be verified."
        case .notRecording:
            return "Voice input is not recording."
        case .permissionUnavailable:
            return "Microphone permission is unavailable."
        case .startFailed:
            return "Voice input could not start the microphone."
        }
    }
}

actor URLVoiceTranscriptionClient: VoiceTranscriptionServing {
    private let baseURL: URL
    private let accessToken: String
    private let session: URLSession

    init(
        baseURL: URL,
        accessToken: String,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.accessToken = accessToken
        self.session = session
    }

    func transcribe(
        _ payload: VoiceDictationPayload
    ) async throws -> VoiceTranscriptionDraft {
        guard payload.mimeType == "audio/wav",
              payload.byteCount > 44,
              !accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
                .isEmpty else {
            throw VoiceTranscriptionClientError.invalidRequest
        }
        let audio = try Data(contentsOf: payload.fileURL)
        guard audio.count == payload.byteCount else {
            throw VoiceTranscriptionClientError.invalidRequest
        }
        let body = VoiceTranscriptionRequest(
            audioBase64: audio.base64EncodedString(),
            clientRequestID: payload.id,
            mimeType: payload.mimeType
        )
        var request = URLRequest(
            url: baseURL.appending(path: "v1/voice-transcriptions")
        )
        request.httpMethod = "POST"
        request.setValue(
            "Bearer \(accessToken)",
            forHTTPHeaderField: "authorization"
        )
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(body)
        request.timeoutInterval = 50

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw VoiceTranscriptionClientError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = try? JSONDecoder().decode(
                VoiceTranscriptionErrorEnvelope.self,
                from: data
            ).error.message
            throw VoiceTranscriptionClientError.backend(
                message ?? "Voice transcription did not return a draft."
            )
        }
        let draft = try JSONDecoder().decode(
            VoiceTranscriptionDraft.self,
            from: data
        )
        guard draft.clientRequestID == payload.id,
              draft.provider == "doubao",
              draft.status == "draft",
              draft.temporaryAudioStoredByTalentSignal == false,
              !draft.transcript.trimmingCharacters(
                in: .whitespacesAndNewlines
              ).isEmpty else {
            throw VoiceTranscriptionClientError.invalidResponse
        }
        return draft
    }
}

private struct VoiceTranscriptionRequest: Encodable {
    let audioBase64: String
    let clientRequestID: UUID
    let mimeType: String

    enum CodingKeys: String, CodingKey {
        case audioBase64 = "audio_base64"
        case clientRequestID = "client_request_id"
        case mimeType = "mime_type"
    }
}

private struct VoiceTranscriptionErrorEnvelope: Decodable {
    struct Body: Decodable {
        let message: String
    }

    let error: Body
}

enum VoiceTranscriptionClientError: LocalizedError, Equatable {
    case backend(String)
    case invalidRequest
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case let .backend(message):
            return message
        case .invalidRequest:
            return "The temporary voice recording could not be verified."
        case .invalidResponse:
            return "Voice transcription returned an invalid draft."
        }
    }
}
