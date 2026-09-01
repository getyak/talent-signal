import SwiftUI

struct QuickPanelView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismissWindow) private var dismissWindow

    var body: some View {
        VStack(spacing: 0) {
            if model.isSyntheticFixture { SyntheticFixtureBanner() }

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("What does this change?")
                                .font(.title2.weight(.semibold))
                            Text("Build one reviewed context aperture. Nothing is read until you add it.")
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Close", systemImage: "xmark") {
                            dismissWindow(id: "quick-panel")
                        }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.borderless)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel(text: "Purpose")
                        TextField("What should Talent Signal help decide?", text: $model.capsule.purpose)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("quick.purpose")
                        Text(model.scopeReviewStatus == .confirmed ? "Scope confirmed for this Capsule" : "Scope proposed · no identity selected yet")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if model.scopeReviewStatus == .proposed {
                        RelationshipScopeReviewView()
                    }

                    ContextCapsuleView(compact: true)

                    HStack {
                        Button("Cancel and keep local") {
                            dismissWindow(id: "quick-panel")
                        }
                        Spacer()
                        Button("Review with Talent Signal", systemImage: "arrow.right") {
                            Task { await model.submitCapsule() }
                        }
                        .buttonStyle(TSPrimaryButtonStyle())
                        .keyboardShortcut(.return, modifiers: [.command, .shift])
                        .disabled(!model.canSubmitCapsule)
                        .accessibilityHint("Submits only the reviewed, non-local items shown in the Capsule")
                        .accessibilityIdentifier("capsule.submit")
                    }
                }
                .padding(24)
            }
        }
        .background(TSBrand.canvas.opacity(0.72))
        .accessibilityIdentifier("quick.panel")
    }
}
