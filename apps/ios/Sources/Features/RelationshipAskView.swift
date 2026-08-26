import SwiftUI

@MainActor
struct RelationshipAskView: View {
    let snapshot: PursuitWorkspaceSnapshot
    let isCanonical: Bool
    @ObservedObject var workspaceStore: PursuitWorkspaceStore
    @ObservedObject var sessionStore: AgentSessionStore
    let sessionID: UUID?
    var initialSeed: AgentSessionSeed? = nil
    let ask: (
        _ objective: String,
        _ personID: String,
        _ contextID: String,
        _ idempotencyKey: String
    ) async throws -> RelationshipAskResponse
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
    let onCapture: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.sizeCategory) private var sizeCategory
    @ScaledMetric(relativeTo: .caption2) private var scopeContextFontSize: CGFloat = 11
    @State private var selectedScope: AskScope?
    @State private var scopeQuery = ""
    @State private var isChoosingScope = false
    @State private var draft = ""
    @State private var activeSessionID: UUID?
    @State private var isSending = false
    @State private var errorMessage: String?
    @State private var selectedCitation: SelectedAskCitation?
    @State private var selectedPursuit: SelectedPursuitTarget?
    @State private var reinstatementOperation: AgentEvidenceReviewOperation?
    @State private var reinstatementReason = ""
    @State private var reviewPreparationError: String?
    @FocusState private var composerFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                scopeBar
                conversation
                composer
            }
            .background(Color.tsSurface.ignoresSafeArea())
            .navigationTitle(
                activeSessionID == nil
                    ? appLanguage.text("New session", zhHans: "新会话")
                    : appLanguage.text("Session", zhHans: "会话")
            )
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(appLanguage.text("Close", zhHans: "关闭")) {
                        dismiss()
                    }
                }
            }
        }
        .tint(.tsInk)
        .presentationDetents([.large])
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
                selectedScope = availableScopes.first {
                    $0.person.id == session.personID
                        && $0.context.id == session.relationshipContextID
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
            } else if selectedScope == nil {
                selectedScope = availableScopes.first
            }
            restoreDraft(preferred: initialSeed?.suggestedObjective)
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
            guard let selectedScope else { return }
            sessionStore.saveDraft(
                value,
                personID: selectedScope.person.id,
                relationshipContextID: selectedScope.context.id
            )
        }
        .accessibilityIdentifier("relationship-ask-sheet")
    }

    private var scopeBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation(.easeOut(duration: 0.18)) {
                    isChoosingScope.toggle()
                }
            } label: {
                if let selectedScope {
                    scopeChip(selectedScope)
                } else {
                    HStack {
                        Text(appLanguage.text("Choose a relationship", zhHans: "选择一段关系"))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.tsInk)
                        Spacer()
                        Image(systemName: "chevron.down")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.tsMutedInk)
                    }
                    .frame(minHeight: 44)
                }
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(
                appLanguage.text("Selected relationship", zhHans: "已选择的关系")
            )
            .accessibilityValue(
                selectedScope.map {
                    "\($0.person.displayLabel), \($0.context.displayLabel)"
                } ?? appLanguage.text("None", zhHans: "未选择")
            )
            .accessibilityHint(
                appLanguage.text(
                    "Choose a different person or relationship.",
                    zhHans: "选择其他人物或关系。"
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

                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(filteredScopes) { scope in
                            Button {
                                selectedScope = scope
                                activeSessionID = nil
                                scopeQuery = ""
                                isChoosingScope = false
                                errorMessage = nil
                                draft = sessionStore.draft(
                                    personID: scope.person.id,
                                    relationshipContextID: scope.context.id
                                )
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(scope.person.displayLabel)
                                        .font(.subheadline.weight(.semibold))
                                    Text(scope.context.displayLabel)
                                        .font(.caption)
                                        .foregroundStyle(Color.tsMutedInk)
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 9)
                                .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 14))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier(
                                "ask-scope-option-\(scope.person.id)-\(scope.context.id)"
                            )
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
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
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
                    .fixedSize(horizontal: false, vertical: true)
                Text(scope.context.displayLabel)
                    .font(.system(size: scopeContextFontSize))
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 1)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .layoutPriority(1)
            Spacer(minLength: 8)
            Image(systemName: "chevron.down")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
                .frame(width: 32, height: 32)
        }
        .contentShape(Rectangle())
    }

    private var conversation: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    if turns.isEmpty {
                        starterGrid
                            .padding(.top, 24)
                    } else {
                        ForEach(turns) { turn in
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
                                    guard let pursuit = snapshot.pursuit(id: pursuitID) else {
                                        return
                                    }
                                    selectedPursuit = SelectedPursuitTarget(
                                        pursuit: pursuit,
                                        actionID: actionID
                                    )
                                }
                            )
                                .id(turn.id)
                        }
                    }

                    if isSending {
                        HStack(spacing: 10) {
                            ProgressView()
                            Text(appLanguage.text("Reading the record…", zhHans: "正在读取记录…"))
                                .font(.caption)
                                .foregroundStyle(Color.tsMutedInk)
                        }
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
                            Button(appLanguage.text("Retry", zhHans: "重试")) {
                                send(draft.isEmpty ? turns.last?.objective ?? "" : draft)
                            }
                            .font(.caption.weight(.semibold))
                        }
                        .padding(14)
                        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 14))
                        .id("ask-error")
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
            .onChange(of: turns.count) { _ in
                if let last = turns.last {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var starterGrid: some View {
        VStack(alignment: .leading, spacing: 18) {
            if !dynamicTypeSize.isAccessibilitySize && !sizeCategory.isAccessibilityCategory {
                Text(
                    selectedScope.map { $0.person.displayLabel }
                        ?? appLanguage.text("Choose a person", zhHans: "选择一个人物")
                )
                .font(.custom("Georgia", size: 28, relativeTo: .title2))
                .foregroundStyle(Color.tsInk)
            }

            Group {
                if dynamicTypeSize.isAccessibilitySize || sizeCategory.isAccessibilityCategory {
                    VStack(alignment: .leading, spacing: 8) {
                        starterPrompts
                    }
                } else {
                    ScrollView(.horizontal) {
                        HStack(spacing: 8) {
                            starterPrompts
                        }
                    }
                    .scrollIndicators(.hidden)
                }
            }

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

    @ViewBuilder
    private var starterPrompts: some View {
        quickPrompt(
            title: appLanguage.text("What changed?", zhHans: "发生了什么变化？"),
            objective: "Explain what changed, the supporting evidence, and what remains uncertain."
        )
        quickPrompt(
            title: appLanguage.text("Prepare questions", zhHans: "准备问题"),
            objective: "Prepare the smallest evidence-grounded questions that would resolve the current gap."
        )
        quickPrompt(
            title: appLanguage.text("Do nothing?", zhHans: "可以不行动吗？"),
            objective: "Check whether no action is the safest current decision and explain the trigger to revisit it."
        )
    }

    private func quickPrompt(title: String, objective: String) -> some View {
        Button {
            send(objective)
        } label: {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsInk)
                .padding(.horizontal, 14)
                .frame(minHeight: 40)
                .background(Color.tsCanvas, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(selectedScope == nil || isSending || !isCanonical)
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            Button(action: onCapture) {
                Image(systemName: "plus")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(
                appLanguage.text(
                    "Add text, photo, or voice",
                    zhHans: "添加文本、图片或语音"
                )
            )

            TextField(
                appLanguage.text("Ask anything", zhHans: "问点什么"),
                text: $draft,
                axis: .vertical
            )
            .focused($composerFocused)
            .lineLimit(1...5)
            .padding(.horizontal, 15)
            .padding(.vertical, 12)
            .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 20))
            .accessibilityIdentifier("ask-composer")

            Button {
                if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    onCapture()
                } else {
                    send(draft)
                }
            } label: {
                Image(
                    systemName: draft.trimmingCharacters(
                        in: .whitespacesAndNewlines
                    ).isEmpty ? "waveform" : "arrow.up"
                )
                    .font(.body.weight(.semibold))
                    .foregroundStyle(
                        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? Color.tsInk
                            : Color.tsSurface
                    )
                    .frame(width: 44, height: 44)
                    .background(
                        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? Color.tsCanvas
                            : Color.tsInk,
                        in: Circle()
                    )
            }
            .disabled(
                selectedScope == nil
                    || isSending
                    || !isCanonical
            )
            .opacity(
                selectedScope == nil || !isCanonical ? 0.35 : 1
            )
            .accessibilityLabel(
                draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? appLanguage.text("Record voice", zhHans: "记录语音")
                    : appLanguage.text("Send", zhHans: "发送")
            )
            .accessibilityIdentifier("ask-send")
            .accessibilityHint(
                isCanonical
                    ? ""
                    : appLanguage.text(
                        "Connect a workspace to send this question.",
                        zhHans: "连接工作区后才能发送这个问题。"
                    )
            )
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(Color.tsSurface.opacity(0.98))
    }

    private var availableScopes: [AskScope] {
        snapshot.people.flatMap { person in
            person.contexts.map { context in
                AskScope(person: person, context: context)
            }
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

    private func send(_ objective: String) {
        let trimmed = objective.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let selectedScope, !isSending else { return }
        errorMessage = nil
        isSending = true
        let operationID = UUID()
        let idempotencyKey = sessionStore.beginAsk(
            trimmed,
            personID: selectedScope.person.id,
            relationshipContextID: selectedScope.context.id,
            proposedIdempotencyKey: "ios:ask:\(operationID.uuidString.lowercased())"
        )
        Task {
            do {
                let response = try await ask(
                    trimmed,
                    selectedScope.person.id,
                    selectedScope.context.id,
                    idempotencyKey
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
                    objective: trimmed,
                    response: response,
                    person: selectedScope.person,
                    context: selectedScope.context
                )
                sessionStore.clearDraft(
                    personID: selectedScope.person.id,
                    relationshipContextID: selectedScope.context.id
                )
                draft = ""
            } catch {
                errorMessage = (error as? LocalizedError)?.errorDescription
                    ?? appLanguage.text(
                        "Ask could not read this record. Your question is still here.",
                        zhHans: "暂时无法读取记录，你的问题仍已保留。"
                    )
            }
            isSending = false
        }
    }

    private func initials(_ name: String) -> String {
        let parts = name.split(separator: " ")
        return String(parts.prefix(2).compactMap(\.first)).uppercased()
    }

    private func restoreDraft(preferred: String? = nil) {
        guard let selectedScope else { return }
        let saved = sessionStore.draft(
            personID: selectedScope.person.id,
            relationshipContextID: selectedScope.context.id
        )
        draft = saved.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? preferred ?? ""
            : saved
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

private struct AskTurnView: View {
    let turn: AgentSessionTurn
    let language: AppLanguage
    let evidenceReviews: [AgentEvidenceReviewOperation]
    let evidenceReviewHistory: [AgentEvidenceReviewOperation]
    let inFlightEvidenceReviewKeys: Set<String>
    let transientSupersededEvidenceReviewKeys: Set<String>
    let evidenceReviewAuthorityReadbackKeys: Set<String>
    let onOpenEvidence: (RelationshipAskResponse.Citation) -> Void
    let onRetryEvidenceReview: (AgentEvidenceReviewOperation) -> Void
    let onReinstateEvidence: (AgentEvidenceReviewOperation) -> Void
    let onStartFreshAsk: () -> Void
    let onOpenPursuit: (String, String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(turn.objective)
                .font(.body)
                .foregroundStyle(Color.tsSurface)
                .padding(.horizontal, 15)
                .padding(.vertical, 11)
                .background(Color.tsInk, in: RoundedRectangle(cornerRadius: 18))
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
                                            Text(citation.compactProvenance)
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
                                        "Evidence from \(citation.sourceName), \(citation.compactProvenance)",
                                        zhHans: "来自 \(citation.sourceName) 的证据，\(citation.compactProvenance)"
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
    var compactProvenance: String {
        let day = observedDate.map { date in
            Self.observedDateFormatter(timeZone: resolvedSourceTimeZone).string(from: date)
        } ?? String(observedAt.prefix(10))
        return "\(day) · \(attribution.actorKind.humanized) · \(reviewStatus.humanized)"
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
                        Text(citation.compactProvenance)
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
                            "\(citation.reviewStatus.humanized) · capture v\(citation.captureVersion)"
                        )
                        citationLine(
                            language.text("Attribution", zhHans: "归属"),
                            "\(citation.attribution.actorKind.humanized) · \(citation.attribution.status.humanized)"
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
