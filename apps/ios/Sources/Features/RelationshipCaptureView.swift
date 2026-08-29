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
    @Environment(\.appLanguage) private var appLanguage

    let image: UIImage

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                ZoomableCaptureImage(image: image)
                    .accessibilityLabel(
                        appLanguage.text("Original conversation screenshot")
                    )
                    .accessibilityHint(
                        appLanguage.text(
                            "Pinch or double tap to zoom while checking the recognized text."
                        )
                    )
                    .accessibilityIdentifier("capture-source-inspection")
            }
            .navigationTitle(appLanguage.text("Inspect original"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.black, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(appLanguage.text("Done")) {
                        dismiss()
                    }
                    .accessibilityIdentifier("close-source-inspection")
                }
            }
            .safeAreaInset(edge: .bottom) {
                Text(
                    appLanguage.text(
                        "Pinch or double tap to zoom. Return to the review to correct OCR errors."
                    )
                )
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
    @State private var relationshipDetailsExpanded = false
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
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
                                eyebrow: appLanguage.text("On-device recognition"),
                                title: appLanguage.text("Reading the screenshot"),
                                detail: appLanguage.text(
                                    "The image remains on this device. Nothing has been attached to a person."
                                )
                            )
                        case .reviewing:
                            reviewContent
                        case .submitting:
                            progressCard(
                                eyebrow: appLanguage.text("Governed source"),
                                title: appLanguage.text("Saving reviewed text"),
                                detail: appLanguage.text(
                                    "The reviewed text is being stored as evidence. Identity remains unresolved."
                                )
                            )
                        case .resolvingIdentity:
                            identityReviewContent
                        case .decidingIdentity:
                            progressCard(
                                eyebrow: appLanguage.text("Explicit identity decision"),
                                title: appLanguage.text("Applying your selection"),
                                detail: appLanguage.text(
                                    "Only the selected person and relationship can receive this source."
                                )
                            )
                        case .compilingWiki:
                            progressCard(
                                eyebrow: appLanguage.text("Living person page"),
                                title: appLanguage.text("Compiling the relationship Wiki"),
                                detail: appLanguage.text(
                                    "Evidence, confirmed state, conflicts, and open questions remain distinct."
                                )
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
            .navigationTitle(appLanguage.text("Review capture"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showCloseOptions = true
                    } label: {
                        Image(systemName: "xmark")
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel(appLanguage.text("Close capture review"))
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
            appLanguage.text("Close this review?"),
            isPresented: $showCloseOptions,
            titleVisibility: .visible
        ) {
            Button(appLanguage.text("Keep for later")) {
                onDismiss(.keepForLater)
            }
            Button(appLanguage.text("Discard capture"), role: .destructive) {
                Task {
                    await store.discard()
                    onDismiss(.discard)
                }
            }
            Button(appLanguage.text("Continue reviewing"), role: .cancel) {}
        } message: {
            Text(
                appLanguage.text(
                    "Keeping it preserves the screenshot and reviewed draft for the next app launch."
                )
            )
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
            .accessibilityLabel(
                appLanguage.text("Inspect original conversation screenshot")
            )
            .accessibilityHint(
                appLanguage.text(
                    "Opens the original image for zooming before you correct the recognized text."
                )
            )
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
                .frame(width: 76, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
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
                SectionLabel(text: appLanguage.text(store.seed.origin.label))
                Text(appLanguage.text("Conversation screenshot"))
                    .font(.headline)
                    .foregroundStyle(Color.tsInk)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(appLanguage.text("Tap to inspect original"))
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
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
                .accessibilityLabel(
                    appLanguage.text("Selected conversation screenshot")
                )
        } else {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.tsSurfaceMuted)
                .overlay {
                    Image(systemName: "text.viewfinder")
                        .foregroundStyle(Color.tsMutedInk)
                }
                .accessibilityLabel(
                    appLanguage.text("Conversation screenshot placeholder")
                )
        }
    }

    private var reviewContent: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 14) {
                SectionLabel(text: appLanguage.text("1 · Review evidence"))
                Text(appLanguage.text("Correct the text before it becomes evidence"))
                    .font(.system(.title2, design: .rounded).weight(.bold))
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
                Text(
                    appLanguage.text(
                        "OCR can be wrong. Speaker identity stays unknown until another source supports it."
                    )
                )
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
                    .accessibilityLabel(
                        appLanguage.text("Reviewed conversation text")
                    )
                    .accessibilityHint(
                        appLanguage.text("Edit any text recognition errors before saving.")
                    )
                    .accessibilityIdentifier("reviewed-ocr-text")

                speakerReviewControl

                Text(
                    appLanguage.text(
                        "Choose only when the screenshot supports it. Unresolved is a valid result."
                    )
                )
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            }
            .tsCard()

            captureContextReview

            Button {
                store.submitReviewedDraft()
            } label: {
                Label(
                    appLanguage.text("Save and check identity"),
                    systemImage: "person.crop.circle.badge.questionmark"
                )
            }
            .buttonStyle(TSPrimaryButtonStyle())
            .disabled(!store.draft.canSubmit)
            .accessibilityIdentifier("submit-reviewed-capture")

            Text(
                appLanguage.text(
                    "This saves reviewed text and source metadata. It does not save the original image or bind a person yet."
                )
            )
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var speakerReviewControl: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                speakerReviewStatus
                speakerReviewPicker
            }
        } else {
            HStack(alignment: .center, spacing: 12) {
                speakerReviewStatus
                Spacer(minLength: 8)
                speakerReviewPicker
            }
        }
    }

    private var speakerReviewStatus: some View {
        Label(
            speakerReviewStatusText,
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
    }

    private var speakerReviewStatusText: String {
        guard let speaker = store.draft.speaker,
              speaker != .unknown else {
            return appLanguage.text("Speaker unresolved")
        }
        return appLanguage.text("Speaker reviewed")
            + " · \(appLanguage.text(speaker.label))"
    }

    private var speakerReviewPicker: some View {
        Menu {
            Button(appLanguage.text("Clear speaker review")) {
                store.draft.speaker = nil
            }
            ForEach(TextSignalSpeaker.allCases) { speaker in
                Button(appLanguage.text(speaker.label)) {
                    store.draft.speaker = speaker
                }
            }
        } label: {
            HStack(spacing: 5) {
                Text(
                    store.draft.speaker?.label
                        ?? appLanguage.text("Speaker")
                )
                .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption2.weight(.bold))
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.tsVermilion)
            .frame(minHeight: 44)
            .padding(.horizontal, 8)
            .background(Color.tsSurfaceMuted, in: RoundedRectangle(cornerRadius: 10))
        }
        .accessibilityLabel(appLanguage.text("Who wrote the reviewed text?"))
        .accessibilityValue(
            store.draft.speaker.map { appLanguage.text($0.label) }
                ?? appLanguage.text("Not reviewed")
        )
        .accessibilityIdentifier("capture-speaker-review")
    }

    private var captureContextReview: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionLabel(text: appLanguage.text("2 · Identity and purpose"))
            Text(appLanguage.text("Keep only clues visible in this conversation."))
                .font(.headline)
                .foregroundStyle(Color.tsInk)
            Text(
                appLanguage.text(
                    "These clues narrow the review; they never choose a person. Leaving identity unresolved is valid."
                )
            )
            .font(.caption)
            .foregroundStyle(Color.tsMutedInk)
            .fixedSize(horizontal: false, vertical: true)

            TextField(
                appLanguage.text("Person name, if visible"),
                text: $store.draft.displayNameHint
            )
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("capture-person-hint")

            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 10) {
                    captureHandleField
                    captureHandleTypeMenu
                }
            } else {
                HStack(alignment: .center, spacing: 10) {
                    captureHandleField
                    captureHandleTypeMenu
                }
            }

            Divider().overlay(Color.tsLine)

            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    relationshipDetailsExpanded.toggle()
                }
            } label: {
                HStack(alignment: .center, spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(appLanguage.text("Relationship details"))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.tsInk)
                        Text(relationshipSummary)
                            .font(.caption)
                            .foregroundStyle(Color.tsMutedInk)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.tsMutedInk)
                        .rotationEffect(.degrees(relationshipDetailsExpanded ? 180 : 0))
                }
                .contentShape(Rectangle())
                .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityValue(
                relationshipDetailsExpanded
                    ? appLanguage.text("Expanded")
                    : appLanguage.text("Collapsed")
            )
            .accessibilityIdentifier("capture-relationship-details")

            if relationshipDetailsExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    TextField(
                        appLanguage.text("Relationship label"),
                        text: $store.draft.relationshipLabel
                    )
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("capture-relationship-label")
                    TextField(
                        appLanguage.text("Purpose"),
                        text: $store.draft.relationshipPurpose,
                        axis: .vertical
                    )
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("capture-relationship-purpose")
                    TextField(
                        appLanguage.text("Role, optional"),
                        text: $store.draft.relationshipRole
                    )
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("capture-relationship-role")
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .tsCard()
    }

    private var captureHandleField: some View {
        TextField(captureHandlePlaceholder, text: $store.draft.handleValue)
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

    private var captureHandleTypeMenu: some View {
        Menu {
            Picker(
                appLanguage.text("Identity clue type"),
                selection: $store.draft.handleType
            ) {
                ForEach(IdentityHandleType.allCases) { type in
                    Text(appLanguage.text(type.label)).tag(type)
                }
            }
        } label: {
            HStack(spacing: 5) {
                Text(appLanguage.text(store.draft.handleType.label))
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption2.weight(.bold))
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.tsInk)
            .frame(minWidth: 78, minHeight: 44)
            .padding(.horizontal, 8)
            .background(Color.tsSurfaceMuted, in: RoundedRectangle(cornerRadius: 10))
        }
        .accessibilityLabel(appLanguage.text("Identity clue type"))
        .accessibilityValue(appLanguage.text(store.draft.handleType.label))
        .accessibilityIdentifier("capture-handle-type")
    }

    private var relationshipSummary: String {
        let label = store.draft.relationshipLabel.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        let role = store.draft.relationshipRole.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        return [label, role].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var captureHandlePlaceholder: String {
        switch store.draft.handleType {
        case .phone:
            return appLanguage.text("Phone number, if visible")
        case .email:
            return appLanguage.text("Email address, if visible")
        case .wechat:
            return appLanguage.text("WeChat ID, if visible")
        }
    }

    @ViewBuilder
    private var identityReviewContent: some View {
        if let identityCase = store.identityCase {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel(text: appLanguage.text("Identity review"))
                    Text(appLanguage.text("Who does this source belong to?"))
                        .font(.system(.title2, design: .rounded).weight(.bold))
                        .foregroundStyle(Color.tsInk)
                    Text(appLanguage.text(identityCase.reason))
                        .font(.body)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Label(
                        appLanguage.text("No person is selected by default"),
                        systemImage: "hand.tap"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.tsWarning)
                    .accessibilityIdentifier("identity-no-preselection")
                }
                .tsCard()

                if identityCase.candidates.isEmpty {
                    StateMessage(
                        eyebrow: appLanguage.text("No safe match"),
                        icon: "person.crop.circle.badge.questionmark",
                        title: appLanguage.text("No existing person matches this clue"),
                        detail: appLanguage.text(
                            "Create a separate person only if the source gives you enough identity evidence. Otherwise leave it unresolved."
                        )
                    ) {
                        EmptyView()
                    }
                } else {
                    ForEach(identityCase.candidates) { candidate in
                        identityCandidateCard(candidate, identityCase: identityCase)
                    }
                }

                if store.selectedCandidateID != nil {
                    Button(appLanguage.text("Bind source to selected person")) {
                        store.bindSelectedCandidate()
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier("bind-selected-person")
                }

                if !store.draft.displayNameHint.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ).isEmpty {
                    Button(appLanguage.text("Create a separate person")) {
                        store.createNewPerson()
                    }
                    .buttonStyle(TSSecondaryButtonStyle())
                    .accessibilityIdentifier("create-new-person-from-capture")
                }

                Button(appLanguage.text("Leave identity unresolved")) {
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
                        Text(appLanguage.text(candidate.temporalRole.label))
                            .font(.caption.weight(.bold))
                            .foregroundStyle(
                                candidate.temporalRole == .current
                                    ? Color.tsConfirmed
                                    : Color.tsWarning
                            )
                        Text(
                            "\(candidate.contextCount) \(appLanguage.text("relationship contexts")) · \(candidate.captureCount) \(appLanguage.text("governed sources"))"
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
                    ? appLanguage.text(
                        "Selects this person for an explicit binding decision."
                    )
                    : appLanguage.text(
                        "Historical clue cannot be selected while another person owns the current clue."
                    )
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
                Text(
                    appLanguage.text(
                        "Protected historical match: the same clue has a different current owner."
                    )
                )
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsWarning)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("historical-candidate-protected")
            }

            if selected && !candidate.relationshipContexts.isEmpty {
                Picker(
                    appLanguage.text("Relationship"),
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
                    eyebrow: appLanguage.text("Safely preserved"),
                    icon: "tray.full",
                    title: appLanguage.text("Source saved without guessing a person"),
                    detail: appLanguage.text(
                        "The reviewed evidence remains unresolved and cannot change any person Wiki until a recruiter resolves identity."
                    )
                ) {
                    Button(appLanguage.text("Return to people")) {
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

                    Text(appLanguage.text("The person page is current"))
                        .font(.system(.title2, design: .rounded).weight(.bold))
                        .foregroundStyle(Color.tsInk)
                    Text(
                        "\(completion.wiki?.blocks.count ?? 0) \(appLanguage.text("source-linked blocks"))"
                    )
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)

                    Button(appLanguage.text("Continue in Agent Session")) {
                        onDismiss(.continueInAgent(completion))
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier("continue-capture-in-agent")

                    Button(appLanguage.text("Return to this person")) {
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
                SectionLabel(text: appLanguage.text("Receipt"))
                receiptRow(label: appLanguage.text("Capture"), value: completion.captureID)
                receiptRow(label: appLanguage.text("Resource"), value: completion.resourceID)
                if let personID = completion.personID {
                    receiptRow(label: appLanguage.text("Person"), value: personID)
                }
                if let contextID = completion.relationshipContextID {
                    receiptRow(label: appLanguage.text("Relationship"), value: contextID)
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
            eyebrow: appLanguage.text("Nothing was silently changed"),
            icon: "arrow.clockwise.circle",
            title: appLanguage.text(failure.title),
            detail: appLanguage.text(failure.message)
        ) {
            VStack(alignment: .leading, spacing: 12) {
                Button(appLanguage.text("Retry safely")) {
                    store.retry()
                }
                .buttonStyle(TSPrimaryButtonStyle())
                .accessibilityIdentifier("retry-capture-step")

                if failure.recoveryStage != .recognition {
                    Button(appLanguage.text("Return to reviewed text")) {
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
            Text(
                appLanguage.text(
                    "Evidence, identity, relationship scope, compiled Wiki, and any future action remain separate. No external message or system record is created here."
                )
            )
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
