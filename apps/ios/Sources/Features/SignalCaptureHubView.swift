import Foundation
import SwiftUI

@MainActor
struct SignalCaptureHubView: View {
    private enum Destination: String, Identifiable {
        case text
        case screenshot
        case audio
        case inbox

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
    @StateObject private var captureHandoff = CaptureHandoffStore.shared
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

                if captureHandoff.inboxCount > 0 {
                    inboxEntry
                        .padding(.top, 22)
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
                    entryMode: .conversationImage,
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
            case .inbox:
                CaptureInboxView(
                    backendURL: backendURL,
                    accessToken: accessToken,
                    workspaceID: workspaceID,
                    runtimeScope: runtimeScope,
                    onDismiss: { destination = nil },
                    onContinueInAgent: onContinueInAgent
                )
            }
        }
        .task {
            await captureHandoff.refreshInbox()
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

    private var inboxEntry: some View {
        Button { destination = .inbox } label: {
            HStack(spacing: 14) {
                Image(systemName: "rectangle.stack")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.tsVermilion)
                    .frame(width: 44, height: 44)
                    .background(Color.tsSurface, in: Circle())
                VStack(alignment: .leading, spacing: 4) {
                    Text(
                        appLanguage.text(
                            "Capture Sessions"
                        )
                    )
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                    Text(inboxCountLabel)
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                }
                Spacer(minLength: 8)
                Text(verbatim: "\(captureHandoff.inboxCount)")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.tsVermilion)
                    .monospacedDigit()
                    .frame(minWidth: 30, minHeight: 30)
                    .background(Color.tsVermilion.opacity(0.1), in: Capsule())
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.tsMutedInk)
            }
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
            .padding(16)
            .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 18))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            appLanguage.text("Capture Sessions")
                + ", " + inboxCountLabel
        )
        .accessibilityIdentifier("capture-hub-inbox")
    }

    private var inboxCountLabel: String {
        if captureHandoff.attentionCount > 0 {
            return String(
                format: appLanguage.text("%lld need your input"),
                locale: appLanguage.locale,
                Int64(captureHandoff.attentionCount)
            )
        }
        if captureHandoff.processingCount > 0 {
            return String(
                format: appLanguage.text("%lld processing"),
                locale: appLanguage.locale,
                Int64(captureHandoff.processingCount)
            )
        }
        return String(
            format: appLanguage.text(
                captureHandoff.inboxCount == 1
                    ? "%lld active capture Session"
                    : "%lld active capture Sessions"
            ),
            locale: appLanguage.locale,
            Int64(captureHandoff.inboxCount)
        )
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

@MainActor
struct CaptureInboxView: View {
    let backendURL: URL?
    let accessToken: String?
    let workspaceID: String?
    let runtimeScope: String?
    let onDismiss: () -> Void
    let onContinueInAgent: ((RelationshipCaptureCompletion) -> Void)?

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dismiss) private var dismiss
    @StateObject private var captureHandoff = CaptureHandoffStore.shared
    @State private var pendingDeletion: PendingCaptureSummary?
    @State private var deletionFailure: String?
    @State private var deletingID: UUID?

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    inboxHeader
                    if let failure = captureHandoff.inboxLoadError {
                        inboxFailure(failure)
                    } else if captureHandoff.inboxItems.isEmpty {
                        emptyInbox
                    } else {
                        ForEach(captureHandoff.inboxItems) { item in
                            inboxCard(item)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 36)
            }
            .scrollIndicators(.hidden)
            .background(Color.tsCanvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack {
                Button {
                    onDismiss()
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel(
                    appLanguage.text("Close Capture Sessions")
                )
                .accessibilityIdentifier("close-capture-inbox")
                Spacer()
                Text(appLanguage.text("Capture Sessions"))
                    .font(.headline)
                    .foregroundStyle(Color.tsInk)
                Spacer()
                Color.clear.frame(width: 44, height: 44)
            }
            .padding(.horizontal, 12)
            .background(Color.tsCanvas)
        }
        .task { await captureHandoff.refreshInbox() }
        .refreshable { await captureHandoff.refreshInbox() }
        .confirmationDialog(
            appLanguage.text("Remove this capture?"),
            isPresented: Binding(
                get: { pendingDeletion != nil },
                set: { if !$0 { pendingDeletion = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(appLanguage.text("Remove local capture"), role: .destructive) {
                guard let item = pendingDeletion else { return }
                pendingDeletion = nil
                deletingID = item.id
                Task {
                    do {
                        try await captureHandoff.removeFromInbox(id: item.id)
                    } catch {
                        deletionFailure = error.localizedDescription
                    }
                    deletingID = nil
                }
            }
            Button(appLanguage.text("Cancel"), role: .cancel) {
                pendingDeletion = nil
            }
        } message: {
            Text(
                appLanguage.text(
                    "This removes the protected local screenshot and Session processing recovery. It does not delete proposed source text already accepted by the backend."
                )
            )
        }
        .alert(
            appLanguage.text("Capture could not be removed"),
            isPresented: Binding(
                get: { deletionFailure != nil },
                set: { if !$0 { deletionFailure = nil } }
            )
        ) {
            Button(appLanguage.text("Done")) { deletionFailure = nil }
        } message: {
            Text(verbatim: deletionFailure ?? "")
        }
        .fullScreenCover(item: $captureHandoff.pendingSeed) { seed in
            RelationshipCaptureView(
                seed: seed,
                backendURL: effectiveBackendURL,
                accessToken: accessToken,
                workspaceID: workspaceID,
                runtimeScope: runtimeScope,
                initialDraft: captureHandoff.initialDraft
            ) { disposition in
                switch disposition {
                case .keepForLater:
                    captureHandoff.keepForLater()
                case .discard:
                    Task {
                        await captureHandoff.advanceToNextCapture(
                            resolution: .dismissed
                        )
                    }
                case .finished:
                    Task {
                        await captureHandoff.advanceToNextCapture(
                            resolution: .completed
                        )
                    }
                case let .continueInAgent(completion):
                    Task {
                        await captureHandoff.advanceToNextCapture(
                            resolution: .completed
                        )
                        onContinueInAgent?(completion)
                    }
                }
            }
        }
        .presentationDetents([.large])
        .tint(.tsVermilion)
    }

    private var effectiveBackendURL: URL {
        backendURL ?? URL(string: "http://127.0.0.1:4317")!
    }

    private var inboxHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(
                text: appLanguage.text(
                    "Session processing"
                )
            )
                .foregroundStyle(Color.tsVermilion)
            Text(countLabel)
                .font(.custom("Georgia", size: 32, relativeTo: .title))
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
            Text(
                appLanguage.text(
                    "Each screenshot starts an Agent Session immediately. This surface appears only while processing is active or the Agent needs a decision."
                )
            )
            .font(.body)
            .foregroundStyle(Color.tsMutedInk)
            .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("capture-inbox-header")
    }

    private var countLabel: String {
        if captureHandoff.attentionCount > 0 {
            return String(
                format: appLanguage.text("%lld need your input"),
                locale: appLanguage.locale,
                Int64(captureHandoff.attentionCount)
            )
        }
        return String(
            format: appLanguage.text("%lld processing"),
            locale: appLanguage.locale,
            Int64(captureHandoff.processingCount)
        )
    }

    private var emptyInbox: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: "checkmark.circle")
                .font(.title2)
                .foregroundStyle(Color.tsConfirmed)
            Text(appLanguage.text("No active capture Sessions"))
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.tsInk)
            Text(
                appLanguage.text(
                    "Processed screenshots stay available from Sessions unless they need your input."
                )
            )
                .font(.body)
                .foregroundStyle(Color.tsMutedInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tsCard()
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("capture-inbox-empty")
    }

    private func inboxFailure(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: "exclamationmark.arrow.triangle.2.circlepath")
                .font(.title2)
                .foregroundStyle(Color.tsWarning)
            Text(appLanguage.text("Inbox needs another try"))
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.tsInk)
            Text(message)
                .font(.body)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            Button(appLanguage.text("Try again")) {
                Task { await captureHandoff.refreshInbox() }
            }
            .buttonStyle(TSPrimaryButtonStyle())
            .accessibilityIdentifier("retry-capture-inbox")
        }
        .tsCard()
        .accessibilityIdentifier("capture-inbox-failure")
    }

    private func inboxCard(_ item: PendingCaptureSummary) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: item.originalAvailable ? "photo" : "text.quote")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.tsVermilion)
                    .frame(width: 44, height: 44)
                    .background(Color.tsSurfaceMuted, in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 5) {
                    Text(statusTitle(for: item))
                        .font(.headline)
                        .foregroundStyle(item.needsAttention ? Color.tsWarning : Color.tsInk)
                    Text(appLanguage.text(item.origin.label) + " · " + relativeDate(item.createdAt))
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                    Text(item.fileName)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .lineLimit(2)
                    if let detail = localizedDetail(for: item) {
                        Text(detail)
                            .font(.caption)
                            .foregroundStyle(Color.tsMutedInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 2)
                    }
                }
                Spacer(minLength: 4)
                Button(role: .destructive) {
                    pendingDeletion = item
                } label: {
                    if deletingID == item.id {
                        ProgressView().frame(width: 44, height: 44)
                    } else {
                        Image(systemName: "trash")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Color.tsVermilion)
                            .frame(width: 44, height: 44)
                    }
                }
                .disabled(deletingID != nil)
                .accessibilityLabel(
                    appLanguage.text("Remove local capture") + ", " + item.fileName
                )
                .accessibilityIdentifier("capture-inbox-delete-\(item.id.uuidString)")
            }

            if item.needsAttention {
                Button {
                    Task { await captureHandoff.resume(id: item.id) }
                } label: {
                    HStack {
                        Text(
                            item.processingState == .failed
                                ? appLanguage.text("Inspect and retry")
                                : appLanguage.text("Review decision")
                        )
                        .font(.body.weight(.semibold))
                        Spacer()
                        Image(systemName: "arrow.right")
                            .font(.caption.weight(.bold))
                    }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .contentShape(Rectangle())
                }
                .buttonStyle(TSPrimaryButtonStyle())
                .accessibilityLabel(
                    appLanguage.text("Open required decision")
                        + ", " + item.fileName
                )
                .accessibilityIdentifier("capture-session-decision-\(item.id.uuidString)")
            } else {
                HStack(spacing: 10) {
                    ProgressView()
                    Text(appLanguage.text("Agent is processing"))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.tsMutedInk)
                    Spacer()
                }
                .frame(minHeight: 48)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("capture-session-processing-\(item.id.uuidString)")
            }
        }
        .tsCard()
    }

    private func statusTitle(for item: PendingCaptureSummary) -> String {
        switch item.processingState {
        case .queued:
            appLanguage.text("Session queued")
        case .processing:
            appLanguage.text("Agent is processing")
        case .needsDecision:
            appLanguage.text("Agent needs your input")
        case .completed:
            appLanguage.text("Processing complete")
        case .failed:
            appLanguage.text("Processing needs attention")
        }
    }

    private func localizedDetail(for item: PendingCaptureSummary) -> String? {
        switch item.processingState {
        case .queued:
            return appLanguage.text(
                "The Session is protected and waiting to start."
            )
        case .processing:
            return appLanguage.text(
                "The Agent is reading the screenshot on this device."
            )
        case .failed:
            return appLanguage.text(
                "Processing stopped. Open the saved capture to inspect or retry it."
            )
        case .completed:
            return nil
        case .needsDecision:
            let detail = item.processingDetail ?? ""
            if detail.contains("multiple possible people") {
                return appLanguage.text(
                    "Multiple people match this screenshot. Choose who owns the conversation."
                )
            }
            if detail.contains("proposed facts") {
                return appLanguage.text(
                    "The Agent found proposed facts that need speaker or evidence confirmation."
                )
            }
            if detail.contains("could not find") || detail.contains("could not resolve") {
                return appLanguage.text(
                    "The Agent could not resolve the person safely. Choose the person and relationship."
                )
            }
            return appLanguage.text(
                "The Agent needs one identity or evidence decision to continue."
            )
        }
    }

    private func relativeDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = appLanguage.locale
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: .now)
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
