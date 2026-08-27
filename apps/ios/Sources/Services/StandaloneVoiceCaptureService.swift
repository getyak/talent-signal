import AVFAudio
import Foundation
import Speech

@MainActor
final class StandaloneVoiceCaptureService: NSObject, ObservableObject {
    enum Phase: Equatable {
        case idle
        case requestingPermission
        case recording(startedAt: Date)
        case transcribing
        case ready(fileName: String)
        case failed(String)
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var transcript = ""
    @Published private(set) var elapsedSeconds = 0

    private let audioSession: AVAudioSession
    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var temporaryURL: URL?
    private var finalURL: URL?
    private var liveSpeechRecorder: Any?
    private let activityCoordinator = StandaloneRecordingActivityCoordinator()
    private var interruptionObserver: NSObjectProtocol?
    private var mediaServicesResetObserver: NSObjectProtocol?

    init(audioSession: AVAudioSession = .sharedInstance()) {
        self.audioSession = audioSession
        super.init()
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: audioSession,
            queue: .main
        ) { [weak self] notification in
            guard let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: rawType) == .began else { return }
            Task { @MainActor in self?.stopForInterruption() }
        }
        mediaServicesResetObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification,
            object: audioSession,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.stopForInterruption() }
        }
    }

    deinit {
        if let interruptionObserver {
            NotificationCenter.default.removeObserver(interruptionObserver)
        }
        if let mediaServicesResetObserver {
            NotificationCenter.default.removeObserver(mediaServicesResetObserver)
        }
    }

    var isRecording: Bool {
        if case .recording = phase { return true }
        return false
    }

    func start(draftID: UUID, authorizationConfirmed: Bool) async {
        guard !isRecording else { return }
        guard authorizationConfirmed else {
            phase = .failed("Confirm that this purpose-bound capture is authorized before recording.")
            return
        }
        phase = .requestingPermission
        let granted = await requestMicrophonePermission()
        guard granted else {
            phase = .failed("Microphone permission was not granted. Your draft remains available for typed input.")
            return
        }
        do {
            let directory = try recordingsDirectory()
            let temporaryURL = directory.appending(path: "\(draftID.uuidString.lowercased()).recording.m4a")
            let finalURL = directory.appending(path: "\(draftID.uuidString.lowercased()).m4a")
            try removeIfPresent(temporaryURL)
            try audioSession.setCategory(.record, mode: .spokenAudio)
            try audioSession.setActive(true)
            if #available(iOS 26.0, *) {
                let liveTemporaryURL = directory.appending(
                    path: "\(draftID.uuidString.lowercased()).recording.caf"
                )
                let liveFinalURL = directory.appending(
                    path: "\(draftID.uuidString.lowercased()).caf"
                )
                try removeIfPresent(liveTemporaryURL)
                try removeIfPresent(liveFinalURL)
                if let liveRecorder = try? await StandaloneLiveSpeechRecorder.start(
                    temporaryURL: liveTemporaryURL,
                    finalURL: liveFinalURL,
                    locale: .current,
                    transcriptUpdate: { [weak self] text in
                        Task { @MainActor in self?.transcript = text }
                    }
                ) {
                    liveSpeechRecorder = liveRecorder
                    self.temporaryURL = liveTemporaryURL
                    self.finalURL = liveFinalURL
                    transcript = ""
                    elapsedSeconds = 0
                    phase = .recording(startedAt: Date())
                    await activityCoordinator.start(draftID: draftID)
                    startTimer()
                    return
                }
                try? removeIfPresent(liveTemporaryURL)
                try? removeIfPresent(liveFinalURL)
            }
            let recorder = try AVAudioRecorder(
                url: temporaryURL,
                settings: [
                    AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                    AVSampleRateKey: 44_100,
                    AVNumberOfChannelsKey: 1,
                    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
                ]
            )
            guard recorder.prepareToRecord(), recorder.record() else {
                throw StandaloneVoiceCaptureError.startFailed
            }
            self.recorder = recorder
            self.temporaryURL = temporaryURL
            self.finalURL = finalURL
            transcript = ""
            elapsedSeconds = 0
            phase = .recording(startedAt: Date())
            await activityCoordinator.start(draftID: draftID)
            startTimer()
        } catch {
            try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            phase = .failed("Recording could not start. Your draft is unchanged: \(error.localizedDescription)")
        }
    }

    func stopAndTranscribe(locale: Locale = .current) async -> String? {
        if #available(iOS 26.0, *),
           let liveRecorder = liveSpeechRecorder as? StandaloneLiveSpeechRecorder {
            timer?.invalidate()
            timer = nil
            liveSpeechRecorder = nil
            phase = .transcribing
            await activityCoordinator.markOrganizing()
            try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            do {
                let result = try await liveRecorder.stop()
                transcript = result.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
                phase = .ready(fileName: result.fileName)
                await activityCoordinator.markReadyToReview()
                return transcript.isEmpty ? nil : transcript
            } catch {
                phase = .failed("The live transcript could not be finalized. The typed Draft remains available.")
                await activityCoordinator.end(dismissImmediately: true)
                return nil
            }
        }
        guard let recorder else {
            await failActiveRecordingIfNeeded()
            return nil
        }
        timer?.invalidate()
        timer = nil
        recorder.stop()
        self.recorder = nil
        try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        let sealedURL: URL
        do {
            sealedURL = try sealFallbackRecording()
        } catch {
            phase = .failed("The recording could not be finalized. The local typed Draft remains available.")
            await activityCoordinator.end(dismissImmediately: true)
            return nil
        }
        phase = .transcribing
        await activityCoordinator.markOrganizing()
        do {
            let text = try await transcribe(fileURL: sealedURL, locale: locale)
            transcript = text.trimmingCharacters(in: .whitespacesAndNewlines)
            phase = .ready(fileName: sealedURL.lastPathComponent)
            await activityCoordinator.markReadyToReview()
            return transcript.isEmpty ? nil : transcript
        } catch {
            phase = .ready(fileName: sealedURL.lastPathComponent)
            transcript = ""
            await activityCoordinator.markReadyToReview()
            return nil
        }
    }

    func stopForInterruption() {
        if #available(iOS 26.0, *), liveSpeechRecorder is StandaloneLiveSpeechRecorder {
            Task { _ = await stopAndTranscribe() }
            return
        }
        guard isRecording else { return }
        timer?.invalidate()
        timer = nil
        recorder?.stop()
        self.recorder = nil
        try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        do {
            let finalURL = try sealFallbackRecording()
            phase = .ready(fileName: finalURL.lastPathComponent)
            Task { await activityCoordinator.markReadyToReview() }
        } catch {
            phase = .failed("Recording was interrupted. The local draft is still available for typed input.")
            Task { await activityCoordinator.end(dismissImmediately: true) }
        }
    }

    func cancel() {
        timer?.invalidate()
        timer = nil
        recorder?.stop()
        recorder = nil
        if #available(iOS 26.0, *),
           let liveRecorder = liveSpeechRecorder as? StandaloneLiveSpeechRecorder {
            liveSpeechRecorder = nil
            Task { await liveRecorder.cancel() }
        }
        try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        if let temporaryURL { try? removeIfPresent(temporaryURL) }
        phase = .idle
        Task { await activityCoordinator.end(dismissImmediately: true) }
    }

    private func requestMicrophonePermission() async -> Bool {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted: return true
            case .denied: return false
            default:
                return await withCheckedContinuation { continuation in
                    AVAudioApplication.requestRecordPermission {
                        continuation.resume(returning: $0)
                    }
                }
            }
        }
        switch audioSession.recordPermission {
        case .granted: return true
        case .denied: return false
        default:
            return await withCheckedContinuation { continuation in
                audioSession.requestRecordPermission {
                    continuation.resume(returning: $0)
                }
            }
        }
    }

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.elapsedSeconds += 1 }
        }
    }

    private func recordingsDirectory() throws -> URL {
        let directory = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        .appending(path: "StandaloneOnboarding", directoryHint: .isDirectory)
        .appending(path: "Recordings", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
        return directory
    }

    private func removeIfPresent(_ url: URL) throws {
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        try FileManager.default.removeItem(at: url)
    }

    private func sealFallbackRecording() throws -> URL {
        guard let temporaryURL, let finalURL,
              FileManager.default.fileExists(atPath: temporaryURL.path) else {
            throw StandaloneVoiceCaptureError.interruptedBeforeFileWasReady
        }
        try removeIfPresent(finalURL)
        try FileManager.default.moveItem(at: temporaryURL, to: finalURL)
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: finalURL.path
        )
        return finalURL
    }

    private func failActiveRecordingIfNeeded() async {
        guard isRecording else { return }
        timer?.invalidate()
        timer = nil
        try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        phase = .failed("Recording stopped before it could be finalized. The local draft remains available for typed input.")
        await activityCoordinator.end(dismissImmediately: true)
    }

    private func transcribe(fileURL: URL, locale: Locale) async throws -> String {
        guard #available(iOS 26.0, *) else {
            throw StandaloneVoiceCaptureError.transcriptionUnavailable
        }
        let authorization = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
        guard authorization == .authorized else {
            throw StandaloneVoiceCaptureError.transcriptionUnavailable
        }
        guard SpeechTranscriber.isAvailable,
              let supportedLocale = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else {
            throw StandaloneVoiceCaptureError.transcriptionUnavailable
        }
        let transcriber = SpeechTranscriber(
            locale: supportedLocale,
            preset: .progressiveTranscription
        )
        let modules: [any SpeechModule] = [transcriber]
        let status = await AssetInventory.status(forModules: modules)
        switch status {
        case .installed:
            break
        case .supported, .downloading:
            if let request = try await AssetInventory.assetInstallationRequest(supporting: modules) {
                try await request.downloadAndInstall()
            }
        case .unsupported:
            throw StandaloneVoiceCaptureError.transcriptionUnavailable
        @unknown default:
            throw StandaloneVoiceCaptureError.transcriptionUnavailable
        }
        let audioFile = try AVAudioFile(forReading: fileURL)
        let analyzer = SpeechAnalyzer(modules: modules)
        let resultTask = Task<String, Error> {
            var latest = ""
            for try await result in transcriber.results {
                latest = String(result.text.characters)
            }
            return latest
        }
        _ = try await analyzer.analyzeSequence(from: audioFile)
        try await analyzer.finalizeAndFinishThroughEndOfInput()
        return try await resultTask.value
    }
}

