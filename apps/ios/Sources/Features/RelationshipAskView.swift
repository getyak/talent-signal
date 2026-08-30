import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers
import Vision

@MainActor
final class VoiceInputStore: ObservableObject {
    enum Phase: Equatable {
        case idle
        case requestingPermission
        case recording(startedAt: Date)
        case transcribing
        case failed(String)
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var microphonePermission: AudioSignalPermission
    @Published private(set) var transcript: String?

    private let recorder: VoiceDictationRecordingServing
    private var activePayload: VoiceDictationPayload?
    private var transcriber: (any VoiceTranscriptionServing)?
    private var limitTask: Task<Void, Never>?
    private var transcriptionOperation: Task<VoiceTranscriptionDraft, Error>?

    init(recorder: VoiceDictationRecordingServing? = nil) {
        let resolvedRecorder: VoiceDictationRecordingServing
        if let recorder {
            resolvedRecorder = recorder
        } else {
#if DEBUG
            resolvedRecorder = ProcessInfo.processInfo.arguments.contains(
                "--deterministic-voice-input"
            )
                ? DeterministicVoiceDictationRecorder()
                : VoiceDictationRecorder()
#else
            resolvedRecorder = VoiceDictationRecorder()
#endif
        }
        self.recorder = resolvedRecorder
        microphonePermission = resolvedRecorder.permissionStatus()
    }

    deinit {
        limitTask?.cancel()
        transcriptionOperation?.cancel()
    }

    var isRecording: Bool {
        if case .recording = phase { return true }
        return false
    }

    var isBusy: Bool {
        switch phase {
        case .requestingPermission, .recording, .transcribing:
            return true
        case .idle, .failed:
            return false
        }
    }

    func refreshPermissionStatus() {
        microphonePermission = recorder.permissionStatus()
    }

    func start(
        sceneIsActive: Bool,
        transcriber: any VoiceTranscriptionServing
    ) async {
        guard !isBusy else { return }
        guard sceneIsActive else {
            phase = .failed(
                "Keep Talent Signal in the foreground to use voice input."
            )
            return
        }
        transcript = nil
        var permission = recorder.permissionStatus()
        if permission == .undetermined {
            phase = .requestingPermission
            permission = await recorder.requestPermission()
        }
        microphonePermission = permission
        guard permission == .granted else {
            phase = .failed(
                "Microphone permission was not granted. No audio was recorded."
            )
            return
        }
        do {
            let recordID = UUID()
            try recorder.start(recordID: recordID)
            self.transcriber = transcriber
            phase = .recording(startedAt: Date())
            limitTask?.cancel()
            limitTask = Task { [weak self] in
                do {
                    try await Task.sleep(for: .seconds(60))
                } catch {
                    return
                }
                await self?.stopAndTranscribe(triggeredByLimit: true)
            }
        } catch {
            try? recorder.cancel()
            phase = .failed(
                (error as? LocalizedError)?.errorDescription
                    ?? "Voice input could not start the microphone."
            )
        }
    }

    func stopAndTranscribe(triggeredByLimit: Bool = false) async {
        guard isRecording, let transcriber else { return }
        if !triggeredByLimit {
            limitTask?.cancel()
            limitTask = nil
        }
        do {
            let payload = try recorder.stop()
            activePayload = payload
            phase = .transcribing
            defer {
                try? recorder.delete(payload)
                activePayload = nil
                self.transcriber = nil
                if triggeredByLimit { limitTask = nil }
            }
            let operation = Task {
                try await transcriber.transcribe(payload)
            }
            transcriptionOperation = operation
            defer { transcriptionOperation = nil }
            let draft = try await operation.value
            try Task.checkCancellation()
            transcript = draft.transcript.trimmingCharacters(
                in: .whitespacesAndNewlines
            )
            phase = .idle
        } catch is CancellationError {
            if case .failed = phase {
                // Foreground loss keeps its explicit recovery message.
            } else {
                phase = .idle
            }
        } catch {
            phase = .failed(
                (error as? LocalizedError)?.errorDescription
                    ?? "Voice transcription failed. Your text draft is unchanged."
            )
        }
    }

    func consumeTranscript() {
        transcript = nil
    }

    func cancel() {
        limitTask?.cancel()
        limitTask = nil
        transcriptionOperation?.cancel()
        transcriptionOperation = nil
        try? recorder.cancel()
        if let activePayload { try? recorder.delete(activePayload) }
        activePayload = nil
        transcriber = nil
        transcript = nil
        phase = .idle
    }

    func stopForForegroundLoss() {
        guard isBusy else { return }
        let wasTranscribing: Bool
        if case .transcribing = phase {
            wasTranscribing = true
        } else {
            wasTranscribing = false
        }
        cancel()
        phase = .failed(
            wasTranscribing
                ? "Voice transcription was interrupted. The temporary recording was deleted; the provider result is unavailable."
                : "Voice input stopped when Talent Signal left the foreground. No audio was sent."
        )
    }

    func dismissFailure() {
        if case .failed = phase { phase = .idle }
    }

    func reportUnavailable() {
        guard !isBusy else { return }
        phase = .failed(
            "Voice dictation is not configured for this workspace. Your message and attachments are unchanged."
        )
    }
}

private struct VoiceListeningVisualizer: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let barCount = 13

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 12.0, paused: reduceMotion)) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            HStack(alignment: .center, spacing: 4) {
                ForEach(0..<barCount, id: \.self) { index in
                    Capsule()
                        .fill(index == barCount / 2 ? Color.tsVermilion : Color.tsInk.opacity(0.72))
                        .frame(width: 3, height: barHeight(index: index, time: time))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 42)
        }
        .accessibilityHidden(true)
    }

    private func barHeight(index: Int, time: TimeInterval) -> CGFloat {
        guard !reduceMotion else {
            return CGFloat(10 + (index * 7) % 22)
        }
        let phase = time * 3.0 + Double(index) * 0.74
        let envelope = 0.5 + 0.5 * sin(phase)
        let stagger = 0.72 + 0.28 * sin(phase * 0.53 + Double(index))
        return 9 + CGFloat(envelope * stagger) * 27
    }
}

