import Foundation
import SwiftUI

@MainActor
struct RelationshipArchiveView: View {
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var captureHandoff = CaptureHandoffStore.shared
    @StateObject private var captureIntentRouter = CaptureIntentRouter.shared
    @StateObject private var workspaceStore: PursuitWorkspaceStore
    @StateObject private var sessionStore: AgentSessionStore
    @State private var selectedPage: RelationshipArchivePage = .today
    @State private var presentedSheet: RelationshipArchiveSheet?
    @State private var capturePresentation: RelationshipCapturePresentation?
    @State private var intakePresentation: AgentIntakePresentation?
    @State private var deferredIntakePresentation: AgentIntakePresentation?
    @State private var deferredArchiveSheet: RelationshipArchiveSheet?
    private let reviewBaseURL: URL?
    private let authenticatedAccessToken: String?
    private let onSignOut: (() async -> Void)?

    init(
        session: PursuitWorkspaceSession? = nil,
        service: PursuitWorkspaceServing? = nil,
        onSignOut: (() async -> Void)? = nil
    ) {
        let resolvedService = service ?? session.map {
            URLPursuitWorkspaceClient(
                baseURL: $0.baseURL,
                accountSlug: $0.accountSlug,
                userEmail: $0.userEmail,
                accessToken: $0.accessToken,
                accountID: $0.accountID,
                userID: $0.userID,
                userDisplayName: $0.userDisplayName
            )
        }
        _workspaceStore = StateObject(
            wrappedValue: PursuitWorkspaceStore(
                service: resolvedService,
                actionCompletions: session?.accountID.map {
                    FilePursuitActionCompletionStore(accountID: $0)
                } ?? UserDefaultsPursuitActionCompletionStore()
            )
        )
        _sessionStore = StateObject(
            wrappedValue: resolvedService == nil
                ? AgentSessionStore.preview(snapshot: .preview)
                : AgentSessionStore(
                    persistence: session?.accountID.map {
                        FileAgentSessionPersistence(accountID: $0)
                    }
                )
        )
        reviewBaseURL = session?.baseURL
        authenticatedAccessToken = session?.accessToken
        self.onSignOut = onSignOut
    }

    var body: some View {
        ZStack {
            Color.tsSurface.ignoresSafeArea()
            pageContent
        }
        .overlay(alignment: .top) {
            if let notice = workspaceStore.refreshNotice {
                PursuitWorkspaceRefreshNotice(message: notice)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            RelationshipArchiveHeader(
                selectedPage: $selectedPage,
                onOpenMenu: { presentedSheet = .menu }
            )
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            RelationshipGuideRail(
                onGuide: { capturePresentation = .ask(sessionID: nil) },
                onCapture: {
                    intakePresentation = .init(initialDestination: nil)
                }
            )
        }
        .sheet(item: $presentedSheet, onDismiss: reloadCanonicalWorkspace) { destination in
            switch destination {
            case let .review(person):
                RelationshipChangeReviewView(person: person)
            case let .resume(person):
                RelationshipResumeView(person: person)
            case let .detail(person):
                RelationshipDetailView(person: person)
            case let .pursuit(pursuit):
                PursuitDetailView(
                    pursuit: pursuit,
                    snapshot: workspaceStore.snapshot,
                    currentUserID: workspaceStore.snapshot?.currentUserID,
                    workspaceStore: workspaceStore,
                    onOpenProposal: { proposal in
                        presentedSheet = nil
                        Task { @MainActor in
                            await Task.yield()
                            presentedSheet = .proposal(proposal)
                        }
                    }
                )
            case let .workspacePerson(person, roles):
                WorkspacePersonDetailView(person: person, roles: roles)
            case let .proposal(proposal):
                RelationshipChangeReviewView(
                    person: previewPerson(for: proposal),
                    reviewSession: reviewBaseURL.map {
                        PursuitProposalReviewSession(
                            baseURL: $0,
                            proposalID: proposal.id,
                            accessToken: authenticatedAccessToken
                        )
                    },
                    actorDisplayName: workspaceStore.snapshot?.currentUserName
                        ?? "Current recruiter"
                )
            case .menu:
                RelationshipMenuView(
                    isCanonical: workspaceStore.isCanonical,
                    workspaceID: workspaceStore.snapshot?.workspaceID,
                    accountName: workspaceStore.snapshot?.currentUserName,
                    proposals: workspaceStore.snapshot?.openProposals ?? [],
                    signOutNotice: sessionStore.persistenceNotice,
                    onOpenProposal: { proposal in
                        Task { @MainActor in
                            await Task.yield()
                            presentedSheet = .proposal(proposal)
                        }
                    },
                    onSignOut: onSignOut.map { signOut in
                        {
                            guard workspaceStore.deleteSavedActionCompletions() else {
                                return false
                            }
                            guard sessionStore.deleteAll() else { return false }
                            await signOut()
                            return true
                        }
                    }
                )
            }
        }
        .fullScreenCover(
            item: $capturePresentation,
            onDismiss: completeDeferredTransition
        ) { presentation in
            switch presentation {
            case let .ask(sessionID):
                if let snapshot = workspaceStore.snapshot {
                    RelationshipAskView(
                        snapshot: snapshot,
                        isCanonical: workspaceStore.isCanonical,
                        workspaceStore: workspaceStore,
                        sessionStore: sessionStore,
                        sessionID: sessionID,
                        ask: { objective, personID, contextID, idempotencyKey in
                            try await workspaceStore.ask(
                                objective: objective,
                                personID: personID,
                                relationshipContextID: contextID,
                                idempotencyKey: idempotencyKey
                            )
                        },
                        reviewEvidence: {
                            fragmentID,
                            expectedReviewStatus,
                            expectedLastReviewID,
                            decision,
                            reason,
                            idempotencyKey in
                            return try await workspaceStore.reviewEvidence(
                                fragmentID: fragmentID,
                                expectedReviewStatus: expectedReviewStatus,
                                expectedLastReviewID: expectedLastReviewID,
                                decision: decision,
                                reason: reason,
                                idempotencyKey: idempotencyKey
                            )
                        },
                        revalidateSessions: {
                            await revalidateSessionEvidence()
                        },
                        onOpenProposal: { proposal in
                            deferredArchiveSheet = .proposal(proposal)
                            capturePresentation = nil
                        },
                        onCapture: {
                            deferredIntakePresentation = .init(initialDestination: nil)
                            capturePresentation = nil
                        }
                    )
                } else {
                    PursuitWorkspaceLoadingView()
                }
            case .screenshot:
                CandidateSignalView(
                    backendURL: reviewBaseURL,
                    accessToken: authenticatedAccessToken,
                    workspaceID: workspaceStore.snapshot?.workspaceID,
                    onClose: { capturePresentation = nil }
                )
            }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            Task {
                sessionStore.pruneExpired()
                await revalidateSessionEvidence()
            }
        }
        .sheet(item: $intakePresentation) { presentation in
            SignalCaptureHubView(
                backendURL: reviewBaseURL,
                accessToken: authenticatedAccessToken,
                workspaceID: workspaceStore.snapshot?.workspaceID,
                initialDestination: presentation.initialDestination,
                onDismiss: { intakePresentation = nil }
            )
        }
        .onReceive(captureHandoff.$pendingSeed) { seed in
            if seed != nil {
                capturePresentation = .screenshot
            }
        }
        .onReceive(captureIntentRouter.$request) { request in
            guard let request else { return }
            intakePresentation = .init(initialDestination: request.destination)
            captureIntentRouter.consume(request.id)
        }
        .onOpenURL { url in
            guard url.scheme == "talent-signal-capture" else { return }
            switch url.host {
            case "audio":
                intakePresentation = .init(initialDestination: .foregroundAudio)
            default:
                intakePresentation = .init(initialDestination: nil)
            }
        }
        .task {
            await workspaceStore.load()
            await revalidateSessionEvidence()
        }
        .tint(.tsVermilion)
    }

    @ViewBuilder
    private var pageContent: some View {
        switch workspaceStore.phase {
        case .loading:
            PursuitWorkspaceLoadingView()
        case let .failed(message):
            PursuitWorkspaceFailureView(
                message: message,
                isRetrying: workspaceStore.isReadInFlight,
                completedReadCount: workspaceStore.completedReadCount
            ) {
                Task { await workspaceStore.load() }
            }
        case .empty:
            PursuitWorkspaceEmptyView(selectedPage: selectedPage)
        case let .preview(snapshot), let .loaded(snapshot):
            TabView(selection: $selectedPage) {
                PursuitTodayView(
                    snapshot: snapshot,
                    isPreview: !workspaceStore.isCanonical,
                    unreadSessions: sessionStore.unreadSessions,
                    actionRecovery: workspaceStore.latestActionRecovery(
                        in: snapshot
                    ),
                    onOpenSession: openSession,
                    onOpenAttention: openAttention,
                    onOpenPursuit: { presentedSheet = .pursuit($0) },
                    onOpenActionRecovery: { pursuitID in
                        guard let pursuit = snapshot.pursuit(id: pursuitID) else {
                            return
                        }
                        presentedSheet = .pursuit(pursuit)
                    }
                )
                .tag(RelationshipArchivePage.today)

                AgentSessionListView(
                    sessions: sessionStore.sessions,
                    isPreview: !workspaceStore.isCanonical,
                    persistenceNotice: sessionStore.persistenceNotice,
                    onOpen: openSession,
                    onNewSession: {
                        capturePresentation = .ask(sessionID: nil)
                    },
                    onMarkUnread: sessionStore.markUnread,
                    onDelete: sessionStore.delete
                )
                .tag(RelationshipArchivePage.sessions)

                WorkspacePeopleView(
                    snapshot: snapshot,
                    isPreview: !workspaceStore.isCanonical,
                    onSelect: { person in
                        presentedSheet = .workspacePerson(
                            person,
                            roles(for: person.id, in: snapshot)
                        )
                    }
                )
                .tag(RelationshipArchivePage.people)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .indexViewStyle(.page(backgroundDisplayMode: .never))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func openSession(_ session: AgentSession) {
        sessionStore.markRead(session.id)
        capturePresentation = .ask(sessionID: session.id)
    }

    private func revalidateSessionEvidence() async {
        guard workspaceStore.isCanonical else { return }
        for target in sessionStore.validationTargets() {
            do {
                try await workspaceStore.revalidateAsk(
                    response: target.response,
                    personID: target.personID,
                    relationshipContextID: target.relationshipContextID
                )
            } catch {
                sessionStore.markTaskStale(target.taskID)
            }
        }
    }

    private func completeDeferredTransition() {
        if let deferredArchiveSheet {
            presentedSheet = deferredArchiveSheet
            self.deferredArchiveSheet = nil
        }
        if let deferredIntakePresentation {
            intakePresentation = deferredIntakePresentation
            self.deferredIntakePresentation = nil
        }
    }

    private func openAttention(_ item: PursuitAttentionItem) {
        guard let snapshot = workspaceStore.snapshot else { return }
        if let proposalID = item.proposalID,
           let proposal = snapshot.proposals.first(where: { $0.id == proposalID }) {
            presentedSheet = .proposal(proposal)
        } else if let pursuit = snapshot.pursuit(id: item.pursuitID) {
            presentedSheet = .pursuit(pursuit)
        }
    }

    private func roles(
        for personID: String,
        in snapshot: PursuitWorkspaceSnapshot
    ) -> [WorkspacePersonRole] {
        snapshot.pursuits.flatMap { pursuit in
            pursuit.personRoles
                .filter { $0.subjectRef.id == personID }
                .map {
                    WorkspacePersonRole(
                        pursuitID: pursuit.id,
                        pursuitTitle: pursuit.title,
                        roleID: $0.id,
                        roleType: $0.roleType,
                        status: $0.status,
                        confidence: $0.confidence,
                        evidenceCount: $0.evidenceRefs.count,
                        evidenceState: $0.evidenceState
                    )
                }
        }
    }

    private func previewPerson(for proposal: WorkspaceProposal) -> RelationshipArchivePerson {
        RelationshipArchivePerson(
            id: proposal.reviewContext.subject.displayLabel,
            name: proposal.subjectDisplayLabel,
            initials: String(proposal.subjectDisplayLabel.prefix(2)).uppercased(),
            role: "Pursuit participant",
            company: "Canonical workspace",
            relationship: workspaceStore.snapshot?.pursuit(id: proposal.pursuitID)?.title
                ?? "Pursuit review",
            dependency: proposal.summary,
            recency: "Now",
            state: .needsReview,
            evidence: "Load the canonical Proposal to review its exact evidence.",
            provenance: "Canonical Proposal · revision \(proposal.baseRevision)",
            previousState: "Canonical value",
            proposedState: "Pending item review",
            nextStep: "Review each item before any Pursuit change."
        )
    }

    private func reloadCanonicalWorkspace() {
        guard workspaceStore.isCanonical else { return }
        Task { await workspaceStore.load() }
    }
}

private enum RelationshipCapturePresentation: Identifiable {
    case ask(sessionID: UUID?)
    case screenshot

    var id: String {
        switch self {
        case let .ask(sessionID):
            return "ask-\(sessionID?.uuidString ?? "new")"
        case .screenshot:
            return "screenshot"
        }
    }
}

private struct AgentIntakePresentation: Identifiable {
    let id = UUID()
    let initialDestination: CaptureIntentDestination?
}

private struct PursuitWorkspaceRefreshNotice: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsVermilion)
                .accessibilityHidden(true)
            Text(message)
                .font(.caption)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.tsSurface)
                .shadow(color: Color.black.opacity(0.08), radius: 16, y: 6)
        )
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("workspace-refresh-notice")
    }
}

