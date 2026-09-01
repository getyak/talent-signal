import SwiftUI

enum TSBrand {
    static let canvas = Color(red: 0.965, green: 0.952, blue: 0.925)
    static let surface = Color(red: 0.988, green: 0.980, blue: 0.960)
    static let ink = Color(red: 0.115, green: 0.105, blue: 0.095)
    static let secondaryInk = Color(red: 0.35, green: 0.33, blue: 0.30)
    static let seam = Color(red: 0.72, green: 0.20, blue: 0.12)
    static let evidence = Color(red: 0.22, green: 0.36, blue: 0.34)
}

struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.semibold))
            .tracking(0.8)
            .foregroundStyle(.secondary)
    }
}

struct TSPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(Color.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                isEnabled ? TSBrand.seam : Color.secondary.opacity(0.28),
                in: RoundedRectangle(cornerRadius: 8)
            )
            .opacity(configuration.isPressed ? 0.78 : 1)
            .contentShape(RoundedRectangle(cornerRadius: 8))
    }
}

struct SyntheticFixtureBanner: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "testtube.2")
            Text("SYNTHETIC FIXTURE")
                .font(.caption.weight(.bold))
            Text("Deterministic test data · no canonical backend readback · no real person or action")
                .font(.caption)
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
        .foregroundStyle(.primary)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.yellow.opacity(0.16))
        .overlay(alignment: .bottom) { Divider() }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("app.syntheticBanner")
    }
}