private struct VoiceRecordButtonHalo: View {
    let isActive: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if isActive {
            TimelineView(.animation(minimumInterval: 1.0 / 15.0, paused: reduceMotion)) { context in
                let pulse: CGFloat = reduceMotion
                    ? 0
                    : CGFloat(
                        (sin(context.date.timeIntervalSinceReferenceDate * 3.2) + 1) / 2
                    )
                Circle()
                    .stroke(Color.tsVermilion.opacity(0.18 + pulse * 0.18), lineWidth: 1.5)
                    .scaleEffect(1.08 + pulse * 0.12)
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}

enum RelationshipAskCaptureAction: Equatable, Sendable {
    case screenshotReview
    case foregroundAudio
}

enum RelationshipAskEntryMode: Equatable, Sendable {
    case text
    case attachment
    case voice
}

@MainActor
struct RelationshipAskView: View {
    let snapshot: PursuitWorkspaceSnapshot
    let isCanonical: Bool
    @ObservedObject var workspaceStore: PursuitWorkspaceStore
    @ObservedObject var sessionStore: AgentSessionStore
    let sessionID: UUID?
    var initialSeed: AgentSessionSeed? = nil
    var initialEntryMode: RelationshipAskEntryMode = .text
    let ask: (
        _ objective: String,
        _ personID: String,
        _ contextID: String,
        _ idempotencyKey: String,
        _ mediaIDs: [String]
    ) async throws -> RelationshipAskResponse
    let saveContact: (
        _ draft: ConversationContactDraft,
        _ target: ConversationContactTarget,
        _ confirmIdentityClue: Bool,
        _ capturedAt: Date,
        _ idempotencyKey: String
    ) async throws -> ResourceCaptureResult
    let reviewEvidence: (
        _ fragmentID: String,
        _ expectedReviewStatus: String,
        _ expectedLastReviewID: String?,
        _ decision: String,
        _ reason: String,
        _ idempotencyKey: String
    ) async throws -> PursuitEvidenceReviewResult
    let revalidateSessions: () async -> Void
    let onOpenProposal: (WorkspaceProposal) -> Void
    let onCapture: (RelationshipAskCaptureAction) -> Void
    let onOpenPerson: (String) -> Void
    let voiceTranscriber: (any VoiceTranscriptionServing)?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.sizeCategory) private var sizeCategory
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled
    @ScaledMetric(relativeTo: .caption2) private var scopeContextFontSize: CGFloat = 11
    @State private var selectedScope: AskScope?
    @State private var scopeQuery = ""
    @State private var isChoosingScope = false
    @State private var isRequestingScope = false
    @State private var draft = ""
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var isPhotoLibraryPresented = false
    @State private var isFileImporterPresented = false
    @State private var isHomeAttachmentChooserPresented = false
    @State private var mediaDrafts: [AskMediaDraft] = []
    @State private var mediaNotice: String?
    @State private var mediaImportTask: Task<Void, Never>?
    @State private var activeSessionID: UUID?
    @State private var isSending = false
    @State private var isInterpretingContact = false
    @State private var contactInterpretationTask: Task<Void, Never>?
    @State private var contactInterpretationSource: String?
    @State private var contactInterpretationNotice: String?
    @State private var pendingObjective: String?
    @State private var pendingScopedSend: String?
#if DEBUG
    @State private var fixtureAskFailureConsumed = false
    @State private var fixtureContactLookupFailureConsumed = false
#endif
    @State private var errorMessage: String?
    @State private var contactDraft: ConversationContactDraft?
    @State private var contactOperationKey: String?
    @State private var pendingContactTarget: ConversationContactTarget?
    @State private var pendingContactCapturedAt: Date?
    @State private var pendingContactConfirmIdentityClue: Bool?
    @State private var contactCandidates: [WorkspacePerson] = []
    @State private var contactLookupPhase: ConversationContactLookupPhase = .idle
    @State private var contactLookupTask: Task<Void, Never>?
    @State private var selectedContactPersonID: String?
    @State private var selectedContactContextID: String?
    @State private var createDistinctContact = false
    @State private var saveContactForIdentityReview = false
    @State private var confirmContactIdentityClue = false
    @State private var isSavingContact = false
    @State private var contactSaveMessage: String?
    @State private var contactSaveError: String?
    @State private var selectedCitation: SelectedAskCitation?
    @State private var selectedPursuit: SelectedPursuitTarget?
    @State private var reinstatementOperation: AgentEvidenceReviewOperation?
    @State private var reinstatementReason = ""
    @State private var reviewPreparationError: String?
    @State private var isVoiceDisclosurePresented = false
    @State private var presentationDetent: PresentationDetent = .large
    @State private var voiceOperation: Task<Void, Never>?
    @StateObject private var voiceInput = VoiceInputStore()
    @AppStorage("voice-input-cloud-disclosure-v1")
    private var hasAcceptedVoiceDisclosure = false
    @FocusState private var composerFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if isCompactEntry, isHomeAttachmentChooserPresented {
                    homeAttachmentChooser
                } else if isCompactEntry {
                    compactEditorHeader
                    starterGrid
                        .padding(.horizontal, 20)
                        .padding(.bottom, 2)
                    compactComposerContext
                    composer
                    Spacer(minLength: 0)
                } else {
                    if shouldShowScopeBar,
                       contactDraft == nil || contactSaveMessage != nil,
                       !usesScrollableScopeBar {
                        scopeBar
                            .transition(.opacity)
                    }
                    conversation
                    composer
                }
            }
            .background(Color.tsSurface.ignoresSafeArea())
            .navigationTitle(
                isCompactEntry
                    ? ""
                    : appLanguage.text("Session", zhHans: "会话")
            )
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !isCompactEntry {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(appLanguage.text("Close", zhHans: "关闭")) {
                            dismiss()
                        }
                    }
                }
            }
            .toolbar(isCompactEntry ? .hidden : .visible, for: .navigationBar)
        }
        .tint(.tsInk)
        .presentationDetents(
            [.height(126), .medium, .large],
            selection: $presentationDetent
        )
        .presentationDragIndicator(.visible)
        .photosPicker(
            isPresented: $isPhotoLibraryPresented,
            selection: $selectedPhotoItems,
            maxSelectionCount: 10,
            matching: .images
        )
        .fileImporter(
            isPresented: $isFileImporterPresented,
            allowedContentTypes: [.image],
            allowsMultipleSelection: true,
            onCompletion: importSelectedImageFiles
        )
        .sheet(item: $selectedCitation) { selection in
            AskCitationDetailView(
                citation: selection.citation,
                language: appLanguage,
                onReject: isCanonical ? { reason in
                    guard let authorityReviewID = selection.citation.lastReviewID else {
                        throw PursuitWorkspaceClientError.askCitationBindingMismatch
                    }
                    let reviewKey = reviewIdempotencyKey(
                        fragmentID: selection.citation.id,
                        expectedReviewStatus: selection.citation.reviewStatus,
                        authorityToken: authorityReviewID,
                        reason: reason,
                        decision: "rejected"
                    )
                    let scope = selectedScope
                    _ = try sessionStore.beginEvidenceReview(
                        idempotencyKey: reviewKey,
                        taskID: selection.taskID,
                        citation: selection.citation,
                        personDisplayName: scope?.person.displayLabel ?? "Current person",
                        relationshipContextDisplayName: scope?.context.displayLabel
                            ?? "Current relationship",
                        expectedReviewStatus: selection.citation.reviewStatus,
                        decision: "rejected",
                        reason: reason
                    )
                    reviewPreparationError = nil
                    sessionStore.markCitationStale(selection.citation.id)
                    selectedCitation = nil
                    guard sessionStore.claimEvidenceReview(reviewKey) else {
                        return
                    }
                    defer { sessionStore.releaseEvidenceReview(reviewKey) }
                    do {
                        let result = try await reviewEvidence(
                            selection.citation.id,
                            selection.citation.reviewStatus,
                            authorityReviewID,
                            "rejected",
                            reason,
                            reviewKey
                        )
                        if !sessionStore.markEvidenceReviewApplied(
                            reviewKey,
                            result: result
                        ) {
                            reviewPreparationError = postReviewPersistenceMessage
                        }
                    } catch {
                        let isTerminal = recordEvidenceReviewFailure(
                            reviewKey,
                            error: error
                        )
                        if !isTerminal { throw error }
                    }
                } : nil
            )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedPursuit) { target in
            PursuitDetailView(
                pursuit: target.pursuit,
                snapshot: workspaceStore.snapshot,
                currentUserID: workspaceStore.snapshot?.currentUserID,
                workspaceStore: workspaceStore,
                targetActionID: target.actionID,
                onOpenProposal: { proposal in
                    selectedPursuit = nil
                    onOpenProposal(proposal)
                }
            )
        }
        .alert(
            appLanguage.text("Re-review this source?", zhHans: "重新审阅此来源？"),
            isPresented: Binding(
                get: { reinstatementOperation != nil },
                set: { if !$0 { reinstatementOperation = nil } }
            )
        ) {
            TextField(
                appLanguage.text("What changed or was corrected?", zhHans: "发生了什么更正？"),
                text: $reinstatementReason
            )
            Button(appLanguage.text("Cancel", zhHans: "取消"), role: .cancel) {
                reinstatementOperation = nil
                reinstatementReason = ""
            }
            Button(appLanguage.text("Re-review source", zhHans: "重新审阅来源")) {
                guard let operation = reinstatementOperation else { return }
                submitReinstatement(operation)
                reinstatementOperation = nil
            }
            .disabled(
                reinstatementReason.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ).isEmpty
            )
        } message: {
            Text(
                appLanguage.text(
                    "The prior dispute stays in the audit. Old answers stay stale; only a fresh Ask can use the source again.",
                    zhHans: "原争议会保留在审计记录中。旧回复仍为过期；只有新的提问才能再次使用该来源。"
                )
            )
        }
        .task {
            await revalidateAndDismissUnavailableCitation()
            activeSessionID = sessionID
            if let session = sessionStore.session(id: sessionID) {
                if let personID = session.personID,
                   let relationshipContextID = session.relationshipContextID {
                    selectedScope = availableScopes.first {
                        $0.person.id == personID
                            && $0.context.id == relationshipContextID
                    }
                } else {
                    selectedScope = nil
                }
                sessionStore.markRead(session.id)
            } else if let initialSeed {
                selectedScope = availableScopes.first {
                    $0.person.id == initialSeed.personID
                        && $0.context.id == initialSeed.relationshipContextID
                }
                if selectedScope == nil {
                    errorMessage = appLanguage.text(
                        "The reviewed relationship is not available in the current workspace.",
                        zhHans: "当前工作区中找不到刚审阅的关系。"
                    )
                }
            }
            restoreContactProposal()
            restoreDraft(preferred: initialSeed?.suggestedObjective)
            if sessionID != nil || initialSeed != nil || contactDraft != nil {
                presentationDetent = .large
            }
            if sessionID == nil,
               initialSeed == nil,
               contactDraft == nil {
                await Task.yield()
                switch initialEntryMode {
                case .text:
                    presentationDetent = .large
                    if !voiceOverEnabled,
                       !dynamicTypeSize.isAccessibilitySize,
                       !sizeCategory.isAccessibilityCategory {
                        composerFocused = true
                    }
                case .attachment:
                    presentationDetent = .medium
                    isHomeAttachmentChooserPresented = true
                case .voice:
                    if !voiceOverEnabled,
                       !dynamicTypeSize.isAccessibilitySize,
                       !sizeCategory.isAccessibilityCategory {
                        composerPrimaryAction()
                    }
                }
            }
            while !Task.isCancelled {
                do {
                    try await Task.sleep(for: .seconds(60))
                } catch {
                    return
                }
                await revalidateAndDismissUnavailableCitation()
            }
        }
        .onChange(of: selectedCitationIsCurrent) { isCurrent in
            if !isCurrent { selectedCitation = nil }
        }
        .onChange(of: draft) { value in
            guard !isSending else { return }
            if contactInterpretationNotice != nil,
               value.trimmingCharacters(in: .whitespacesAndNewlines)
                != contactInterpretationSource {
                contactInterpretationNotice = nil
                contactInterpretationSource = nil
            }
            if selectedScope == nil,
               value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                isRequestingScope = false
                isChoosingScope = false
                scopeQuery = ""
            }
            if let selectedScope {
                sessionStore.saveDraft(
                    value,
                    personID: selectedScope.person.id,
                    relationshipContextID: selectedScope.context.id
                )
            } else if activeSessionID == nil,
                      initialSeed == nil,
                      contactDraft == nil {
                sessionStore.saveGlobalDraft(value)
            }
        }
        .onChange(of: selectedPhotoItems) { items in
            guard !items.isEmpty else { return }
            importSelectedPhotos(items)
        }
        .onChange(of: isSending) { sending in
            if sending { presentationDetent = .large }
        }
        .onChange(of: isRequestingScope) { requesting in
            if requesting { presentationDetent = .medium }
        }
        .onChange(of: voiceInput.phase) { phase in
            switch phase {
            case .idle:
                break
            case .requestingPermission, .recording, .transcribing, .failed:
                if isCompactEntry { presentationDetent = .medium }
            }
        }
        .onChange(of: selectedScope?.id) { _ in
            guard let selectedScope, !mediaDrafts.isEmpty else { return }
            rebindMediaDrafts(to: selectedScope)
        }
        .onChange(of: voiceInput.transcript) { transcript in
            guard let transcript, !transcript.isEmpty else { return }
            insertVoiceTranscript(transcript)
            voiceInput.consumeTranscript()
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                voiceInput.refreshPermissionStatus()
            } else {
                voiceOperation?.cancel()
                voiceOperation = nil
                voiceInput.stopForForegroundLoss()
            }
        }
        .onDisappear {
            contactInterpretationTask?.cancel()
            contactInterpretationTask = nil
            voiceOperation?.cancel()
            voiceOperation = nil
            voiceInput.cancel()
            mediaImportTask?.cancel()
            mediaImportTask = nil
            discardMediaDrafts()
        }
        .confirmationDialog(
            appLanguage.text("Use Doubao voice transcription?"),
            isPresented: $isVoiceDisclosurePresented,
            titleVisibility: .visible
        ) {
            Button(appLanguage.text("Start voice input")) {
                hasAcceptedVoiceDisclosure = true
                voiceHaptic(.soft)
                startVoiceInput()
            }
            .accessibilityIdentifier("confirm-voice-input-disclosure")
            Button(appLanguage.text("Cancel"), role: .cancel) {}
        } message: {
            Text(
                appLanguage.text(
                    "After you stop, this temporary recording is sent to Doubao for transcription. The words stay editable here and are not sent to the Agent until you tap Send. Talent Signal deletes its temporary audio after the response; provider handling follows your service agreement."
                )
            )
        }
        .accessibilityIdentifier("relationship-ask-sheet")
    }

    private var scopeBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                composerFocused = false
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) {
                    isChoosingScope.toggle()
                }
            } label: {
                Group {
                    if let selectedScope {
                        scopeChip(selectedScope)
                    } else {
                        HStack {
                            Image(systemName: "person.crop.circle.badge.questionmark")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.tsVermilion)
                                .accessibilityHidden(true)
                            Text(
                                appLanguage.text(
                                    isRequestingScope
                                        ? "Who is this about?"
                                        : "Choose a relationship"
                                )
                            )
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.tsInk)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer()
                            Image(systemName: "chevron.down")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Color.tsMutedInk)
                        }
                    }
                }
                .frame(
                    maxWidth: .infinity,
                    minHeight: scopeSelectorMinimumHeight,
                    alignment: .leading
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(isSending)
            .frame(
                maxWidth: .infinity,
                minHeight: scopeSelectorMinimumHeight,
                alignment: .leading
            )
            .accessibilityLabel(
                selectedScope == nil
                    ? appLanguage.text("Choose a relationship for this message")
                    : appLanguage.text("Selected relationship", zhHans: "已选择的关系")
            )
            .accessibilityValue(
                selectedScope.map {
                    "\($0.person.displayLabel), \($0.context.displayLabel)"
                } ?? appLanguage.text("None", zhHans: "未选择")
            )
            .accessibilityHint(
                appLanguage.text(
                    selectedScope == nil
                        ? "Choose a person and relationship for this message."
                        : "Choose a different person or relationship."
                )
            )
            .accessibilityIdentifier("ask-scope-selector")

            if isChoosingScope {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(Color.tsMutedInk)
                        .accessibilityHidden(true)
                    TextField(
                        appLanguage.text("Person or context", zhHans: "人物或情境"),
                        text: $scopeQuery
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("ask-scope-search")
                }
                .frame(minHeight: 44)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private var scopeChoices: some View {
        if filteredScopes.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Label(
                    appLanguage.text("No matching relationships"),
                    systemImage: "magnifyingglass"
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.tsInk)
                Text(appLanguage.text("Try another person or context."))
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                Button(appLanguage.text("Clear search")) {
                    scopeQuery = ""
                }
                .font(.caption.weight(.semibold))
                .frame(minHeight: 44)
            }
            .accessibilityIdentifier("ask-scope-no-results")
        } else if dynamicTypeSize.isAccessibilitySize
                    || sizeCategory.isAccessibilityCategory {
            VStack(spacing: 8) {
                ForEach(filteredScopes) { scope in
                    scopeOption(scope, fillsWidth: true)
                }
            }
        } else {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(filteredScopes) { scope in
                        scopeOption(scope, fillsWidth: false)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    private func scopeOption(_ scope: AskScope, fillsWidth: Bool) -> some View {
        Button {
            selectScope(scope)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(scope.person.displayLabel)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .lineLimit(fillsWidth ? nil : 1)
                    .fixedSize(horizontal: false, vertical: true)
                Text(scope.context.displayLabel)
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(fillsWidth ? nil : 1)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(
                maxWidth: fillsWidth ? .infinity : nil,
                minHeight: 44,
                alignment: .leading
            )
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 14))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(
            "ask-scope-option-\(scope.person.id)-\(scope.context.id)"
        )
    }

    private func scopeChip(_ scope: AskScope) -> some View {
        HStack(alignment: .top, spacing: 8) {
            if !dynamicTypeSize.isAccessibilitySize && !sizeCategory.isAccessibilityCategory {
                Circle()
                    .fill(Color.tsVermilion.opacity(0.14))
                    .frame(width: 26, height: 26)
                    .overlay {
                        Text(initials(scope.person.displayLabel))
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.tsVermilion)
                            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    }
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(scope.person.displayLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 2 : 1)
                    .fixedSize(horizontal: false, vertical: true)
                Text(scope.context.displayLabel)
                    .font(.system(size: scopeContextFontSize))
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 2 : 1)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .layoutPriority(1)
            Spacer(minLength: 8)
            Image(systemName: "chevron.down")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
                .frame(width: 32, height: 32)
        }
        .frame(
            maxWidth: .infinity,
            minHeight: scopeSelectorMinimumHeight,
            alignment: .leading
        )
        .contentShape(Rectangle())
    }

    private var scopeSelectorMinimumHeight: CGFloat {
        selectedScope == nil ? 44 : 80
    }

    private var usesScrollableScopeBar: Bool {
        dynamicTypeSize.isAccessibilitySize || sizeCategory.isAccessibilityCategory
    }

    private var conversation: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    if shouldShowScopeBar,
                       contactDraft == nil || contactSaveMessage != nil,
                       usesScrollableScopeBar {
                        scopeBar
                            .padding(.horizontal, -20)
                            .id("ask-scrollable-scope-bar")
                    }

                    if isChoosingScope {
                        scopeChoices
                            .id("ask-scope-choices")
                    }

                    if conversationItems.isEmpty, contactDraft == nil {
                        starterGrid
                            .padding(.top, 24)
                    }

                    if let contactDraft {
                        ConversationContactProposalTurn(
                            draft: contactDraftBinding(fallback: contactDraft),
                            candidates: contactCandidates,
                            lookupPhase: contactLookupPhase,
                            selectedPersonID: $selectedContactPersonID,
                            selectedContextID: $selectedContactContextID,
                            createDistinct: $createDistinctContact,
                            saveForIdentityReview: $saveContactForIdentityReview,
                            confirmIdentityClue: $confirmContactIdentityClue,
                            hasPendingWrite: pendingContactTarget != nil,
                            isSaving: isSavingContact,
                            saveMessage: contactSaveMessage,
                            errorMessage: contactSaveError,
                            isCanonical: isCanonical,
                            language: appLanguage,
                            onConfirm: saveContactProposal,
                            onRetryLookup: {
                                startContactLookup(for: contactDraft)
                            },
                            onCancel: clearContactProposal
                        )
                        .id("contact-proposal-turn")
                    }

                    if !conversationItems.isEmpty {
                        ForEach(conversationItems) { item in
                            switch item {
                            case let .contactReceipt(receipt):
                                AgentContactReceiptTurn(
                                    receipt: receipt,
                                    language: appLanguage,
                                    onOpenPerson: openPersonAction(for: receipt)
                                )
                                .id(item.id)
                            case let .ask(turn):
                            AskTurnView(
                                turn: turn,
                                language: appLanguage,
                                evidenceReviews: sessionStore.latestEvidenceReviews(
                                    taskID: turn.response.taskID
                                ),
                                evidenceReviewHistory: sessionStore.evidenceReviewHistory(
                                    taskID: turn.response.taskID
                                ),
                                inFlightEvidenceReviewKeys: sessionStore.activeEvidenceReviewKeys,
                                transientSupersededEvidenceReviewKeys:
                                    sessionStore.transientSupersededEvidenceReviewKeys,
                                evidenceReviewAuthorityReadbackKeys:
                                    sessionStore.evidenceReviewAuthorityReadbackKeys,
                                loadMedia: { mediaID in
                                    try await workspaceStore.loadChatMedia(id: mediaID)
                                },
                                onOpenEvidence: { citation in
                                    selectedCitation = SelectedAskCitation(
                                        taskID: turn.response.taskID,
                                        citation: citation
                                    )
                                },
                                onRetryEvidenceReview: retryEvidenceReview,
                                onReinstateEvidence: { operation in
                                    reinstatementReason = ""
                                    reinstatementOperation = operation
                                },
                                onStartFreshAsk: {
                                    draft = RelationshipAskDraftPolicy.currentEvidenceDraft(
                                        preserving: draft,
                                        suggestion: appLanguage.text(
                                            "What is current now?",
                                            zhHans: "现在的最新情况是什么？"
                                        )
                                    )
                                    composerFocused = true
                                },
                                onOpenPursuit: { pursuitID, actionID in
                                    guard let pursuit = currentSnapshot.pursuit(id: pursuitID) else {
                                        return
                                    }
                                    selectedPursuit = SelectedPursuitTarget(
                                        pursuit: pursuit,
                                        actionID: actionID
                                    )
                                }
                            )
                                .id(item.id)
                            }
                        }
                    }

                    if isSending, let pendingObjective {
                        AskPendingTurnView(
                            message: pendingObjective,
                            mediaDrafts: mediaDrafts,
                            language: appLanguage
                        )
                        .id("ask-loading")
                    }

                    if let errorMessage {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "exclamationmark.circle")
                                .foregroundStyle(Color.tsVermilion)
                            Text(errorMessage)
                                .font(.caption)
                                .foregroundStyle(Color.tsInk)
                            Spacer(minLength: 8)
                            if isCanonical {
                                Button(appLanguage.text("Retry", zhHans: "重试")) {
                                    send(draft.isEmpty ? turns.last?.objective ?? "" : draft)
                                }
                                .font(.caption.weight(.semibold))
                                .accessibilityIdentifier("ask-retry")
                            }
                        }
                        .padding(14)
                        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 14))
                        .id("ask-error")
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("ask-error")
                    }

                    if let reviewPreparationError {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "exclamationmark.shield")
                                .foregroundStyle(Color.tsVermilion)
                                .accessibilityHidden(true)
                            Text(reviewPreparationError)
                                .font(.caption)
                                .foregroundStyle(Color.tsInk)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            Button(appLanguage.text("Dismiss", zhHans: "关闭")) {
                                self.reviewPreparationError = nil
                            }
                            .font(.caption.weight(.semibold))
                        }
                        .padding(14)
                        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 14))
                        .accessibilityIdentifier("ask-evidence-review-persistence-error")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 20)
            }
            .accessibilityIdentifier("ask-conversation")
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: conversationItems.count) { _ in
                if let last = conversationItems.last {
                    Task { @MainActor in
                        await Task.yield()
                        proxy.scrollTo(last.id, anchor: .top)
                        try? await Task.sleep(for: .milliseconds(100))
                        if reduceMotion {
                            proxy.scrollTo(last.responseScrollTargetID, anchor: .top)
                        } else {
                            withAnimation(.easeOut(duration: 0.2)) {
                                proxy.scrollTo(last.responseScrollTargetID, anchor: .top)
                            }
                        }
                    }
                }
            }
            .onChange(of: isSending) { sending in
                guard sending else { return }
                Task { @MainActor in
                    await Task.yield()
                    if reduceMotion {
                        proxy.scrollTo("ask-loading", anchor: .bottom)
                    } else {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo("ask-loading", anchor: .bottom)
                        }
                    }
                }
            }
            .onChange(of: errorMessage) { message in
                guard message != nil else { return }
                Task { @MainActor in
                    await Task.yield()
                    if reduceMotion {
                        proxy.scrollTo("ask-error", anchor: .bottom)
                    } else {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo("ask-error", anchor: .bottom)
                        }
                    }
                }
            }
            .onChange(of: contactDraft?.sourceNote) { sourceNote in
                guard sourceNote != nil else { return }
                Task { @MainActor in
                    await Task.yield()
                    if reduceMotion {
                        proxy.scrollTo("contact-proposal-turn", anchor: .top)
                    } else {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo("contact-proposal-turn", anchor: .top)
                        }
                    }
                }
            }
            .onChange(of: contactLookupPhase) { phase in
                guard case .failed = phase else { return }
                Task { @MainActor in
                    await Task.yield()
                    if reduceMotion {
                        proxy.scrollTo("contact-identity-state", anchor: .bottom)
                    } else {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo("contact-identity-state", anchor: .bottom)
                        }
                    }
                }
            }
        }
    }

    private var starterGrid: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !isCanonical {
                Label(
                    appLanguage.text(
                        dynamicTypeSize.isAccessibilitySize
                            || sizeCategory.isAccessibilityCategory
                            ? "Preview · connect to send"
                            : "Preview data · connect a workspace to send",
                        zhHans: dynamicTypeSize.isAccessibilitySize
                            || sizeCategory.isAccessibilityCategory
                            ? "预览 · 连接后可发送"
                            : "预览数据 · 连接工作区后即可提问"
                    ),
                    systemImage: "eye"
                )
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("ask-preview-send-boundary")
            }
        }
    }

    private var composer: some View {
        let controlSize = composerControlSize

        return VStack(spacing: 8) {
            contactInterpretationStatus
            voiceInputStatus

            if !mediaDrafts.isEmpty, !isSending {
                AskMediaDraftTray(
                    drafts: mediaDrafts,
                    onRetry: retryMediaDraft,
                    onRemove: removeMediaDraft
                )
            }

            if let mediaNotice, !isSending {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: "photo.on.rectangle.angled")
                        .accessibilityHidden(true)
                    Text(mediaNotice)
                        .font(.caption)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                }
                .foregroundStyle(Color.tsMutedInk)
                .accessibilityIdentifier("ask-media-notice")
            }

            HStack(alignment: .bottom, spacing: 8) {
                composerAttachmentControl(size: controlSize)

                TextField(
                    composerPlaceholder,
                    text: $draft,
                    axis: .vertical
                )
                .focused($composerFocused)
                .lineLimit(
                    isCompactEntry
                        ? (usesAccessibilityLayout ? 2...4 : 8...18)
                        : 1...5
                )
                .disabled(
                    voiceInput.isBusy
                        || isSending
                        || isInterpretingContact
                        || hasBlockingContactProposal
                )
                .padding(.horizontal, 15)
                .padding(.vertical, 12)
                .frame(
                    minHeight: isCompactEntry
                        ? (usesAccessibilityLayout ? 92 : 190)
                        : nil,
                    alignment: .topLeading
                )
                .background(
                    Color.tsCanvas,
                    in: RoundedRectangle(cornerRadius: isCompactEntry ? 22 : 20)
                )
                .overlay {
                    if isCompactEntry {
                        RoundedRectangle(cornerRadius: 22)
                            .stroke(Color.tsLine, lineWidth: 1)
                    }
                }
                .accessibilityIdentifier("ask-composer")

                Button(action: composerPrimaryAction) {
                    Group {
                        if voiceInput.phase == .transcribing {
                            ProgressView()
                                .tint(Color.tsSurface)
                        } else {
                            Image(systemName: composerPrimarySymbol)
                                .font(.system(size: 17, weight: .semibold))
                        }
                    }
                    .foregroundStyle(composerPrimaryForeground)
                    .frame(
                        width: composerPrimaryControlSize,
                        height: composerPrimaryControlSize
                    )
                    .background(composerPrimaryBackground, in: Circle())
                    .overlay {
                        VoiceRecordButtonHalo(isActive: voiceInput.isRecording)
                    }
                }
                .frame(
                    width: composerPrimaryControlSize,
                    height: composerPrimaryControlSize
                )
                .disabled(composerPrimaryDisabled)
                .opacity(composerPrimaryDisabled ? 0.35 : 1)
                .accessibilityLabel(composerPrimaryAccessibilityLabel)
                .accessibilityIdentifier(
                    hasComposerInput ? "ask-send" : "ask-voice"
                )
                .accessibilityHint(composerPrimaryAccessibilityHint)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(Color.tsSurface.opacity(0.98))
        .animation(
            reduceMotion ? nil : .spring(response: 0.34, dampingFraction: 0.84),
            value: voiceInput.phase
        )
    }

    @ViewBuilder
    private func composerAttachmentControl(size: CGFloat) -> some View {
        Menu {
            Button {
                composerFocused = false
                isPhotoLibraryPresented = true
            } label: {
                Label(
                    appLanguage.text("Photos"),
                    systemImage: "photo.on.rectangle"
                )
            }
            Button {
                composerFocused = false
                isFileImporterPresented = true
            } label: {
                Label(
                    appLanguage.text("Image from Files"),
                    systemImage: "folder"
                )
            }
            Divider()
            Button {
                requestRelationshipScope()
            } label: {
                Label(
                    appLanguage.text("Link a relationship", zhHans: "关联关系"),
                    systemImage: "person.crop.circle.badge.plus"
                )
            }
        } label: {
                composerAttachmentIcon(size: size)
        }
        .disabled(
            voiceInput.isBusy
                || isSending
                || isInterpretingContact
                || hasBlockingContactProposal
                || mediaDrafts.count >= 10
        )
        .accessibilityLabel(appLanguage.text("Add to this message"))
        .accessibilityHint(
            appLanguage.text(
                "Add task images or link a relationship. Attachments remain proposals, not reviewed evidence."
            )
        )
        .accessibilityIdentifier("ask-attachment-menu")
    }

    nonisolated private func composerAttachmentIcon(size: CGFloat) -> some View {
        Image(systemName: "paperclip")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Color.tsInk)
            .frame(width: size, height: size)
            .background(Color.tsCanvas, in: Circle())
    }

    private var composerControlSize: CGFloat {
        dynamicTypeSize.isAccessibilitySize || sizeCategory.isAccessibilityCategory
            ? 52
            : 44
    }

    @ViewBuilder
    private var contactInterpretationStatus: some View {
        if isInterpretingContact {
            HStack(spacing: 10) {
                ProgressView()
                    .tint(Color.tsInk)
                Text(appLanguage.text("Understanding this message…"))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("ask-contact-interpreting")
                Spacer(minLength: 8)
                Button(appLanguage.text("Cancel")) {
                    cancelContactInterpretation()
                }
                .font(.caption.weight(.semibold))
                .frame(minHeight: 44)
                .accessibilityIdentifier("ask-contact-interpretation-cancel")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 16))
        } else if let contactInterpretationNotice {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "person.crop.circle.badge.questionmark")
                    .foregroundStyle(Color.tsMutedInk)
                    .accessibilityHidden(true)
                Text(contactInterpretationNotice)
                    .font(.caption)
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 16))
            .accessibilityIdentifier("ask-contact-clarification")
        }
    }

    private var composerPrimaryControlSize: CGFloat {
        max(52, composerControlSize)
    }

    @ViewBuilder
    private var voiceInputStatus: some View {
        switch voiceInput.phase {
        case .idle:
            EmptyView()
        case .requestingPermission:
            HStack(spacing: 10) {
                ProgressView()
                Text(appLanguage.text("Waiting for microphone permission…"))
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                Spacer(minLength: 8)
            }
            .accessibilityIdentifier("ask-voice-requesting-permission")
        case let .recording(startedAt):
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    Image(systemName: "waveform.circle.fill")
                        .font(.title3)
                        .foregroundStyle(Color.tsVermilion)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(appLanguage.text("Listening to you"))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.tsInk)
                            .accessibilityIdentifier("ask-voice-recording")
                        Text(appLanguage.text("Foreground voice · 1 minute max"))
                            .font(.caption2)
                            .foregroundStyle(Color.tsMutedInk)
                    }
                    Spacer(minLength: 8)
                    Text(startedAt, style: .timer)
                        .font(.subheadline.monospacedDigit().weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                    Button {
                        cancelVoiceInput()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.caption.weight(.bold))
                            .frame(width: 44, height: 44)
                            .background(Color.tsSurfaceMuted, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(appLanguage.text("Cancel"))
                    .accessibilityIdentifier("ask-voice-cancel")
                }
                VoiceListeningVisualizer()
                Text(
                    appLanguage.text(
                        "Tap the red stop button to create an editable transcript."
                    )
                )
                .font(.caption2)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                Color.tsCanvas,
                in: RoundedRectangle(cornerRadius: 22, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(Color.tsVermilion.opacity(0.28), lineWidth: 1)
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
        case .transcribing:
            HStack(spacing: 10) {
                ProgressView()
                    .tint(Color.tsInk)
                VStack(alignment: .leading, spacing: 2) {
                    Text(appLanguage.text("Creating an editable transcript…"))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                        .accessibilityIdentifier("ask-voice-transcribing")
                    Text(
                        appLanguage.text(
                            "Nothing is sent to the Agent until you tap Send."
                        )
                    )
                    .font(.caption2)
                    .foregroundStyle(Color.tsMutedInk)
                }
                Spacer(minLength: 8)
                Button(appLanguage.text("Cancel")) {
                    cancelVoiceInput()
                }
                .font(.caption.weight(.semibold))
                .frame(minHeight: 44)
                .accessibilityIdentifier("ask-voice-cancel-transcription")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                Color.tsCanvas,
                in: RoundedRectangle(cornerRadius: 18, style: .continuous)
            )
            .transition(.opacity)
        case let .failed(message):
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.circle")
                    .foregroundStyle(Color.tsVermilion)
                    .accessibilityHidden(true)
                Text(appLanguage.text(message))
                    .font(.caption)
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("ask-voice-failed")
                Spacer(minLength: 8)
                if voiceInput.microphonePermission == .denied {
                    Button(appLanguage.text("Settings")) {
                        guard let url = URL(
                            string: UIApplication.openSettingsURLString
                        ) else { return }
                        openURL(url)
                    }
                    .font(.caption.weight(.semibold))
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("ask-voice-open-settings")
                } else {
                    Button(appLanguage.text("Dismiss")) {
                        voiceInput.dismissFailure()
                    }
                    .font(.caption.weight(.semibold))
                    .frame(minHeight: 44)
                }
            }
        }
    }

    private var composerPrimarySymbol: String {
        if isSending { return "arrow.up" }
        if hasComposerInput { return "arrow.up" }
        return voiceInput.isRecording ? "stop.fill" : "waveform"
    }

    private var composerPrimaryForeground: Color {
        if hasComposerInput || voiceInput.isRecording { return .tsSurface }
        return .tsInk
    }

    private var composerPrimaryBackground: Color {
        if hasComposerInput { return .tsInk }
        if voiceInput.isRecording { return .tsVermilion }
        return .tsCanvas
    }

    private var composerPrimaryDisabled: Bool {
        if hasBlockingContactProposal { return true }
        if isInterpretingContact { return true }
        if hasComposerInput { return !canSendDraft }
        if voiceInput.phase == .transcribing
            || voiceInput.phase == .requestingPermission {
            return true
        }
        return isSending
    }

    private var composerPrimaryAccessibilityLabel: String {
        if hasBlockingContactProposal {
            return appLanguage.text("Finish reviewing the contact first")
        }
        if isSending {
            return appLanguage.text("Reading the record…")
        }
        if isInterpretingContact {
            return appLanguage.text("Understanding this message…")
        }
        if hasComposerInput {
            return selectedScope == nil
                ? appLanguage.text(
                    "Send and let Agent link the relationship",
                    zhHans: "发送并由 Agent 关联关系"
                )
                : appLanguage.text("Send", zhHans: "发送")
        }
        if voiceInput.isRecording { return appLanguage.text("Stop and transcribe") }
        if voiceTranscriber == nil { return appLanguage.text("Record voice") }
        return appLanguage.text("Start voice input")
    }

    private var composerPrimaryAccessibilityHint: String {
        if hasComposerInput { return "" }
        guard voiceTranscriber != nil else { return "" }
        if voiceInput.isRecording {
            return appLanguage.text(
                "Stops recording and sends the temporary audio to Doubao for transcription."
            )
        }
        return appLanguage.text(
            "Records your voice in the foreground. The transcript remains editable before Send."
        )
    }

    private func composerPrimaryAction() {
        if hasComposerInput {
            send(draft)
            return
        }
        if voiceInput.isRecording {
            voiceHaptic(.rigid)
            voiceOperation?.cancel()
            voiceOperation = Task {
                await voiceInput.stopAndTranscribe()
                voiceOperation = nil
            }
            return
        }
        guard voiceTranscriber != nil else {
            voiceInput.reportUnavailable()
            return
        }
        guard hasAcceptedVoiceDisclosure else {
            isVoiceDisclosurePresented = true
            return
        }
        voiceHaptic(.soft)
        startVoiceInput()
    }

    private func startVoiceInput() {
        guard let voiceTranscriber else { return }
        composerFocused = false
        voiceInput.dismissFailure()
        voiceOperation?.cancel()
        voiceOperation = Task {
            await voiceInput.start(
                sceneIsActive: scenePhase == .active,
                transcriber: voiceTranscriber
            )
            voiceOperation = nil
        }
    }

    private func cancelVoiceInput() {
        voiceHaptic(.light)
        voiceOperation?.cancel()
        voiceOperation = nil
        voiceInput.cancel()
    }

    private func voiceHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.prepare()
        generator.impactOccurred()
    }

    private func insertVoiceTranscript(_ transcript: String) {
        let current = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        draft = current.isEmpty ? transcript : "\(current) \(transcript)"
        composerFocused = true
    }

    private var isCompactEntry: Bool {
        sessionID == nil
            && activeSessionID == nil
            && initialSeed == nil
            && contactDraft == nil
            && !isSending
            && !isInterpretingContact
            && !isRequestingScope
            && errorMessage == nil
            && reviewPreparationError == nil
    }

    @ViewBuilder
    private var compactEditorHeader: some View {
        if usesAccessibilityLayout {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(appLanguage.text("NEW MESSAGE"))
                    .font(.caption2.weight(.bold))
                    .tracking(1.05)
                    .foregroundStyle(Color.tsVermilion)
                Spacer(minLength: 8)
                Text(appLanguage.text("Text · Markdown"))
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 8)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("ask-markdown-editor-header")
        } else {
            VStack(alignment: .leading, spacing: 9) {
                HStack(alignment: .firstTextBaseline) {
                    Text(appLanguage.text("NEW MESSAGE"))
                        .font(.caption2.weight(.bold))
                        .tracking(1.15)
                        .foregroundStyle(Color.tsVermilion)
                    Spacer(minLength: 12)
                    Label(
                        appLanguage.text("Text · Markdown"),
                        systemImage: "text.alignleft"
                    )
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                }
                Text(
                    appLanguage.text("Write with room to think.")
                )
                .font(.custom("Georgia", size: 30, relativeTo: .title2))
                .foregroundStyle(Color.tsInk)
                .tracking(-0.45)
                Text(
                    appLanguage.text(
                        "Plain text and Markdown stay editable until you choose Send."
                    )
                )
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 10)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("ask-markdown-editor-header")
        }
    }

    private var usesAccessibilityLayout: Bool {
        dynamicTypeSize.isAccessibilitySize || sizeCategory.isAccessibilityCategory
    }

    private var homeAttachmentChooser: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(appLanguage.text("ADD TO MESSAGE"))
                    .font(.caption2.weight(.bold))
                    .tracking(1.15)
                    .foregroundStyle(Color.tsVermilion)
                Text(
                    appLanguage.text("Choose a source first.")
                )
                .font(.custom("Georgia", size: 30, relativeTo: .title2))
                .foregroundStyle(Color.tsInk)
                .tracking(-0.45)
                .padding(.top, 8)
                Text(
                    appLanguage.text(
                        "Nothing is imported until you make a choice."
                    )
                )
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .padding(.top, 7)

                VStack(spacing: 10) {
                    homeAttachmentChoice(
                        title: appLanguage.text("Photos"),
                        detail: appLanguage.text("Choose one or more images"),
                        symbol: "photo.on.rectangle",
                        identifier: "home-attachment-photos"
                    ) {
                        composerFocused = false
                        isHomeAttachmentChooserPresented = false
                        presentationDetent = .large
                        isPhotoLibraryPresented = true
                    }
                    homeAttachmentChoice(
                        title: appLanguage.text("Image files"),
                        detail: appLanguage.text(
                            "Browse JPEG, PNG, WebP, GIF, HEIC, or HEIF"
                        ),
                        symbol: "folder",
                        identifier: "home-attachment-files"
                    ) {
                        composerFocused = false
                        isHomeAttachmentChooserPresented = false
                        presentationDetent = .large
                        isFileImporterPresented = true
                    }
                    homeAttachmentChoice(
                        title: appLanguage.text("Link a relationship"),
                        detail: appLanguage.text(
                            "Choose the Person and Pursuit context"
                        ),
                        symbol: "person.crop.circle.badge.plus",
                        identifier: "home-attachment-relationship"
                    ) {
                        isHomeAttachmentChooserPresented = false
                        requestRelationshipScope()
                    }
                }
                .padding(.top, 22)

                Button {
                    isHomeAttachmentChooserPresented = false
                    presentationDetent = .large
                    Task { @MainActor in
                        await Task.yield()
                        composerFocused = true
                    }
                } label: {
                    Label(
                        appLanguage.text("Write text or Markdown instead"),
                        systemImage: "square.and.pencil"
                    )
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.tsInk)
                .padding(.top, 10)
                .accessibilityIdentifier("home-attachment-write")
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 28)
        }
        .background(Color.tsSurface.ignoresSafeArea())
        .accessibilityIdentifier("home-attachment-chooser")
    }

    private func homeAttachmentChoice(
        title: String,
        detail: String,
        symbol: String,
        identifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: symbol)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .frame(width: 44, height: 44)
                    .background(Color.tsSurface, in: Circle())
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.tsMutedInk)
                    .accessibilityHidden(true)
            }
            .frame(maxWidth: .infinity, minHeight: 68, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 18))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title). \(detail)")
        .accessibilityIdentifier(identifier)
    }

    @ViewBuilder
    private var compactComposerContext: some View {
        if let selectedScope {
            Button {
                requestRelationshipScope()
            } label: {
                HStack(spacing: 8) {
                    Circle()
                        .fill(Color.tsVermilion.opacity(0.14))
                        .frame(width: 24, height: 24)
                        .overlay {
                            Text(initials(selectedScope.person.displayLabel))
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(Color.tsVermilion)
                        }
                        .accessibilityHidden(true)
                    Text(selectedScope.person.displayLabel)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                        .lineLimit(1)
                    Text(selectedScope.context.displayLabel)
                        .font(.caption2)
                        .foregroundStyle(Color.tsMutedInk)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    Image(systemName: "chevron.down")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Color.tsMutedInk)
                }
                .frame(minHeight: 32)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 18)
            .accessibilityLabel(
                appLanguage.text(
                    "Selected relationship",
                    zhHans: "已选择的关系"
                )
            )
            .accessibilityValue(
                "\(selectedScope.person.displayLabel), \(selectedScope.context.displayLabel)"
            )
            .accessibilityHint(
                appLanguage.text(
                    "Choose a different person or relationship."
                )
            )
            .accessibilityIdentifier("ask-scope-selector")
        }
    }

    private var currentSnapshot: PursuitWorkspaceSnapshot {
        workspaceStore.snapshot ?? snapshot
    }

    private var availableScopes: [AskScope] {
        currentSnapshot.people.flatMap { person in
            person.contexts.map { context in
                AskScope(person: person, context: context)
            }
        }
    }

    private var trimmedDraft: String {
        draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var hasComposerInput: Bool {
        !trimmedDraft.isEmpty || !mediaDrafts.isEmpty
    }

    private var composerPlaceholder: String {
        if hasBlockingContactProposal {
            return appLanguage.text("Finish reviewing the contact first")
        }
        if contactSaveMessage != nil, selectedScope == nil {
            return appLanguage.text("Add another contact…")
        }
        return appLanguage.text("Message or add anything…")
    }

    private var hasBlockingContactProposal: Bool {
        contactDraft != nil && contactSaveMessage == nil
    }

    private var shouldShowScopeBar: Bool {
        selectedScope != nil
            || isRequestingScope
            || sessionID != nil
            || initialSeed != nil
            || activeSessionID != nil
    }

    private var canSendDraft: Bool {
        let isContactIntent = ConversationContactIntake.propose(trimmedDraft) != nil
        if isContactIntent, mediaDrafts.isEmpty {
            return !isSending
                && !isInterpretingContact
                && !isSavingContact
        }
        return hasComposerInput
            && !isSending
            && !isInterpretingContact
            && !isSavingContact
            && mediaDrafts.allSatisfy {
                if case .failed = $0.phase { return false }
                return $0.phase != .removing
            }
    }

    private var filteredScopes: [AskScope] {
        let needle = scopeQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return availableScopes }
        return availableScopes.filter {
            $0.person.displayLabel.localizedCaseInsensitiveContains(needle)
                || $0.context.displayLabel.localizedCaseInsensitiveContains(needle)
        }
    }

    private var turns: [AgentSessionTurn] {
        sessionStore.session(id: activeSessionID)?.turns ?? []
    }

    private var conversationItems: [AgentConversationItem] {
        guard let session = sessionStore.session(id: activeSessionID) else {
            return []
        }
        let hiddenOperationKey = contactSaveMessage == nil
            ? nil
            : contactOperationKey
        let receiptItems = session.contactReceipts.compactMap { receipt in
            receipt.operationKey == hiddenOperationKey
                ? nil
                : AgentConversationItem.contactReceipt(receipt)
        }
        return (receiptItems + session.turns.map(AgentConversationItem.ask))
            .sorted { lhs, rhs in
                lhs.createdAt == rhs.createdAt
                    ? lhs.id < rhs.id
                    : lhs.createdAt < rhs.createdAt
            }
    }

    private func openPersonAction(
        for receipt: AgentContactReceipt
    ) -> (() -> Void)? {
        guard let personID = receipt.currentPerson(in: currentSnapshot)?.id else {
            return nil
        }
        return { onOpenPerson(personID) }
    }

    private func importSelectedPhotos(_ items: [PhotosPickerItem]) {
        mediaImportTask?.cancel()
        mediaImportTask = Task {
            defer {
                selectedPhotoItems = []
                mediaImportTask = nil
            }
            let remaining = max(0, 10 - mediaDrafts.count)
            guard remaining > 0 else {
                mediaNotice = appLanguage.text("Ten images is the limit for one Ask.")
                return
            }
            if items.count > remaining {
                mediaNotice = appLanguage.text(
                    "Only the first \(remaining) selected images were added.",
                    zhHans: "仅添加了所选图片中的前 \(remaining) 张。"
                )
            }
            for (offset, item) in items.prefix(remaining).enumerated() {
                if Task.isCancelled { return }
                do {
                    guard var data = try await item.loadTransferable(type: Data.self),
                          var preview = UIImage(data: data) else {
                        throw PursuitWorkspaceClientError.invalidResponse
                    }
                    var mediaType = item.supportedContentTypes
                        .compactMap(\.preferredMIMEType)
                        .first(where: Self.allowedChatMediaTypes.contains)
                    var fileExtension = item.supportedContentTypes
                        .compactMap(\.preferredFilenameExtension)
                        .first
                    if mediaType == nil {
                        guard let converted = preview.jpegData(compressionQuality: 0.9) else {
                            throw PursuitWorkspaceClientError.invalidResponse
                        }
                        data = converted
                        preview = UIImage(data: converted) ?? preview
                        mediaType = "image/jpeg"
                        fileExtension = "jpg"
                    }
                    guard !data.isEmpty, data.count <= 8_388_608 else {
                        mediaNotice = appLanguage.text("One image was larger than 8 MB and was not added.")
                        continue
                    }
                    appendMediaDraft(
                        data: data,
                        preview: preview,
                        fileName: "ask-photo-\(mediaDrafts.count + offset + 1).\(fileExtension ?? "image")",
                        mediaType: mediaType ?? "image/jpeg"
                    )
                } catch is CancellationError {
                    return
                } catch {
                    mediaNotice = appLanguage.text("One selected image could not be read; the rest are unchanged.")
                }
            }
        }
    }

    private func importSelectedImageFiles(_ result: Result<[URL], Error>) {
        guard case let .success(urls) = result else {
            mediaNotice = appLanguage.text(
                "The selected file could not be opened. Your message is unchanged."
            )
            return
        }
        mediaImportTask?.cancel()
        mediaImportTask = Task {
            defer { mediaImportTask = nil }
            let remaining = max(0, 10 - mediaDrafts.count)
            for url in urls.prefix(remaining) {
                if Task.isCancelled { return }
                let accessed = url.startAccessingSecurityScopedResource()
                defer {
                    if accessed { url.stopAccessingSecurityScopedResource() }
                }
                do {
                    let data = try Data(contentsOf: url, options: [.mappedIfSafe])
                    guard !data.isEmpty,
                          data.count <= 8_388_608,
                          let preview = UIImage(data: data) else {
                        mediaNotice = appLanguage.text(
                            "One file was not a supported image or was larger than 8 MB."
                        )
                        continue
                    }
                    let originalType = (try? url.resourceValues(
                        forKeys: [.contentTypeKey]
                    ).contentType)?.preferredMIMEType
                    let normalizedData: Data
                    let normalizedName: String
                    let mediaType: String
                    if let originalType,
                       Self.allowedChatMediaTypes.contains(originalType) {
                        normalizedData = data
                        normalizedName = url.lastPathComponent
                        mediaType = originalType
                    } else if let jpeg = preview.jpegData(compressionQuality: 0.9) {
                        normalizedData = jpeg
                        normalizedName = "\(url.deletingPathExtension().lastPathComponent).jpg"
                        mediaType = "image/jpeg"
                    } else {
                        continue
                    }
                    appendMediaDraft(
                        data: normalizedData,
                        preview: preview,
                        fileName: normalizedName,
                        mediaType: mediaType
                    )
                } catch {
                    mediaNotice = appLanguage.text(
                        "One image file could not be read; the rest are unchanged."
                    )
                }
            }
        }
    }

    private func appendMediaDraft(
        data: Data,
        preview: UIImage,
        fileName: String,
        mediaType: String
    ) {
        let id = UUID()
        let scale = preview.scale
        let mediaDraft = AskMediaDraft(
            id: id,
            data: data,
            preview: preview,
            fileName: fileName,
            mediaType: mediaType,
            width: max(1, Int(preview.size.width * scale)),
            height: max(1, Int(preview.size.height * scale)),
            routingText: "",
            remoteAsset: nil,
            phase: selectedScope == nil ? .waitingForContext : .uploading
        )
        mediaDrafts.append(mediaDraft)
        Task {
            let recognizedText = await Task.detached(priority: .utility) {
                Self.routingText(in: data)
            }.value
            guard let index = mediaDrafts.firstIndex(where: { $0.id == id }) else {
                return
            }
            mediaDrafts[index].routingText = recognizedText
        }
        mediaNotice = appLanguage.text(
            "Attached for this Agent task · not reviewed evidence",
            zhHans: "已附加到本次 Agent 任务 · 尚非已审阅证据"
        )
        if let selectedScope {
            uploadMediaDraft(id, scope: selectedScope)
        }
        if isCompactEntry { presentationDetent = .medium }
    }

    nonisolated private static func routingText(in data: Data) -> String {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["zh-Hans", "en-US"]
        do {
            try VNImageRequestHandler(data: data).perform([request])
            return (request.results ?? [])
                .compactMap { $0.topCandidates(1).first?.string }
                .joined(separator: "\n")
        } catch {
            return ""
        }
    }

    private func rebindMediaDrafts(to scope: AskScope) {
        let priorMediaIDs = mediaDrafts.compactMap { $0.remoteAsset?.id }
        for index in mediaDrafts.indices {
            mediaDrafts[index].remoteAsset = nil
            mediaDrafts[index].phase = .uploading
        }
        Task {
            for mediaID in priorMediaIDs {
                try? await workspaceStore.deleteChatMedia(id: mediaID)
            }
            for id in mediaDrafts.map(\.id) {
                uploadMediaDraft(id, scope: scope)
            }
        }
    }

    private func uploadMediaDraft(_ id: UUID, scope: AskScope? = nil) {
        guard let index = mediaDrafts.firstIndex(where: { $0.id == id }),
              let resolvedScope = scope ?? selectedScope else { return }
        mediaDrafts[index].phase = .uploading
        let mediaDraft = mediaDrafts[index]
        Task {
            do {
                let asset: ChatMediaAsset
                if let existing = mediaDraft.remoteAsset {
                    asset = existing
                } else {
                    asset = try await workspaceStore.createChatMedia(
                        personID: resolvedScope.person.id,
                        relationshipContextID: resolvedScope.context.id,
                        fileName: mediaDraft.fileName,
                        mediaType: mediaDraft.mediaType,
                        byteSize: mediaDraft.data.count,
                        width: mediaDraft.width,
                        height: mediaDraft.height,
                        idempotencyKey: "ios:chat-media:\(mediaDraft.id.uuidString.lowercased())"
                    )
                }
                guard let current = mediaDrafts.firstIndex(where: { $0.id == id }) else {
                    try? await workspaceStore.deleteChatMedia(id: asset.id)
                    return
                }
                mediaDrafts[current].remoteAsset = asset
                let ready = asset.status == "ready"
                    ? asset
                    : try await workspaceStore.uploadChatMedia(
                        id: asset.id,
                        data: mediaDraft.data,
                        mediaType: mediaDraft.mediaType
                    )
                guard let finalIndex = mediaDrafts.firstIndex(where: { $0.id == id }) else {
                    try? await workspaceStore.deleteChatMedia(id: ready.id)
                    return
                }
                mediaDrafts[finalIndex].remoteAsset = ready
                mediaDrafts[finalIndex].phase = .ready
            } catch {
                guard let failedIndex = mediaDrafts.firstIndex(where: { $0.id == id }) else { return }
                mediaDrafts[failedIndex].phase = .failed(
                    (error as? LocalizedError)?.errorDescription
                        ?? appLanguage.text("Upload failed. Retry keeps the same image identity.")
                )
                mediaNotice = appLanguage.text("An image did not upload. Retry or remove it before Send.")
            }
        }
    }

    private func retryMediaDraft(_ id: UUID) {
        uploadMediaDraft(id)
    }

    private func removeMediaDraft(_ id: UUID) {
        guard let index = mediaDrafts.firstIndex(where: { $0.id == id }) else { return }
        guard let mediaID = mediaDrafts[index].remoteAsset?.id else {
            mediaDrafts.remove(at: index)
            if mediaDrafts.isEmpty { mediaNotice = nil }
            return
        }
        mediaDrafts[index].phase = .removing
        Task {
            do {
                try await workspaceStore.deleteChatMedia(id: mediaID)
                mediaDrafts.removeAll { $0.id == id }
                if mediaDrafts.isEmpty { mediaNotice = nil }
            } catch {
                guard let failedIndex = mediaDrafts.firstIndex(where: { $0.id == id }) else { return }
                mediaDrafts[failedIndex].phase = .failed(
                    (error as? LocalizedError)?.errorDescription
                        ?? appLanguage.text("The image could not be removed.")
                )
                mediaNotice = appLanguage.text("Removal was not confirmed. The image remains attached locally.")
            }
        }
    }

    private func discardMediaDrafts() {
        let mediaIDs = mediaDrafts.compactMap { $0.remoteAsset?.id }
        mediaDrafts = []
        mediaNotice = nil
        guard !mediaIDs.isEmpty else { return }
        Task {
            for mediaID in mediaIDs {
                try? await workspaceStore.deleteChatMedia(id: mediaID)
            }
        }
    }

    private static let allowedChatMediaTypes: Set<String> = [
        "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
    ]

    private func send(_ objective: String) {
        let trimmed = objective.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (!trimmed.isEmpty || !mediaDrafts.isEmpty),
              !isSending,
              !isInterpretingContact else { return }
        if mediaDrafts.isEmpty,
           let proposedContact = ConversationContactIntake.propose(trimmed) {
            stageContactProposal(proposedContact)
            return
        }
        let effectiveObjective = trimmed.isEmpty
            ? appLanguage.text(
                "Read the attached material. Tell me what changed, what remains uncertain, and the smallest safe next step.",
                zhHans: "阅读附件，告诉我发生了什么变化、还有哪些不确定，以及最小且安全的下一步。"
            )
            : trimmed
        let resolvedScope = selectedScope ?? inferredScope(
            from: ([trimmed] + mediaDrafts.map(\.routingText))
                .filter { !$0.isEmpty }
                .joined(separator: "\n")
        )
        if selectedScope == nil, let resolvedScope {
            selectScope(resolvedScope)
        }
        guard let resolvedScope else {
            if mediaDrafts.isEmpty {
                pendingScopedSend = effectiveObjective
                beginContactInterpretation(trimmed)
            } else {
                pendingScopedSend = effectiveObjective
                requestRelationshipScope()
            }
            return
        }
        guard isCanonical else {
            errorMessage = appLanguage.text(
                "This is preview data, so no question was sent. Open a signed-in workspace connected to the backend, then try again."
            )
            composerFocused = false
            return
        }
        errorMessage = nil
        pendingObjective = effectiveObjective
        isSending = true
        draft = ""
        composerFocused = false
        Task {
            do {
                try await waitForMediaToBecomeReady()
                let mediaIDs = mediaDrafts.compactMap(\.readyMediaID)
                guard mediaIDs.count == mediaDrafts.count else {
                    throw PursuitWorkspaceClientError.askUnavailable
                }
                let operationID = UUID()
                let idempotencyKey = sessionStore.beginAsk(
                    effectiveObjective,
                    personID: resolvedScope.person.id,
                    relationshipContextID: resolvedScope.context.id,
                    proposedIdempotencyKey: "ios:ask:\(operationID.uuidString.lowercased())",
                    requestIdentity: mediaIDs.isEmpty
                        ? nil
                        : mediaIDs.joined(separator: ":")
                )
                try await waitForFixtureAskDelayIfNeeded()
                let response = try await ask(
                    effectiveObjective,
                    resolvedScope.person.id,
                    resolvedScope.context.id,
                    idempotencyKey,
                    mediaIDs
                )
                sessionStore.revalidateEvidenceReviewAuthority(
                    citations: response.citations,
                    supersededMessage: appLanguage.text(
                        "A newer source decision is already current. This older operation cannot be retried.",
                        zhHans: "已有更新的来源决定生效。这条较早的操作不能再次重试。"
                    )
                )
                activeSessionID = sessionStore.record(
                    sessionID: activeSessionID,
                    objective: effectiveObjective,
                    response: response,
                    person: resolvedScope.person,
                    context: resolvedScope.context
                )
                pendingObjective = nil
                sessionStore.clearDraft(
                    personID: resolvedScope.person.id,
                    relationshipContextID: resolvedScope.context.id
                )
                mediaDrafts = []
                mediaNotice = nil
            } catch {
                draft = trimmed
                pendingObjective = nil
                errorMessage = askFailureMessage(error)
            }
            isSending = false
        }
    }

    private func askFailureMessage(_ error: Error) -> String {
        if let urlError = error as? URLError,
           [
            .notConnectedToInternet,
            .cannotConnectToHost,
            .cannotFindHost,
            .networkConnectionLost,
            .timedOut,
            .dataNotAllowed,
           ].contains(urlError.code) {
            return appLanguage.text(
                "The workspace could not be reached. Check your connection and Tailscale, then retry. Your message is still here."
            )
        }
        return (error as? LocalizedError)?.errorDescription
            ?? appLanguage.text(
                "Ask could not read this material. Your message and attachments are still here.",
                zhHans: "暂时无法读取这些内容，你的消息和附件仍已保留。"
            )
    }

    private func waitForMediaToBecomeReady() async throws {
        guard !mediaDrafts.isEmpty else { return }
        for _ in 0..<300 {
            if mediaDrafts.allSatisfy({ $0.phase == .ready }) { return }
            if mediaDrafts.contains(where: {
                if case .failed = $0.phase { return true }
                return false
            }) {
                throw PursuitWorkspaceClientError.askUnavailable
            }
            try await Task.sleep(for: .milliseconds(100))
        }
        throw URLError(.timedOut)
    }

    private func inferredScope(from source: String) -> AskScope? {
        let normalizedSource = normalizedScopeText(source)
        guard !normalizedSource.isEmpty else {
            return availableScopes.count == 1 ? availableScopes.first : nil
        }
        let scored = availableScopes.compactMap { scope -> (AskScope, Int)? in
            let person = normalizedScopeText(scope.person.displayLabel)
            let context = normalizedScopeText(scope.context.displayLabel)
            var score = 0
            if person.count >= 2, normalizedSource.contains(person) {
                score += 100
            }
            if context.count >= 4, normalizedSource.contains(context) {
                score += 40
            }
            return score > 0 ? (scope, score) : nil
        }
        guard let bestScore = scored.map(\.1).max() else { return nil }
        let best = scored.filter { $0.1 == bestScore }.map(\.0)
        if best.count == 1 { return best[0] }
        let people = Set(best.map { $0.person.id })
        if people.count == 1,
           let onlyPersonID = people.first,
           let person = currentSnapshot.people.first(where: { $0.id == onlyPersonID }),
           person.contexts.count == 1 {
            return best.first
        }
        return nil
    }

    private func normalizedScopeText(_ value: String) -> String {
        value.folding(
            options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
            locale: appLanguage.locale
        )
        .precomposedStringWithCompatibilityMapping
        .replacingOccurrences(
            of: #"[^\p{L}\p{N}@+]+"#,
            with: " ",
            options: .regularExpression
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func beginContactInterpretation(_ source: String) {
        contactInterpretationTask?.cancel()
        contactInterpretationSource = source
        contactInterpretationNotice = nil
        errorMessage = nil
        isInterpretingContact = true
        composerFocused = false
        contactInterpretationTask = Task {
            do {
                try await waitForFixtureContactInterpretationIfNeeded()
            } catch {
                return
            }
            let result = await AdaptiveConversationContactIntentInterpreter()
                .interpret(source)
            guard !Task.isCancelled,
                  contactInterpretationSource == source else { return }
            isInterpretingContact = false
            contactInterpretationTask = nil
            switch result {
            case let .contact(proposal):
                contactInterpretationSource = nil
                stageContactProposal(proposal)
            case .notContact:
                contactInterpretationSource = nil
                requestRelationshipScope()
            case .needsClarification:
                pendingScopedSend = nil
                contactInterpretationNotice = appLanguage.text(
                    "I couldn't support a contact name from this message. Add the person's name, or choose a relationship to ask about it."
                )
                composerFocused = true
            }
        }
    }

    private func waitForFixtureContactInterpretationIfNeeded() async throws {
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let flagIndex = arguments.firstIndex(
            of: "--fixture-contact-interpretation-delay-seconds"
        ), arguments.indices.contains(flagIndex + 1),
           let seconds = Double(arguments[flagIndex + 1]),
           seconds > 0 else { return }
        try await Task.sleep(for: .milliseconds(Int(seconds * 1_000)))
#endif
    }

    private func cancelContactInterpretation() {
        contactInterpretationTask?.cancel()
        contactInterpretationTask = nil
        contactInterpretationSource = nil
        isInterpretingContact = false
        composerFocused = true
    }

    private func requestRelationshipScope() {
        errorMessage = nil
        isRequestingScope = true
        scopeQuery = ""
        composerFocused = false
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) {
            isChoosingScope = true
        }
    }

    private func stageContactProposal(_ proposedContact: ConversationContactDraft) {
        pendingScopedSend = nil
        errorMessage = nil
        contactInterpretationNotice = nil
        contactInterpretationSource = nil
        isChoosingScope = false
        isRequestingScope = false
        presentationDetent = .large
        contactDraft = proposedContact
        contactOperationKey = "ios:contact:\(UUID().uuidString.lowercased())"
        pendingContactTarget = nil
        pendingContactCapturedAt = nil
        pendingContactConfirmIdentityClue = nil
        selectedContactPersonID = nil
        selectedContactContextID = nil
        createDistinctContact = false
        saveContactForIdentityReview = false
        confirmContactIdentityClue = proposedContact.identityClue != nil
        contactSaveMessage = nil
        contactSaveError = nil
        startContactLookup(for: proposedContact)
        if let contactOperationKey,
           !sessionStore.saveContactProposal(
                proposedContact,
                idempotencyKey: contactOperationKey,
                clearingGlobalDraft: true
           ) {
            contactSaveError = appLanguage.text(
                "The proposal is open, but this device could not protect it for relaunch."
            )
        }
        draft = ""
        composerFocused = false
    }

    private func waitForFixtureAskDelayIfNeeded() async throws {
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let flagIndex = arguments.firstIndex(of: "--fixture-ask-delay-seconds"),
              arguments.indices.contains(flagIndex + 1),
              let seconds = Double(arguments[flagIndex + 1]),
              seconds > 0 else {
            if arguments.contains("--fixture-ask-fail-once"),
               !fixtureAskFailureConsumed {
                fixtureAskFailureConsumed = true
                throw URLError(.networkConnectionLost)
            }
            return
        }
        try await Task.sleep(for: .milliseconds(Int(seconds * 1_000)))
        if arguments.contains("--fixture-ask-fail-once"),
           !fixtureAskFailureConsumed {
            fixtureAskFailureConsumed = true
            throw URLError(.networkConnectionLost)
        }
#endif
    }

    private func startContactLookup(
        for proposal: ConversationContactDraft,
        preservePendingWrite: Bool = false
    ) {
        contactLookupTask?.cancel()
        if !preservePendingWrite {
            selectedContactPersonID = nil
            selectedContactContextID = nil
            createDistinctContact = false
            saveContactForIdentityReview = false
        }
        guard isCanonical else {
            contactCandidates = []
            contactLookupPhase = .idle
            return
        }
        guard let identityClue = proposal.identityClue else {
            contactCandidates = ConversationContactMatchPolicy.sameNameReview(
                for: proposal,
                in: currentSnapshot.people
            )
            contactLookupPhase = .complete
            return
        }
        contactCandidates = []
        contactLookupPhase = .checking
        let sourceNote = proposal.sourceNote
        contactLookupTask = Task {
            do {
                try await waitForFixtureContactLookupIfNeeded()
                let matches = try await workspaceStore.findContactMatches(
                    identityClue: identityClue
                )
                guard !Task.isCancelled, contactDraft?.sourceNote == sourceNote else {
                    return
                }
                contactCandidates = matches
                contactLookupPhase = .complete
            } catch is CancellationError {
                return
            } catch {
                guard contactDraft?.sourceNote == sourceNote else { return }
                contactCandidates = []
                contactLookupPhase = .failed(
                    (error as? LocalizedError)?.errorDescription
                        ?? appLanguage.text(
                            "Identity checking is temporarily unavailable."
                        )
                )
            }
        }
    }

    private func waitForFixtureContactLookupIfNeeded() async throws {
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if let flagIndex = arguments.firstIndex(
            of: "--fixture-contact-lookup-delay-seconds"
        ), arguments.indices.contains(flagIndex + 1),
           let seconds = Double(arguments[flagIndex + 1]),
           seconds > 0 {
            try await Task.sleep(for: .milliseconds(Int(seconds * 1_000)))
        }
        if arguments.contains("--fixture-contact-lookup-fail-once"),
           !fixtureContactLookupFailureConsumed {
            fixtureContactLookupFailureConsumed = true
            throw URLError(.networkConnectionLost)
        }
#endif
    }

    private func saveContactProposal() {
        guard let contactDraft, !isSavingContact else { return }
        guard contactLookupPhase == .complete else {
            contactSaveError = appLanguage.text(
                "Wait for identity checking or retry it before saving."
            )
            return
        }
        let candidates = contactCandidates
        let target: ConversationContactTarget
        if let pendingContactTarget {
            target = pendingContactTarget
        } else {
            let hasIdentityConflict = ConversationContactMatchPolicy
                .hasCurrentHistoricalConflict(in: candidates)
            if saveContactForIdentityReview {
                target = .unresolved
            } else if let selectedContactPersonID {
                target = .existingPerson(
                    personID: selectedContactPersonID,
                    relationshipContextID: selectedContactContextID
                )
            } else if candidates.isEmpty || (createDistinctContact && !hasIdentityConflict) {
                target = .newPerson
            } else {
                contactSaveError = appLanguage.text(
                    "Choose the existing person or explicitly create a separate contact."
                )
                return
            }
        }
        contactSaveError = nil
        contactSaveMessage = nil
        isSavingContact = true
        let operationKey = contactOperationKey
            ?? sessionStore.contactProposalOperationKey
            ?? "ios:contact:\(UUID().uuidString.lowercased())"
        contactOperationKey = operationKey
        let confirmedIdentityClue = pendingContactConfirmIdentityClue
            ?? confirmContactIdentityClue
        guard sessionStore.saveContactProposal(
            contactDraft,
            idempotencyKey: operationKey,
            pendingTarget: target,
            pendingConfirmIdentityClue: confirmedIdentityClue
        ) else {
            isSavingContact = false
            contactSaveError = appLanguage.text(
                "The confirmed operation could not be protected for a safe retry. Nothing was saved."
            )
            return
        }
        let capturedAt = sessionStore.contactProposalCapturedAt ?? Date()
        pendingContactTarget = target
        pendingContactCapturedAt = capturedAt
        pendingContactConfirmIdentityClue = confirmedIdentityClue
        Task {
            do {
                let result = try await saveContact(
                    contactDraft,
                    target,
                    confirmedIdentityClue,
                    capturedAt,
                    operationKey
                )
                let receipt = result.resource.id.suffix(8)
                let receiptOutcome = contactReceiptOutcome(for: target)
                if receiptOutcome == .identityReview {
                    guard result.identity.resolutionCaseID != nil,
                          result.identity.personID == nil,
                          result.identity.relationshipContextID == nil else {
                        throw PursuitWorkspaceClientError.scopeReadbackMismatch
                    }
                } else {
                    guard result.identity.personID != nil,
                          result.identity.relationshipContextID != nil,
                          result.identity.resolutionCaseID == nil else {
                        throw PursuitWorkspaceClientError.scopeReadbackMismatch
                    }
                }
                let canonicalPerson = result.identity.personID.flatMap { personID in
                    currentSnapshot.people.first { $0.id == personID }
                }
                let canonicalContext = result.identity.relationshipContextID.flatMap {
                    contextID in
                    canonicalPerson?.contexts.first { $0.id == contextID }
                }
                let receiptSessionID = sessionStore.recordContactReceipt(
                    operationKey: operationKey,
                    outcome: receiptOutcome,
                    result: result,
                    personDisplayLabel: canonicalPerson?.displayLabel ?? contactDraft.name,
                    contextDisplayLabel: canonicalContext?.displayLabel
                        ?? (receiptOutcome == .identityReview
                            ? nil
                            : contactDraft.relationshipContext)
                )
                bindContactContinuation(
                    to: result,
                    sessionID: receiptSessionID
                )
                let didClearRecovery = sessionStore.clearContactProposal()
                if didClearRecovery {
                    pendingContactTarget = nil
                    pendingContactCapturedAt = nil
                    pendingContactConfirmIdentityClue = nil
                }
                if target == .unresolved {
                    guard let caseID = result.identity.resolutionCaseID else {
                        throw PursuitWorkspaceClientError.scopeReadbackMismatch
                    }
                    contactSaveMessage = didClearRecovery
                        ? receiptSessionID.map { _ in
                            "\(appLanguage.text("Saved for identity review")) · \(appLanguage.text("case")) \(caseID.suffix(8)) · \(appLanguage.text("source receipt")) \(receipt)."
                        } ?? appLanguage.text(
                            "Saved for identity review, but Session history is unavailable on this device.",
                            zhHans: "已保存以供身份审阅，但此设备上的会话历史不可用。"
                        )
                        : appLanguage.text(
                            "Saved for identity review, but local recovery could not be cleared. Reopening uses the same safe operation."
                        )
                } else {
                    let destination = canonicalPerson?.displayLabel ?? contactDraft.name
                    contactSaveMessage = didClearRecovery
                        ? receiptSessionID.map { _ in
                            appLanguage.text(
                                "Saved to \(destination) · receipt \(receipt). The original note remains the source.",
                                zhHans: "已保存到 \(destination) · 回执 \(receipt)。原始输入仍作为来源保留。"
                            )
                        } ?? appLanguage.text(
                            "Saved to \(destination), but Session history is unavailable on this device.",
                            zhHans: "已保存到 \(destination)，但此设备上的会话历史不可用。"
                        )
                        : appLanguage.text(
                            "Saved, but local recovery could not be cleared. Reopening uses the same safe operation."
                        )
                }
            } catch {
                contactSaveError = (error as? LocalizedError)?.errorDescription
                    ?? appLanguage.text(
                        "The contact was not saved. Your proposal is still here."
                    )
            }
            isSavingContact = false
        }
    }

    private func contactReceiptOutcome(
        for target: ConversationContactTarget
    ) -> AgentContactReceipt.Outcome {
        switch target {
        case .newPerson: return .createdPerson
        case .existingPerson: return .matchedExisting
        case .unresolved: return .identityReview
        }
    }

    private func bindContactContinuation(
        to result: ResourceCaptureResult,
        sessionID: UUID?
    ) {
        activeSessionID = sessionID
        isChoosingScope = false
        guard let personID = result.identity.personID,
              let relationshipContextID = result.identity.relationshipContextID else {
            // An unresolved identity case owns no relationship scope. The
            // composer may accept another contact intent, but a generic Ask
            // must never inherit whichever relationship preceded this review.
            selectedScope = nil
            return
        }
        selectedScope = availableScopes.first {
            $0.person.id == personID
                && $0.context.id == relationshipContextID
        }
    }

    private func clearContactProposal() {
        guard sessionStore.clearContactProposal() else {
            contactSaveError = appLanguage.text(
                "The proposal could not be cleared from protected recovery. It remains open."
            )
            return
        }
        contactDraft = nil
        contactOperationKey = nil
        pendingContactTarget = nil
        pendingContactCapturedAt = nil
        pendingContactConfirmIdentityClue = nil
        contactLookupTask?.cancel()
        contactLookupTask = nil
        contactCandidates = []
        contactLookupPhase = .idle
        selectedContactPersonID = nil
        selectedContactContextID = nil
        createDistinctContact = false
        saveContactForIdentityReview = false
        confirmContactIdentityClue = false
        contactSaveMessage = nil
        contactSaveError = nil
    }

    private func contactDraftBinding(
        fallback: ConversationContactDraft
    ) -> Binding<ConversationContactDraft> {
        Binding(
            get: { contactDraft ?? fallback },
            set: { updated in
                contactDraft = updated
                let wasPending = pendingContactTarget != nil
                let operationKey = wasPending
                    ? "ios:contact:\(UUID().uuidString.lowercased())"
                    : contactOperationKey
                        ?? sessionStore.contactProposalOperationKey
                        ?? "ios:contact:\(UUID().uuidString.lowercased())"
                contactOperationKey = operationKey
                if wasPending {
                    pendingContactTarget = nil
                    pendingContactCapturedAt = nil
                    pendingContactConfirmIdentityClue = nil
                }
                if !sessionStore.saveContactProposal(
                    updated,
                    idempotencyKey: operationKey
                ) {
                    contactSaveError = appLanguage.text(
                        "This edit is visible, but it could not be protected for relaunch."
                    )
                }
            }
        )
    }

    private func restorePendingContactChoice() {
        selectedContactPersonID = nil
        selectedContactContextID = nil
        createDistinctContact = false
        saveContactForIdentityReview = false
        switch pendingContactTarget {
        case .newPerson:
            createDistinctContact = true
        case let .existingPerson(personID, relationshipContextID):
            selectedContactPersonID = personID
            selectedContactContextID = relationshipContextID
        case .unresolved:
            saveContactForIdentityReview = true
        case nil:
            break
        }
    }

    private func restoreContactProposal() {
        guard sessionID == nil,
              initialSeed == nil,
              contactDraft == nil,
              let restoredDraft = sessionStore.contactProposalDraft else {
            return
        }
        contactDraft = restoredDraft
        contactOperationKey = sessionStore.contactProposalOperationKey
        pendingContactTarget = sessionStore.contactProposalPendingTarget
        pendingContactCapturedAt = sessionStore.contactProposalCapturedAt
        pendingContactConfirmIdentityClue =
            sessionStore.contactProposalPendingConfirmIdentityClue
        confirmContactIdentityClue = restoredDraft.identityClue != nil
        restorePendingContactChoice()
        startContactLookup(for: restoredDraft)
    }

    private func initials(_ name: String) -> String {
        let parts = name.split(separator: " ")
        return String(parts.prefix(2).compactMap(\.first)).uppercased()
    }

    private func restoreDraft(preferred: String? = nil) {
        let saved: String
        if let selectedScope {
            saved = sessionStore.draft(
                personID: selectedScope.person.id,
                relationshipContextID: selectedScope.context.id
            )
        } else if sessionID == nil,
                  initialSeed == nil,
                  contactDraft == nil {
            saved = sessionStore.globalDraft()
        } else {
            return
        }
        draft = saved.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? preferred ?? ""
            : saved
    }

    private func selectScope(_ scope: AskScope) {
        let pendingSend = pendingScopedSend
        pendingScopedSend = nil
        let priorScope = selectedScope
        let unscopedDraft = draft
        let shouldPromoteDraft = priorScope == nil
            && !unscopedDraft.trimmingCharacters(
                in: .whitespacesAndNewlines
            ).isEmpty
        let wasGlobalComposition = activeSessionID == nil
            && initialSeed == nil

        selectedScope = scope
        activeSessionID = nil
        scopeQuery = ""
        isChoosingScope = false
        isRequestingScope = false
        errorMessage = nil

        if shouldPromoteDraft {
            if wasGlobalComposition {
                if !sessionStore.promoteGlobalDraft(
                    unscopedDraft,
                    personID: scope.person.id,
                    relationshipContextID: scope.context.id
                ) {
                    errorMessage = appLanguage.text(
                        "This relationship is selected, but the draft remains protected as a global draft until this device can save the move."
                    )
                }
            } else {
                sessionStore.saveDraft(
                    unscopedDraft,
                    personID: scope.person.id,
                    relationshipContextID: scope.context.id
                )
            }
            draft = unscopedDraft
            if !voiceOverEnabled {
                Task { @MainActor in
                    await Task.yield()
                    composerFocused = true
                }
            }
        } else {
            draft = sessionStore.draft(
                personID: scope.person.id,
                relationshipContextID: scope.context.id
            )
        }

        if let pendingSend {
            Task { @MainActor in
                await Task.yield()
                send(pendingSend)
            }
        }
    }

    private func reviewIdempotencyKey(
        fragmentID: String,
        expectedReviewStatus: String,
        authorityToken: String,
        reason: String,
        decision: String
    ) -> String {
        AgentEvidenceReviewIntent.idempotencyKey(
            fragmentID: fragmentID,
            expectedReviewStatus: expectedReviewStatus,
            authorityToken: authorityToken,
            decision: decision,
            reason: reason
        )
    }

    private func retryEvidenceReview(_ operation: AgentEvidenceReviewOperation) {
        guard !sessionStore.activeEvidenceReviewKeys.contains(
            operation.idempotencyKey
        ) else {
            return
        }
        do {
            try sessionStore.markEvidenceReviewPending(operation.idempotencyKey)
            reviewPreparationError = nil
        } catch {
            reviewPreparationError = evidenceReviewFailureMessage(error)
            return
        }
        performEvidenceReview(operation)
    }

    private func performEvidenceReview(_ operation: AgentEvidenceReviewOperation) {
        guard sessionStore.claimEvidenceReview(operation.idempotencyKey) else {
            return
        }
        Task {
            defer {
                sessionStore.releaseEvidenceReview(operation.idempotencyKey)
            }
            do {
                let result = try await reviewEvidence(
                    operation.fragmentID,
                    operation.expectedReviewStatus,
                    operation.authorityReviewID,
                    operation.decision,
                    operation.reason,
                    operation.idempotencyKey
                )
                if !sessionStore.markEvidenceReviewApplied(
                    operation.idempotencyKey,
                    result: result
                ) {
                    reviewPreparationError = postReviewPersistenceMessage
                }
                await revalidateAndDismissUnavailableCitation()
            } catch {
                _ = recordEvidenceReviewFailure(
                    operation.idempotencyKey,
                    error: error
                )
            }
        }
    }

    private func submitReinstatement(_ prior: AgentEvidenceReviewOperation) {
        let reason = reinstatementReason.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !reason.isEmpty else { return }
        guard let authorityReviewID = prior.resultingReviewID else {
            reviewPreparationError = appLanguage.text(
                "Ask again before re-reviewing this older saved operation.",
                zhHans: "请先重新提问，再重新审阅这条较早保存的操作。"
            )
            return
        }
        let key = reviewIdempotencyKey(
            fragmentID: prior.fragmentID,
            expectedReviewStatus: "rejected",
            authorityToken: authorityReviewID,
            reason: reason,
            decision: "reviewed"
        )
        reinstatementReason = ""
        do {
            let operation = try sessionStore.beginEvidenceReview(
                idempotencyKey: key,
                basedOn: prior,
                expectedReviewStatus: "rejected",
                authorityReviewID: authorityReviewID,
                decision: "reviewed",
                reason: reason
            )
            reviewPreparationError = nil
            performEvidenceReview(operation)
        } catch {
            reviewPreparationError = evidenceReviewFailureMessage(error)
        }
    }

    private var postReviewPersistenceMessage: String {
        appLanguage.text(
            "The canonical review responded, but its protected local confirmation was not saved. Reconcile safely with the same operation key.",
            zhHans: "规范审阅已响应，但受保护的本地确认未能保存。请使用同一操作键安全核对。"
        )
    }

    private func evidenceReviewFailureMessage(_ error: Error) -> String {
        (error as? LocalizedError)?.errorDescription
            ?? appLanguage.text(
                "The canonical review outcome is unknown. Retry uses the same operation key.",
                zhHans: "规范审阅结果尚不确定。重试会使用同一个操作键。"
            )
    }

    @discardableResult
    private func recordEvidenceReviewFailure(
        _ idempotencyKey: String,
        error: Error
    ) -> Bool {
        if let typed = error as? PursuitWorkspaceClientError,
           typed.isSupersededEvidenceReview {
            let didPersist = sessionStore.markEvidenceReviewSuperseded(
                idempotencyKey,
                message: appLanguage.text(
                    "A newer source decision is already current. This older operation cannot be retried.",
                    zhHans: "已有更新的来源决定生效。这条较早的操作不能再次重试。"
                )
            )
            if !didPersist {
                reviewPreparationError = appLanguage.text(
                    "A newer source decision is current, but this device could not save that notice. Ask again for current evidence.",
                    zhHans: "已有更新的来源决定生效，但此设备无法保存该提示。请重新提问以获取当前证据。"
                )
            }
            return true
        }
        let message = evidenceReviewFailureMessage(error)
        let didPersist: Bool
        if let typed = error as? PursuitWorkspaceClientError,
           case .backend = typed {
            didPersist = sessionStore.markEvidenceReviewFailed(
                idempotencyKey,
                message: message
            )
        } else {
            didPersist = sessionStore.markEvidenceReviewUnknown(
                idempotencyKey,
                message: message
            )
        }
        if !didPersist {
            reviewPreparationError = postReviewPersistenceMessage
        }
        return false
    }

    private var selectedCitationIsCurrent: Bool {
        guard isCanonical, let selectedCitation else { return true }
        return sessionStore.validationTargets().contains { target in
            target.taskID == selectedCitation.taskID
                && target.response.citations.contains {
                    $0.id == selectedCitation.citation.id
                }
        }
    }

    private func revalidateAndDismissUnavailableCitation() async {
        await revalidateSessions()
        if !selectedCitationIsCurrent { selectedCitation = nil }
    }
}