@available(iOS 26.0, *)
private final class StandaloneLiveSpeechRecorder {
    struct Result {
        let fileName: String
        let transcript: String
    }

    private let engine: AVAudioEngine
    private let audioFile: AVAudioFile
    private let analyzer: SpeechAnalyzer
    private let inputContinuation: AsyncStream<AnalyzerInput>.Continuation
    private let analysisTask: Task<Void, Error>
    private let resultTask: Task<String, Error>
    private let temporaryURL: URL
    private let finalURL: URL

    private init(
        engine: AVAudioEngine,
        audioFile: AVAudioFile,
        analyzer: SpeechAnalyzer,
        inputContinuation: AsyncStream<AnalyzerInput>.Continuation,
        analysisTask: Task<Void, Error>,
        resultTask: Task<String, Error>,
        temporaryURL: URL,
        finalURL: URL
    ) {
        self.engine = engine
        self.audioFile = audioFile
        self.analyzer = analyzer
        self.inputContinuation = inputContinuation
        self.analysisTask = analysisTask
        self.resultTask = resultTask
        self.temporaryURL = temporaryURL
        self.finalURL = finalURL
    }

    static func start(
        temporaryURL: URL,
        finalURL: URL,
        locale: Locale,
        transcriptUpdate: @escaping @Sendable (String) -> Void
    ) async throws -> StandaloneLiveSpeechRecorder {
        let authorization = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
        guard authorization == .authorized,
              SpeechTranscriber.isAvailable,
              let supportedLocale = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else {
            throw StandaloneVoiceCaptureError.transcriptionUnavailable
        }
        let transcriber = SpeechTranscriber(
            locale: supportedLocale,
            preset: .progressiveTranscription
        )
        let modules: [any SpeechModule] = [transcriber]
        let status = await AssetInventory.status(forModules: modules)
        switch status {
        case .installed:
            break
        case .supported, .downloading:
            if let request = try await AssetInventory.assetInstallationRequest(supporting: modules) {
                try await request.downloadAndInstall()
            }
        case .unsupported:
            throw StandaloneVoiceCaptureError.transcriptionUnavailable
        @unknown default:
            throw StandaloneVoiceCaptureError.transcriptionUnavailable
        }

        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
            throw StandaloneVoiceCaptureError.startFailed
        }
        let audioFile = try AVAudioFile(
            forWriting: temporaryURL,
            settings: inputFormat.settings
        )
        let analyzer = SpeechAnalyzer(modules: modules)
        try await analyzer.prepareToAnalyze(in: inputFormat)
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        let analysisTask = Task {
            try await analyzer.start(inputSequence: stream)
        }
        let resultTask = Task<String, Error> {
            var latest = ""
            for try await result in transcriber.results {
                latest = String(result.text.characters)
                transcriptUpdate(latest)
            }
            return latest
        }
        inputNode.installTap(
            onBus: 0,
            bufferSize: 1_024,
            format: inputFormat
        ) { buffer, _ in
            do {
                try audioFile.write(from: buffer)
                if let copy = buffer.standaloneCopy() {
                    continuation.yield(AnalyzerInput(buffer: copy))
                }
            } catch {
                continuation.finish()
            }
        }
        engine.prepare()
        do {
            try engine.start()
        } catch {
            inputNode.removeTap(onBus: 0)
            continuation.finish()
            analysisTask.cancel()
            resultTask.cancel()
            throw error
        }
        return StandaloneLiveSpeechRecorder(
            engine: engine,
            audioFile: audioFile,
            analyzer: analyzer,
            inputContinuation: continuation,
            analysisTask: analysisTask,
            resultTask: resultTask,
            temporaryURL: temporaryURL,
            finalURL: finalURL
        )
    }

    func stop() async throws -> Result {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        inputContinuation.finish()
        if FileManager.default.fileExists(atPath: finalURL.path) {
            try FileManager.default.removeItem(at: finalURL)
        }
        try FileManager.default.moveItem(at: temporaryURL, to: finalURL)
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: finalURL.path
        )
        let transcript: String
        do {
            try await analyzer.finalizeAndFinishThroughEndOfInput()
            _ = try await analysisTask.value
            transcript = try await resultTask.value
        } catch {
            analysisTask.cancel()
            resultTask.cancel()
            transcript = ""
        }
        return Result(fileName: finalURL.lastPathComponent, transcript: transcript)
    }

    func cancel() async {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        inputContinuation.finish()
        await analyzer.cancelAndFinishNow()
        analysisTask.cancel()
        resultTask.cancel()
        try? FileManager.default.removeItem(at: temporaryURL)
    }
}

