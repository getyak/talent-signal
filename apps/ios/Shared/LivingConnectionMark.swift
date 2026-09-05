import SwiftUI

enum LivingConnectionPhase: String, Codable, Hashable {
    case listening
    case thinking
    case review
    case failed
    case timedOut
}

/// One relationship-gap geometry used across the composer and system surfaces.
/// Motion adds life, while the resting geometry preserves every state when
/// Reduce Motion is enabled or ActivityKit pauses animation.
struct LivingConnectionMark: View {
    let phase: LivingConnectionPhase
    var size: CGFloat = 28
    var ink: Color = .primary
    var signal: Color = Color(red: 0.95, green: 0.31, blue: 0.22)
    var reduceMotion = false

    var body: some View {
        TimelineView(
            .animation(
                minimumInterval: 1.0 / 20.0,
                paused: reduceMotion || !phase.animates
            )
        ) { context in
            let progress = reduceMotion
                ? 0.0
                : context.date.timeIntervalSinceReferenceDate
                    .truncatingRemainder(dividingBy: phase.period) / phase.period
            ZStack {
                Circle()
                    .trim(from: 0.10, to: 0.82)
                    .stroke(
                        ink,
                        style: StrokeStyle(
                            lineWidth: size * 0.105,
                            lineCap: .round
                        )
                    )
                    .rotationEffect(.degrees(-24))

                signalStroke(progress: progress)

                if phase == .listening {
                    listeningEcho(progress: progress, multiplier: 1)
                    listeningEcho(progress: progress, multiplier: 2)
                }

                if phase == .review {
                    reviewFold
                }

                if phase == .timedOut {
                    timeoutTick
                }
            }
            .frame(width: size, height: size)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private func signalStroke(progress: Double) -> some View {
        let orbit = phase == .thinking ? progress * 360 : 0
        let breathing = phase == .thinking
            ? 0.88 + 0.12 * sin(progress * .pi * 2)
            : phase == .listening
                ? 0.92 + 0.08 * sin(progress * .pi * 2)
                : 1
        let displacement: CGSize = {
            switch phase {
            case .failed: return CGSize(width: size * 0.13, height: size * 0.17)
            case .timedOut: return CGSize(width: size * 0.04, height: -size * 0.02)
            default: return .zero
            }
        }()
        let strokeWidth = phase == .failed ? size * 0.16 : size * 0.105
        let strokeHeight = phase == .failed ? size * 0.16 : size * 0.29

        return Capsule(style: .continuous)
            .fill(signal)
            .frame(width: strokeWidth, height: strokeHeight)
            .rotationEffect(.degrees(phase == .failed ? 0 : -8))
            .offset(x: size * 0.36 + displacement.width, y: displacement.height)
            .scaleEffect(breathing)
            .rotationEffect(.degrees(orbit))
    }

    private func listeningEcho(progress: Double, multiplier: Double) -> some View {
        let pulse = reduceMotion ? 0.35 : (progress + multiplier * 0.22)
            .truncatingRemainder(dividingBy: 1)
        return Circle()
            .trim(from: 0.43, to: 0.57)
            .stroke(
                signal.opacity(max(0.08, 0.44 - pulse * 0.34)),
                style: StrokeStyle(
                    lineWidth: max(1, size * 0.045),
                    lineCap: .round
                )
            )
            .rotationEffect(.degrees(-1))
            .scaleEffect(1.0 + pulse * (0.34 + multiplier * 0.12))
    }

    private var reviewFold: some View {
        Path { path in
            path.move(to: CGPoint(x: size * 0.66, y: size * 0.45))
            path.addLine(to: CGPoint(x: size * 0.74, y: size * 0.54))
            path.addLine(to: CGPoint(x: size * 0.88, y: size * 0.34))
        }
        .stroke(
            signal,
            style: StrokeStyle(
                lineWidth: max(1.5, size * 0.07),
                lineCap: .round,
                lineJoin: .round
            )
        )
    }

    private var timeoutTick: some View {
        Capsule(style: .continuous)
            .fill(signal)
            .frame(width: max(1.5, size * 0.06), height: size * 0.13)
            .offset(x: size * 0.40, y: -size * 0.24)
            .rotationEffect(.degrees(45))
    }
}

private extension LivingConnectionPhase {
    var animates: Bool { self == .listening || self == .thinking }
    var period: TimeInterval {
        switch self {
        case .listening: return 1.15
        case .thinking: return 2.0
        case .review, .failed, .timedOut: return 1
        }
    }
}