private struct ConversationContactProposalTurn: View {
    @Binding var draft: ConversationContactDraft
    let candidates: [WorkspacePerson]
    let lookupPhase: ConversationContactLookupPhase
    @Binding var selectedPersonID: String?
    @Binding var selectedContextID: String?
    @Binding var createDistinct: Bool
    @Binding var saveForIdentityReview: Bool
    @Binding var confirmIdentityClue: Bool
    let hasPendingWrite: Bool
    let isSaving: Bool
    let saveMessage: String?
    let errorMessage: String?
    let isCanonical: Bool
    let language: AppLanguage
    let onConfirm: () -> Void
    let onRetryLookup: () -> Void
    let onCancel: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.sizeCategory) private var sizeCategory
    @State private var showsAllMatches = false
    @State private var editsDetails = false

    private var selectedPerson: WorkspacePerson? {
        candidates.first { $0.id == selectedPersonID }
    }

    private var canConfirm: Bool {
        isCanonical
            && !isSaving
            && lookupPhase == .complete
            && !draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !draft.relationshipContext.trimmingCharacters(
                in: .whitespacesAndNewlines
            ).isEmpty
            && (hasPendingWrite || (
                saveForIdentityReview
                    || candidates.isEmpty
                    || (createDistinct && !hasCurrentHistoricalConflict)
                    || selectedPersonID != nil
            ))
            && saveMessage == nil
    }

    private var hasCurrentHistoricalConflict: Bool {
        ConversationContactMatchPolicy.hasCurrentHistoricalConflict(in: candidates)
    }

    private var isReadOnly: Bool {
        hasPendingWrite || saveMessage != nil
    }

    private var confirmButtonEmphasized: Bool {
        canConfirm || isSaving
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AskUserMessageBubble(
                message: draft.sourceNote,
                accessibilityIdentifier: "contact-user-message"
            )
            .frame(maxWidth: .infinity, alignment: .trailing)

            HStack(alignment: .top, spacing: 0) {
                proposalCard
                    .frame(
                        maxWidth: dynamicTypeSize.isAccessibilitySize
                            || sizeCategory.isAccessibilityCategory
                            ? .infinity
                            : 344,
                        alignment: .leading
                    )
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("contact-proposal-turn")
    }

    private var proposalCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Label(
                        language.text("Contact"),
                        systemImage: "person.crop.circle.badge.plus"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.tsMutedInk)

                    Text(proposalTitle)
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("contact-proposal-title")
                }
                Spacer(minLength: 8)
                Button(action: onCancel) {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .disabled(isSaving || (hasPendingWrite && saveMessage == nil))
                .opacity(isSaving || (hasPendingWrite && saveMessage == nil) ? 0.42 : 1)
                .accessibilityLabel(language.text("Dismiss proposal", zhHans: "关闭提议"))
                .accessibilityIdentifier("contact-dismiss-proposal")
            }

            if let saveMessage {
                completedReceipt(saveMessage)
            } else {
                contactDetails

                if let clue = draft.identityClue {
                    Toggle(isOn: $confirmIdentityClue) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: "\(identityClueLabel(clue)) · \(clue.value)")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.tsInk)
                                .textSelection(.enabled)
                            Text(
                                language.text(
                                    "Include this identity clue when you confirm"
                                )
                            )
                            .font(.caption)
                            .foregroundStyle(Color.tsMutedInk)
                        }
                    }
                    .tint(Color.tsVermilion)
                    .disabled(isReadOnly)
                    .accessibilityIdentifier("contact-confirm-identity-clue")
                }

                if hasPendingWrite {
                    Label(
                        language.text(
                            "Previous outcome is unknown · retry is locked to the original operation"
                        ),
                        systemImage: "arrow.triangle.2.circlepath"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 14))
                    .accessibilityIdentifier("contact-pending-write-boundary")
                }

                identityReview
                    .id("contact-identity-state")

                if let errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.circle")
                        .font(.caption)
                        .foregroundStyle(Color.tsVermilion)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("contact-save-error")
                }

                Button {
                    editsDetails = false
                    onConfirm()
                } label: {
                    HStack(spacing: 8) {
                        if isSaving {
                            ProgressView()
                                .tint(Color.tsSurface)
                        }
                        Text(confirmTitle)
                            .font(.subheadline.weight(.bold))
                        Spacer()
                        Image(systemName: "arrow.right")
                            .font(.subheadline.weight(.bold))
                    }
                    .foregroundStyle(
                        confirmButtonEmphasized ? Color.tsSurface : Color.tsMutedInk
                    )
                    .padding(.horizontal, 16)
                    .frame(minHeight: 50)
                    .background(
                        confirmButtonEmphasized ? Color.tsInk : Color.tsCanvas,
                        in: RoundedRectangle(cornerRadius: 16)
                    )
                    .overlay {
                        if !confirmButtonEmphasized {
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(Color.tsLine, lineWidth: 1)
                        }
                    }
                }
                .buttonStyle(.plain)
                .disabled(!canConfirm)
                .accessibilityIdentifier("contact-confirm-save")
            }

            Label(
                saveMessage == nil
                    ? language.text(
                        "Proposed only · nothing changes until you confirm",
                        zhHans: "仅为提议 · 确认前不会发生任何更改"
                    )
                    : language.text(
                        "Saved with canonical receipt · source remains traceable"
                    ),
                systemImage: saveMessage == nil ? "lock.shield" : "checkmark.shield"
            )
            .font(.caption2)
            .foregroundStyle(Color.tsMutedInk)
            .accessibilityIdentifier(
                saveMessage == nil ? "contact-proposal-boundary" : "contact-receipt-boundary"
            )
        }
        .padding(16)
        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 20))
        .overlay {
            RoundedRectangle(cornerRadius: 20)
                .stroke(Color.tsLine, lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("contact-proposal-card")
        .onChange(of: draft.name) { _ in
            selectedPersonID = nil
            selectedContextID = nil
            createDistinct = false
            saveForIdentityReview = false
            showsAllMatches = false
            if draft.identityClue == nil {
                onRetryLookup()
            }
        }
        .onChange(of: draft.identityClue) { clue in
            selectedPersonID = nil
            selectedContextID = nil
            createDistinct = false
            saveForIdentityReview = false
            confirmIdentityClue = clue != nil
            showsAllMatches = false
            onRetryLookup()
        }
    }

    private func completedReceipt(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            contactDetails

            if let clue = draft.identityClue {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: "\(identityClueLabel(clue)) · \(clue.value)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.tsInk)
                            .textSelection(.enabled)
                        Text(
                            language.text(
                                confirmIdentityClue
                                    ? "Included in the saved source"
                                    : "Not included in the saved source"
                            )
                        )
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                    }
                } icon: {
                    Image(
                        systemName: confirmIdentityClue
                            ? "checkmark.circle.fill"
                            : "minus.circle"
                    )
                    .foregroundStyle(
                        confirmIdentityClue ? Color.tsVermilion : Color.tsMutedInk
                    )
                }
                .accessibilityIdentifier("contact-saved-identity-clue")
            }

            Label {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(Color.tsInk)
            }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 16))
                .accessibilityIdentifier("contact-save-success")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("contact-completed-receipt")
    }

    private var proposalTitle: String {
        if saveMessage != nil {
            return language.text("Contact saved")
        }
        if hasPendingWrite {
            return language.text("Confirm the original save")
        }
        guard isCanonical else {
            return language.text("Review this contact")
        }
        switch lookupPhase {
        case .idle:
            return language.text("Review this contact")
        case .checking:
            return language.text("Checking existing contacts")
        case .failed:
            return language.text("Identity check needs retry")
        case .complete:
            if hasCurrentHistoricalConflict {
                return language.text("Identity needs review")
            }
            if candidates.isEmpty {
                return language.text("Create a new contact?")
            }
            if selectedPersonID != nil {
                return language.text("Add to the existing contact?")
            }
            return language.text("Choose the existing contact")
        }
    }

    @ViewBuilder
    private var contactDetails: some View {
        if editsDetails {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(language.text("Name"))
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                    TextField(
                        language.text("Contact name", zhHans: "联系人姓名"),
                        text: $draft.name
                    )
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.next)
                    .disabled(isReadOnly)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityIdentifier("contact-proposal-name")
                }

                VStack(alignment: .leading, spacing: 5) {
                    Text(language.text("Relationship"))
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                    TextField(
                        language.text("Relationship", zhHans: "关系"),
                        text: $draft.relationshipContext
                    )
                    .font(.body)
                    .foregroundStyle(Color.tsInk)
                    .submitLabel(.done)
                    .disabled(isReadOnly)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityIdentifier("contact-proposal-relationship")
                }

                Button {
                    editsDetails = false
                } label: {
                    Label(
                        language.text("Done editing"),
                        systemImage: "checkmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .disabled(isReadOnly)
                .accessibilityIdentifier("contact-finish-details")
            }
            .padding(14)
            .background(Color.tsSurface.opacity(0.72), in: RoundedRectangle(cornerRadius: 16))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("contact-details-editor")
        } else {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(
                        draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? language.text("Name needed")
                            : draft.name
                    )
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("contact-summary-name")

                    Text(
                        draft.relationshipContext.trimmingCharacters(
                            in: .whitespacesAndNewlines
                        ).isEmpty
                            ? language.text("Relationship needed")
                            : draft.relationshipContext
                    )
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("contact-summary-relationship")
                }
                .layoutPriority(1)

                Spacer(minLength: 4)

                if !isReadOnly {
                    Button {
                        editsDetails = true
                    } label: {
                        Label(
                            language.text("Edit"),
                            systemImage: "pencil"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                        .frame(minWidth: 44, minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(language.text("Edit contact details"))
                    .accessibilityIdentifier("contact-edit-details")
                }
            }
            .padding(14)
            .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 16))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("contact-proposal-summary")
        }
    }

    @ViewBuilder
    private var identityReview: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(
                language.text("Identity check"),
                systemImage: "person.text.rectangle"
            )
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.tsInk)

            if !isCanonical {
                Label(
                    language.text(
                        "Workspace readback is unavailable. Edit safely here; identity checking and save stay disabled.",
                        zhHans: "工作区回读暂不可用；你仍可安全编辑，但身份检查和保存保持禁用。"
                    ),
                    systemImage: "exclamationmark.shield"
                )
                .font(.subheadline)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("contact-workspace-unavailable")
            } else if lookupPhase == .checking {
                Label {
                    Text(
                        language.text(
                            "Checking confirmed identity clues…"
                        )
                    )
                } icon: {
                    ProgressView()
                }
                .font(.subheadline)
                .foregroundStyle(Color.tsInk)
                .accessibilityIdentifier("contact-identity-checking")
            } else if case let .failed(message) = lookupPhase {
                VStack(alignment: .leading, spacing: 8) {
                    Label(message, systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                        .font(.subheadline)
                        .foregroundStyle(Color.tsInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(action: onRetryLookup) {
                        Text(language.text("Retry identity check"))
                            .font(.caption.weight(.semibold))
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("contact-retry-identity-check")
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("contact-identity-check-failed")
            } else if candidates.isEmpty {
                Label(
                    language.text(
                        draft.identityClue == nil
                            ? "No same-name page found · no identity clue to verify"
                            : "No confirmed identity match · ready to create after review"
                    ),
                    systemImage: "checkmark.circle"
                )
                .font(.subheadline)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("contact-identity-no-match")
            } else {
                Text(
                    language.text(
                        hasCurrentHistoricalConflict
                            ? "Current and historical owners differ · choose the current owner or keep this unresolved"
                            : draft.identityClue == nil
                                ? "Same-name review only · names do not prove identity"
                                : "Possible identity matches · none selected"
                    )
                )
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("contact-no-preselection")

                ForEach(visibleCandidates) { person in
                    let policyAllowsSelection = ConversationContactMatchPolicy.canSelect(
                        person,
                        among: candidates
                    )
                    let selectionAllowed = !isReadOnly && policyAllowsSelection
                    Button {
                        guard selectionAllowed else { return }
                        selectedPersonID = person.id
                        selectedContextID = matchingContext(in: person)?.id
                        createDistinct = false
                        saveForIdentityReview = false
                    } label: {
                        HStack(spacing: 12) {
                            Text(initials(person.displayLabel))
                                .font(.caption.weight(.bold))
                                .foregroundStyle(Color.tsVermilion)
                                .frame(width: 36, height: 36)
                                .background(Color.tsVermilion.opacity(0.1), in: Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(person.displayLabel)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Color.tsInk)
                                Text(
                                    matchDetail(for: person)
                                )
                                .font(.caption)
                                .foregroundStyle(Color.tsMutedInk)
                            }
                            Spacer()
                            Image(
                                systemName: selectionAllowed
                                    ? selectedPersonID == person.id
                                        ? "checkmark.circle.fill"
                                        : "circle"
                                    : policyAllowsSelection
                                        ? "lock.circle"
                                        : "clock.arrow.circlepath"
                            )
                            .foregroundStyle(
                                selectionAllowed && selectedPersonID == person.id
                                    ? Color.tsVermilion
                                    : Color.tsMutedInk.opacity(0.5)
                            )
                        }
                        .padding(12)
                        .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                    .disabled(!selectionAllowed)
                    .opacity(selectionAllowed ? 1 : 0.72)
                    .accessibilityIdentifier("contact-match-\(person.id)")
                    .accessibilityValue(
                        selectionAllowed
                            ? ""
                            : policyAllowsSelection
                                ? language.text(
                                    saveMessage == nil
                                        ? "Original operation locked · selection disabled"
                                        : "Saved receipt · selection disabled"
                                )
                                : language.text(
                                    "Historical ownership only · selection disabled"
                                )
                    )
                }

                if candidates.count > 3, !showsAllMatches {
                    Button {
                        showsAllMatches = true
                    } label: {
                        Text(
                            language.text(
                                "Show \(candidates.count - 3) more matches",
                                zhHans: "显示另外 \(candidates.count - 3) 个匹配项"
                            )
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("contact-show-all-matches")
                }

                if let selectedPerson {
                    relationshipChoices(for: selectedPerson)
                        .disabled(isReadOnly)
                }

                if hasCurrentHistoricalConflict {
                    VStack(alignment: .leading, spacing: 6) {
                        Button {
                            saveForIdentityReview.toggle()
                            if saveForIdentityReview {
                                selectedPersonID = nil
                                selectedContextID = nil
                                createDistinct = false
                            }
                        } label: {
                            Label(
                                language.text("Save for identity review"),
                                systemImage: saveForIdentityReview
                                    ? "checkmark.square.fill"
                                    : "square"
                            )
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(
                                saveForIdentityReview ? Color.tsVermilion : Color.tsInk
                            )
                            .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                        .disabled(isReadOnly)
                        .accessibilityIdentifier("contact-save-for-identity-review")

                        Button {
                            draft.identityClue = nil
                        } label: {
                            Label(
                                language.text("Remove identity clue and review by name"),
                                systemImage: "minus.circle"
                            )
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.tsInk)
                            .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                        .disabled(isReadOnly)
                        .accessibilityIdentifier("contact-remove-identity-clue")
                    }
                } else {
                    Button {
                        createDistinct.toggle()
                        if createDistinct {
                            selectedPersonID = nil
                            selectedContextID = nil
                            saveForIdentityReview = false
                        }
                    } label: {
                        Label(
                            language.text(
                                saveMessage == nil
                                    ? "Create as a separate person"
                                    : "Created as a separate person"
                            ),
                            systemImage: createDistinct
                                ? "checkmark.square.fill"
                                : "square"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(createDistinct ? Color.tsVermilion : Color.tsInk)
                        .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .disabled(isReadOnly)
                    .accessibilityIdentifier("contact-create-distinct")
                }
            }
        }
    }

    private func relationshipChoices(for person: WorkspacePerson) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(language.text("Add to relationship", zhHans: "添加到关系"))
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
            ForEach(person.contexts.prefix(3)) { context in
                Button {
                    selectedContextID = context.id
                } label: {
                    Label(
                        context.displayLabel,
                        systemImage: selectedContextID == context.id
                            ? "checkmark.circle.fill"
                            : "circle"
                    )
                    .font(.caption)
                    .foregroundStyle(Color.tsInk)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
                .buttonStyle(.plain)
            }
            Button {
                selectedContextID = nil
            } label: {
                Label(
                    language.text(
                        "New · \(draft.relationshipContext)",
                        zhHans: "新关系 · \(draft.relationshipContext)"
                    ),
                    systemImage: selectedContextID == nil
                        ? "checkmark.circle.fill"
                        : "circle"
                )
                .font(.caption)
                .foregroundStyle(Color.tsInk)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 12)
    }

    private var confirmTitle: String {
        if hasPendingWrite {
            return language.text(
                "Retry same operation"
            )
        }
        if saveForIdentityReview {
            return language.text("Save for identity review")
        }
        if candidates.isEmpty || createDistinct {
            return language.text("Create contact", zhHans: "创建联系人")
        }
        return language.text("Add to existing contact", zhHans: "添加到现有联系人")
    }

    private var visibleCandidates: [WorkspacePerson] {
        showsAllMatches ? candidates : Array(candidates.prefix(3))
    }

    private func matchDetail(for person: WorkspacePerson) -> String {
        if let match = person.identityMatches.first(where: {
            $0.kind == "confirmed_handle" || $0.kind == "expired_handle"
        }) {
            let status = match.kind == "confirmed_handle"
                ? language.text("Confirmed", zhHans: "已确认")
                : language.text("Needs fresh confirmation", zhHans: "需要重新确认")
            let type = match.handleType.map { handleType in
                switch handleType {
                case "email": return language.text("email", zhHans: "邮箱")
                case "phone": return language.text("phone", zhHans: "电话")
                case "linkedin_url": return "LinkedIn"
                default: return language.text("identity clue", zhHans: "身份线索")
                }
            } ?? language.text("identity clue", zhHans: "身份线索")
            if let displayHint = match.displayHint {
                return "\(status) \(type) · \(displayHint)"
            }
            return "\(status) \(type)"
        }
        return language.text(
            "Same name · \(person.contextCount) relationship\(person.contextCount == 1 ? "" : "s")",
            zhHans: "同名 · \(person.contextCount) 段关系"
        )
    }

    private func identityClueLabel(
        _ clue: ConversationContactDraft.IdentityClue
    ) -> String {
        switch clue.type {
        case "email": return language.text("Email", zhHans: "邮箱")
        case "phone": return language.text("Phone", zhHans: "电话")
        case "linkedin_url": return "LinkedIn"
        default: return language.text("Identity clue", zhHans: "身份线索")
        }
    }

    private func matchingContext(in person: WorkspacePerson) -> WorkspacePerson.Context? {
        let target = draft.relationshipContext.folding(
            options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
            locale: .current
        )
        return person.contexts.first {
            $0.displayLabel.folding(
                options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
                locale: .current
            ) == target
        }
    }

    private func initials(_ name: String) -> String {
        let parts = name.split(separator: " ")
        let value = String(parts.prefix(2).compactMap(\.first))
        return value.isEmpty ? String(name.prefix(2)) : value.uppercased()
    }
}

private enum AgentConversationItem: Identifiable {
    case contactReceipt(AgentContactReceipt)
    case ask(AgentSessionTurn)

    var id: String {
        switch self {
        case let .contactReceipt(receipt):
            return "contact-receipt-\(receipt.id.uuidString)"
        case let .ask(turn):
            return "ask-turn-\(turn.id.uuidString)"
        }
    }

    var createdAt: Date {
        switch self {
        case let .contactReceipt(receipt): return receipt.createdAt
        case let .ask(turn): return turn.createdAt
        }
    }

    var responseScrollTargetID: String {
        guard case let .ask(turn) = self else { return id }
        let answer = turn.response.blocks.first {
            ["answer", "question_set", "clarification", "failure_recovery"]
                .contains($0.kind)
        } ?? turn.response.blocks.first
        return answer.map { "ask-response-block-\($0.id)" } ?? id
    }
}

private struct AskScope: Identifiable, Equatable {
    let person: WorkspacePerson
    let context: WorkspacePerson.Context
    var id: String { "\(person.id):\(context.id)" }
}

private struct SelectedAskCitation: Identifiable {
    let taskID: String
    let citation: RelationshipAskResponse.Citation
    var id: String { "\(taskID):\(citation.id)" }
}

private struct SelectedPursuitTarget: Identifiable {
    let pursuit: WorkspacePursuit
    let actionID: String
    var id: String { "\(pursuit.id):\(actionID)" }
}

private struct AskPendingTurnView: View {
    let message: String
    let mediaDrafts: [AskMediaDraft]
    let language: AppLanguage

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .trailing, spacing: 7) {
                if !mediaDrafts.isEmpty {
                    AskPendingMediaStrip(
                        drafts: mediaDrafts,
                        language: language
                    )
                }
                AskUserMessageBubble(message: message)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)

            HStack(spacing: 9) {
                ProgressView()
                    .controlSize(.small)
                    .accessibilityHidden(true)
                Text(
                    language.text("Reading the record…")
                )
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                language.text("Reading the record…")
            )
            .accessibilityIdentifier("ask-loading")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ask-pending-turn")
    }
}

private struct AskPendingMediaStrip: View {
    let drafts: [AskMediaDraft]
    let language: AppLanguage

    private var visibleDrafts: [AskMediaDraft] { Array(drafts.prefix(3)) }

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(visibleDrafts.enumerated()), id: \.element.id) { index, draft in
                Image(uiImage: draft.preview)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 58, height: 58)
                    .clipShape(RoundedRectangle(cornerRadius: 13))
                    .overlay {
                        if index == 2, drafts.count > 3 {
                            RoundedRectangle(cornerRadius: 13)
                                .fill(Color.black.opacity(0.48))
                            Text(verbatim: "+\(drafts.count - 3)")
                                .font(.headline)
                                .foregroundStyle(.white)
                        }
                    }
            }
        }
        .padding(3)
        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.tsLine, lineWidth: 1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            String(drafts.count) + " · "
                + language.text("Task images, not evidence")
        )
        .accessibilityIdentifier("ask-pending-media")
    }
}