private struct RelationshipArchiveHeader: View {
    @Binding var selectedPage: RelationshipArchivePage
    let onOpenMenu: () -> Void
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var selectionNamespace

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onOpenMenu) {
                RelationshipSignalOrb()
                    .frame(width: 36, height: 36)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                appLanguage.text(
                    "Open Talent Signal menu",
                    zhHans: "打开 Talent Signal 菜单"
                )
            )
            .accessibilityIdentifier("relationship-menu")

            HStack(spacing: 0) {
                ForEach(RelationshipArchivePage.allCases) { page in
                    Button {
                        if reduceMotion {
                            selectedPage = page
                        } else {
                            withAnimation(.spring(response: 0.34, dampingFraction: 0.84)) {
                                selectedPage = page
                            }
                        }
                    } label: {
                        ZStack {
                            if selectedPage == page {
                                Capsule()
                                    .fill(Color.tsInk.opacity(0.075))
                                    .matchedGeometryEffect(
                                        id: "archive-selection",
                                        in: selectionNamespace
                                    )
                            }
                            Text(page.title(in: appLanguage))
                                .font(.subheadline.weight(
                                    selectedPage == page ? .semibold : .regular
                                ))
                                .foregroundStyle(Color.tsInk)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(
                        selectedPage == page ? .isSelected : []
                    )
                    .accessibilityIdentifier(
                        "archive-tab-\(page.accessibilityIdentifier)"
                    )
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, minHeight: 58)
        .background(Color.tsSurface.opacity(0.96))
        .animation(
            reduceMotion ? nil : .spring(response: 0.34, dampingFraction: 0.84),
            value: selectedPage
        )
        .accessibilityElement(children: .contain)
    }
}

private struct PursuitTodayView: View {
    let snapshot: PursuitWorkspaceSnapshot
    let isPreview: Bool
    let unreadSessions: [AgentSession]
    let actionRecovery: PursuitActionRecoveryItem?
    let onOpenSession: (AgentSession) -> Void
    let onOpenAttention: (PursuitAttentionItem) -> Void
    let onOpenPursuit: (WorkspacePursuit) -> Void
    let onOpenActionRecovery: (String) -> Void
    @State private var showsAllAttention = false
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                RelationshipEyebrow(formattedToday, color: .tsInk)
                Text(appLanguage.text("Today", zhHans: "今天"))
                    .font(.custom("Georgia", size: 44, relativeTo: .largeTitle))
                    .foregroundStyle(Color.tsInk)
                    .tracking(-1.3)
                    .padding(.top, 7)
                if !attentionItems.isEmpty || actionRecovery != nil {
                    Text(summary)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .padding(.top, 6)
                        .accessibilityIdentifier("today-attention-summary")
                }

                if isPreview {
                    PursuitPreviewBoundary()
                        .padding(.top, 22)
                }

                if let unread = unreadSessions.first {
                    Text(
                        appLanguage.text(
                            unreadSessions.count == 1
                                ? "Unread session"
                                : "Unread sessions",
                            zhHans: "未读会话"
                        )
                    )
                    .font(.caption.weight(.bold))
                    .tracking(1.1)
                    .foregroundStyle(Color.tsMutedInk)
                    .padding(.top, 34)

                    TodayUnreadSessionRow(
                        session: unread,
                        remainingCount: max(unreadSessions.count - 1, 0),
                        action: { onOpenSession(unread) }
                    )
                    .padding(.top, 6)
                }

                if let actionRecovery {
                    Text(
                        appLanguage.text(
                            actionRecovery.status == .recorded
                                ? "Recent outcome"
                                : "Recovery in progress",
                            zhHans: actionRecovery.status == .recorded
                                ? "近期结果"
                                : "正在恢复"
                        )
                    )
                    .font(.caption.weight(.bold))
                    .tracking(1.1)
                    .foregroundStyle(Color.tsMutedInk)
                    .padding(.top, unreadSessions.isEmpty ? 30 : 24)

                    TodayActionRecoveryCard(
                        item: actionRecovery,
                        action: {
                            onOpenActionRecovery(actionRecovery.pursuitID)
                        }
                    )
                    .padding(.top, 6)
                }

                if attentionItems.isEmpty {
                    if actionRecovery == nil {
                        PursuitNoActionView()
                            .padding(.top, topWorkSpacing)
                    }
                } else if let focus = attentionItems.first {
                    TodayFocusCard(
                        item: focus,
                        pursuit: snapshot.pursuit(id: focus.pursuitID),
                        primaryAction: { openPrimary(focus) },
                        proposalAction: { onOpenAttention(focus) },
                        pursuitAction: {
                            if let pursuit = snapshot.pursuit(id: focus.pursuitID) {
                                onOpenPursuit(pursuit)
                            }
                        }
                    )
                    .padding(.top, topWorkSpacing)

                    if attentionItems.count > 1 {
                        Text(appLanguage.text("Next", zhHans: "接下来"))
                            .font(.caption.weight(.bold))
                            .tracking(1.1)
                            .foregroundStyle(Color.tsMutedInk)
                            .padding(.top, 38)
                            .padding(.bottom, 4)
                        ForEach(visibleContinuationItems) { item in
                            TodayContinuationRow(
                                item: item,
                                pursuit: snapshot.pursuit(id: item.pursuitID),
                                primaryAction: { openPrimary(item) },
                                proposalAction: { onOpenAttention(item) }
                            )
                        }
                        if hiddenAttentionCount > 0 || showsAllAttention {
                            Button {
                                showsAllAttention.toggle()
                            } label: {
                                HStack {
                                    Text(attentionDisclosureLabel)
                                        .font(.subheadline.weight(.semibold))
                                    Spacer()
                                    Image(
                                        systemName: showsAllAttention
                                            ? "chevron.up"
                                            : "chevron.down"
                                    )
                                }
                                .foregroundStyle(Color.tsInk)
                                .frame(minHeight: 48)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("today-attention-disclosure")
                        }
                    }
                }

                Label(noActionSummary, systemImage: "checkmark.circle")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .frame(minHeight: 72, alignment: .leading)
                    .padding(.top, 16)
                    .accessibilityIdentifier("no-action-summary")
            }
            .padding(.horizontal, 24)
            .padding(.top, 30)
            .padding(.bottom, 36)
        }
        .scrollIndicators(.hidden)
        .accessibilityIdentifier(
            isPreview ? "editorial-today" : "canonical-pursuit-today"
        )
    }

    private var summary: String {
        let total = attentionItems.count
            + unreadSessions.count
            + (actionRecovery == nil ? 0 : 1)
        if total == 0 {
            return ""
        }
        return appLanguage.text(
            "\(total) to consider",
            zhHans: "\(total) 件待判断"
        )
    }

    private var topWorkSpacing: CGFloat {
        unreadSessions.isEmpty && actionRecovery == nil ? 34 : 24
    }

    private var formattedToday: String {
        Date.now.formatted(
            Date.FormatStyle()
                .weekday(.wide)
                .month(.wide)
                .day()
                .locale(appLanguage.locale)
        )
    }

    private var visibleContinuationItems: [PursuitAttentionItem] {
        let continuation = Array(attentionItems.dropFirst())
        return showsAllAttention ? continuation : Array(continuation.prefix(4))
    }

    private var hiddenAttentionCount: Int {
        max(attentionItems.count - 5, 0)
    }

    private var attentionItems: [PursuitAttentionItem] {
        guard let actionRecovery else { return snapshot.todayItems }
        return snapshot.todayItems.filter {
            $0.pursuitID != actionRecovery.pursuitID
        }
    }

    private var attentionDisclosureLabel: String {
        if showsAllAttention {
            return appLanguage.text("Show fewer", zhHans: "收起")
        }
        return appLanguage.text(
            "Show \(hiddenAttentionCount) more",
            zhHans: "再显示 \(hiddenAttentionCount) 件"
        )
    }

    private func openPrimary(_ item: PursuitAttentionItem) {
        guard let pursuit = snapshot.pursuit(id: item.pursuitID) else { return }
        if item.kind == .review {
            onOpenAttention(item)
        } else {
            onOpenPursuit(pursuit)
        }
    }

    private var noActionSummary: String {
        if snapshot.noActionPursuitCount == 0 {
            return appLanguage.text(
                "All active work is accounted for",
                zhHans: "所有活跃目标均已覆盖"
            )
        }
        return appLanguage.text(
            "\(snapshot.noActionPursuitCount) need no action",
            zhHans: "\(snapshot.noActionPursuitCount) 个暂不行动"
        )
    }
}

