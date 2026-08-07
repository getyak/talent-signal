import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

@MainActor
struct CandidateSignalView: View {
    @StateObject private var store: CandidateSignalStore
    @StateObject private var captureHandoff = CaptureHandoffStore.shared
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var importedImage: UIImage?
    @State private var photoImportTask: Task<Void, Never>?
    @State private var localhostExpanded = false
    @State private var recruiterContext = HeroLoopCatalog.defaultRecruiterContext
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init() {
        _store = StateObject(wrappedValue: CandidateSignalStore())
    }

    init(store: CandidateSignalStore) {
        _store = StateObject(wrappedValue: store)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.tsCanvas.ignoresSafeArea()
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 24) {
                            BrandHeader()
                                .id("screen-top")

                            switch store.stage {
                            case .idle:
                                idleContent
                            case let .importing(kind):
                                importingContent(kind)
                            case let .importCancelled(kind):
                                cancelledContent(kind)
                            case let .importFailed(failure):
                                failedContent(failure)
                            case .reviewingUnboundImage:
                                unboundImageContent
                            case .reviewingFixture:
                                fixtureReviewContent
                            case .actionPreview:
                                actionPreviewContent
                            case let .outcome(outcome):
                                outcomeContent(outcome)
                            }

                            PrivacyBoundaryNote()
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 14)
                        .padding(.bottom, 40)
                    }
                    .clipped()
                    .onChange(of: store.stage) { _ in
                        Task { @MainActor in
                            proxy.scrollTo("screen-top", anchor: .top)
                        }
                    }
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                Color.tsCanvas
                    .frame(height: 1)
                    .background(Color.tsCanvas.ignoresSafeArea(edges: .top))
                    .accessibilityHidden(true)
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            Color.tsCanvas
                .frame(height: 8)
                .accessibilityHidden(true)
        }
        .tint(.tsVermilion)
        .onChange(of: selectedPhoto) { item in
            loadSelectedPhoto(item)
        }
        .onDisappear {
            photoImportTask?.cancel()
        }
        .fullScreenCover(item: $captureHandoff.pendingSeed) { seed in
            RelationshipCaptureView(
                seed: seed,
                backendURL: URL(string: store.backendAddress)
                    ?? URL(string: "http://127.0.0.1:4317")!,
                initialDraft: captureHandoff.initialDraft
            ) { disposition in
                selectedPhoto = nil
                switch disposition {
                case .keepForLater:
                    captureHandoff.keepForLater()
                case .discard, .finished:
                    captureHandoff.clear()
                }
            }
        }
    }

    private var idleContent: some View {
        VStack(alignment: .leading, spacing: 20) {
            SourceNotice(text: store.sourceNotice)

            if let savedSeed = captureHandoff.savedSeed,
               captureHandoff.pendingSeed == nil {
                VStack(alignment: .leading, spacing: 14) {
                    SectionLabel(text: "Pending review")
                    Text("Continue \(savedSeed.fileName)")
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                    Text("The screenshot and your reviewed draft remain on this device. No person was changed.")
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Resume capture review") {
                        captureHandoff.resume()
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier("resume-capture-review")
                }
                .tsCard()
            }

            VStack(alignment: .leading, spacing: 16) {
                SectionLabel(text: "90-second product loop")

                Text("See the value after confirmation")
                    .font(.system(.title2, design: .rounded).weight(.bold))
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)

                Text("A synthetic conversation becomes exact facts, two reviewable action cards, and one relationship-aware insight.")
                    .font(.body)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)

                HeroConversationPreview()

                VStack(alignment: .leading, spacing: 8) {
                    Text("Optional recruiter context")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.tsMutedInk)

                    TextEditor(text: $recruiterContext)
                        .font(.body)
                        .foregroundStyle(Color.tsInk)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 92)
                        .padding(10)
                        .background(
                            Color.tsSurfaceMuted,
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                        )
                        .accessibilityLabel("Optional recruiter context")
                        .accessibilityIdentifier("hero-recruiter-context")
                }

                Button {
                    store.beginHeroLoop(recruiterContext: recruiterContext)
                } label: {
                    Label("Run screenshot → action → insight", systemImage: "arrow.right.circle.fill")
                }
                .buttonStyle(TSPrimaryButtonStyle())
                .accessibilityIdentifier("open-hero-loop")

                Text("Synthetic evidence only · arbitrary-image OCR and external writes remain explicitly out of scope.")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .tsCard()

            VStack(alignment: .leading, spacing: 16) {
                SectionLabel(text: "Try your own image")

                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Choose one conversation image")
                                .font(.headline)
                                .foregroundStyle(Color.tsInk)
                            Text("Review on-device text, compare identity evidence, then attach it to one relationship Wiki.")
                                .font(.subheadline)
                                .foregroundStyle(Color.tsMutedInk)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    } icon: {
                        Image(systemName: "photo.badge.plus")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(Color.tsVermilion)
                    }
                    .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("choose-image")
                .accessibilityHint("Opens the system photo picker, then starts text and identity review.")
            }
            .tsCard()

            VStack(alignment: .leading, spacing: 16) {
                SectionLabel(text: "Synthetic fixture demo")

                Picker("Fixture case", selection: $store.selectedFixtureID) {
                    ForEach(store.suite.cases) { fixture in
                        Text("\(fixture.id) · \(fixture.title)")
                            .tag(fixture.id)
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("fixture-picker")

                Text("Fixture data is synthetic and intentionally selected. It is never inferred from the image above.")
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)

                Button {
                    store.beginFixtureImport()
                } label: {
                    Label("Open selected synthetic case", systemImage: "doc.text.magnifyingglass")
                }
                .buttonStyle(TSPrimaryButtonStyle())
                .accessibilityIdentifier("open-fixture")
            }
            .tsCard()

            DisclosureGroup(isExpanded: $localhostExpanded) {
                VStack(alignment: .leading, spacing: 14) {
                    TextField("http://127.0.0.1:8787/fixtures.json", text: $store.localhostAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityLabel("Local fixture server address")
                        .accessibilityIdentifier("localhost-address")

                    Text("Read-only sync accepts only localhost or loopback addresses and requires the same eight-case fixture contract.")
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)

                    Button("Sync and open selected case") {
                        store.syncFromLocalhost()
                    }
                    .buttonStyle(TSSecondaryButtonStyle())
                    .accessibilityIdentifier("sync-localhost")
                }
                .padding(.top, 14)
            } label: {
                Label("Configure localhost fixture sync", systemImage: "network")
                    .font(.headline)
                    .foregroundStyle(Color.tsInk)
            }
            .tsCard()
        }
    }

    private func importingContent(_ kind: ImportKind) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            SectionLabel(text: "Importing")
                .accessibilityIdentifier("importing-state")
            ProgressView()
                .controlSize(.large)
                .accessibilityLabel(kind.title)
            Text(kind.title)
                .font(.title2.weight(.semibold))
                .foregroundStyle(Color.tsInk)
            Text("No fact or action is available until this step finishes. Cancelling leaves candidate state unchanged.")
                .font(.body)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)

            Button("Cancel import") {
                photoImportTask?.cancel()
                store.cancelImport()
            }
            .buttonStyle(TSSecondaryButtonStyle())
            .accessibilityIdentifier("cancel-import")
        }
        .tsCard()
    }

    private func cancelledContent(_ kind: ImportKind) -> some View {
        StateMessage(
            eyebrow: "Import cancelled",
            icon: "xmark.circle",
            title: "\(kind.title) was cancelled",
            detail: "No evidence was interpreted, no fact was proposed, and no external record changed."
        ) {
            Button("Return to import") {
                clearImageAndReset()
            }
            .buttonStyle(TSPrimaryButtonStyle())
            .accessibilityIdentifier("cancelled-recovery")
        }
    }

    private func failedContent(_ failure: ImportFailure) -> some View {
        StateMessage(
            eyebrow: "Import failed",
            icon: "exclamationmark.triangle",
            title: "Nothing was changed",
            detail: failure.message
        ) {
            VStack(alignment: .leading, spacing: 12) {
                if failure.kind == .localhost || failure.kind == .backend {
                    Button(
                        failure.kind == .backend
                            ? "Retry canonical state read"
                            : "Retry localhost sync"
                    ) {
                        store.retryImport()
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier("retry-import")
                }

                Button("Return to import") {
                    clearImageAndReset()
                }
                .buttonStyle(TSSecondaryButtonStyle())
                .accessibilityIdentifier("failed-recovery")
            }
        }
    }

    private var unboundImageContent: some View {
        VStack(alignment: .leading, spacing: 20) {
            SourceNotice(text: store.sourceNotice)

            if let importedImage {
                Image(uiImage: importedImage)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 260)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .accessibilityLabel("The user-selected, unbound image")
            } else {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.tsSurfaceMuted)
                    .frame(height: 180)
                    .overlay {
                        Image(systemName: "photo")
                            .font(.largeTitle)
                            .foregroundStyle(Color.tsMutedInk)
                    }
                    .accessibilityLabel("Simulated user-selected, unbound image")
            }

            StateMessage(
                eyebrow: "Unbound evidence",
                icon: "link.badge.plus",
                title: "Unrelated image selected",
                detail: "No fixture facts are shown. This prototype does not OCR, identify a person, or bind arbitrary images to a candidate."
            ) {
                Button("Remove image and return") {
                    clearImageAndReset()
                }
                .buttonStyle(TSPrimaryButtonStyle())
            }
        }
    }

    @ViewBuilder
    private var fixtureReviewContent: some View {
        if let session = store.session {
            FixtureReviewView(
                session: session,
                sourceNotice: store.sourceNotice,
                dynamicTypeSize: dynamicTypeSize,
                onConfirm: { _ = store.confirmFact(id: $0) },
                onEdit: { _ = store.editFact(id: $0, value: $1) },
                onDismiss: { _ = store.dismissFact(id: $0) },
                onPreviewAction: { _ = store.showActionPreview() },
                onFinishWithoutAction: store.finishWithoutAction,
                onCancelReview: clearImageAndReset
            )
        } else {
            StateMessage(
                eyebrow: "Review unavailable",
                icon: "exclamationmark.triangle",
                title: "No fixture is open",
                detail: "Return to import and intentionally choose a synthetic case."
            ) {
                Button("Return to import", action: clearImageAndReset)
                    .buttonStyle(TSPrimaryButtonStyle())
            }
        }
    }

    @ViewBuilder
    private var actionPreviewContent: some View {
        if let session = store.session {
            ActionPreviewView(
                session: session,
                sourceNotice: store.sourceNotice,
                dynamicTypeSize: dynamicTypeSize,
                onApproveAction: { _ = store.approveAction(id: $0) },
                onDismissAction: { _ = store.dismissAction(id: $0) },
                onReturnToReview: store.returnToReview,
                onCompleteHandoff: store.completeLocalHandoff
            )
        }
    }

    private func outcomeContent(_ outcome: ReviewOutcome) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            if let insight = store.session?.momentumInsight {
                MomentumInsightView(
                    insight: insight,
                    eyebrow: "Confirmed-context insight"
                )
            }

            StateMessage(
                eyebrow: "Outcome",
                icon: outcome.kind == .refused ? "hand.raised" : "checkmark.circle",
                title: outcome.title,
                detail: outcome.detail
            ) {
                VStack(alignment: .leading, spacing: 14) {
                    Label("No external changes", systemImage: "lock.shield")
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                        .accessibilityIdentifier("no-external-changes")

                    Button("Review another synthetic case") {
                        clearImageAndReset()
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier("review-another")
                }
            }
        }
    }

    private func loadSelectedPhoto(_ item: PhotosPickerItem?) {
        photoImportTask?.cancel()
        guard let item else { return }

        store.beginSelectedImageImport()
        photoImportTask = Task {
            do {
                guard let data = try await item.loadTransferable(type: Data.self),
                      UIImage(data: data) != nil else {
                    store.failSelectedImageImport(
                        message: "The selected item could not be read as an image. No review state changed."
                    )
                    return
                }
                try Task.checkCancellation()
                let mediaType = item.supportedContentTypes.first?
                    .preferredMIMEType ?? "image/*"
                let seed = try await PendingCaptureInbox.shared.stage(
                    imageData: data,
                    fileName: "conversation-\(Int(Date().timeIntervalSince1970)).jpg",
                    mediaType: mediaType,
                    origin: .photosPicker
                )
                try Task.checkCancellation()
                store.reset()
                captureHandoff.present(seed)
            } catch is CancellationError {
                return
            } catch {
                store.failSelectedImageImport(
                    message: "The selected image could not be imported. No review state changed."
                )
            }
        }
    }

    private func clearImageAndReset() {
        photoImportTask?.cancel()
        photoImportTask = nil
        importedImage = nil
        selectedPhoto = nil
        store.reset()
    }
}

#Preview("Idle") {
    CandidateSignalView(
        store: CandidateSignalStore(
            importDelayNanoseconds: 0,
            launchConfiguration: AppLaunchConfiguration(scenario: .idle, endpoint: nil)
        )
    )
}

#Preview("TS-CORE-01 review") {
    CandidateSignalView(
        store: CandidateSignalStore(
            importDelayNanoseconds: 0,
            launchConfiguration: AppLaunchConfiguration(
                scenario: .fixture("TS-CORE-01"),
                endpoint: nil
            )
        )
    )
}

#Preview("Import failure") {
    CandidateSignalView(
        store: CandidateSignalStore(
            importDelayNanoseconds: 0,
            launchConfiguration: AppLaunchConfiguration(
                scenario: .importFailed,
                endpoint: nil
            )
        )
    )
}