private struct AskUserMessageBubble: View {
    let message: String
    var accessibilityIdentifier = "ask-user-message"

    var body: some View {
        ViewThatFits(in: .horizontal) {
            bubble(fixesWidth: true)
            bubble(fixesWidth: false)
                .frame(maxWidth: 330, alignment: .trailing)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(message)
        .accessibilityIdentifier(accessibilityIdentifier)
    }

    private func bubble(fixesWidth: Bool) -> some View {
        Text(message)
            .font(.body)
            .foregroundStyle(Color.tsInk)
            .fixedSize(horizontal: fixesWidth, vertical: true)
            .padding(.horizontal, 15)
            .padding(.vertical, 11)
            .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .stroke(Color.tsLine, lineWidth: 1)
            }
    }
}

private struct AgentContactReceiptTurn: View {
    let receipt: AgentContactReceipt
    let language: AppLanguage
    let onOpenPerson: (() -> Void)?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(Color.tsVermilion.opacity(0.12))
                            .frame(width: 38, height: 38)
                        Image(systemName: outcomeIcon)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.tsVermilion)
                    }
                    .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(language.text("Contact tool"))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.tsMutedInk)
                        Text(outcomeTitle)
                            .font(.headline)
                            .foregroundStyle(Color.tsInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                VStack(alignment: .leading, spacing: 5) {
                    Text(receipt.personDisplayLabel)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                    Text(
                        receipt.contextDisplayLabel
                            ?? language.text("Identity review")
                    )
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                }

                Divider()
                    .overlay(Color.tsLine)

                VStack(alignment: .leading, spacing: 7) {
                    receiptReference(
                        label: language.text("Source receipt"),
                        value: String(receipt.resourceID.suffix(8))
                    )
                    if let resolutionCaseID = receipt.resolutionCaseID {
                        receiptReference(
                            label: language.text("Review case"),
                            value: String(resolutionCaseID.suffix(8))
                        )
                    }
                }

                Label(
                    boundaryMessage,
                    systemImage: receipt.requiresRefresh
                        ? "clock.arrow.circlepath"
                        : "checkmark.shield"
                )
                .font(.caption2)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)

                if let onOpenPerson {
                    Divider()
                        .overlay(Color.tsLine)
                    Button(action: onOpenPerson) {
                        HStack(spacing: 10) {
                            Text(language.text("Open in People"))
                            Spacer(minLength: 12)
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.bold))
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("contact-receipt-open-person")
                }
            }
            .padding(16)
            .frame(maxWidth: 344, alignment: .leading)
            .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 20))
            .overlay {
                RoundedRectangle(cornerRadius: 20)
                    .stroke(Color.tsLine, lineWidth: 1)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("agent-contact-receipt-\(receipt.id.uuidString)")
    }

    private var outcomeTitle: String {
        switch receipt.outcome {
        case .createdPerson:
            return language.text("Contact created")
        case .matchedExisting:
            return language.text("Added to existing contact")
        case .identityReview:
            return language.text("Saved for identity review", zhHans: "已保存以供身份审阅")
        }
    }

    private var outcomeIcon: String {
        switch receipt.outcome {
        case .createdPerson: return "person.crop.circle.badge.plus"
        case .matchedExisting: return "person.2.badge.gearshape"
        case .identityReview: return "person.crop.circle.badge.questionmark"
        }
    }

    private var boundaryMessage: String {
        if receipt.requiresRefresh {
            if receipt.outcome == .identityReview {
                return language.text(
                    "Restored reference · identity still needs review"
                )
            }
            if receipt.personID != nil, onOpenPerson == nil {
                return language.text(
                    "Restored reference · person is no longer available in People"
                )
            }
            return language.text(
                    "Restored reference · verify current state in People"
                )
        }
        return language.text(
            "Canonical IDs saved · original source stays separate"
        )
    }

    private func receiptReference(label: String, value: String) -> some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 3) {
                    receiptReferenceLabel(label)
                    receiptReferenceValue(value)
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    receiptReferenceLabel(label)
                    Spacer(minLength: 12)
                    receiptReferenceValue(value)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func receiptReferenceLabel(_ label: String) -> some View {
        Text(label)
            .font(.caption)
            .foregroundStyle(Color.tsMutedInk)
    }

    private func receiptReferenceValue(_ value: String) -> some View {
        Text(value)
            .font(.caption.monospaced().weight(.semibold))
            .foregroundStyle(Color.tsInk)
            .textSelection(.enabled)
    }
}