@available(iOS 26.0, *)
private extension AVAudioPCMBuffer {
    func standaloneCopy() -> AVAudioPCMBuffer? {
        guard let copy = AVAudioPCMBuffer(
            pcmFormat: format,
            frameCapacity: frameCapacity
        ) else { return nil }
        copy.frameLength = frameLength
        let sourceBuffers = UnsafeMutableAudioBufferListPointer(mutableAudioBufferList)
        let destinationBuffers = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
        for index in sourceBuffers.indices {
            guard let source = sourceBuffers[index].mData,
                  let destination = destinationBuffers[index].mData else { continue }
            memcpy(destination, source, Int(sourceBuffers[index].mDataByteSize))
            destinationBuffers[index].mDataByteSize = sourceBuffers[index].mDataByteSize
        }
        return copy
    }
}

enum StandaloneVoiceCaptureError: LocalizedError {
    case startFailed
    case transcriptionUnavailable
    case interruptedBeforeFileWasReady

    var errorDescription: String? {
        switch self {
        case .startFailed:
            return "The foreground recorder did not start."
        case .transcriptionUnavailable:
            return "On-device transcription is unavailable. The recording remains local and you can type the Signal."
        case .interruptedBeforeFileWasReady:
            return "The interrupted recording file was not ready to seal."
        }
    }
}
