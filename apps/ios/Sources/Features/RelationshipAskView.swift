import CryptoKit
import SwiftUI

@MainActor
struct RelationshipAskView: View {
    let snapshot: PursuitWorkspaceSnapshot
    let isCanonical: Bool
    @ObservedObject var sessionStore: AgentSessionStore
    let sessionID: UUID?
    let ask: (
        _ objective: String,
        _ personID: String,
        _ contextID: String,
        _ idempotencyKey: String
    ) async throws -> RelationshipAskResponse
    let rejectEvidence: (
        _ fragmentID: String,
        _ expectedReviewStatus: String,
        _ reason: String,
        _ idempotencyKey: String
    ) async throws -> Void
    let revalidateSessions: () async -> Void
    let onCapture: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.sizeCategory) private var sizeCategory
    @State private var selectedScope: AskScope?
    @State private var scopeQuery = ""
    @State private var isChoosingScope = false
    @State private var draft = ""
    @State private var activeSessionID: UUID?
    @State private var isSending = false
    @State private var errorMessage: String?
    @State private var selectedCitation: RelationshipAskResponse.Citation?
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
        .sheet(item: $selectedCitation) { citation in
            AskCitationDetailView(
                citation: citation,
                language: appLanguage,
                onReject: isCanonical ? { reason in
                    let reviewKey = reviewIdempotencyKey(
                        citation: citation,
                        reason: reason,
                        decision: "rejected"
                    )
                    sessionStore.markCitationStale(citation.id)
                    try await rejectEvidence(
                        citation.id,
                        citation.reviewStatus,
                        reason,
                        reviewKey
                    )
                    selectedCitation = nil
                } : nil
            )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .task {
            await revalidateSessions()
            activeSessionID = sessionID
            if let session = sessionStore.session(id: sessionID) {
                selectedScope = availableScopes.first {
                    $0.person.id == session.personID
                        && $0.context.id == session.relationshipContextID
                }
                sessionStore.markRead(session.id)
            } else if selectedScope == nil {
                selectedScope = availableScopes.first
            }
            restoreDraft()
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
        HStack(spacing: 8) {
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
                Text(scope.context.displayLabel)
                    .font(.caption2)
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
            }
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
                                onOpenEvidence: { selectedCitation = $0 }
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

    private func restoreDraft() {
        guard let selectedScope else { return }
        draft = sessionStore.draft(
            personID: selectedScope.person.id,
            relationshipContextID: selectedScope.context.id
        )
    }

    private func reviewIdempotencyKey(
        citation: RelationshipAskResponse.Citation,
        reason: String,
        decision: String
    ) -> String {
        let material = [
            citation.id,
            citation.reviewStatus,
            citation.lastReviewedAt ?? "never-reviewed",
            decision,
            reason.trimmingCharacters(in: .whitespacesAndNewlines),
        ].joined(separator: "|")
        let digest = SHA256.hash(data: Data(material.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return "ios:evidence-review:\(digest)"
    }
}

private struct AskScope: Identifiable, Equatable {
    let person: WorkspacePerson
    let context: WorkspacePerson.Context
    var id: String { "\(person.id):\(context.id)" }
}

private struct AskTurnView: View {
    let turn: AgentSessionTurn
    let language: AppLanguage
    let onOpenEvidence: (RelationshipAskResponse.Citation) -> Void

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
                    Text(block.body)
                        .font(.subheadline)
                        .foregroundStyle(Color.tsInk)
                        .fixedSize(horizontal: false, vertical: true)
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
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ask-response-turn")
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
