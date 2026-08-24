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
#endif
