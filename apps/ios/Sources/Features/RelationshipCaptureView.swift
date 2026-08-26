import SwiftUI
import UIKit

enum CaptureDismissDisposition {
    case keepForLater
    case discard
    case finished
    case continueInAgent(RelationshipCaptureCompletion)
}

private struct CaptureSourceInspectionView: View {
    @Environment(\.dismiss) private var dismiss

    let image: UIImage

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                ZoomableCaptureImage(image: image)
                    .accessibilityLabel("Original conversation screenshot")
                    .accessibilityHint("Pinch or double tap to zoom while checking the recognized text.")
                    .accessibilityIdentifier("capture-source-inspection")
            }
            .navigationTitle("Inspect original")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.black, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                    .accessibilityIdentifier("close-source-inspection")
                }
            }
            .safeAreaInset(edge: .bottom) {
                Text("Pinch or double tap to zoom. Return to the review to correct OCR errors.")
                    .font(.caption)
                    .foregroundStyle(Color.white.opacity(0.82))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity)
                    .background(Color.black.opacity(0.88))
            }
        }
        .tint(.white)
    }
}

private struct ZoomableCaptureImage: UIViewRepresentable {
    let image: UIImage

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> UIScrollView {
        let scrollView = UIScrollView()
        scrollView.backgroundColor = .black
        scrollView.minimumZoomScale = 1
        scrollView.maximumZoomScale = 6
        scrollView.delegate = context.coordinator
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.showsVerticalScrollIndicator = false
        scrollView.bouncesZoom = true

        let imageView = UIImageView(image: image)
        imageView.contentMode = .scaleAspectFit
        imageView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(imageView)
        NSLayoutConstraint.activate([
            imageView.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor),
            imageView.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
            imageView.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
            imageView.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor),
            imageView.heightAnchor.constraint(equalTo: scrollView.frameLayoutGuide.heightAnchor),
        ])

        context.coordinator.imageView = imageView
        context.coordinator.scrollView = scrollView
        let doubleTap = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.toggleZoom(_:))
        )
        doubleTap.numberOfTapsRequired = 2
        scrollView.addGestureRecognizer(doubleTap)
        return scrollView
    }

    func updateUIView(_ scrollView: UIScrollView, context: Context) {
        context.coordinator.imageView?.image = image
    }

    final class Coordinator: NSObject, UIScrollViewDelegate {
        weak var imageView: UIImageView?
        weak var scrollView: UIScrollView?

        func viewForZooming(in scrollView: UIScrollView) -> UIView? {
            imageView
        }

        @objc func toggleZoom(_ gesture: UITapGestureRecognizer) {
            guard let scrollView else { return }
            if scrollView.zoomScale > scrollView.minimumZoomScale {
                scrollView.setZoomScale(scrollView.minimumZoomScale, animated: true)
            } else {
                let point = gesture.location(in: imageView)
                let scale = min(2.5, scrollView.maximumZoomScale)
                let size = CGSize(
                    width: scrollView.bounds.width / scale,
                    height: scrollView.bounds.height / scale
                )
                scrollView.zoom(
                    to: CGRect(
                        x: point.x - size.width / 2,
                        y: point.y - size.height / 2,
                        width: size.width,
                        height: size.height
                    ),
                    animated: true
                )
            }
        }
    }
}

@MainActor
struct RelationshipCaptureView: View {
    @StateObject private var store: RelationshipCaptureStore
    @State private var showCloseOptions = false
    @State private var showSourceInspection = false
    let onDismiss: (CaptureDismissDisposition) -> Void

    init(
        seed: PendingCaptureSeed,
        backendURL: URL,
        accessToken: String? = nil,
        initialDraft: RecognizedCaptureDraft? = nil,
        onDismiss: @escaping (CaptureDismissDisposition) -> Void
    ) {
        _store = StateObject(
            wrappedValue: RelationshipCaptureStore(
                seed: seed,
                service: URLRelationshipCaptureClient(
                    baseURL: backendURL,
                    accessToken: accessToken
                ),
                initialDraft: initialDraft
            )
        )
        self.onDismiss = onDismiss
    }