private struct AskTurnView: View {
    let turn: AgentSessionTurn
    let language: AppLanguage
    let evidenceReviews: [AgentEvidenceReviewOperation]
    let evidenceReviewHistory: [AgentEvidenceReviewOperation]
    let inFlightEvidenceReviewKeys: Set<String>
    let transientSupersededEvidenceReviewKeys: Set<String>
    let evidenceReviewAuthorityReadbackKeys: Set<String>
    let loadMedia: (String) async throws -> ChatMediaContent
    let onOpenEvidence: (RelationshipAskResponse.Citation) -> Void
    let onRetryEvidenceReview: (AgentEvidenceReviewOperation) -> Void
    let onReinstateEvidence: (AgentEvidenceReviewOperation) -> Void
    let onStartFreshAsk: () -> Void
    let onOpenPursuit: (String, String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .trailing, spacing: 7) {
                if !turn.response.media.isEmpty {
                    ChatMediaAlbumBubble(media: turn.response.media, load: loadMedia)
                        .frame(maxWidth: 310)
                }
                AskUserMessageBubble(message: turn.objective)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)

            if turn.requiresRefresh {
                Label(
                    language.text(
                        "Saved response · ask again to refresh its sources",
                        zhHans: "已保存回复 · 再次提问以刷新来源"
                    ),
                    systemImage: "clock.arrow.trianglehead.counterclockwise.rotate.90"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
                .accessibilityIdentifier("ask-restored-response-needs-refresh")
            }

            ForEach(turn.response.blocks) { block in
                VStack(alignment: .leading, spacing: 9) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(block.title)
                            .font(.headline)
                            .foregroundStyle(Color.tsInk)
                        Spacer(minLength: 8)
                        if block.requiresUserDecision {
                            Image(systemName: "checkmark.circle.badge.questionmark")
                                .foregroundStyle(Color.tsVermilion)
                                .accessibilityLabel(
                                    language.text("Needs review", zhHans: "需要审阅")
                                )
                        }
                    }
                    if block.kind == "active_action" {
                        AskActiveActionView(
                            rawBody: block.body,
                            targetRef: block.targetRef,
                            language: language,
                            onOpenPursuit: onOpenPursuit
                        )
                    } else {
                        Text(block.body)
                            .font(.subheadline)
                            .foregroundStyle(Color.tsInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if !block.citationDependencyIDs.isEmpty && !turn.requiresRefresh {
                        let citations = block.citationDependencyIDs.compactMap { id in
                            turn.response.citations.first { $0.id == id }
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(citations) { citation in
                                Button { onOpenEvidence(citation) } label: {
                                    HStack(alignment: .firstTextBaseline, spacing: 7) {
                                        Image(systemName: "quote.bubble")
                                            .accessibilityHidden(true)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(citation.sourceName)
                                                .font(.caption.weight(.semibold))
                                                .foregroundStyle(Color.tsInk)
                                            Text(citation.compactProvenance(in: language))
                                                .font(.caption2)
                                                .foregroundStyle(Color.tsMutedInk)
                                        }
                                        Spacer(minLength: 6)
                                        Image(systemName: "chevron.right")
                                            .font(.caption2.weight(.semibold))
                                            .foregroundStyle(Color.tsMutedInk)
                                    }
                                    .frame(minHeight: 44)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(
                                    language.text(
                                        "Evidence from \(citation.sourceName), \(citation.compactProvenance(in: language))",
                                        zhHans: "来自 \(citation.sourceName) 的证据，\(citation.compactProvenance(in: language))"
                                    )
                                )
                                .accessibilityHint(
                                    language.text("Open the exact cited source", zhHans: "打开精确引用来源")
                                )
                                .accessibilityIdentifier("ask-citation-\(citation.id)")
                            }
                        }
                    } else if !block.citationDependencyIDs.isEmpty {
                        Label(
                            language.text(
                                "Citations are hidden until this response is refreshed",
                                zhHans: "刷新回复前，引用暂不显示"
                            ),
                            systemImage: "shield.lefthalf.filled"
                        )
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                    }
                }
                .padding(.vertical, 14)
                .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
                .id("ask-response-block-\(block.id)")
            }

            ForEach(evidenceReviews) { operation in
                AskEvidenceReviewStatusView(
                    operation: operation,
                    language: language,
                    isInFlight: inFlightEvidenceReviewKeys.contains(
                        operation.idempotencyKey
                    ),
                    isSupersededInSession:
                        transientSupersededEvidenceReviewKeys.contains(
                            operation.idempotencyKey
                        ),
                    requiresAuthorityReadback:
                        evidenceReviewAuthorityReadbackKeys.contains(
                            operation.idempotencyKey
                        ),
                    onRetry: { onRetryEvidenceReview(operation) },
                    onReinstate: { onReinstateEvidence(operation) },
                    onStartFreshAsk: onStartFreshAsk
                )
            }

            if evidenceReviewHistory.count > 1 {
                AskEvidenceReviewHistoryView(
                    operations: evidenceReviewHistory,
                    language: language
                )
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ask-response-turn")
    }
}

private struct AskActiveActionView: View {
    let rawBody: String
    let targetRef: RelationshipAskResponse.Block.TargetRef?
    let language: AppLanguage
    let onOpenPursuit: (String, String) -> Void

