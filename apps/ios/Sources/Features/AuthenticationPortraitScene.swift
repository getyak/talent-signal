import SwiftUI

/// Fictional, bundled people. Progress is presentation only, never account data.
enum AuthenticationPortraitLayout {
    static let anchors: [CGPoint] = [
        .init(x: 0.25, y: 0.67), .init(x: 0.73, y: 0.68),
        .init(x: 0.48, y: 0.88), .init(x: 0.50, y: 0.56),
        .init(x: 0.88, y: 0.47), .init(x: 0.15, y: 0.40),
        .init(x: 0.76, y: 0.27), .init(x: 0.30, y: 0.23),
        .init(x: 0.11, y: 0.88), .init(x: 0.87, y: 0.91),
        .init(x: 0.54, y: 0.28),
    ]
    static let diameters: [CGFloat] = [72, 66, 44, 82, 42, 48, 52, 38, 34, 32, 28]

    static func phase(_ progress: CGFloat, from start: CGFloat, to end: CGFloat) -> CGFloat {
        let t = max(0, min(1, (progress - start) / (end - start)))
        return t * t * (3 - 2 * t)
    }

    static func arrival(_ index: Int, progress: CGFloat) -> CGFloat {
        let delay = CGFloat(index) * 0.012
        return phase(progress, from: delay, to: 0.78 + delay)
    }

    static func position(_ index: Int, progress: CGFloat, size: CGSize) -> CGPoint {
        let t = arrival(index, progress: progress)
        let anchor = anchors[index]
        let origin = CGPoint(x: 0.5 + CGFloat(index % 3 - 1) * 0.04, y: 1.12)
        // Each face follows the same hand, with a slight lateral opening arc.
        let arc = sin(t * .pi) * (anchor.x - 0.5) * 0.16
        return CGPoint(x: size.width * (origin.x + (anchor.x - origin.x) * t + arc),
                       y: size.height * (origin.y + (1 - anchor.y - origin.y) * t))
    }
}

/// One animatable value owns portraits AND edges, including spring interruption.
/// No timer, physics loop or delayed task continues after the gesture settles.
struct AuthenticationPortraits: View, Animatable {
    var progress: CGFloat
    @Environment(\.talentSignalReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    var body: some View {
        GeometryReader { geometry in
            let layoutProgress: CGFloat = reduceMotion ? 1 : progress
            let scale = min(1, geometry.size.width / 390, geometry.size.height / 280)
            ZStack {
                Canvas { context, size in
                    for index in AuthenticationPortraitLayout.anchors.indices {
                        let next = (index + 3) % AuthenticationPortraitLayout.anchors.count
                        let start = AuthenticationPortraitLayout.position(index, progress: layoutProgress, size: size)
                        let end = AuthenticationPortraitLayout.position(next, progress: layoutProgress, size: size)
                        let reveal = AuthenticationPortraitLayout.phase(progress, from: 0.44 + CGFloat(index) * 0.012, to: 0.96)
                        var path = Path()
                        path.move(to: start)
                        path.addQuadCurve(to: end, control: CGPoint(x: (start.x + end.x) / 2,
                                                                  y: (start.y + end.y) / 2 + 14 * (1 - reveal)))
                        context.stroke(path.trimmedPath(from: 0, to: reveal),
                            with: .color(Color.tsInk.opacity((colorScheme == .dark ? 0.22 : 0.13) * reveal)),
                            style: StrokeStyle(lineWidth: 0.8, lineCap: .round))
                    }
                }
                ForEach(AuthenticationPortraitLayout.anchors.indices, id: \.self) { index in
                    let arrival = AuthenticationPortraitLayout.arrival(index, progress: progress)
                    let diameter = AuthenticationPortraitLayout.diameters[index] * scale
                    Image("WelcomePortrait\(index + 1)")
                        .resizable().scaledToFill()
                        .frame(width: diameter, height: diameter)
                        .clipShape(Circle())
                        .overlay(Circle().strokeBorder(Color.tsSurface, lineWidth: 1.5))
                        .scaleEffect(reduceMotion ? 1 : 0.58 + 0.42 * arrival)
                        .opacity(Double(AuthenticationPortraitLayout.phase(progress,
                            from: CGFloat(index) * 0.012, to: 0.20 + CGFloat(index) * 0.012)))
                        .position(AuthenticationPortraitLayout.position(index, progress: layoutProgress, size: geometry.size))
                }
            }
        }
        .mask {
            LinearGradient(stops: [
                .init(color: .black, location: 0),
                .init(color: .black, location: 0.88),
                .init(color: .clear, location: 1),
            ], startPoint: .top, endPoint: .bottom)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