private struct TodayActionRecoveryCard: View {
    let item: PursuitActionRecoveryItem
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Label(
                        item.status == .recorded
                            ? "Outcome recorded"
                            : "Checking canonical result",
                        systemImage: item.status == .recorded
                            ? "checkmark.seal"
                            : "arrow.triangle.2.circlepath"
                    )
                    .font(.headline)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                }
                Text(item.actionTitle)
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                Text(item.outcomeSummary)
                    .font(.subheadline)
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(item.pursuitTitle) · Owner: \(item.ownerDisplayName)")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                Label(
                    "No message, calendar event, or external write",
                    systemImage: "lock.shield"
                )
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
            }
            .foregroundStyle(Color.tsInk)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 16))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("today-action-recovery-\(item.actionID)")
    }
}

private struct TodayUnreadSessionRow: View {
    let session: AgentSession
    let remainingCount: Int
    let action: () -> Void
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Color.tsInk)
                        .frame(width: 42, height: 42)
                    Image(systemName: "sparkles")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.tsSurface)
                }
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    Text(session.title)
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                        .lineLimit(1)
                    Text("\(session.personDisplayLabel) · \(session.contextDisplayLabel)")
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                if remainingCount > 0 {
                    Text("+\(remainingCount)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.tsMutedInk)
                }
                Circle()
                    .fill(Color.tsVermilion)
                    .frame(width: 7, height: 7)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 66)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            appLanguage.text(
                "Unread session: \(session.title), \(session.personDisplayLabel)",
                zhHans: "未读会话：\(session.title)，\(session.personDisplayLabel)"
            )
        )
        .accessibilityIdentifier("today-unread-session")
    }
}

private struct TodayFocusCard: View {
    let item: PursuitAttentionItem
    let pursuit: WorkspacePursuit?
    let primaryAction: () -> Void
    let proposalAction: () -> Void
    let pursuitAction: () -> Void
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                RelationshipEyebrow(
                    item.kind == .review
                        ? appLanguage.text("AI insight · Needs review", zhHans: "AI 洞察 · 需要审阅")
                        : appLanguage.workspaceTerm(item.eyebrow)
                )
                Spacer(minLength: 10)
                if let due = item.due {
                    Text(due)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.tsMutedInk)
                }
            }
            Text(
                item.subjectDisplayLabel
                    ?? pursuit?.title
                    ?? appLanguage.text("Pursuit", zhHans: "目标")
            )
                .font(.custom("Georgia", size: 27, relativeTo: .title2))
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
            if item.subjectDisplayLabel != nil, let pursuit {
                Text(pursuit.title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 5)
            }
            Text(item.title)
                .font(.body)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)

            if dynamicTypeSize.isAccessibilitySize {
                primaryActionButton
                    .padding(.top, 20)
            }

            TodayDecisionContextLine(
                label: appLanguage.text("Target outcome", zhHans: "目标结果"),
                value: item.targetOutcome
            )
                .padding(.top, 10)
            TodayDecisionContextLine(
                label: appLanguage.text("Target date", zhHans: "目标日期"),
                value: item.targetDate
            )
            if let blocker = item.blocker {
                TodayDecisionContextLine(
                    label: appLanguage.text("Blocker", zhHans: "阻碍"),
                    value: blocker
                )
            }

            HStack(spacing: 12) {
                if let owner = item.owner {
                    Label(owner, systemImage: "person")
                }
                if let evidence = item.evidenceFreshness {
                    Label(shortEvidence(evidence), systemImage: "link")
                }
            }
            .font(.caption)
            .foregroundStyle(Color.tsMutedInk)
            .lineLimit(1)
            .padding(.top, 14)

            if !dynamicTypeSize.isAccessibilitySize {
                primaryActionButton
                    .padding(.top, 20)
            }

            if item.proposalID != nil, item.proposedAction != nil, item.kind != .review {
                Button(action: proposalAction) {
                    Text(appLanguage.text("Review proposal", zhHans: "审阅提议"))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
                .accessibilityLabel(
                    appLanguage.text(
                        "Review proposal for \(pursuit?.title ?? item.title)",
                        zhHans: "审阅 \(pursuit?.title ?? item.title) 的提议"
                    )
                )
                .accessibilityIdentifier("today-review-proposal-\(item.pursuitID)")
            } else if item.kind == .review {
                Button(action: pursuitAction) {
                    Text(appLanguage.text("Open Pursuit", zhHans: "打开目标"))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("today-open-pursuit")
            }
        }
        .padding(20)
        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 22))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today-focus")
    }

    private var primaryActionButton: some View {
        Button(action: primaryAction) {
            HStack {
                Text(appLanguage.workspaceTerm(item.actionLabel))
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Image(systemName: "arrow.right")
            }
            .foregroundStyle(Color.tsSurface)
            .frame(minHeight: 48)
            .padding(.horizontal, 16)
            .background(Color.tsInk, in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            appLanguage.text(
                "\(item.actionLabel) for \(item.subjectDisplayLabel ?? pursuit?.title ?? item.title). \(item.title)",
                zhHans: "为 \(item.subjectDisplayLabel ?? pursuit?.title ?? item.title) \(item.actionLabel)：\(item.title)"
            )
        )
        .accessibilityIdentifier(
            item.kind == .review
                ? "today-review-proposal-\(item.pursuitID)"
                : "today-attention-pursuit-\(item.pursuitID)"
        )
    }

    private func shortEvidence(_ value: String) -> String {
        value.components(separatedBy: " · ").first ?? value
    }
}

