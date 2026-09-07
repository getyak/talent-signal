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

/// An empty input is a voice surface; toolbar controls and marked text retain
/// native editing ownership. Whitespace is a draft too and is never replaced.
enum AskVoiceHoldPolicy {
    static func canBegin(
        location: CGPoint,
        inputFrame: CGRect,
        voiceControlFrame: CGRect,
        draft: String,
        hasAttachments: Bool,
        isComposing: Bool,
        isDisabled: Bool
    ) -> Bool {
        draft.isEmpty && !hasAttachments && !isComposing && !isDisabled
            && (inputFrame.contains(location) || voiceControlFrame.contains(location))
    }
}

struct VoiceTextInputFramePreferenceKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let next = nextValue()
        if !next.isEmpty { value = next }
    }
}

/// Owns only empty-composer touch regions. A native recognizer distinguishes a
/// completed tap from a held press before capture begins; UIKit retains ordinary
/// text interaction whenever a committed or marked draft is present.
struct AskVoiceHoldSurface: UIViewRepresentable {
    let inputFrame: CGRect
    let voiceControlFrame: CGRect
    let draft: String
    let hasAttachments: Bool
    let isComposing: Bool
    let isDisabled: Bool
    let onTapInput: () -> Void
    let onTapVoice: () -> Void
    let onHoldBegan: () -> Void
    let onHoldChanged: (CGSize) -> Void
    let onHoldEnded: (Bool) -> Void

    func makeUIView(context: Context) -> TouchSurface {
        let view = TouchSurface()
        view.configuration = self
        return view
    }

    func updateUIView(_ uiView: TouchSurface, context: Context) {
        uiView.configuration = self
    }

    final class TouchSurface: UIView {
        var configuration: AskVoiceHoldSurface?
        private var holdStart = CGPoint.zero
        private var isHolding = false

        override init(frame: CGRect) {
            super.init(frame: frame)
            backgroundColor = .clear
            isAccessibilityElement = false
            accessibilityElementsHidden = true
            let hold = UILongPressGestureRecognizer(target: self, action: #selector(held(_:)))
            hold.minimumPressDuration = 0.42
            hold.allowableMovement = 32
            let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
            tap.require(toFail: hold)
            addGestureRecognizer(hold)
            addGestureRecognizer(tap)
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

        override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
            guard let configuration else { return false }
            return AskVoiceHoldPolicy.canBegin(
                location: convert(point, to: nil), inputFrame: configuration.inputFrame,
                voiceControlFrame: configuration.voiceControlFrame,
                draft: configuration.draft, hasAttachments: configuration.hasAttachments,
                isComposing: configuration.isComposing, isDisabled: configuration.isDisabled
            )
        }

        @objc private func tapped(_ recognizer: UITapGestureRecognizer) {
            guard recognizer.state == .ended, let configuration else { return }
            let point = recognizer.location(in: nil)
            if configuration.inputFrame.contains(point) {
                configuration.onTapInput()
            } else if configuration.voiceControlFrame.contains(point) {
                configuration.onTapVoice()
            }
        }

        @objc private func held(_ recognizer: UILongPressGestureRecognizer) {
            switch recognizer.state {
            case .began:
                guard let configuration else { return }
                holdStart = recognizer.location(in: nil)
                isHolding = true
                configuration.onHoldBegan()
            case .changed:
                guard isHolding else { return }
                let point = recognizer.location(in: nil)
                configuration?.onHoldChanged(CGSize(width: point.x - holdStart.x, height: point.y - holdStart.y))
            case .ended, .cancelled, .failed:
                guard isHolding else { return }
                isHolding = false
                configuration?.onHoldEnded(recognizer.state != .ended)
            default:
                break
            }
        }
    }
}
