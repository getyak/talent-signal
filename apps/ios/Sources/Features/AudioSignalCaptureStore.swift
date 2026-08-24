import Foundation

@MainActor
final class AudioSignalCaptureStore: ObservableObject {
    enum Phase: Equatable {
        case idle
        case requestingPermission
        case preparing
        case recording(startedAt: Date)
        case saved(AudioSignalLocalReceipt)
        case failed(String)
        case deleting
        case deleted
    }

    @Published var purpose = "Preserve an authorized conversation moment for recruiter review"
    @Published var authorizationBasis = ""
    @Published var authorizingParty = ""
    @Published var authorizationConfirmed = false
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var notice: String?

    private let recorder: AudioSignalRecordingServing
    private var activeID = UUID()

    init(recorder: AudioSignalRecordingServing) {
        self.recorder = recorder
    }

    convenience init() {
        self.init(recorder: AudioSignalRecorder())
    }

    var canStart: Bool {
        guard authorizationConfirmed,
              !purpose.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !authorizationBasis.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !authorizingParty.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }
        switch phase {
        case .idle, .failed, .deleted: return true
        default: return false
        }
    }

    var isRecording: Bool {
        if case .recording = phase { return true }
        return false
    }

    func restore() {
        guard phase == .idle else { return }
        do {
            if let receipt = try recorder.latestReceipt() {
                phase = .saved(receipt)
            }
        } catch {
            phase = .failed("Local recording metadata could not be verified: \(error.localizedDescription)")
        }
    }

    func start(sceneIsActive: Bool) async {
        guard canStart else { return }
        guard sceneIsActive else {
            phase = .failed("Open Talent Signal in the foreground before recording. No recording started.")
            return
        }
        notice = nil
        var permission = recorder.permissionStatus()
        if permission == .undetermined {
            phase = .requestingPermission
            permission = await recorder.requestPermission()
        }
        guard permission == .granted else {
            phase = .failed("Microphone permission was not granted. No recording started.")
            return
        }
        phase = .preparing
        do {
            activeID = UUID()
            try recorder.start(
                recordID: activeID,
                purpose: purpose.trimmingCharacters(in: .whitespacesAndNewlines),
                authorization: .init(
                    basis: authorizationBasis.trimmingCharacters(in: .whitespacesAndNewlines),
                    authorizingParty: authorizingParty.trimmingCharacters(in: .whitespacesAndNewlines),
                    attestedBy: "Current local recruiter",
                    scope: purpose.trimmingCharacters(in: .whitespacesAndNewlines),
                    recordedAt: Date()
                )
            )
            phase = .recording(startedAt: Date())
        } catch {
            try? recorder.discardActiveRecording()
            phase = .failed(error.localizedDescription)
        }
    }

    func stop() {
        guard isRecording else { return }
        do {
            phase = .saved(try recorder.stop())
        } catch {
            try? recorder.discardActiveRecording()
            phase = .failed("Recording stopped without a durable receipt: \(error.localizedDescription)")
        }
    }

    func stopForForegroundLoss() {
        guard isRecording else { return }
        do {
            let receipt = try recorder.stop()
            notice = "Recording stopped because Talent Signal left the foreground. The completed local payload is recoverable."
            phase = .saved(receipt)
        } catch {
            try? recorder.discardActiveRecording()
            phase = .failed("The foreground recording was interrupted and no verified payload was saved.")
        }
    }

    func delete() {
        guard case let .saved(receipt) = phase else { return }
        phase = .deleting
        do {
            try recorder.delete(receipt)
            purpose = "Preserve an authorized conversation moment for recruiter review"
            authorizationBasis = ""
            authorizingParty = ""
            authorizationConfirmed = false
            notice = nil
            phase = .deleted
        } catch {
            phase = .failed("The local recording was not deleted: \(error.localizedDescription)")
        }
    }
}