private struct TodayContinuationRow: View {
    let item: PursuitAttentionItem
    let pursuit: WorkspacePursuit?
    let primaryAction: () -> Void
    let proposalAction: () -> Void
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: primaryAction) {
                HStack(alignment: .center, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(pursuit?.title ?? appLanguage.text("Pursuit", zhHans: "目标"))
                            .font(.headline)
                            .foregroundStyle(Color.tsInk)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(item.title)
                            .font(.caption)
                            .foregroundStyle(Color.tsMutedInk)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 7) {
                        Text(
                            [item.owner, item.due ?? appLanguage.workspaceTerm(item.eyebrow)]
                                .compactMap { $0 }
                                .joined(separator: " · ")
                        )
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color.tsMutedInk)
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(Color.tsMutedInk)
                    }
                }
                .frame(minHeight: 82)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier(
                item.kind == .review
                    ? "today-review-proposal-\(item.pursuitID)"
                    : "today-attention-pursuit-\(item.pursuitID)"
            )

            if item.proposalID != nil, item.kind != .review {
                Button(action: proposalAction) {
                    Text(appLanguage.text("Review proposal", zhHans: "审阅提议"))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(
                    appLanguage.text(
                        "Review proposal for \(pursuit?.title ?? item.title)",
                        zhHans: "审阅 \(pursuit?.title ?? item.title) 的提议"
                    )
                )
                .accessibilityIdentifier("today-review-proposal-\(item.pursuitID)")
            }
        }
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
    }
}

private struct PursuitAttentionRow: View {
    let item: PursuitAttentionItem
    let pursuit: WorkspacePursuit?
    let primaryAction: () -> Void
    let proposalAction: () -> Void
    @State private var isExpanded = false
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                RelationshipEyebrow(appLanguage.workspaceTerm(item.eyebrow))
                Spacer(minLength: 8)
                if let due = item.due {
                    Text(
                        appLanguage.text(
                            "Due \(due)",
                            zhHans: "截止 \(due)"
                        )
                    )
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Color.tsMutedInk)
                }
            }
            .padding(.top, 18)
            Text(
                pursuit?.title
                    ?? appLanguage.text(
                        "Pursuit unavailable",
                        zhHans: "目标不可用"
                    )
            )
                .font(.custom("Georgia", size: 22, relativeTo: .headline))
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
            Text(item.title)
                .font(.subheadline)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 7)
            TodayDecisionContextLine(
                label: appLanguage.text("Target outcome", zhHans: "目标结果"),
                value: item.targetOutcome
            )
                .padding(.top, 8)
            TodayDecisionContextLine(
                label: appLanguage.text("Target date", zhHans: "目标日期"),
                value: item.targetDate
            )
            if let owner = item.owner {
                TodayDecisionContextLine(
                    label: appLanguage.text("Owner", zhHans: "负责人"),
                    value: "\(owner)\(item.due.map { appLanguage.text(" · due \($0)", zhHans: " · 截止 \($0)") } ?? "")"
                )
            }
            if let blocker = item.blocker {
                TodayDecisionContextLine(
                    label: appLanguage.text("Blocker", zhHans: "阻碍"),
                    value: blocker
                )
            }
            if let evidenceFreshness = item.evidenceFreshness {
                TodayDecisionContextLine(
                    label: appLanguage.text("Evidence", zhHans: "证据"),
                    value: evidenceFreshness
                )
            }
            DisclosureGroup(isExpanded: $isExpanded) {
                Text(item.reason)
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
                if let pursuit {
                    TodayDecisionContextLine(
                        label: appLanguage.text(
                            "Current milestone",
                            zhHans: "当前里程碑"
                        ),
                        value: "\(pursuit.milestone.humanized) · \(pursuit.milestoneAuthority.evidenceState.attentionLabel.lowercased()) · revision \(pursuit.revision)"
                    )
                }
            } label: {
                Text(
                    isExpanded
                        ? appLanguage.text("Hide full context", zhHans: "收起完整背景")
                        : appLanguage.text("Show full context", zhHans: "查看完整背景")
                )
                    .font(.caption.weight(.semibold))
            }
            .padding(.top, 8)
            .accessibilityIdentifier("today-context-\(item.pursuitID)")
            Button(action: primaryAction) {
                HStack(spacing: 12) {
                    Text(appLanguage.workspaceTerm(item.actionLabel))
                        .font(.subheadline.weight(.semibold))
                    Image(systemName: "arrow.right")
                }
                .foregroundStyle(Color.tsInk)
                .frame(minHeight: 44)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Color.tsInk).frame(height: 1)
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier(
                item.kind == .review
                    ? "today-review-proposal-\(item.pursuitID)"
                    : "today-attention-\(item.id)"
            )
            .padding(.top, 12)
            if item.proposalID != nil, item.proposedAction != nil {
                Button(action: proposalAction) {
                    Text(appLanguage.text("Review proposal", zhHans: "审阅提议"))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.tsMutedInk)
                        .frame(
                            maxWidth: .infinity,
                            minHeight: 44,
                            alignment: .leading
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("today-review-proposal-\(item.pursuitID)")
            }
        }
        .padding(.bottom, 22)
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
    }
}

private struct TodayDecisionContextLine: View {
    let label: String
    let value: String
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    labelView
                    valueView
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    labelView.frame(minWidth: 64, alignment: .leading)
                    valueView
                }
            }
        }
        .padding(.top, 7)
        .accessibilityElement(children: .combine)
    }

    private var labelView: some View {
        Text(label.uppercased())
            .font(.caption2.weight(.bold))
            .tracking(1.1)
            .foregroundStyle(Color.tsMutedInk)
            .fixedSize(horizontal: true, vertical: false)
    }

    private var valueView: some View {
        Text(value)
            .font(.caption)
            .foregroundStyle(Color.tsInk)
            .fixedSize(horizontal: false, vertical: true)
    }
}

private struct AgentSessionListView: View {
    let sessions: [AgentSession]
    let isPreview: Bool
    let persistenceNotice: String?
    let onOpen: (AgentSession) -> Void
    let onNewSession: () -> Void
    let onMarkUnread: (UUID) -> Void
    let onDelete: (UUID) -> Void
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .bottom, spacing: 18) {
                VStack(alignment: .leading, spacing: 7) {
                    RelationshipEyebrow(
                        appLanguage.text("AGENT CONVERSATIONS", zhHans: "AGENT 对话"),
                        color: .tsInk
                    )
                    Text(appLanguage.text("Sessions", zhHans: "会话"))
                        .font(.custom("Georgia", size: 42, relativeTo: .largeTitle))
                        .foregroundStyle(Color.tsInk)
                        .tracking(-1.1)
                }
                Spacer(minLength: 8)
                Button(action: onNewSession) {
                    Image(systemName: "plus")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.tsSurface)
                        .frame(width: 44, height: 44)
                        .background(Color.tsInk, in: Circle())
                }
                .accessibilityLabel(
                    appLanguage.text("New session", zhHans: "新建会话")
                )
                .accessibilityIdentifier("new-agent-session")
            }
            .padding(.horizontal, 24)
            .padding(.top, 28)
            .padding(.bottom, isPreview ? 14 : 22)

            if isPreview {
                PursuitPreviewBoundary()
                    .padding(.horizontal, 24)
                    .padding(.bottom, 8)
            }

            if let persistenceNotice {
                Label(persistenceNotice, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 8)
                    .accessibilityIdentifier("agent-session-persistence-notice")
            }

            if sessions.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.title2)
                        .foregroundStyle(Color.tsMutedInk)
                    Text(appLanguage.text("No sessions yet", zhHans: "还没有会话"))
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                    Text(
                        appLanguage.text(
                            "Ask from the bottom field. A successful Agent response will appear here without becoming relationship truth.",
                            zhHans: "从底部输入框开始提问。Agent 成功回复后会出现在这里，但不会因此成为关系事实。"
                        )
                    )
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(.horizontal, 24)
                .padding(.top, 42)
                .accessibilityIdentifier("agent-sessions-empty")
            } else {
                List {
                    ForEach(sessions) { session in
                        Button { onOpen(session) } label: {
                            AgentSessionRow(session: session)
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Color.tsSurface)
                        .listRowSeparatorTint(Color.tsLine)
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button {
                                onMarkUnread(session.id)
                            } label: {
                                Label(
                                    appLanguage.text("Unread", zhHans: "标为未读"),
                                    systemImage: "circle.fill"
                                )
                            }
                            .tint(Color.tsMutedInk)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                onDelete(session.id)
                            } label: {
                                Label(
                                    appLanguage.text("Remove", zhHans: "移除"),
                                    systemImage: "trash"
                                )
                            }
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(Color.tsSurface)
                .accessibilityIdentifier("agent-session-list")
            }
        }
        .background(Color.tsSurface)
    }
}