    private var fields: Fields { Fields(body: rawBody) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(fields.action)
                .font(.body.weight(.semibold))
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { metadata }
                VStack(alignment: .leading, spacing: 8) { metadata }
            }

            if let gap = fields.gap {
                detail(
                    language.text("Waiting on", zhHans: "正在等待"),
                    value: gap,
                    symbol: "hourglass"
                )
            }
            if let close = fields.closeCondition {
                detail(
                    language.text("Done when", zhHans: "完成条件"),
                    value: close,
                    symbol: "checkmark.circle"
                )
            }
            if let effect = fields.effect {
                Label(effect, systemImage: "shield.lefthalf.filled")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let targetRef, targetRef.type == "pursuit_action" {
                Button {
                    onOpenPursuit(targetRef.pursuitID, targetRef.actionID)
                } label: {
                    Label(
                        language.text("Open Pursuit", zhHans: "打开追求事项"),
                        systemImage: "arrow.up.right"
                    )
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityHint(
                    language.text(
                        "Opens the existing action without recording a change",
                        zhHans: "打开现有行动，不记录任何更改"
                    )
                )
                .accessibilityIdentifier(
                    "ask-open-pursuit-\(targetRef.pursuitID)-\(targetRef.actionID)"
                )
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ask-active-action")
    }

    @ViewBuilder
    private var metadata: some View {
        if let owner = fields.owner {
            Label(owner, systemImage: "person.crop.circle")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
        }
        if let due = fields.due {
            Label(due.label(language: language), systemImage: due.isOverdue ? "exclamationmark.clock" : "calendar")
                .font(.caption.weight(.semibold))
                .foregroundStyle(due.isOverdue ? Color.tsVermilion : Color.tsMutedInk)
                .accessibilityIdentifier("ask-active-action-due")
        }
    }

    private func detail(_ label: String, value: String, symbol: String) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: symbol)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
                .frame(width: 16)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.tsMutedInk)
                Text(value)
                    .font(.subheadline)
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private struct Fields {
        let action: String
        let owner: String?
        let due: Due?
        let gap: String?
        let closeCondition: String?
        let effect: String?

        init(body: String) {
            let lines = body.split(separator: "\n").map(String.init)
            action = lines.first ?? body
            owner = Self.value(prefix: "Owner: ", lines: lines)
            due = Self.value(prefix: "Due: ", lines: lines).flatMap(Due.init(raw:))
            gap = Self.value(prefix: "Open gap: ", lines: lines)
            closeCondition = Self.value(prefix: "Close when: ", lines: lines)
            effect = lines.first { $0.hasPrefix("Existing work only") }
        }

        private static func value(prefix: String, lines: [String]) -> String? {
            lines.first { $0.hasPrefix(prefix) }.map { String($0.dropFirst(prefix.count)) }
        }
    }

