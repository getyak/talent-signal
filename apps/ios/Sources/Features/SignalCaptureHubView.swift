import SwiftUI

@MainActor
struct SignalCaptureHubView: View {
    private enum Destination: String, Identifiable {
        case text
        case screenshot
        case audio

        var id: String { rawValue }
    }

    let backendURL: URL?
    let accessToken: String?
    let workspaceID: String?
    let runtimeScope: String?
    let initialDestination: CaptureIntentDestination?
    let onDismiss: () -> Void
    let onContinueInAgent: ((RelationshipCaptureCompletion) -> Void)?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var destination: Destination?

    init(
        backendURL: URL?,
        accessToken: String? = nil,
        workspaceID: String? = nil,
        runtimeScope: String? = nil,
        initialDestination: CaptureIntentDestination? = nil,
        onDismiss: @escaping () -> Void = {},
        onContinueInAgent: ((RelationshipCaptureCompletion) -> Void)? = nil
    ) {
        self.backendURL = backendURL
        self.accessToken = accessToken
        self.workspaceID = workspaceID
        self.runtimeScope = runtimeScope
        self.initialDestination = initialDestination
        self.onDismiss = onDismiss
        self.onContinueInAgent = onContinueInAgent
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 16) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(appLanguage.text("Capture for the Agent"))
                            .font(.custom("Georgia", size: 28, relativeTo: .title2))
                            .foregroundStyle(Color.tsInk)
                        Text(
                            appLanguage.text(
                                "Preserve the source now. Available parsing follows scope review."
                            )
                        )
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 4)
                    Button {
                        onDismiss()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.tsInk)
                            .frame(width: 44, height: 44)
                            .background(Color.tsCanvas, in: Circle())
                    }
                    .accessibilityLabel(
                        appLanguage.text("Close input")
                    )
                    .accessibilityIdentifier("close-capture-hub")
                }

                Group {
                    if dynamicTypeSize.isAccessibilitySize {
                        VStack(spacing: 8) { captureOptions }
                    } else {
                        HStack(spacing: 10) { captureOptions }
                    }
                }
                .padding(.top, 24)

                Label(
                    appLanguage.text(
                        "Nothing here confirms identity, facts, or an external write."
                    ),
                    systemImage: "checkmark.shield"
                )
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 22)
            }
            .padding(.horizontal, 22)
            .padding(.top, 24)
            .padding(.bottom, 28)
        }
        .background(Color.tsSurface.ignoresSafeArea())
        .fullScreenCover(item: $destination) { value in
            switch value {
            case .text:
                textSignalView
            case .screenshot:
                CandidateSignalView(
                    backendURL: backendURL,
                    accessToken: accessToken,
                    workspaceID: workspaceID,
                    runtimeScope: runtimeScope,
                    onClose: { destination = nil },
                    onContinueInAgent: { completion in
                        destination = nil
                        Task { @MainActor in
                            await Task.yield()
                            onContinueInAgent?(completion)
                        }
                    }
                )
            case .audio:
                AudioSignalCaptureView(runtimeScope: runtimeScope, onDismiss: { destination = nil })
            }
        }
        .task {
            if initialDestination == .foregroundAudio {
                destination = .audio
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .tint(.tsVermilion)
        .labDiagnosticPresentation()
        .accessibilityIdentifier("signal-capture-hub")
    }

    @ViewBuilder
    private var captureOptions: some View {
        captureRow(
            title: appLanguage.text("Text"),
            detail: appLanguage.text("Type or paste"),
            symbol: "text.quote",
            identifier: "capture-hub-text"
        ) { destination = .text }
        captureRow(
            title: appLanguage.text("Photo"),
            detail: appLanguage.text("Choose one"),
            symbol: "photo",
            identifier: "capture-hub-screenshot"
        ) { destination = .screenshot }
        captureRow(
            title: appLanguage.text("Voice"),
            detail: appLanguage.text("Record now"),
            symbol: "waveform",
            identifier: "capture-hub-audio"
        ) { destination = .audio }
    }

    @ViewBuilder
    private var textSignalView: some View {
        if let backendURL {
            TextSignalCaptureView(
                backendURL: backendURL,
                accessToken: accessToken,
                workspaceID: workspaceID,
                runtimeScope: runtimeScope,
                onDismiss: { destination = nil }
            )
        } else {
            TextSignalCaptureView(
                store: TextSignalCaptureStore(
                    service: LocalOnlyTextSignalSyncService()
                ),
                onDismiss: { destination = nil }
            )
        }
    }

    private func captureRow(
        title: String,
        detail: String,
        symbol: String,
        identifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: symbol)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .frame(width: 40, height: 40)
                    .background(Color.tsSurface, in: Circle())
                VStack(alignment: .leading, spacing: 7) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 112, alignment: .leading)
            .padding(14)
            .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 18))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }
}

private actor LocalOnlyTextSignalSyncService: TextSignalSyncServing {
    func loadScopes() -> TextSignalScopeCatalog {
        TextSignalScopeCatalog(workspaceID: "local-unassigned", scopes: [])
    }

    func sync(_ record: TextSignalOutboxRecord) throws -> TextSignalSyncReceipt {
        throw TextSignalSyncError.loginFailed
    }

    func deleteCapture(id: String, recordID: UUID) throws -> TextSignalDeletionReceipt {
        throw TextSignalSyncError.loginFailed
    }
}