private struct AgentSessionRow: View {
    let session: AgentSession
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .fill(session.isUnread ? Color.tsInk : Color.tsCanvas)
                    .frame(width: 46, height: 46)
                Image(systemName: "sparkles")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(session.isUnread ? Color.tsSurface : Color.tsInk)
            }
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(session.title)
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    Text(session.updatedAt, style: .relative)
                        .font(.caption2)
                        .foregroundStyle(Color.tsMutedInk)
                }
                Text("\(session.personDisplayLabel) · \(session.contextDisplayLabel)")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(1)
                Text(session.latestPreview)
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(2)
            }

            if session.isUnread {
                Circle()
                    .fill(Color.tsVermilion)
                    .frame(width: 7, height: 7)
                    .padding(.top, 8)
                    .accessibilityLabel(appLanguage.text("Unread", zhHans: "未读"))
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("agent-session-\(session.id.uuidString)")
    }
}

private struct PursuitListView: View {
    let snapshot: PursuitWorkspaceSnapshot
    let isPreview: Bool
    let onSelect: (WorkspacePursuit) -> Void
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                RelationshipPageIntro(
                    eyebrow: appLanguage.text(
                        "Outcome rooms · \(snapshot.pursuits.count)",
                        zhHans: "目标空间 · \(snapshot.pursuits.count)"
                    ),
                    title: appLanguage.text("Pursuits", zhHans: "目标"),
                    summary: appLanguage.text(
                        "Each room keeps one outcome, its current gap, and owned action together.",
                        zhHans: "每个空间将一个目标结果、当前缺口与已负责行动集中呈现。"
                    )
                )
                .padding(.bottom, 24)
                if isPreview { PursuitPreviewBoundary() }
                ForEach(snapshot.pursuits) { pursuit in
                    Button { onSelect(pursuit) } label: {
                        PursuitListRow(
                            pursuit: pursuit,
                            pendingReviewCount: snapshot.openProposals.filter {
                                $0.pursuitID == pursuit.id
                            }.count
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("pursuit-row-\(pursuit.id)")
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 24)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .accessibilityIdentifier("pursuit-list")
    }
}

private struct PursuitListRow: View {
    let pursuit: WorkspacePursuit
    let pendingReviewCount: Int
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                RelationshipEyebrow(pursuit.status.humanized)
                Spacer()
                Text(
                    appLanguage.text(
                        "Rev \(pursuit.revision)",
                        zhHans: "版本 \(pursuit.revision)"
                    )
                )
                    .font(.caption2)
                    .foregroundStyle(Color.tsMutedInk)
            }
            Text(pursuit.title)
                .font(.custom("Georgia", size: 21, relativeTo: .headline))
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
            Text(
                appLanguage.text(
                    "Target outcome: \(pursuit.targetOutcome.workspacePhrase)",
                    zhHans: "目标结果：\(pursuit.targetOutcome.workspacePhrase)"
                )
            )
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 12) {
                Label(pursuit.milestone.humanized, systemImage: "flag")
                Label(
                    appLanguage.text(
                        "\(pursuit.openGapCount) gaps",
                        zhHans: "\(pursuit.openGapCount) 个缺口"
                    ),
                    systemImage: "questionmark.circle"
                )
                if pendingReviewCount > 0 {
                    Label(
                        appLanguage.text(
                            "\(pendingReviewCount) review",
                            zhHans: "\(pendingReviewCount) 项待审阅"
                        ),
                        systemImage: "checklist"
                    )
                }
            }
            .font(.caption)
            .foregroundStyle(Color.tsMutedInk)
        }
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
    }
}

private struct WorkspacePeopleView: View {
    let snapshot: PursuitWorkspaceSnapshot
    let isPreview: Bool
    let onSelect: (WorkspacePerson) -> Void
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                RelationshipPageIntro(
                    eyebrow: appLanguage.text(
                        "Stable identities · \(snapshot.people.count)",
                        zhHans: "稳定身份 · \(snapshot.people.count)"
                    ),
                    title: appLanguage.text("People", zhHans: "人物"),
                    summary: appLanguage.text(
                        "One person may hold different roles across Pursuits; the role never becomes identity.",
                        zhHans: "同一个人可在不同目标中承担不同角色；角色不会取代身份。"
                    )
                )
                .padding(.bottom, 24)
                if isPreview { PursuitPreviewBoundary() }
                ForEach(snapshot.people) { person in
                    Button { onSelect(person) } label: {
                        WorkspacePersonRow(
                            person: person,
                            roles: personRoles(person.id)
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("workspace-person-\(person.id)")
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 24)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .accessibilityIdentifier("relationship-people")
    }

    private func personRoles(_ personID: String) -> [String] {
        snapshot.pursuits.flatMap { pursuit in
            pursuit.personRoles
                .filter { $0.subjectRef.id == personID }
                .map { "\($0.roleType.humanized) · \(pursuit.title)" }
        }
    }
}

private struct WorkspacePersonRow: View {
    let person: WorkspacePerson
    let roles: [String]
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            RelationshipInitials(
                initials: String(person.displayLabel.prefix(2)).uppercased(),
                size: 48
            )
            VStack(alignment: .leading, spacing: 6) {
                Text(person.displayLabel)
                    .font(.custom("Georgia", size: 19, relativeTo: .headline))
                    .foregroundStyle(Color.tsInk)
                if roles.isEmpty {
                    Text(
                        appLanguage.text(
                            "No active Pursuit role",
                            zhHans: "暂无活跃目标角色"
                        )
                    )
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                } else {
                    ForEach(roles.prefix(2), id: \.self) { role in
                        Text(role)
                            .font(.caption)
                            .foregroundStyle(Color.tsMutedInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Text(
                    appLanguage.text(
                        "\(person.captureCount) governed source\(person.captureCount == 1 ? "" : "s") · \(person.confirmedIdentityCount) confirmed identity clue\(person.confirmedIdentityCount == 1 ? "" : "s")",
                        zhHans: "\(person.captureCount) 个受治理来源 · \(person.confirmedIdentityCount) 条已确认身份线索"
                    )
                )
                    .font(.caption2)
                    .foregroundStyle(Color.tsMutedInk.opacity(0.82))
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .frame(minHeight: 48)
        }
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
    }
}

private struct PursuitPreviewBoundary: View {
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        Label(
            appLanguage.text(
                "Synthetic preview · canonical backend not connected",
                zhHans: "合成预览 · 尚未连接权威后端"
            ),
            systemImage: "eye.trianglebadge.exclamationmark"
        )
        .font(.caption.weight(.semibold))
        .foregroundStyle(Color.tsMutedInk)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Divider().overlay(Color.tsLine) }
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
        .accessibilityIdentifier("workspace-preview-boundary")
    }
}

private struct PursuitNoActionView: View {
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: "checkmark.circle")
                .font(.title2)
                .foregroundStyle(Color.tsMutedInk)
            Text(
                appLanguage.text(
                    "Nothing needs your judgment.",
                    zhHans: "当前无需你作出判断。"
                )
            )
                .font(.custom("Georgia", size: 27, relativeTo: .title2))
                .foregroundStyle(Color.tsInk)
            Text(
                appLanguage.text(
                    "No pending Proposal, owned due action, or reviewed-evidence gap is asking for attention.",
                    zhHans: "目前没有待审提议、已负责的到期行动或经审阅证据支持的缺口需要关注。"
                )
            )
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
        }
        .padding(.vertical, 28)
        .accessibilityIdentifier("today-no-action")
    }
}

private struct PursuitWorkspaceLoadingView: View {
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        VStack(spacing: 14) {
            ProgressView()
            Text(
                appLanguage.text(
                    "Reading canonical Pursuits…",
                    zhHans: "正在读取权威目标…"
                )
            )
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
            Text(
                appLanguage.text(
                    "No preview facts are shown while this read is unresolved.",
                    zhHans: "读取尚未完成时，不会展示任何预览事实。"
                )
            )
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier("workspace-loading")
    }
}