    private struct Due {
        let date: Date?
        let fallback: String

        init?(raw: String) {
            guard raw != "not set" else { return nil }
            fallback = raw
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd HH:mm:ss 'UTC'"
            date = formatter.date(from: raw)
        }

        var isOverdue: Bool { date.map { $0 < Date() } ?? false }

        func label(language: AppLanguage) -> String {
            guard let date else { return fallback }
            let localized = date.formatted(date: .abbreviated, time: .shortened)
            return isOverdue
                ? language.text("Overdue · \(localized)", zhHans: "已逾期 · \(localized)")
                : localized
        }
    }
}

private struct AskEvidenceReviewStatusView: View {
    let operation: AgentEvidenceReviewOperation
    let language: AppLanguage
    let isInFlight: Bool
    let isSupersededInSession: Bool
    let requiresAuthorityReadback: Bool
    let onRetry: () -> Void
    let onReinstate: () -> Void
    let onStartFreshAsk: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: symbol)
                    .foregroundStyle(foreground)
                    .accessibilityHidden(true)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                Spacer(minLength: 8)
                if operation.state == .pending && isInFlight {
                    ProgressView()
                        .controlSize(.small)
                }
            }
            Text("\(operation.sourceName) · \(operation.personDisplayName) · \(operation.relationshipContextDisplayName)")
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            if requiresAuthorityReadback && !isEffectivelySuperseded {
                Text(
                    language.text(
                        "This operation was restored after an interruption. Check current evidence before any retry.",
                        zhHans: "此操作在中断后恢复。任何重试前，请先检查当前证据。"
                    )
                )
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            } else if isSupersededInSession && operation.state != .superseded {
                Text(
                    language.text(
                        "This terminal notice could not be saved on this device. The older operation stays blocked for this session.",
                        zhHans: "此终态提示未能保存在本设备上。这条较早的操作在本次会话中仍会被阻止。"
                    )
                )
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            } else if let statusMessage = operation.statusMessage,
                      [.outcomeUnknown, .failed, .superseded].contains(
                        operation.state
                      ) {
                Text(statusMessage)
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(
                language.text(
                    "The audit keeps every decision. Old answers stay stale.",
                    zhHans: "审计会保留每次决定。旧回复仍保持过期。"
                )
            )
            .font(.caption2)
            .foregroundStyle(Color.tsMutedInk)

            if isEffectivelySuperseded || requiresAuthorityReadback {
                Button(action: onStartFreshAsk) {
                    Label(
                        language.text(
                            requiresAuthorityReadback
                                ? "Check current evidence"
                                : "Ask with current evidence",
                            zhHans: requiresAuthorityReadback
                                ? "检查当前证据"
                                : "基于当前证据提问"
                        ),
                        systemImage: "sparkle.magnifyingglass"
                    )
                    .font(.caption.weight(.semibold))
                    .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityHint(
                    language.text(
                        "Moves to a fresh Ask and sends nothing automatically; the old review is not retried",
                        zhHans: "转到新的提问且不会自动发送；不会重试较早的审阅"
                    )
                )
                .accessibilityIdentifier("ask-evidence-review-current")
            } else if [.outcomeUnknown, .failed].contains(operation.state)
                || (operation.state == .pending && !isInFlight) {
                Button(action: onRetry) {
                    Label(
                        language.text("Reconcile safely", zhHans: "安全核对"),
                        systemImage: "arrow.clockwise"
                    )
                    .font(.caption.weight(.semibold))
                    .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityHint(
                    language.text(
                        "Retries the same evidence-review operation; it cannot create a duplicate review",
                        zhHans: "使用同一证据审阅操作重试，不会创建重复审阅"
                    )
                )
            } else if operation.state == .applied,
                      operation.decision == "rejected",
                      operation.resultingReviewID != nil {
                Button(action: onReinstate) {
                    Label(
                        language.text("Re-review corrected source", zhHans: "重新审阅已更正来源"),
                        systemImage: "clock.arrow.circlepath"
                    )
                    .font(.caption.weight(.semibold))
                    .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityHint(
                    language.text(
                        "Adds a new reviewed decision; the prior dispute remains in the audit",
                        zhHans: "添加新的已审阅决定；原争议仍保留在审计中"
                    )
                )
            }
        }
        .padding(14)
        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ask-evidence-review-\(operation.fragmentID)")
    }

    private var symbol: String {
        if isEffectivelySuperseded {
            return "arrow.trianglehead.2.clockwise.rotate.90"
        }
        if requiresAuthorityReadback {
            return "checkmark.shield"
        }
        switch operation.state {
        case .pending:
            return "clock"
        case .outcomeUnknown, .failed:
            return "exclamationmark.triangle"
        case .superseded:
            return "arrow.trianglehead.2.clockwise.rotate.90"
        case .applied:
            return operation.decision == "rejected"
                ? "checkmark.shield"
                : "checkmark.seal"
        }
    }

    private var foreground: Color {
        (isEffectivelySuperseded
            || requiresAuthorityReadback
            || [.outcomeUnknown, .failed].contains(operation.state))
            ? Color.tsVermilion
            : Color.tsMutedInk
    }

    private var title: String {
        if isEffectivelySuperseded {
            return language.text(
                "Newer source review is current",
                zhHans: "更新的来源审阅已生效"
            )
        }
        if requiresAuthorityReadback {
            return language.text(
                "Check source authority before retry",
                zhHans: "重试前检查来源权限"
            )
        }
        switch operation.state {
        case .pending:
            return isInFlight
                ? language.text("Saving source review…", zhHans: "正在保存来源审阅…")
                : language.text(
                    "Source review needs reconciliation",
                    zhHans: "来源审阅需要核对"
                )
        case .outcomeUnknown:
            return language.text("Review outcome unknown", zhHans: "审阅结果尚不确定")
        case .failed:
            return language.text("Review was not saved", zhHans: "审阅未保存")
        case .superseded:
            return language.text(
                "Newer source review is current",
                zhHans: "更新的来源审阅已生效"
            )
        case .applied where operation.decision == "rejected":
            return language.text("Source disputed · saved", zhHans: "来源已标记争议 · 已保存")
        case .applied:
            return language.text(
                "Source re-reviewed · ask again for fresh evidence",
                zhHans: "来源已重新审阅 · 再次提问以获取最新证据"
            )
        }
    }

    private var isEffectivelySuperseded: Bool {
        operation.state == .superseded || isSupersededInSession
    }
}

enum RelationshipAskDraftPolicy {
    static func currentEvidenceDraft(
        preserving existingDraft: String,
        suggestion: String
    ) -> String {
        existingDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? suggestion
            : existingDraft
    }
}

private struct AskEvidenceReviewHistoryView: View {
    let operations: [AgentEvidenceReviewOperation]
    let language: AppLanguage

    var body: some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(operations) { operation in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(decisionLabel(operation))
                                .font(.caption.weight(.semibold))
                            Spacer(minLength: 8)
                            Text(historyDate(operation).formatted(date: .abbreviated, time: .shortened))
                                .font(.caption2)
                                .foregroundStyle(Color.tsMutedInk)
                        }
                        Text(operation.reason)
                            .font(.caption)
                            .foregroundStyle(Color.tsInk)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("\(operation.state.rawValue) · …\(operation.idempotencyKey.suffix(8))")
                            .font(.caption2.monospaced())
                            .foregroundStyle(Color.tsMutedInk)
                    }
                    if operation.id != operations.last?.id {
                        Divider().overlay(Color.tsLine)
                    }
                }
            }
            .padding(.top, 10)
        } label: {
            Label(
                language.text(
                    "Source review history · \(operations.count)",
                    zhHans: "来源审阅历史 · \(operations.count)"
                ),
                systemImage: "clock.arrow.circlepath"
            )
            .font(.caption.weight(.semibold))
        }
        .padding(14)
        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 14))
        .accessibilityIdentifier("ask-evidence-review-history")
    }

    private func decisionLabel(_ operation: AgentEvidenceReviewOperation) -> String {
        operation.decision == "rejected"
            ? language.text("Disputed", zhHans: "已标记争议")
            : language.text("Reviewed", zhHans: "已审阅")
    }

    private func historyDate(_ operation: AgentEvidenceReviewOperation) -> Date {
        guard let canonicalDecidedAt = operation.canonicalDecidedAt else {
            return operation.updatedAt
        }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: canonicalDecidedAt)
            ?? ISO8601DateFormatter().date(from: canonicalDecidedAt)
            ?? operation.updatedAt
    }
}

