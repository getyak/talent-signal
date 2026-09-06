import SwiftUI
import UIKit

/// Records the first main-run-loop display callback after a product surface is
/// presented. This does not claim that pixels reached the display or that the
/// task became usable.
@MainActor
final class LabDisplayCallbackStage {
    private let engine: LabDiagnosticsEngine
    private var ticket: LabDiagnosticsEngine.ClientTicket?

    init(engine: LabDiagnosticsEngine = .shared) {
        self.engine = engine
    }

    @discardableResult
    func begin() -> Bool {
        guard ticket == nil,
              let value = engine.beginClientSpan(.firstDisplayCallback, parent: nil) else {
            return false
        }
        ticket = value
        return true
    }

    func receivedDisplayCallback() {
        finish(.completed)
    }

    func cancel() {
        finish(.cancelled)
    }

    private func finish(_ outcome: LabClientSpan.Outcome) {
        guard let ticket else { return }
        self.ticket = nil
        engine.finishClientSpan(ticket, outcome: outcome)
    }
}

@MainActor
private struct LabFirstDisplayCallbackProbe: UIViewRepresentable {
    @MainActor
    final class Coordinator: NSObject {
        private let stage = LabDisplayCallbackStage()
        private var link: CADisplayLink?

        func start() {
            guard link == nil, stage.begin() else { return }
            let link = CADisplayLink(target: self, selector: #selector(tick))
            self.link = link
            link.add(to: .main, forMode: .common)
        }

        @objc private func tick() {
            link?.invalidate()
            link = nil
            stage.receivedDisplayCallback()
        }

        func cancel() {
            link?.invalidate()
            link = nil
            stage.cancel()
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isHidden = true
        view.isUserInteractionEnabled = false
        context.coordinator.start()
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {}

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        coordinator.cancel()
    }
}

extension View {
    func labDiagnosticPresentation() -> some View {
        background {
            LabFirstDisplayCallbackProbe()
                .frame(width: 0, height: 0)
                .accessibilityHidden(true)
        }
    }
}