private struct PursuitWorkspaceFailureView: View {
    let message: String
    let isRetrying: Bool
    let completedReadCount: Int
    let retry: () -> Void
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            RelationshipEyebrow(
                appLanguage.text("Read failed", zhHans: "读取失败")
            )
            Text(
                appLanguage.text(
                    "Canonical workspace unavailable",
                    zhHans: "权威工作区不可用"
                )
            )
                .font(.custom("Georgia", size: 28, relativeTo: .title2))
                .foregroundStyle(Color.tsInk)
                .accessibilityIdentifier("workspace-failed")
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
            Text(
                appLanguage.text(
                    "No cached or synthetic candidate facts are being substituted.",
                    zhHans: "不会用缓存或合成的候选人事实替代当前状态。"
                )
            )
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
            Text(
                completedReadCount > 1
                    ? appLanguage.text(
                        "Last retry finished · canonical state is still unavailable.",
                        zhHans: "上次重试已结束 · 权威状态仍不可用。"
                    )
                    : appLanguage.text(
                        "Initial read finished · canonical state is unavailable.",
                        zhHans: "首次读取已结束 · 权威状态不可用。"
                    )
            )
                .font(.caption2)
                .foregroundStyle(Color.tsMutedInk.opacity(0.82))
                .accessibilityIdentifier(
                    "workspace-failed-attempt-\(completedReadCount)"
                )
            if isRetrying {
                HStack(spacing: 10) {
                    ProgressView()
                    Text(
                        appLanguage.text(
                            "Retrying canonical read…",
                            zhHans: "正在重试权威读取…"
                        )
                    )
                        .font(.subheadline.weight(.semibold))
                }
                .frame(minHeight: 44)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("workspace-retrying")
            } else {
                Button(
                    appLanguage.text("Retry read", zhHans: "重新读取"),
                    action: retry
                )
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("retry-workspace-read")
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
}

private struct PursuitWorkspaceEmptyView: View {
    let selectedPage: RelationshipArchivePage
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            RelationshipEyebrow(
                appLanguage.text(
                    "Canonical workspace",
                    zhHans: "权威工作区"
                )
            )
            Text(
                emptyTitle
            )
                .font(.custom("Georgia", size: 31, relativeTo: .title2))
                .foregroundStyle(Color.tsInk)
            Text(
                appLanguage.text(
                    "Capture can preserve a Signal, but it will not invent an identity or Pursuit.",
                    zhHans: "捕捉可以保留信号，但不会凭空创建身份或目标。"
                )
            )
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .accessibilityIdentifier("workspace-empty")
    }

    private var emptyTitle: String {
        switch selectedPage {
        case .today:
            return appLanguage.text("Nothing needs attention", zhHans: "暂无待处理事项")
        case .sessions:
            return appLanguage.text("No sessions yet", zhHans: "还没有会话")
        case .people:
            return appLanguage.text("No people yet", zhHans: "还没有人物")
        }
    }
}

struct PursuitDetailView: View {
    @State private var pursuit: WorkspacePursuit
    let snapshot: PursuitWorkspaceSnapshot?
    let currentUserID: String?
    @ObservedObject var workspaceStore: PursuitWorkspaceStore
    let targetActionID: String?
    let onOpenProposal: (WorkspaceProposal) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var completingActionID: String?

    init(
        pursuit: WorkspacePursuit,
        snapshot: PursuitWorkspaceSnapshot?,
        currentUserID: String?,
        workspaceStore: PursuitWorkspaceStore,
        targetActionID: String? = nil,
        onOpenProposal: @escaping (WorkspaceProposal) -> Void
    ) {
        _pursuit = State(initialValue: pursuit)
        self.snapshot = snapshot
        self.currentUserID = currentUserID
        self.workspaceStore = workspaceStore
        self.targetActionID = targetActionID
        self.onOpenProposal = onOpenProposal
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                    RelationshipEyebrow("\(pursuit.status.humanized) · revision \(pursuit.revision)")
                        .padding(.top, 26)
                    Text(pursuit.title)
                        .font(.custom("Georgia", size: 36, relativeTo: .largeTitle))
                        .foregroundStyle(Color.tsInk)
                        .tracking(-0.8)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                    Text("Target outcome: \(pursuit.targetOutcome.workspacePhrase)")
                        .font(.body)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)

                    PursuitDefinitionSection(
                        title: "Current frame",
                        rows: [
                            ("Milestone", pursuit.milestone.humanized),
                            (
                                "Milestone authority",
                                "\(pursuit.milestoneAuthority.kind.humanized) · \(pursuit.milestoneAuthority.evidenceState.attentionLabel)"
                            ),
                            (
                                "Confirmed",
                                milestoneConfirmationSummary
                            ),
                            ("Target date", WorkspaceDate.short(pursuit.targetDate)),
                            ("Type", pursuit.type.humanized),
                        ]
                    )