extension RelationshipAskResponse.Citation {
    func compactProvenance(in language: AppLanguage) -> String {
        let day = observedDate.map { date in
            Self.observedDateFormatter(timeZone: resolvedSourceTimeZone).string(from: date)
        } ?? String(observedAt.prefix(10))
        return "\(day) · \(language.workspaceValue(attribution.actorKind)) · \(language.workspaceValue(reviewStatus))"
    }

    var detailedObservedAt: String {
        guard let observedDate else {
            return "\(observedAt)\(sourceTimezone.map { " · \($0)" } ?? "")"
        }
        let zone = resolvedSourceTimeZone
        let value = Self.observedDateTimeFormatter(timeZone: zone).string(
            from: observedDate
        )
        return sourceTimezone.map { "\(value) · \($0)" } ?? value
    }

    var detailedLastReviewedAt: String? {
        guard let lastReviewedAt else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = fractional.date(from: lastReviewedAt)
            ?? ISO8601DateFormatter().date(from: lastReviewedAt)
        guard let date else {
            return "\(lastReviewedAt)\(sourceTimezone.map { " · \($0)" } ?? "")"
        }
        let value = Self.observedDateTimeFormatter(
            timeZone: resolvedSourceTimeZone
        ).string(from: date)
        return sourceTimezone.map { "\(value) · \($0)" } ?? value
    }

    private var observedDate: Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: observedAt) { return date }
        return ISO8601DateFormatter().date(from: observedAt)
    }

    private var resolvedSourceTimeZone: TimeZone {
        sourceTimezone.flatMap(TimeZone.init(identifier:))
            ?? TimeZone(secondsFromGMT: 0)!
    }

    private static func observedDateFormatter(timeZone: TimeZone) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }

    private static func observedDateTimeFormatter(timeZone: TimeZone) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd HH:mm zzz"
        return formatter
    }
}

private struct AskCitationDetailView: View {
    let citation: RelationshipAskResponse.Citation
    let language: AppLanguage
    let onReject: ((String) async throws -> Void)?
    @Environment(\.dismiss) private var dismiss
    @State private var isRejecting = false
    @State private var showsRejectPrompt = false
    @State private var rejectionReason = ""
    @State private var rejectionError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text(citation.sourceName)
                            .font(.custom("Georgia", size: 28, relativeTo: .title2))
                            .foregroundStyle(Color.tsInk)
                        Text(citation.compactProvenance(in: language))
                            .font(.caption)
                            .foregroundStyle(Color.tsMutedInk)
                    }

                    if let excerpt = citation.exactExcerpt {
                        Text(excerpt)
                            .font(.body)
                            .foregroundStyle(Color.tsInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(18)
                            .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 18))
                            .accessibilityIdentifier("ask-citation-excerpt")
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        citationLine(
                            language.text("Observed", zhHans: "观察时间"),
                            citation.detailedObservedAt
                        )
                        citationLine(
                            language.text("Source state", zhHans: "来源状态"),
                            "\(language.workspaceValue(citation.reviewStatus)) · capture v\(citation.captureVersion)"
                        )
                        citationLine(
                            language.text("Attribution", zhHans: "归属"),
                            "\(language.workspaceValue(citation.attribution.actorKind)) · \(language.workspaceValue(citation.attribution.status))"
                        )
                        if let reviewer = citation.lastReviewedBy {
                            citationLine(
                                language.text("Last reviewed", zhHans: "最近审阅"),
                                "\(reviewer)\(citation.detailedLastReviewedAt.map { " · \($0)" } ?? "")"
                            )
                        }
                        citationLine(
                            language.text("Derived by", zhHans: "解析来源"),
                            "\(citation.parser.name) \(citation.parser.version)"
                        )
                    }

                    Label(
                        language.text(
                            "This exact governed fragment supports the Agent response.",
                            zhHans: "这个受治理的精确片段支持了 Agent 的回答。"
                        ),
                        systemImage: "checkmark.shield"
                    )
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)

                    if onReject != nil {
                        Button {
                            showsRejectPrompt = true
                        } label: {
                            Label(
                                language.text(
                                    "Review this source",
                                    zhHans: "审阅这个来源"
                                ),
                                systemImage: "exclamationmark.bubble"
                            )
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.bordered)
                        .disabled(isRejecting)
                        .accessibilityIdentifier("ask-review-citation")

                        if let rejectionError {
                            Text(rejectionError)
                                .font(.caption)
                                .foregroundStyle(Color.tsMutedInk)
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("ask-review-citation-error")
                        }
                    }
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 24)
            }
            .background(Color.tsSurface.ignoresSafeArea())
            .navigationTitle(language.text("Evidence", zhHans: "证据"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(language.text("Done", zhHans: "完成")) { dismiss() }
                }
            }
        }
        .tint(.tsInk)
        .accessibilityIdentifier("ask-citation-detail")
        .alert(
            language.text("Dispute this source?", zhHans: "对这个来源提出异议？"),
            isPresented: $showsRejectPrompt
        ) {
            TextField(
                language.text("What is wrong?", zhHans: "哪里不准确？"),
                text: $rejectionReason
            )
            Button(language.text("Cancel", zhHans: "取消"), role: .cancel) {}
            Button(
                language.text("Mark disputed", zhHans: "标记为有异议"),
                role: .destructive
            ) {
                let reason = rejectionReason.trimmingCharacters(
                    in: .whitespacesAndNewlines
                )
                guard let onReject, !reason.isEmpty else { return }
                isRejecting = true
                rejectionError = nil
                Task {
                    do {
                        try await onReject(reason)
                    } catch {
                        rejectionError = (error as? LocalizedError)?.errorDescription
                            ?? language.text(
                                "The source review was not saved.",
                                zhHans: "来源审阅未能保存。"
                            )
                    }
                    isRejecting = false
                }
            }
            .disabled(
                rejectionReason.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ).isEmpty || isRejecting
            )
        } message: {
            Text(
                language.text(
                    "The current Agent response will become stale. No external message is sent.",
                    zhHans: "当前 Agent 回答会变为过期状态，不会发送任何外部消息。"
                )
            )
        }
    }

    private func citationLine(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
            Text(value)
                .font(.caption)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
