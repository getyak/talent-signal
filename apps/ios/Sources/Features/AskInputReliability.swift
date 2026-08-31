import OSLog
import SwiftUI
import UIKit

/// Observes the active UIKit text input without replacing SwiftUI's native
/// `TextField`. Chinese, Japanese, and other multi-stage input methods expose
/// provisional candidates through `markedTextRange`; those candidates must not
/// enable or invoke Send until the input method commits them.
struct AskIMECompositionMonitor: UIViewRepresentable {
    let isEnabled: Bool
    let onCompositionChanged: (Bool) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onCompositionChanged: onCompositionChanged)
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isAccessibilityElement = false
        view.isUserInteractionEnabled = false
        context.coordinator.start()
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.isEnabled = isEnabled
        context.coordinator.onCompositionChanged = onCompositionChanged
        if !isEnabled {
            context.coordinator.publish(false)
        }
    }

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        coordinator.stop()
    }

    final class Coordinator {
        var isEnabled = false
        var onCompositionChanged: (Bool) -> Void

        private var observers: [NSObjectProtocol] = []
        private var lastPublished = false

        init(onCompositionChanged: @escaping (Bool) -> Void) {
            self.onCompositionChanged = onCompositionChanged
        }

        func start() {
            guard observers.isEmpty else { return }
            let center = NotificationCenter.default
            observers = [
                center.addObserver(
                    forName: UITextField.textDidChangeNotification,
                    object: nil,
                    queue: .main
                ) { [weak self] notification in
                    guard let field = notification.object as? UITextField else { return }
                    self?.read(field)
                },
                center.addObserver(
                    forName: UITextView.textDidChangeNotification,
                    object: nil,
                    queue: .main
                ) { [weak self] notification in
                    guard let view = notification.object as? UITextView else { return }
                    self?.read(view)
                },
                center.addObserver(
                    forName: UITextField.textDidEndEditingNotification,
                    object: nil,
                    queue: .main
                ) { [weak self] _ in self?.publish(false) },
                center.addObserver(
                    forName: UITextView.textDidEndEditingNotification,
                    object: nil,
                    queue: .main
                ) { [weak self] _ in self?.publish(false) },
            ]
        }

        func stop() {
            let center = NotificationCenter.default
            observers.forEach(center.removeObserver)
            observers = []
        }

        func publish(_ composing: Bool) {
            guard isEnabled || !composing, composing != lastPublished else { return }
            lastPublished = composing
            onCompositionChanged(composing)
        }

        private func read(_ input: UITextInput & UIResponder) {
            guard isEnabled, input.isFirstResponder else { return }
            publish(input.markedTextRange != nil)
        }
    }
}

/// Coarse local diagnostics for input lifecycle failures. The messages are
/// deliberately closed-vocabulary and never accept user content or identity.
enum AskInputDiagnostics {
    enum VoiceState: String {
        case idle
        case requestingPermission = "requesting_permission"
        case recording
        case transcribing
        case failed
    }

    enum SubmissionState: String {
        case idle
        case routingLocal = "routing_local"
        case requestingWorkspace = "requesting_workspace"
    }

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.talentsignal.app",
        category: "ask-input"
    )

    static func compositionChanged(isComposing: Bool) {
        let state = isComposing ? "marked" : "committed"
        logger.info(
            "composer composition=\(state, privacy: .public)"
        )
    }

    static func voiceTransition(_ state: VoiceState) {
        logger.info("voice state=\(state.rawValue, privacy: .public)")
    }

    static func submissionTransition(_ state: SubmissionState) {
        logger.info("ask submission=\(state.rawValue, privacy: .public)")
    }
}

enum AskInputCommitPolicy {
    static func canSubmit(hasCommittedInput: Bool, isComposing: Bool) -> Bool {
        hasCommittedInput && !isComposing
    }
}