                    if ["partial", "unavailable"].contains(
                        pursuit.milestoneAuthority.evidenceState.availability
                    ) {
                        VStack(alignment: .leading, spacing: 8) {
                            Label(
                                "Milestone source authority changed",
                                systemImage: "exclamationmark.shield"
                            )
                            .font(.headline)
                            .foregroundStyle(Color.tsVermilion)
                            Text(
                                "The recruiter-confirmed decision and revision remain in history, but \(pursuit.milestoneAuthority.evidenceState.explanation.lowercased()). Review or correct the milestone before treating it as current evidence-backed truth."
                            )
                            .font(.subheadline)
                            .foregroundStyle(Color.tsMutedInk)
                            .fixedSize(horizontal: false, vertical: true)
                            if let receiptID = pursuit.milestoneAuthority.receiptID {
                                Text("Decision receipt \(receiptID.prefix(8))")
                                    .font(.caption)
                                    .foregroundStyle(Color.tsMutedInk)
                            }
                        }
                        .padding(14)
                        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 14))
                        .padding(.top, 16)
                        .accessibilityIdentifier("milestone-authority-warning")
                    }

                    if !pendingProposals.isEmpty {
                        RelationshipEyebrow("Waiting for review")
                            .padding(.top, 30)
                        ForEach(pendingProposals) { proposal in
                            Button { onOpenProposal(proposal) } label: {
                                VStack(alignment: .leading, spacing: 7) {
                                    Text(proposal.summary)
                                        .font(.headline)
                                        .foregroundStyle(Color.tsInk)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Text("\(proposal.subjectDisplayLabel) · \(proposal.status.humanized) · base revision \(proposal.baseRevision)")
                                        .font(.caption)
                                        .foregroundStyle(Color.tsMutedInk)
                                }
                                .padding(.vertical, 16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
                            .accessibilityIdentifier("pursuit-proposal-\(proposal.id)")
                        }
                    }

                    if !staleProposals.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Label(
                                "Proposal is out of date",
                                systemImage: "clock.badge.exclamationmark"
                            )
                            .font(.headline)
                            .foregroundStyle(Color.tsVermilion)
                            Text(
                                "This Pursuit is now revision \(currentPursuitRevision). An older Proposal cannot be reviewed and has no execution authority. Current workspace readback will replace it."
                            )
                            .font(.subheadline)
                            .foregroundStyle(Color.tsMutedInk)
                            .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14)
                        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 14))
                        .padding(.top, 24)
                        .accessibilityIdentifier("pursuit-stale-proposal")
                    }

                    RelationshipEyebrow("Open gaps")
                        .padding(.top, 30)
                    if pursuit.gaps.filter({ $0.status == "open" }).isEmpty {
                        Text("No open gap is recorded.")
                            .font(.subheadline)
                            .foregroundStyle(Color.tsMutedInk)
                            .padding(.top, 12)
                    } else {
                        ForEach(pursuit.gaps.filter { $0.status == "open" }) { gap in
                            VStack(alignment: .leading, spacing: 7) {
                                Text(gap.title)
                                    .font(.headline)
                                    .foregroundStyle(Color.tsInk)
                                Text("\(gap.basis.temporalAuthorityLabel) · \(gap.basis.evidenceState.attentionLabel)")
                                    .font(.caption)
                                    .foregroundStyle(
                                        gap.basis.evidenceState.availability == "available"
                                            ? Color.tsMutedInk
                                            : Color.tsVermilion
                                    )
                                Text(gap.basis.evidenceState.explanation)
                                    .font(.caption2)
                                    .foregroundStyle(Color.tsMutedInk)
                                Text(gap.basis.summary)
                                    .font(.subheadline)
                                    .foregroundStyle(Color.tsMutedInk)
                                Text("Close when: \(gap.closeCondition)")
                                    .font(.caption)
                                    .foregroundStyle(Color.tsMutedInk)
                            }
                            .padding(.vertical, 16)
                            .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
                        }
                    }

                    RelationshipEyebrow("Owned internal actions")
                        .padding(.top, 30)
                    if let completion = recordedActionCompletion {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Observed outcome recorded", systemImage: "checkmark.seal")
                                .font(.headline)
                            Text(completion.action.title)
                                .font(.subheadline.weight(.semibold))
                            Text("Owner: \(completion.action.ownerDisplayName) · \(WorkspaceDate.recorded(at: completion.result.receipt.occurredAt, sourceTimezone: TimeZone.current.identifier))")
                                .font(.caption)
                                .foregroundStyle(Color.tsMutedInk)
                            Text("Canonical revision \(completion.result.receipt.entityRef.beforeRevision) → \(completion.result.receipt.entityRef.afterRevision)")
                                .font(.caption)
                                .foregroundStyle(Color.tsMutedInk)
                            DisclosureGroup("Audit details") {
                                Text("Operation \(completion.result.receipt.operationID.prefix(8)) · receipt \(completion.result.receipt.id.prefix(8))")
                                    .font(.caption2)
                                    .foregroundStyle(Color.tsMutedInk)
                            }
                            Label("No message, calendar event, or external write", systemImage: "lock.shield")
                                .font(.caption)
                                .foregroundStyle(Color.tsMutedInk)
                        }
                        .padding(14)
                        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 14))
                        .accessibilityIdentifier("pursuit-action-completion-receipt")
                    }
                    if pursuit.actions.isEmpty {
                        Text("No action is recorded.")
                            .font(.subheadline)
                            .foregroundStyle(Color.tsMutedInk)
                            .padding(.top, 12)
                    } else {
                        ForEach(pursuit.actions) { action in
                            VStack(alignment: .leading, spacing: 7) {
                                if action.id == targetActionID {
                                    Label(
                                        "Referenced in Ask",
                                        systemImage: "arrow.down.right.circle.fill"
                                    )
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(Color.tsVermilion)
                                    .accessibilityIdentifier(
                                        "pursuit-target-action-\(action.id)"
                                    )
                                }
                                Text(action.title)
                                    .font(.headline)
                                    .foregroundStyle(Color.tsInk)
                                Text("\(action.status.humanized) · \(action.dueAt.map(WorkspaceDate.short) ?? "no due date")")
                                    .font(.caption)
                                    .foregroundStyle(Color.tsMutedInk)
                                Text("Owner: \(action.ownerDisplayName)")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(Color.tsInk)
                                    .accessibilityIdentifier("pursuit-action-owner-\(action.id)")
                                if let outcome = action.outcomeSummary,
                                   let completedAt = action.completedAt {
                                    Text("Observed outcome: \(outcome)")
                                        .font(.subheadline)
                                        .foregroundStyle(Color.tsInk)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Text(WorkspaceDate.recorded(at: completedAt, sourceTimezone: TimeZone.current.identifier))
                                        .font(.caption2)
                                        .foregroundStyle(Color.tsMutedInk)
                                }
                                Label(
                                    action.externalEffects.isEmpty
                                        ? "No message, calendar event, or external write"
                                        : "External effect requires separate verification",
                                    systemImage: "lock.shield"
                                )
                                .font(.caption)
                                .foregroundStyle(Color.tsMutedInk)

                                if !["completed", "cancelled"].contains(action.status),
                                   action.ownerUserID == currentUserID {
                                    if completingActionID == action.id {
                                        actionCompletionControls(for: action)
                                    } else {
                                        Button("Record observed outcome") {
                                            completingActionID = action.id
                                            Task {
                                                await workspaceStore.prepareActionCompletion(
                                                    pursuit: pursuit,
                                                    action: action
                                                )
                                                syncRecordedAction()
                                            }
                                        }
                                        .font(.subheadline.weight(.semibold))
                                        .frame(minHeight: 44)
                                        .accessibilityIdentifier("open-pursuit-action-completion-\(action.id)")
                                    }
                                }
                            }
                            .padding(.vertical, 16)
                            .padding(.horizontal, action.id == targetActionID ? 12 : 0)
                            .background(
                                action.id == targetActionID
                                    ? Color.tsCanvas
                                    : Color.clear,
                                in: RoundedRectangle(cornerRadius: 14)
                            )
                            .overlay {
                                if action.id == targetActionID {
                                    RoundedRectangle(cornerRadius: 14)
                                        .stroke(Color.tsVermilion.opacity(0.55), lineWidth: 1)
                                }
                            }
                            .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
                            .id(action.id)
                        }
                    }
                    }
                    .padding(.horizontal, 22)
                    .padding(.bottom, 40)
                }
                .background(Color.tsSurface.ignoresSafeArea())
                .navigationTitle("Pursuit")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Close", action: dismiss.callAsFunction)
                    }
                }
                .task {
                    if let targetActionID,
                       pursuit.actions.contains(where: { $0.id == targetActionID }) {
                        await Task.yield()
                        proxy.scrollTo(targetActionID, anchor: .center)
                    }
                    for action in pursuit.actions
                    where workspaceStore.hasSavedActionCompletion(actionID: action.id) {
                        completingActionID = action.id
                        await workspaceStore.prepareActionCompletion(
                            pursuit: pursuit,
                            action: action
                        )
                        syncRecordedAction()
                    }
                }
            }
        }
        .accessibilityIdentifier("pursuit-detail")
    }

    private var pendingProposals: [WorkspaceProposal] {
        workspaceStore.snapshot?.openProposals.filter {
            $0.pursuitID == pursuit.id
                && $0.baseRevision == currentPursuitRevision
        } ?? []
    }

    private var staleProposals: [WorkspaceProposal] {
        workspaceStore.snapshot?.openProposals.filter {
            $0.pursuitID == pursuit.id
                && $0.baseRevision != currentPursuitRevision
        } ?? []
    }

    private var currentPursuitRevision: Int {
        recordedActionCompletion?.result.pursuit.revision
            ?? workspaceStore.snapshot?.pursuit(id: pursuit.id)?.revision
            ?? pursuit.revision
    }

    private var milestoneConfirmationSummary: String {
        let actor: String
        if let confirmedBy = pursuit.milestoneAuthority.confirmedByUserID,
           confirmedBy == snapshot?.currentUserID {
            actor = snapshot?.currentUserName ?? "Current recruiter"
        } else if pursuit.milestoneAuthority.confirmedByUserID != nil {
            actor = "Workspace member"
        } else {
            actor = "Actor unavailable"
        }
        let confirmation = pursuit.milestoneAuthority.confirmedAt.map {
            WorkspaceDate.recorded(
                at: $0,
                sourceTimezone: TimeZone.current.identifier
            )
        } ?? "Time unavailable"
        return "\(actor) · \(confirmation)"
    }

    private var recordedActionCompletion: (
        action: WorkspaceAction,
        result: PursuitActionCompletionResult
    )? {
        for action in pursuit.actions {
            if case let .recorded(result) = workspaceStore.actionCompletionPhase(
                actionID: action.id
            ), let canonicalAction = result.pursuit.actions.first(where: {
                $0.id == action.id
            }) {
                return (canonicalAction, result)
            }
        }
        return nil
    }

    @ViewBuilder
    private func actionCompletionControls(for action: WorkspaceAction) -> some View {
        let phase = workspaceStore.actionCompletionPhase(actionID: action.id)
        switch phase {
        case .confirming:
            Label(
                "Recording with one saved recovery reference. Success waits for canonical readback.",
                systemImage: "arrow.triangle.2.circlepath"
            )
            .font(.caption)
            .foregroundStyle(Color.tsMutedInk)
            .accessibilityIdentifier("pursuit-action-confirming")
        case let .unknownLocked(operationID):
            VStack(alignment: .leading, spacing: 10) {
                Label(
                    "Outcome unknown — operation locked",
                    systemImage: "exclamationmark.shield"
                )
                .font(.subheadline.weight(.semibold))
                Text("The saved recovery reference will be checked before another write is allowed.")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                DisclosureGroup("Audit details") {
                    Text("Recovery reference \(operationID.uuidString.lowercased())")
                        .font(.caption2)
                        .foregroundStyle(Color.tsMutedInk)
                }
                Button("Check canonical result") {
                    Task {
                        await workspaceStore.reconcileActionCompletion(
                            actionID: action.id
                        )
                        syncRecordedAction()
                    }
                }
                .frame(minHeight: 44)
                .accessibilityIdentifier("reconcile-pursuit-action-\(action.id)")
            }
            .accessibilityIdentifier("pursuit-action-unknown-locked")
        case .recorded:
            EmptyView()
        case let .conflict(message), let .failed(message):
            completionEditor(for: action, message: message)
        case .idle, .editing:
            completionEditor(for: action, message: nil)
        }
    }

    private func completionEditor(
        for action: WorkspaceAction,
        message: String?
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Directly observed outcome")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsInk)
            TextField(
                "What was directly observed?",
                text: Binding(
                    get: {
                        workspaceStore.actionOutcomeDrafts[action.id] ?? ""
                    },
                    set: { value in
                        workspaceStore.updateActionOutcomeDraft(
                            pursuit: pursuit,
                            action: action,
                            value: value
                        )
                    }
                ),
                axis: .vertical
            )
            .textFieldStyle(.roundedBorder)
            .accessibilityIdentifier("pursuit-action-outcome-\(action.id)")
            if let message {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(Color.tsVermilion)
            }
            HStack(spacing: 12) {
                Button("Cancel") {
                    workspaceStore.cancelActionCompletion(actionID: action.id)
                    completingActionID = nil
                }
                .frame(minHeight: 44)
                Button("Record outcome") {
                    recordOutcome(for: action)
                }
                .buttonStyle(.borderedProminent)
                .disabled(
                    (workspaceStore.actionOutcomeDrafts[action.id] ?? "")
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                        .isEmpty
                )
                .accessibilityIdentifier("complete-pursuit-action-\(action.id)")
            }
        }
    }

    private func recordOutcome(for action: WorkspaceAction) {
        Task {
            await workspaceStore.submitActionCompletion(
                pursuit: pursuit,
                action: action
            )
            syncRecordedAction()
        }
    }

    private func syncRecordedAction() {
        guard let completingActionID,
              case let .recorded(result) = workspaceStore.actionCompletionPhase(
                actionID: completingActionID
              ) else { return }
        pursuit = result.pursuit
    }
}

