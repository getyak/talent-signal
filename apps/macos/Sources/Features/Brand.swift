import AppKit
import SwiftUI

enum TSBrand {
    static let canvas = adaptive(
        light: NSColor(srgbRed: 0.992, green: 0.992, blue: 0.988, alpha: 1),
        dark: NSColor(srgbRed: 0.075, green: 0.079, blue: 0.073, alpha: 1)
    )
    static let sidebar = adaptive(
        light: NSColor(srgbRed: 0.961, green: 0.961, blue: 0.953, alpha: 1),
        dark: NSColor(srgbRed: 0.098, green: 0.104, blue: 0.096, alpha: 1)
    )
    static let surface = adaptive(
        light: NSColor(srgbRed: 1, green: 1, blue: 1, alpha: 1),
        dark: NSColor(srgbRed: 0.125, green: 0.132, blue: 0.122, alpha: 1)
    )
    static let raisedSurface = adaptive(
        light: NSColor(srgbRed: 1, green: 0.997, blue: 0.987, alpha: 1),
        dark: NSColor(srgbRed: 0.151, green: 0.158, blue: 0.147, alpha: 1)
    )
    static let ink = adaptive(
        light: NSColor(srgbRed: 0.161, green: 0.169, blue: 0.169, alpha: 1),
        dark: NSColor(srgbRed: 0.946, green: 0.932, blue: 0.900, alpha: 1)
    )
    static let secondaryInk = adaptive(
        light: NSColor(srgbRed: 0.439, green: 0.459, blue: 0.443, alpha: 1),
        dark: NSColor(srgbRed: 0.714, green: 0.695, blue: 0.654, alpha: 1)
    )
    static let seam = adaptive(
        light: NSColor(srgbRed: 0.735, green: 0.220, blue: 0.130, alpha: 1),
        dark: NSColor(srgbRed: 0.922, green: 0.420, blue: 0.305, alpha: 1)
    )
    static let seamTint = adaptive(
        light: NSColor(srgbRed: 0.968, green: 0.900, blue: 0.864, alpha: 1),
        dark: NSColor(srgbRed: 0.245, green: 0.125, blue: 0.098, alpha: 1)
    )
    static let evidence = adaptive(
        light: NSColor(srgbRed: 0.205, green: 0.360, blue: 0.326, alpha: 1),
        dark: NSColor(srgbRed: 0.485, green: 0.690, blue: 0.635, alpha: 1)
    )
    static let evidenceTint = adaptive(
        light: NSColor(srgbRed: 0.890, green: 0.924, blue: 0.906, alpha: 1),
        dark: NSColor(srgbRed: 0.104, green: 0.196, blue: 0.172, alpha: 1)
    )
    static let hairline = adaptive(
        light: NSColor(srgbRed: 0.906, green: 0.910, blue: 0.898, alpha: 1),
        dark: NSColor(srgbRed: 0.232, green: 0.244, blue: 0.226, alpha: 1)
    )
    static let selection = adaptive(
        light: NSColor(srgbRed: 0.925, green: 0.929, blue: 0.918, alpha: 1),
        dark: NSColor(srgbRed: 0.170, green: 0.183, blue: 0.165, alpha: 1)
    )
    static let fixtureTint = adaptive(
        light: NSColor(srgbRed: 0.965, green: 0.923, blue: 0.745, alpha: 1),
        dark: NSColor(srgbRed: 0.235, green: 0.194, blue: 0.075, alpha: 1)
    )

    private static func adaptive(light: NSColor, dark: NSColor) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
        })
    }
}

struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 12, weight: .medium, design: .default))
            .tracking(0)
            .foregroundStyle(TSBrand.secondaryInk)
    }
}

struct TSBrandMark: View {
    var size: CGFloat = 24
    var monochrome = false

    var body: some View {
        ZStack {
            HeldIntervalInkShape()
                .stroke(TSBrand.ink, style: StrokeStyle(lineWidth: size * 5.5 / 64, lineCap: .round, lineJoin: .round))
            HeldIntervalSignalShape()
                .stroke(monochrome ? TSBrand.ink : TSBrand.seam, style: StrokeStyle(lineWidth: size * 5.5 / 64, lineCap: .round, lineJoin: .round))
        }
        .frame(width: size, height: size)
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

struct TSPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .padding(.horizontal, 15)
            .padding(.vertical, 9)
            .background(
                isEnabled ? TSBrand.seam : TSBrand.selection,
                in: RoundedRectangle(cornerRadius: 9, style: .continuous)
            )
            .overlay {
                if isEnabled {
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .stroke(Color.white.opacity(0.12), lineWidth: 0.5)
                }
            }
            .foregroundStyle(isEnabled ? Color.white : TSBrand.secondaryInk)
            .shadow(color: isEnabled ? TSBrand.seam.opacity(0.14) : .clear, radius: 5, y: 2)
            .opacity(configuration.isPressed ? 0.78 : 1)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    }
}

struct TSStatusBadge: View {
    let title: String
    let systemImage: String
    var isAttention = false

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.semibold))
            .foregroundStyle(isAttention ? TSBrand.seam : TSBrand.secondaryInk)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(
                isAttention ? TSBrand.seamTint : TSBrand.selection,
                in: Capsule()
            )
    }
}

private struct TSSurfaceModifier: ViewModifier {
    let raised: Bool
    let accent: Color?

    func body(content: Content) -> some View {
        content
            .background(
                raised ? TSBrand.raisedSurface : TSBrand.surface,
                in: RoundedRectangle(cornerRadius: raised ? 14 : 11, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: raised ? 14 : 11, style: .continuous)
                    .stroke(accent?.opacity(0.55) ?? TSBrand.hairline.opacity(0.72), lineWidth: 1)
            }
            .shadow(color: raised ? Color.black.opacity(0.055) : .clear, radius: 12, y: 4)
    }
}

extension View {
    func tsSurface(raised: Bool = false, accent: Color? = nil) -> some View {
        modifier(TSSurfaceModifier(raised: raised, accent: accent))
    }
}

struct SyntheticFixtureBanner: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "testtube.2")
                .foregroundStyle(TSBrand.seam)
            Text("SYNTHETIC FIXTURE")
                .font(.caption.weight(.bold))
            Text("Deterministic data · no canonical readback · no real person or action")
                .font(.caption)
                .foregroundStyle(TSBrand.secondaryInk)
            Spacer(minLength: 8)
            if model.isAccessibilityZoomPreview {
                Label("200% text preview", systemImage: "textformat.size.larger")
                    .font(.caption.weight(.semibold))
            }
            if model.isReducedMotionPreview {
                Label("Reduced Motion", systemImage: "figure.walk.motion.trianglebadge.exclamationmark")
                    .font(.caption.weight(.semibold))
            }
        }
        .foregroundStyle(TSBrand.ink)
        .padding(.horizontal, 14)
        .padding(.vertical, 7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(TSBrand.fixtureTint)
        .overlay(alignment: .bottom) {
            Rectangle().fill(TSBrand.hairline.opacity(0.72)).frame(height: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("app.syntheticBanner")
    }
}