    init(
        store: RelationshipCaptureStore,
        onDismiss: @escaping (CaptureDismissDisposition) -> Void = { _ in }
    ) {
        _store = StateObject(wrappedValue: store)
        self.onDismiss = onDismiss
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.tsCanvas.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        sourceHeader

                        switch store.stage {
                        case .recognizing:
                            progressCard(
                                eyebrow: "On-device recognition",
                                title: "Reading the screenshot",
                                detail: "The image remains on this device. Nothing has been attached to a person."
                            )
                        case .reviewing:
                            reviewContent
                        case .submitting:
                            progressCard(
                                eyebrow: "Governed source",
                                title: "Saving reviewed text",
                                detail: "The reviewed text is being stored as evidence. Identity remains unresolved."
                            )
                        case .resolvingIdentity:
                            identityReviewContent
                        case .decidingIdentity:
                            progressCard(
                                eyebrow: "Explicit identity decision",
                                title: "Applying your selection",
                                detail: "Only the selected person and relationship can receive this source."
                            )
                        case .compilingWiki:
                            progressCard(
                                eyebrow: "Living person page",
                                title: "Compiling the relationship Wiki",
                                detail: "Evidence, confirmed state, conflicts, and open questions remain distinct."
                            )
                        case let .completed(completion):
                            completionContent(completion)
                        case let .failed(failure):
                            failureContent(failure)
                        }

                        relationshipBoundary
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 18)
                }
            }
            .navigationTitle("Review capture")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showCloseOptions = true
                    } label: {
                        Image(systemName: "xmark")
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Close capture review")
                    .accessibilityIdentifier("close-capture-review")
                }
            }
        }
        .tint(.tsVermilion)
        .task {
            store.start()
        }
        .onChange(of: store.draft) { _ in
            if store.stage == .reviewing {
                store.persistDraft()
            }
        }
        .confirmationDialog(
            "Close this review?",
            isPresented: $showCloseOptions,
            titleVisibility: .visible
        ) {
            Button("Keep for later") {
                onDismiss(.keepForLater)
            }
            Button("Discard capture", role: .destructive) {
                Task {
                    await store.discard()
                    onDismiss(.discard)
                }
            }
            Button("Continue reviewing", role: .cancel) {}
        } message: {
            Text("Keeping it preserves the screenshot and reviewed draft for the next app launch.")
        }
        .sheet(isPresented: $showSourceInspection) {
            if let image = UIImage(data: store.seed.imageData) {
                CaptureSourceInspectionView(image: image)
            }
        }
    }

    @ViewBuilder
    private var sourceHeader: some View {
        if UIImage(data: store.seed.imageData) != nil {
            Button {
                showSourceInspection = true
            } label: {
                sourceHeaderContent(showsInspectionCue: true)
            }
            .buttonStyle(.plain)
            .tsCard()
            .accessibilityLabel("Inspect original conversation screenshot")
            .accessibilityHint("Opens the original image for zooming before you correct the recognized text.")
            .accessibilityIdentifier("inspect-capture-source")
        } else {
            sourceHeaderContent(showsInspectionCue: false)
                .tsCard()
                .accessibilityIdentifier("capture-source-header")
        }
    }

    private func sourceHeaderContent(showsInspectionCue: Bool) -> some View {
        HStack(alignment: .center, spacing: 14) {
            imagePreview
                .frame(width: 62, height: 78)
                .overlay(alignment: .bottomTrailing) {
                    if showsInspectionCue {
                        Image(systemName: "magnifyingglass")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color.white)
                            .padding(6)
                            .background(Color.black.opacity(0.68), in: Circle())
                            .padding(5)
                    }
                }

            VStack(alignment: .leading, spacing: 5) {
                SectionLabel(text: store.seed.origin.label)
                Text(store.seed.fileName)
                    .font(.headline)
                    .foregroundStyle(Color.tsInk)
                    .lineLimit(2)
                Text("Original image stays on this device")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
            }
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private var imagePreview: some View {
        if let image = UIImage(data: store.seed.imageData) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityLabel("Selected conversation screenshot")
        } else {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.tsSurfaceMuted)
                .overlay {
                    Image(systemName: "text.viewfinder")
                        .foregroundStyle(Color.tsMutedInk)
                }
                .accessibilityLabel("Conversation screenshot placeholder")
        }
    }

    private var reviewContent: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 14) {
                SectionLabel(text: "1 · Review evidence")
                Text("Correct the text before it becomes evidence")
                    .font(.system(.title2, design: .rounded).weight(.bold))
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
                Text("OCR can be wrong. Speaker identity stays unknown until another source supports it.")
                    .font(.body)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)

                TextEditor(text: $store.draft.reviewedText)
                    .font(.body)
                    .foregroundStyle(Color.tsInk)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 190)
                    .padding(12)
                    .background(
                        Color.tsEvidence,
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                    )
                    .overlay {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.tsLine, lineWidth: 1)
                    }
                    .accessibilityLabel("Reviewed conversation text")
                    .accessibilityHint("Edit any text recognition errors before saving.")
                    .accessibilityIdentifier("reviewed-ocr-text")

                Label(
                    store.draft.speaker.map {
                        "Attribution: \($0.label) · recruiter reviewed"
                    } ?? "Attribution: not reviewed · remains unresolved",
                    systemImage: "quote.bubble"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(
                    store.draft.speaker == nil || store.draft.speaker == .unknown
                        ? Color.tsWarning
                        : Color.tsConfirmed
                )
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("unknown-speaker-boundary")

                Picker("Who wrote the reviewed text?", selection: $store.draft.speaker) {
                    Text("Not reviewed").tag(Optional<TextSignalSpeaker>.none)
                    ForEach(TextSignalSpeaker.allCases) { speaker in
                        Text(speaker.label).tag(Optional(speaker))
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("capture-speaker-review")

                Text(
                    "Choose only when the screenshot supports it. Unresolved speaker is valid, but Agent proposals stay unavailable until candidate attribution is confirmed."
                )
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            }
            .tsCard()

            VStack(alignment: .leading, spacing: 16) {
                SectionLabel(text: "2 · Identity clue")
                Text("A clue finds candidates; it never chooses one.")
                    .font(.headline)
                    .foregroundStyle(Color.tsInk)

                TextField("Person name, if visible", text: $store.draft.displayNameHint)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("capture-person-hint")

                Picker("Identity clue type", selection: $store.draft.handleType) {
                    ForEach(IdentityHandleType.allCases) { type in
                        Text(type.label).tag(type)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("capture-handle-type")

                TextField(
                    store.draft.handleType == .phone
                        ? "Phone number"
                        : store.draft.handleType == .email
                            ? "Email address"
                            : "WeChat ID",
                    text: $store.draft.handleValue
                )
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(
                    store.draft.handleType == .phone
                        ? .phonePad
                        : store.draft.handleType == .email
                            ? .emailAddress
                            : .default
                )
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("capture-handle-value")
            }
            .tsCard()

            VStack(alignment: .leading, spacing: 16) {
                SectionLabel(text: "3 · Relationship scope")
                TextField("Relationship label", text: $store.draft.relationshipLabel)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("capture-relationship-label")
                TextField("Purpose", text: $store.draft.relationshipPurpose, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("capture-relationship-purpose")
                TextField("Role, optional", text: $store.draft.relationshipRole)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("capture-relationship-role")
            }
            .tsCard()

            Button {
                store.submitReviewedDraft()
            } label: {
                Label("Save and check identity", systemImage: "person.crop.circle.badge.questionmark")
            }
            .buttonStyle(TSPrimaryButtonStyle())
            .disabled(!store.draft.canSubmit)
            .accessibilityIdentifier("submit-reviewed-capture")

            Text("This saves reviewed text and source metadata. It does not save the original image or bind a person yet.")
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var identityReviewContent: some View {
        if let identityCase = store.identityCase {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel(text: "Identity review")
                    Text("Who does this source belong to?")
                        .font(.system(.title2, design: .rounded).weight(.bold))
                        .foregroundStyle(Color.tsInk)
                    Text(identityCase.reason)
                        .font(.body)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Label(
                        "No person is selected by default",
                        systemImage: "hand.tap"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.tsWarning)
                    .accessibilityIdentifier("identity-no-preselection")
                }
                .tsCard()

                if identityCase.candidates.isEmpty {
                    StateMessage(
                        eyebrow: "No safe match",
                        icon: "person.crop.circle.badge.questionmark",
                        title: "No existing person matches this clue",
                        detail: "Create a separate person only if the source gives you enough identity evidence. Otherwise leave it unresolved."
                    ) {
                        EmptyView()
                    }
                } else {
                    ForEach(identityCase.candidates) { candidate in
                        identityCandidateCard(candidate, identityCase: identityCase)
                    }
                }

                if store.selectedCandidateID != nil {
                    Button("Bind source to selected person") {
                        store.bindSelectedCandidate()
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier("bind-selected-person")
                }

                if !store.draft.displayNameHint.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ).isEmpty {
                    Button("Create a separate person") {
                        store.createNewPerson()
                    }
                    .buttonStyle(TSSecondaryButtonStyle())
                    .accessibilityIdentifier("create-new-person-from-capture")
                }

                Button("Leave identity unresolved") {
                    store.leaveUnresolved()
                }
                .buttonStyle(TSTextButtonStyle())
                .accessibilityIdentifier("leave-identity-unresolved")
            }
        }
    }

    private func identityCandidateCard(
        _ candidate: IdentityResolutionCandidate,
        identityCase: IdentityResolutionCase
    ) -> some View {
        let selectable = store.isCandidateSelectable(candidate)
        let selected = store.selectedCandidateID == candidate.personID

        return VStack(alignment: .leading, spacing: 14) {
            Button {
                store.selectCandidate(candidate)
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    Image(
                        systemName: selected
                            ? "checkmark.circle.fill"
                            : selectable
                                ? "circle"
                                : "clock.arrow.circlepath"
                    )
                    .font(.title3)
                    .foregroundStyle(
                        selected
                            ? Color.tsConfirmed
                            : candidate.temporalRole == .historical
                                ? Color.tsWarning
                                : Color.tsMutedInk
                    )

                    VStack(alignment: .leading, spacing: 6) {
                        Text(candidate.displayLabel)
                            .font(.headline)
                            .foregroundStyle(Color.tsInk)
                        Text(candidate.temporalRole.label)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(
                                candidate.temporalRole == .current
                                    ? Color.tsConfirmed
                                    : Color.tsWarning
                            )
                        Text(
                            "\(candidate.contextCount) relationships · \(candidate.captureCount) governed sources"
                        )
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!selectable)
            .accessibilityIdentifier("identity-candidate-\(candidate.personID)")
            .accessibilityHint(
                selectable
                    ? "Selects this person for an explicit binding decision."
                    : "Historical clue cannot be selected while another person owns the current clue."
            )

            VStack(alignment: .leading, spacing: 6) {
                ForEach(candidate.matchReasons, id: \.self) { reason in
                    Label(reason, systemImage: "link")
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if !selectable {
                Text("Protected historical match: the same clue has a different current owner.")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsWarning)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("historical-candidate-protected")
            }

            if selected && !candidate.relationshipContexts.isEmpty {
                Picker(
                    "Relationship",
                    selection: Binding(
                        get: {
                            store.selectedContextID
                                ?? candidate.relationshipContexts[0].id
                        },
                        set: { value in
                            if let context = candidate.relationshipContexts.first(
                                where: { $0.id == value }
                            ) {
                                store.selectContext(context)
                            }
                        }
                    )
                ) {
                    ForEach(candidate.relationshipContexts) { context in
                        Text(context.displayLabel).tag(context.id)
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("candidate-context-picker")
            }
        }
        .tsCard()
        .overlay {
            RoundedRectangle(cornerRadius: 22)
                .stroke(
                    selected ? Color.tsConfirmed : Color.clear,
                    lineWidth: selected ? 2 : 0
                )
        }
    }

    private func completionContent(
        _ completion: RelationshipCaptureCompletion
    ) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            if completion.isUnresolved {
                StateMessage(
                    eyebrow: "Safely preserved",
                    icon: "tray.full",
                    title: "Source saved without guessing a person",
                    detail: "The reviewed evidence remains unresolved and cannot change any person Wiki until a recruiter resolves identity."
                ) {
                    Button("Return to people") {
                        onDismiss(.finished)
                    }
                        .buttonStyle(TSPrimaryButtonStyle())
                        .accessibilityIdentifier("return-to-people")
                }
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    Label(
                        completion.wiki?.quality.verdict == "gold"
                            ? "WIKI · GOLD"
                            : "WIKI · \(completion.wiki?.quality.verdict.uppercased() ?? "NOT COMPILED")",
                        systemImage: completion.wiki?.quality.verdict == "gold"
                            ? "checkmark.seal.fill"
                            : "exclamationmark.triangle"
                    )
                    .font(.caption.weight(.bold))
                    .tracking(1)
                    .foregroundStyle(
                        completion.wiki?.quality.verdict == "gold"
                            ? Color.tsConfirmed
                            : Color.tsWarning
                    )
                    .accessibilityIdentifier("wiki-quality-verdict")

                    Text("The person page is current")
                        .font(.system(.title2, design: .rounded).weight(.bold))
                        .foregroundStyle(Color.tsInk)
                    Text(
                        "\(completion.wiki?.blocks.count ?? 0) source-linked blocks"
                    )
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)

                    Button("Continue in Agent Session") {
                        onDismiss(.continueInAgent(completion))
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier("continue-capture-in-agent")

                    Button("Return to this person") {
                        onDismiss(.finished)
                    }
                    .buttonStyle(TSSecondaryButtonStyle())
                    .accessibilityIdentifier("return-to-person")
                }
                .tsCard()

                if let personDisplayLabel = completion.personDisplayLabel {
                    if let calendarProposal = DeviceCalendarProposalDetector.detect(
                        draft: store.draft,
                        personDisplayName: personDisplayLabel,
                        sourceID: completion.captureID,
                        capturedAt: store.seed.createdAt
                    ) {
                        DeviceCalendarHandoffView(proposal: calendarProposal)
                    }

                    DeviceContactHandoffView(
                        draft: DeviceContactDraft(
                            sourceID: completion.captureID,
                            displayName: personDisplayLabel,
                            handleType: store.draft.handleType,
                            handleValue: store.draft.handleValue
                        ),
                        relationshipLabel: completion.relationshipDisplayLabel
                            ?? store.draft.relationshipLabel
                    )
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: "Receipt")
                receiptRow(label: "Capture", value: completion.captureID)
                receiptRow(label: "Resource", value: completion.resourceID)
                if let personID = completion.personID {
                    receiptRow(label: "Person", value: personID)
                }
                if let contextID = completion.relationshipContextID {
                    receiptRow(label: "Relationship", value: contextID)
                }
            }
            .tsCard()
            .accessibilityIdentifier("capture-completion-receipt")
        }
    }

    private func receiptRow(label: String, value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
            Spacer()
            Text(String(value.prefix(12)))
                .font(.caption.monospaced())
                .foregroundStyle(Color.tsInk)
        }
        .accessibilityElement(children: .combine)
    }

    private func progressCard(
        eyebrow: String,
        title: String,
        detail: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionLabel(text: eyebrow)
            ProgressView()
                .controlSize(.large)
                .accessibilityLabel(title)
            Text(title)
                .font(.system(.title2, design: .rounded).weight(.bold))
                .foregroundStyle(Color.tsInk)
            Text(detail)
                .font(.body)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .tsCard()
        .accessibilityIdentifier("capture-progress")
    }

    private func failureContent(_ failure: RelationshipCaptureFailure) -> some View {
        StateMessage(
            eyebrow: "Nothing was silently changed",
            icon: "arrow.clockwise.circle",
            title: failure.title,
            detail: failure.message
        ) {
            VStack(alignment: .leading, spacing: 12) {
                Button("Retry safely") {
                    store.retry()
                }
                .buttonStyle(TSPrimaryButtonStyle())
                .accessibilityIdentifier("retry-capture-step")

                if failure.recoveryStage != .recognition {
                    Button("Return to reviewed text") {
                        store.returnToReview()
                    }
                    .buttonStyle(TSSecondaryButtonStyle())
                    .accessibilityIdentifier("return-to-capture-review")
                }
            }
        }
    }

    private var relationshipBoundary: some View {
        Label {
            Text("Evidence, identity, relationship scope, compiled Wiki, and any future action remain separate. No external message or system record is created here.")
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "lock.shield")
        }
        .font(.caption)
        .foregroundStyle(Color.tsMutedInk)
        .padding(.horizontal, 4)
        .accessibilityIdentifier("capture-safety-boundary")
    }
}
