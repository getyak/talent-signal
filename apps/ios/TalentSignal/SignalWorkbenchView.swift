import PhotosUI
import SwiftUI

struct SignalWorkbenchView: View {
    @State private var selectedItem: PhotosPickerItem?
    @State private var selectedImage: Image?
    @State private var hasImportedEvidence = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    hero
                    evidenceCard

                    if hasImportedEvidence {
                        actionCard
                        momentumCard
                    } else {
                        emptyState
                    }
                }
                .padding(20)
            }
            .background(Color.signalBackground)
            .navigationTitle("Talent Signal")
            .navigationBarTitleDisplayMode(.inline)
        }
        .tint(.signalMint)
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("TODAY’S SIGNAL")
                .font(.caption.weight(.semibold))
                .tracking(1.5)
                .foregroundStyle(Color.signalMint)
            Text("Turn conversations into confident next moves.")
                .font(.largeTitle.bold())
                .foregroundStyle(.white)
            Text("Import recruiter-controlled evidence. You confirm every action before anything changes.")
                .font(.body)
                .foregroundStyle(.white.opacity(0.68))
        }
    }

    private var evidenceCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Conversation evidence", systemImage: "rectangle.stack.badge.plus")
                .font(.headline)

            if let selectedImage {
                selectedImage
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .frame(maxHeight: 240)
            }

            PhotosPicker(selection: $selectedItem, matching: .images) {
                Label(
                    hasImportedEvidence ? "Replace screenshot" : "Import screenshot",
                    systemImage: "photo.on.rectangle"
                )
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.signalMint)
                .foregroundStyle(Color.signalBackground)
                .fontWeight(.semibold)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .onChange(of: selectedItem) { _, item in
                Task {
                    guard let data = try? await item?.loadTransferable(type: Data.self),
                          let uiImage = UIImage(data: data) else { return }
                    selectedImage = Image(uiImage: uiImage)
                    hasImportedEvidence = true
                }
            }

            Button("Use demo evidence") {
                hasImportedEvidence = true
            }
            .frame(maxWidth: .infinity)
            .accessibilityIdentifier("use-demo-evidence")
        }
        .signalCard()
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: "waveform.path.ecg")
                .font(.title)
                .foregroundStyle(Color.signalCoral)
            Text("No signal yet")
                .font(.title3.bold())
            Text("Import a screenshot or use the demo to preview the review loop.")
                .foregroundStyle(.secondary)
        }
        .signalCard()
    }

    private var actionCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("PROPOSED ACTION")
                .font(.caption.weight(.semibold))
                .tracking(1.4)
                .foregroundStyle(Color.signalCoral)
            Text("Follow up with Maya on Thursday")
                .font(.title3.bold())
            Text("Evidence: “I’ll have a decision after Wednesday’s leadership sync.”")
                .foregroundStyle(.secondary)
            Button("Confirm action") {}
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("confirm-action")
        }
        .signalCard()
    }

    private var momentumCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("MOMENTUM")
                    .font(.caption.weight(.semibold))
                    .tracking(1.4)
                Spacer()
                Text("WARM")
                    .font(.caption.bold())
                    .foregroundStyle(Color.signalMint)
            }
            Text("Decision context is clear and the next checkpoint is explicit.")
                .font(.headline)
            ProgressView(value: 0.72)
                .tint(.signalMint)
        }
        .signalCard()
    }
}

private extension View {
    func signalCard() -> some View {
        padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

private extension Color {
    static let signalBackground = Color(red: 0.02, green: 0.08, blue: 0.18)
    static let signalMint = Color(red: 0.13, green: 0.91, blue: 0.78)
    static let signalCoral = Color(red: 1.0, green: 0.39, blue: 0.27)
}

#Preview {
    SignalWorkbenchView()
}
