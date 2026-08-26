import SwiftUI

/// Runtime rendering of the approved Held Interval brand geometry.
///
/// Path rendering lets the ink adapt to light and dark interfaces without
/// introducing a second logo or a dark technology badge behind the mark.
struct TalentSignalBrandMark: View {
    var body: some View {
        GeometryReader { geometry in
            let lineWidth = min(geometry.size.width, geometry.size.height) * 5.5 / 64
            ZStack {
                HeldIntervalInkShape()
                    .stroke(
                        Color.tsInk,
                        style: StrokeStyle(
                            lineWidth: lineWidth,
                            lineCap: .round,
                            lineJoin: .round
                        )
                    )
                HeldIntervalSignalShape()
                    .stroke(
                        Color.tsVermilion,
                        style: StrokeStyle(
                            lineWidth: lineWidth,
                            lineCap: .round,
                            lineJoin: .round
                        )
                    )
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

private struct HeldIntervalInkShape: Shape {
    func path(in rect: CGRect) -> Path {
        let transform = HeldIntervalTransform(rect: rect)
        var path = Path()
        path.move(to: transform.point(x: 38, y: 10.5))
        path.addCurve(
            to: transform.point(x: 24, y: 8.9),
            control1: transform.point(x: 33.7, y: 8.4),
            control2: transform.point(x: 28.8, y: 7.7)
        )
        path.addCurve(
            to: transform.point(x: 9.9, y: 35.6),
            control1: transform.point(x: 12.1, y: 11.8),
            control2: transform.point(x: 5.7, y: 24.2)
        )
        path.addCurve(
            to: transform.point(x: 35.1, y: 48.5),
            control1: transform.point(x: 13.7, y: 45.8),
            control2: transform.point(x: 24.7, y: 51.4)
        )
        return path
    }
}

private struct HeldIntervalSignalShape: Shape {
    func path(in rect: CGRect) -> Path {
        let transform = HeldIntervalTransform(rect: rect)
        var path = Path()
        path.move(to: transform.point(x: 43.8, y: 15.6))
        path.addCurve(
            to: transform.point(x: 46.5, y: 40.1),
            control1: transform.point(x: 51.2, y: 21.7),
            control2: transform.point(x: 52.4, y: 32.6)
        )
        return path
    }
}

private struct HeldIntervalTransform {
    let scale: CGFloat
    let offset: CGPoint

    init(rect: CGRect) {
        scale = min(rect.width, rect.height) / 64
        offset = CGPoint(
            x: rect.minX + (rect.width - 64 * scale) / 2,
            y: rect.minY + (rect.height - 64 * scale) / 2
        )
    }

    func point(x: CGFloat, y: CGFloat) -> CGPoint {
        CGPoint(x: offset.x + x * scale, y: offset.y + y * scale)
    }
}

#Preview("Held Interval") {
    HStack(spacing: 28) {
        TalentSignalBrandMark().frame(width: 34, height: 34)
        TalentSignalBrandMark().frame(width: 72, height: 72)
    }
    .padding(32)
    .background(Color.tsSurface)
}