private struct PursuitDefinitionSection: View {
    let title: String
    let rows: [(String, String)]

    var body: some View {
        VStack(spacing: 0) {
            RelationshipEyebrow(title)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 30)
                .padding(.bottom, 8)
            Grid(alignment: .leading, horizontalSpacing: 20, verticalSpacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { entry in
                    let row = entry.element
                    let rowIdentifier = "definition-\(title.lowercased().replacingOccurrences(of: " ", with: "-"))-row-\(entry.offset)"
                    GridRow(alignment: .top) {
                        Text(row.0)
                            .font(.caption)
                            .foregroundStyle(Color.tsMutedInk)
                            .gridColumnAlignment(.leading)
                            .accessibilityIdentifier("\(rowIdentifier)-label")
                        Text(row.1)
                            .font(.subheadline)
                            .foregroundStyle(Color.tsInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .gridColumnAlignment(.leading)
                            .accessibilityIdentifier("\(rowIdentifier)-value")
                    }
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .bottom) {
                        Divider().overlay(Color.tsLine)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct WorkspacePersonDetailView: View {
    let person: WorkspacePerson
    let roles: [WorkspacePersonRole]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    RelationshipEyebrow("Stable person identity")
                        .padding(.top, 26)
                    Text(person.displayLabel)
                        .font(.custom("Georgia", size: 38, relativeTo: .largeTitle))
                        .foregroundStyle(Color.tsInk)
                        .tracking(-0.8)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                    Text("Roles below are contextual. They do not redefine identity or rank this person.")
                        .font(.body)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)

                    RelationshipEyebrow("Pursuit roles")
                        .padding(.top, 30)
                    if roles.isEmpty {
                        Text("No active Pursuit role is recorded.")
                            .font(.subheadline)
                            .foregroundStyle(Color.tsMutedInk)
                            .padding(.top, 12)
                    } else {
                        ForEach(roles) { role in
                            VStack(alignment: .leading, spacing: 7) {
                                Text(role.pursuitTitle)
                                    .font(.headline)
                                    .foregroundStyle(Color.tsInk)
                                Text("\(role.roleType.humanized) · \(role.status.humanized) · \(role.confidence.humanized)")
                                    .font(.caption)
                                    .foregroundStyle(Color.tsMutedInk)
                                Text(role.evidenceState.explanation)
                                    .font(.caption2)
                                    .foregroundStyle(
                                        role.evidenceState.availability == "unavailable"
                                            ? Color.tsVermilion
                                            : Color.tsMutedInk
                                    )
                            }
                            .padding(.vertical, 16)
                            .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
                        }
                    }

                    PursuitDefinitionSection(
                        title: "Governed identity",
                        rows: [
                            ("Sources", "\(person.captureCount)"),
                            ("Identity clues", "\(person.confirmedIdentityCount)"),
                            ("Contexts", "\(person.contextCount)"),
                        ]
                    )
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 40)
            }
            .background(Color.tsSurface.ignoresSafeArea())
            .navigationTitle("Person")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close", action: dismiss.callAsFunction)
                }
            }
        }
        .accessibilityIdentifier("workspace-person-detail")
    }
}

private struct RelationshipGuideRail: View {
    let onGuide: () -> Void
    let onCapture: () -> Void
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        HStack(spacing: 0) {
            Button(action: onGuide) {
                HStack(spacing: 10) {
                    RelationshipSignalOrb()
                        .frame(width: 28, height: 28)
                    Text(appLanguage.text("Ask anything", zhHans: "问点什么"))
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                    Spacer(minLength: 6)
                }
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .padding(.leading, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                appLanguage.text("Open a new Agent session", zhHans: "打开新的 Agent 会话")
            )
            .accessibilityIdentifier("relationship-guide")

            Button(action: onCapture) {
                Image(systemName: "waveform")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .frame(width: 48, height: 48)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                appLanguage.text(
                    "Add text, photo, or voice",
                    zhHans: "添加文本、图片或语音"
                )
            )
            .accessibilityIdentifier("capture-relationship-moment")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 9)
        .background(Color.tsCanvas, in: Capsule())
        .padding(.horizontal, 20)
        .background(Color.tsSurface.opacity(0.97))
    }
}

private struct RelationshipPageIntro: View {
    let eyebrow: String
    let title: String
    let summary: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            RelationshipEyebrow(eyebrow, color: .tsInk)
                .accessibilityIdentifier("workspace-page-eyebrow")
            Text(title)
                .font(.custom("Georgia", size: 52, relativeTo: .largeTitle))
                .foregroundStyle(Color.tsInk)
                .tracking(-1.8)
                .padding(.top, 8)
            Text(summary)
                .font(.body)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 9)
        }
    }
}

private struct RelationshipEyebrow: View {
    let text: String
    let color: Color

    init(_ text: String, color: Color = .tsVermilion) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text.uppercased())
            .font(.caption2.weight(.bold))
            .tracking(1.15)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
    }
}

private struct RelationshipContinueRow: View {
    let initials: String
    let name: String
    let context: String
    let status: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                RelationshipInitials(initials: initials, size: 40)
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 7) {
                        Text(name)
                            .font(.custom("Georgia", size: 16, relativeTo: .body))
                            .foregroundStyle(Color.tsInk)
                        Text(context)
                            .font(.caption2)
                            .foregroundStyle(Color.tsMutedInk)
                    }
                    Text(status)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
            }
            .frame(minHeight: 68)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
    }
}

private struct RelationshipPersonRow: View {
    let person: RelationshipArchivePerson
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 14) {
                RelationshipInitials(initials: person.initials, size: 50)
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(person.state.rawValue.uppercased())
                            .font(.caption2.weight(.bold))
                            .tracking(0.7)
                            .foregroundStyle(
                                person.state == .changed
                                    ? Color.tsVermilion
                                    : Color.tsMutedInk
                            )
                        Spacer()
                        Text(person.recency.uppercased())
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color.tsMutedInk)
                    }
                    Text(person.name)
                        .font(.custom("Georgia", size: 19, relativeTo: .headline))
                        .foregroundStyle(Color.tsInk)
                    Text("\(person.role) · \(person.company)")
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(person.dependency)
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 3)
                }
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .frame(minHeight: 50)
            }
            .padding(.vertical, 20)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
        .accessibilityIdentifier("relationship-person-\(person.id)")
    }
}

private struct RelationshipInitials: View {
    let initials: String
    let size: CGFloat

    var body: some View {
        Text(initials)
            .font(.custom("Georgia", size: size * 0.32, relativeTo: .body))
            .foregroundStyle(Color.tsMutedInk)
            .frame(width: size, height: size)
            .background(Color.tsCanvas, in: Circle())
            .overlay { Circle().stroke(Color.tsLine, lineWidth: 1) }
            .accessibilityHidden(true)
    }
}

private struct RelationshipLibraryRow: View {
    let systemImage: String
    let title: String
    let detail: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: systemImage)
                    .font(.body)
                    .foregroundStyle(Color.tsMutedInk)
                    .frame(width: 42, height: 42)
                    .overlay { Circle().stroke(Color.tsLine, lineWidth: 1) }
                VStack(alignment: .leading, spacing: 5) {
                    Text(title)
                        .font(.custom("Georgia", size: 16, relativeTo: .body))
                        .foregroundStyle(Color.tsInk)
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
            }
            .frame(minHeight: 82)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
    }
}

private struct RelationshipCollectionLabel: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
        }
        .font(.caption2.weight(.semibold))
        .tracking(0.8)
        .textCase(.uppercase)
        .foregroundStyle(Color.tsMutedInk)
        .frame(minHeight: 44)
        .overlay(alignment: .top) { Divider().overlay(Color.tsLine) }
    }
}

struct RelationshipSignalOrb: View {
    var body: some View {
        HStack(alignment: .bottom, spacing: 3) {
            Capsule().fill(Color.tsSurface).frame(width: 3, height: 8)
            Capsule().fill(Color.tsSurface).frame(width: 3, height: 16)
            Capsule().fill(Color.tsVermilion).frame(width: 3, height: 12)
        }
        .frame(width: 34, height: 34)
        .background(Color.tsInk, in: Circle())
        .shadow(color: Color.tsInk.opacity(0.16), radius: 5, y: 3)
        .accessibilityHidden(true)
    }
}

#Preview("Editorial Today") {
    RelationshipArchiveView()
}

extension String {
    var humanized: String {
        replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { word in
                guard let first = word.first else { return "" }
                return first.uppercased() + word.dropFirst()
            }
            .joined(separator: " ")
    }

    var workspacePhrase: String {
        contains("_") ? humanized : self
    }
}

private extension WorkspaceGap.Basis {
    var temporalAuthorityLabel: String {
        if kind == "evidence_supported", evidenceState.availability != "available" {
            return "Originally evidence-supported"
        }
        return kind.humanized
    }
}
