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
    @State private var presentedPursuit: WorkspacePursuit?
    @State private var presentedSheet: RelationshipArchiveSheet?
    @State private var capturePresentation: RelationshipCapturePresentation?
    @State private var intakePresentation: AgentIntakePresentation?
    @State private var isRelationshipCalendarPresented = false
    @State private var deferredIntakePresentation: AgentIntakePresentation?
    @State private var deferredArchiveSheet: RelationshipArchiveSheet?
    @State private var deferredCapturePresentation: RelationshipCapturePresentation?
    @State private var deferredPeoplePersonID: String?
    @State private var selectedPeoplePersonID: String?
    private let reviewBaseURL: URL?
    private let authenticatedAccessToken: String?
    private let accountEmail: String?
    private let workspaceLabel: String?
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
        let resolvedSessionStore: AgentSessionStore
#if DEBUG
        let usesPersistentPreview = ProcessInfo.processInfo.arguments.contains(
            "--persist-preview-agent"
        )
        if resolvedService == nil, usesPersistentPreview {
            let previewStore = AgentSessionStore(
                persistence: FileAgentSessionPersistence(
                    accountID: "ui-test-preview-agent"
                )
            )
            if ProcessInfo.processInfo.arguments.contains(
                "--reset-preview-agent"
            ) {
                _ = previewStore.deleteAll()
            }
            resolvedSessionStore = previewStore
        } else if resolvedService == nil {
            resolvedSessionStore = AgentSessionStore.preview(snapshot: .preview)
        } else {
            resolvedSessionStore = AgentSessionStore(
                persistence: session?.accountID.map {
                    FileAgentSessionPersistence(accountID: $0)
                }
            )
        }
#else
        if resolvedService == nil {
            resolvedSessionStore = AgentSessionStore.preview(snapshot: .preview)
        } else {
            resolvedSessionStore = AgentSessionStore(
                persistence: session?.accountID.map {
                    FileAgentSessionPersistence(accountID: $0)
                }
            )
        }
#endif
        _sessionStore = StateObject(wrappedValue: resolvedSessionStore)
        reviewBaseURL = session?.baseURL
        authenticatedAccessToken = session?.accessToken
        accountEmail = session?.userEmail
        workspaceLabel = session?.accountSlug
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
                onGuide: {
                    capturePresentation = .ask(sessionID: nil, seed: nil)
                },
                onCapture: {
                    capturePresentation = .screenshot
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
                    workspaceLabel: workspaceLabel,
                    accountName: workspaceStore.snapshot?.currentUserName,
                    accountEmail: accountEmail,
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
            case let .ask(sessionID, seed):
                if let snapshot = workspaceStore.snapshot {
                    RelationshipAskView(
                        snapshot: snapshot,
                        isCanonical: workspaceStore.isCanonical,
                        workspaceStore: workspaceStore,
                        sessionStore: sessionStore,
                        sessionID: sessionID,
                        initialSeed: seed,
                        ask: { objective, personID, contextID, idempotencyKey, mediaIDs in
                            try await workspaceStore.ask(
                                objective: objective,
                                personID: personID,
                                relationshipContextID: contextID,
                                idempotencyKey: idempotencyKey,
                                mediaIDs: mediaIDs
                            )
                        },
                        saveContact: {
                            draft,
                            target,
                            confirmIdentityClue,
                            capturedAt,
                            idempotencyKey in
                            try await workspaceStore.saveContactDraft(
                                draft,
                                target: target,
                                confirmIdentityClue: confirmIdentityClue,
                                capturedAt: capturedAt,
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
                        onCapture: { destination in
                            switch destination {
                            case .screenshotReview:
                                deferredCapturePresentation = .screenshot
                            case .foregroundAudio:
                                deferredIntakePresentation = .init(
                                    initialDestination: .foregroundAudio
                                )
                            }
                            capturePresentation = nil
                        },
                        onOpenPerson: { personID in
                            deferredPeoplePersonID = personID
                            capturePresentation = nil
                        },
                        voiceTranscriber: composerVoiceTranscriber
                    )
                } else {
                    PursuitWorkspaceLoadingView()
                }
            case .screenshot:
                CandidateSignalView(
                    backendURL: reviewBaseURL,
                    accessToken: authenticatedAccessToken,
                    workspaceID: workspaceStore.snapshot?.workspaceID,
                    entryMode: .conversationImage,
                    onClose: { capturePresentation = nil },
                    onContinueInAgent: continueCaptureInAgent
                )
            }
        }
        .fullScreenCover(
            isPresented: $isRelationshipCalendarPresented,
            onDismiss: completeDeferredTransition
        ) {
            if let snapshot = workspaceStore.snapshot {
                RelationshipCalendarView(
                    snapshot: snapshot,
                    isPreview: !workspaceStore.isCanonical,
                    initialActivities: RelationshipCalendarProjection.activities(
                        snapshot: snapshot,
                        isPreview: !workspaceStore.isCanonical
                    ),
                    onPrepare: stageCalendarPreparation
                )
            } else {
                PursuitWorkspaceLoadingView()
            }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            Task {
                sessionStore.pruneExpired()
                await revalidateSessionEvidence()
            }
        }
        .onChange(of: selectedPage) { _ in
            closePursuit()
        }
        .onChange(of: workspaceStore.snapshot) { snapshot in
            guard let pursuitID = presentedPursuit?.id else { return }
            presentedPursuit = snapshot?.pursuit(id: pursuitID)
        }
        .sheet(
            item: $intakePresentation,
            onDismiss: completeDeferredTransition
        ) { presentation in
            SignalCaptureHubView(
                backendURL: reviewBaseURL,
                accessToken: authenticatedAccessToken,
                workspaceID: workspaceStore.snapshot?.workspaceID,
                initialDestination: presentation.initialDestination,
                onDismiss: { intakePresentation = nil },
                onContinueInAgent: continueCaptureInAgent
            )
        }
        .onReceive(captureHandoff.$pendingSeed) { seed in
            guard let seed else { return }
            if intakePresentation != nil {
                if seed.origin == .appShortcut {
                    deferredCapturePresentation = .screenshot
                    intakePresentation = nil
                }
                return
            }
            guard capturePresentation == nil else { return }
            capturePresentation = .screenshot
        }
        .onReceive(captureIntentRouter.$request) { request in
            guard let request else { return }
            switch request.destination {
            case .hub:
                capturePresentation = .ask(sessionID: nil, seed: nil)
            case .foregroundAudio:
                intakePresentation = .init(initialDestination: request.destination)
            case .latestProposal:
                if let proposal = workspaceStore.snapshot?.openProposals.first {
                    presentedSheet = .proposal(proposal)
                }
            case let .pursuit(id):
                if let pursuit = workspaceStore.snapshot?.pursuits.first(where: { $0.id == id }) {
                    openPursuit(pursuit)
                }
            }
            captureIntentRouter.consume(request.id)
        }
        .onOpenURL { url in
            guard url.scheme == "talent-signal-capture" else { return }
            switch url.host {
            case "audio":
                intakePresentation = .init(initialDestination: .foregroundAudio)
            default:
                capturePresentation = .ask(sessionID: nil, seed: nil)
            }
        }
        .task {
            await workspaceStore.load()
            await revalidateSessionEvidence()
        }
        .tint(.tsVermilion)
    }

    private var composerVoiceTranscriber: (any VoiceTranscriptionServing)? {
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--deterministic-voice-input") {
            return DeterministicVoiceTranscriber()
        }
        if let baseURL = reviewBaseURL,
           URLFixtureLoader.isLoopback(baseURL),
           authenticatedAccessToken == nil {
            return URLSimulatedVoiceTranscriptionClient(
                baseURL: baseURL,
                accountSlug: workspaceLabel ?? "fixture-alpha",
                userEmail: accountEmail ?? "recruiter@alpha.local"
            )
        }
#endif
        return reviewBaseURL.flatMap { baseURL in
            authenticatedAccessToken.map { accessToken in
                URLVoiceTranscriptionClient(
                    baseURL: baseURL,
                    accessToken: accessToken
                )
            }
        }
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
            ZStack {
                TabView(selection: $selectedPage) {
                    PursuitTodayView(
                        snapshot: snapshot,
                        isPreview: !workspaceStore.isCanonical,
                        calendarActivities: RelationshipCalendarProjection.activities(
                            snapshot: snapshot,
                            isPreview: !workspaceStore.isCanonical
                        ),
                        unreadSessions: sessionStore.unreadSessions,
                        actionRecovery: workspaceStore.latestActionRecovery(
                            in: snapshot
                        ),
                        onOpenSession: openSession,
                        onOpenCalendar: {
                            isRelationshipCalendarPresented = true
                        },
                        onOpenAttention: openAttention,
                        onOpenPursuit: openPursuit,
                        onOpenActionRecovery: { pursuitID in
                            guard let pursuit = snapshot.pursuit(id: pursuitID) else {
                                return
                            }
                            openPursuit(pursuit)
                        }
                    )
                    .tag(RelationshipArchivePage.today)

                    AgentSessionListView(
                        sessions: sessionStore.sessions,
                        isPreview: !workspaceStore.isCanonical,
                        persistenceNotice: sessionStore.persistenceNotice,
                        onOpen: openSession,
                        onMarkUnread: sessionStore.markUnread,
                        onDelete: sessionStore.delete
                    )
                    .tag(RelationshipArchivePage.sessions)

                    WorkspacePeopleView(
                        snapshot: snapshot,
                        isPreview: !workspaceStore.isCanonical,
                        roles: { roles(for: $0, in: snapshot) },
                        selectedPersonID: $selectedPeoplePersonID,
                        onOpenPursuit: openPursuit
                    )
                    .tag(RelationshipArchivePage.people)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .indexViewStyle(.page(backgroundDisplayMode: .never))
                .allowsHitTesting(presentedPursuit == nil)
                .accessibilityHidden(presentedPursuit != nil)

                if let presentedPursuit {
                    PursuitDetailView(
                        pursuit: presentedPursuit,
                        snapshot: snapshot,
                        currentUserID: snapshot.currentUserID,
                        workspaceStore: workspaceStore,
                        backLabel: selectedPage.title(in: appLanguage),
                        onBack: closePursuit,
                        onOpenProposal: { proposal in
                            presentedSheet = .proposal(proposal)
                        }
                    )
                    .id(presentedPursuit.id)
                    .transition(.opacity)
                    .zIndex(1)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .animation(.easeOut(duration: 0.18), value: presentedPursuit?.id)
        }
    }

    private func openPursuit(_ pursuit: WorkspacePursuit) {
        presentedPursuit = pursuit
    }

    private func closePursuit() {
        presentedPursuit = nil
    }

    private func openSession(_ session: AgentSession) {
        sessionStore.markRead(session.id)
        capturePresentation = .ask(sessionID: session.id, seed: nil)
    }

    private func stageCalendarPreparation(
        _ activity: RelationshipCalendarActivity
    ) {
        let objective = String(
            format: appLanguage.text(
                "Prepare for the %1$@ %2$@ with %3$@. Clarify the objective, unresolved evidence, and the three questions that matter most."
            ),
            locale: appLanguage.locale,
            timeText(activity.startDate),
            activity.kind.title(in: appLanguage).lowercased(),
            activity.personDisplayLabel
        )
        let existingDraft = sessionStore.draft(
            personID: activity.personID,
            relationshipContextID: activity.relationshipContextID
        )
        if existingDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            sessionStore.saveDraft(
                objective,
                personID: activity.personID,
                relationshipContextID: activity.relationshipContextID
            )
        }

        let matchingSession = sessionStore.sessions.first {
            $0.personID == activity.personID
                && $0.relationshipContextID == activity.relationshipContextID
        }
        if let matchingSession {
            deferredCapturePresentation = .ask(
                sessionID: matchingSession.id,
                seed: nil
            )
        } else {
            deferredCapturePresentation = .ask(
                sessionID: nil,
                seed: .meetingPreparation(
                    personID: activity.personID,
                    relationshipContextID: activity.relationshipContextID,
                    suggestedObjective: objective
                )
            )
        }
    }

    private func timeText(_ date: Date) -> String {
        date.formatted(
            Date.FormatStyle()
                .hour()
                .minute()
                .locale(appLanguage.locale)
        )
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
        if let deferredPeoplePersonID {
            selectedPage = .people
            selectedPeoplePersonID = deferredPeoplePersonID
            self.deferredPeoplePersonID = nil
        }
        if let deferredCapturePresentation {
            capturePresentation = deferredCapturePresentation
            self.deferredCapturePresentation = nil
        }
        if let deferredArchiveSheet {
            presentedSheet = deferredArchiveSheet
            self.deferredArchiveSheet = nil
        }
        if let deferredIntakePresentation {
            intakePresentation = deferredIntakePresentation
            self.deferredIntakePresentation = nil
        }
    }

    private func continueCaptureInAgent(
        _ completion: RelationshipCaptureCompletion
    ) {
        guard let personID = completion.personID,
              let relationshipContextID = completion.relationshipContextID else {
            return
        }
        let seed = AgentSessionSeed.reviewedCapture(
            personID: personID,
            relationshipContextID: relationshipContextID
        )
        Task {
            await workspaceStore.load()
            deferredCapturePresentation = .ask(sessionID: nil, seed: seed)
            capturePresentation = nil
            intakePresentation = nil
        }
    }

    private func openAttention(_ item: PursuitAttentionItem) {
        guard let snapshot = workspaceStore.snapshot else { return }
        if let proposalID = item.proposalID,
           let proposal = snapshot.proposals.first(where: { $0.id == proposalID }) {
            presentedSheet = .proposal(proposal)
        } else if let pursuit = snapshot.pursuit(id: item.pursuitID) {
            openPursuit(pursuit)
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
                        targetOutcome: pursuit.targetOutcome,
                        roleID: $0.id,
                        roleType: $0.roleType,
                        status: $0.status,
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
    case ask(sessionID: UUID?, seed: AgentSessionSeed?)
    case screenshot

    var id: String {
        switch self {
        case let .ask(sessionID, seed):
            return [
                "ask",
                sessionID?.uuidString ?? "new",
                seed?.personID ?? "unscoped",
                seed?.relationshipContextID ?? "unscoped",
            ].joined(separator: "-")
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
                                .accessibilityHidden(true)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(
                        selectedPage == page ? .isSelected : []
                    )
                    .accessibilityLabel(page.title(in: appLanguage))
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
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityElement(children: .contain)
    }
}

private struct PursuitTodayView: View {
    let snapshot: PursuitWorkspaceSnapshot
    let isPreview: Bool
    let calendarActivities: [RelationshipCalendarActivity]
    let unreadSessions: [AgentSession]
    let actionRecovery: PursuitActionRecoveryItem?
    let onOpenSession: (AgentSession) -> Void
    let onOpenCalendar: () -> Void
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

                TodayRelationshipCalendarPeek(
                    activities: calendarActivities,
                    onOpen: onOpenCalendar
                )
                    // This is a compact glance, not the calendar reading surface.
                    // Keep it legible at accessibility sizes without letting a
                    // secondary preview displace the decision that Today exists for.
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .padding(.top, isPreview ? 16 : 22)

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
                        proposalAction: { onOpenAttention(focus) }
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
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Label(
                        item.status == .recorded
                            ? appLanguage.text("Outcome recorded")
                            : appLanguage.text("Checking canonical result"),
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
                Text(String(
                    format: appLanguage.text("%1$@ · Owner: %2$@"),
                    locale: appLanguage.locale,
                    item.pursuitTitle,
                    item.ownerDisplayName
                ))
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                Label(
                    appLanguage.text(
                        "No message, calendar event, or external write"
                    ),
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
                    Text(session.displayTitle(in: appLanguage))
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                        .lineLimit(1)
                    Text(
                        "\(session.personDisplayLabel) · \(session.displayContextLabel(in: appLanguage))"
                    )
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
                "Unread session: \(session.displayTitle(in: appLanguage)), \(session.personDisplayLabel)",
                zhHans: "未读会话：\(session.displayTitle(in: appLanguage))，\(session.personDisplayLabel)"
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
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                RelationshipEyebrow(
                    item.kind == .review
                        ? appLanguage.text("Proposed change · Needs review")
                        : appLanguage.workspaceTerm(item.eyebrow)
                )
                Spacer(minLength: 10)
                if let due = item.due {
                    Text(appLanguage.shortDate(due))
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
                Text(appLanguage.workspaceTerm(pursuit.title))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 5)
            }
            Text(appLanguage.workspaceTerm(item.title))
                .font(.body)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)

            TodayDecisionContextLine(
                label: appLanguage.text("Target outcome", zhHans: "目标结果"),
                value: appLanguage.workspaceTerm(item.targetOutcome),
                accessibilityIdentifier: "today-focus-target-outcome"
            )
                .padding(.top, 10)
            TodayDecisionContextLine(
                label: appLanguage.text("Target date", zhHans: "目标日期"),
                value: appLanguage.shortDate(item.targetDate),
                accessibilityIdentifier: "today-focus-target-date"
            )
            if let blocker = item.blocker {
                TodayDecisionContextLine(
                    label: appLanguage.text("Blocker", zhHans: "阻碍"),
                    value: appLanguage.workspaceTerm(blocker),
                    accessibilityIdentifier: "today-focus-blocker"
                )
            }

            attentionMetadata
                .padding(.top, 14)

            primaryActionButton
                .padding(.top, 20)

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

    @ViewBuilder
    private var attentionMetadata: some View {
        let evidence = localizedEvidenceSummary
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) {
                    if let owner = item.owner {
                        metadataLabel(owner, systemImage: "person")
                    }
                    if let evidence {
                        metadataLabel(evidence, systemImage: "link")
                    }
                }
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) {
                        if let owner = item.owner {
                            metadataLabel(owner, systemImage: "person")
                        }
                        if let evidence {
                            metadataLabel(evidence, systemImage: "link")
                        }
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        if let owner = item.owner {
                            metadataLabel(owner, systemImage: "person")
                        }
                        if let evidence {
                            metadataLabel(evidence, systemImage: "link")
                        }
                    }
                }
            }
        }
        .font(.caption)
        .foregroundStyle(Color.tsMutedInk)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("today-focus-metadata")
    }

    private func metadataLabel(
        _ text: String,
        systemImage: String
    ) -> some View {
        Label(text, systemImage: systemImage)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var localizedEvidenceSummary: String? {
        if let observedAt = item.evidenceObservedAt {
            return shortEvidence(appLanguage.evidenceFreshness(
                observedAt: observedAt,
                sourceTimezone: item.evidenceSourceTimezone
            ))
        }
        return item.evidenceState.map(appLanguage.evidenceExplanation)
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
                        Text(
                            pursuit.map { appLanguage.workspaceTerm($0.title) }
                                ?? appLanguage.text("Pursuit", zhHans: "目标")
                        )
                            .font(.headline)
                            .foregroundStyle(Color.tsInk)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(appLanguage.workspaceTerm(item.title))
                            .font(.caption)
                            .foregroundStyle(Color.tsMutedInk)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 7) {
                        Text(
                            [
                                item.owner,
                                item.due.map(appLanguage.shortDate)
                                    ?? appLanguage.workspaceTerm(item.eyebrow),
                            ]
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

private struct TodayDecisionContextLine: View {
    let label: String
    let value: String
    var accessibilityIdentifier: String? = nil
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
        .accessibilityIdentifier(accessibilityIdentifier ?? "")
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
    let onMarkUnread: (UUID) -> Void
    let onDelete: (UUID) -> Void
    @State private var query = ""
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        VStack(spacing: 0) {
            WorkspaceSearchField(
                query: $query,
                placeholder: appLanguage.text("Search sessions"),
                accessibilityIdentifier: "session-search"
            )
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 8)

            if isPreview {
                PursuitPreviewBoundary()
                    .padding(.horizontal, 20)
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
                            "Use the bottom field. Successful Agent responses and confirmed tool receipts appear here without becoming relationship truth."
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
            } else if filteredSessions.isEmpty {
                WorkspaceRetrievalEmptyState(
                    title: appLanguage.text("No matching sessions"),
                    detail: appLanguage.text("Try a person, Pursuit, or question."),
                    accessibilityIdentifier: "agent-sessions-no-matches"
                )
            } else {
                List {
                    Section {
                        ForEach(filteredSessions) { session in
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
                    } header: {
                        WorkspaceRetrievalSectionHeader(
                            title: appLanguage.text("Recent"),
                            count: filteredSessions.count,
                            accessibilityIdentifier: "session-result-count"
                        )
                        .textCase(nil)
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

    private var filteredSessions: [AgentSession] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return sessions }
        return sessions.filter { session in
            [
                session.displayTitle(in: appLanguage),
                session.personDisplayLabel,
                session.displayContextLabel(in: appLanguage),
                session.latestPreview(in: appLanguage),
            ]
            .joined(separator: " ")
            .localizedCaseInsensitiveContains(needle)
        }
    }
}

private struct AgentSessionRow: View {
    let session: AgentSession
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            if !dynamicTypeSize.isAccessibilitySize {
                if session.isIdentityReview {
                    ZStack {
                        Circle()
                            .fill(Color.tsVermilion.opacity(0.12))
                            .frame(width: 46, height: 46)
                        Image(systemName: "person.crop.circle.badge.questionmark")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.tsVermilion)
                    }
                    .accessibilityHidden(true)
                } else {
                    RelationshipInitials(
                        initials: relationshipInitials(session.personDisplayLabel),
                        size: 46,
                        isEmphasized: session.isUnread
                    )
                    .accessibilityHidden(true)
                }
            }

            VStack(alignment: .leading, spacing: 5) {
                if dynamicTypeSize.isAccessibilitySize {
                    HStack(alignment: .firstTextBaseline) {
                        Text(compactRelativeTime)
                            .font(.caption2)
                            .monospacedDigit()
                            .foregroundStyle(Color.tsMutedInk)
                        Spacer()
                        if session.isUnread {
                            Label(
                                appLanguage.text("Unread", zhHans: "未读"),
                                systemImage: "circle.fill"
                            )
                            .font(.caption2)
                            .foregroundStyle(Color.tsVermilion)
                        }
                    }
                    Text(session.displayTitle(in: appLanguage))
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                        .lineLimit(nil)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier(
                            "agent-session-title-\(session.id.uuidString)"
                        )
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(session.displayTitle(in: appLanguage))
                            .font(.headline)
                            .foregroundStyle(Color.tsInk)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier(
                                "agent-session-title-\(session.id.uuidString)"
                            )
                        Spacer(minLength: 6)
                        Text(compactRelativeTime)
                            .font(.caption2)
                            .monospacedDigit()
                            .foregroundStyle(Color.tsMutedInk)
                            .accessibilityIdentifier(
                                "agent-session-time-\(session.id.uuidString)"
                            )
                    }
                }
                Text(
                    "\(session.personDisplayLabel) · \(session.displayContextLabel(in: appLanguage))"
                )
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                    .fixedSize(horizontal: false, vertical: true)
                Text(session.latestPreview(in: appLanguage))
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if session.isUnread && !dynamicTypeSize.isAccessibilitySize {
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
        .accessibilityValue(compactRelativeTime)
        .accessibilityIdentifier("agent-session-\(session.id.uuidString)")
    }

    private var compactRelativeTime: String {
        let interval = max(Date.now.timeIntervalSince(session.updatedAt), 0)
        if interval < 60 {
            return appLanguage.text("Now", zhHans: "刚刚")
        }
        if interval < 3_600 {
            let minutes = max(Int(interval / 60), 1)
            return appLanguage.text("\(minutes)m", zhHans: "\(minutes)分")
        }
        if interval < 86_400 {
            let hours = max(Int(interval / 3_600), 1)
            return appLanguage.text("\(hours)h", zhHans: "\(hours)时")
        }
        if interval < 604_800 {
            let days = max(Int(interval / 86_400), 1)
            return appLanguage.text("\(days)d", zhHans: "\(days)天")
        }
        return session.updatedAt.formatted(
            Date.FormatStyle()
                .month(.abbreviated)
                .day()
                .locale(appLanguage.locale)
        )
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
    let roles: (String) -> [WorkspacePersonRole]
    @Binding var selectedPersonID: String?
    let onOpenPursuit: (WorkspacePursuit) -> Void
    @State private var query = ""
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        Group {
            if let selectedPerson {
                WorkspacePersonDetailView(
                    person: selectedPerson,
                    roles: roles(selectedPerson.id),
                    onBack: { selectedPersonID = nil },
                    onOpenPursuit: { pursuitID in
                        guard let pursuit = snapshot.pursuit(id: pursuitID) else {
                            return
                        }
                        onOpenPursuit(pursuit)
                    }
                )
            } else {
                directory
            }
        }
        .onChange(of: snapshot.people.map(\.id)) { currentPersonIDs in
            guard let selectedPersonID,
                  !currentPersonIDs.contains(selectedPersonID) else { return }
            self.selectedPersonID = nil
        }
    }

    private var directory: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                WorkspaceSearchField(
                    query: $query,
                    placeholder: appLanguage.text("Search people"),
                    accessibilityIdentifier: "people-search"
                )
                .padding(.bottom, 8)

                if isPreview {
                    PursuitPreviewBoundary()
                }

                WorkspaceRetrievalSectionHeader(
                    title: appLanguage.text("Directory"),
                    count: filteredPeople.count,
                    accessibilityIdentifier: "people-result-count"
                )
                .padding(.top, 8)

                if filteredPeople.isEmpty {
                    WorkspaceRetrievalEmptyState(
                        title: appLanguage.text("No matching people"),
                        detail: appLanguage.text("Try a name, role, or Pursuit."),
                        accessibilityIdentifier: "people-no-matches"
                    )
                    .frame(minHeight: 280)
                } else {
                    ForEach(filteredPeople) { person in
                        Button { selectedPersonID = person.id } label: {
                            WorkspacePersonRow(
                                person: person,
                                roles: personRoles(person.id)
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("workspace-person-\(person.id)")
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .accessibilityIdentifier("relationship-people")
    }

    private var selectedPerson: WorkspacePerson? {
        selectedPersonID.flatMap { id in snapshot.people.first { $0.id == id } }
    }

    private func personRoles(_ personID: String) -> [String] {
        roles(personID).map { "\($0.roleType.humanized) · \($0.pursuitTitle)" }
    }

    private var filteredPeople: [WorkspacePerson] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return snapshot.people }
        return snapshot.people.filter { person in
            let profileText = person.profile?.headline ?? ""
            return ([person.displayLabel, profileText] + personRoles(person.id))
                .joined(separator: " ")
                .localizedCaseInsensitiveContains(needle)
        }
    }
}

private struct WorkspacePersonRow: View {
    let person: WorkspacePerson
    let roles: [String]
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            if !dynamicTypeSize.isAccessibilitySize {
                RelationshipInitials(
                    initials: relationshipInitials(person.displayLabel),
                    size: 48
                )
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(person.displayLabel)
                    .font(.custom("Georgia", size: 19, relativeTo: .headline))
                    .foregroundStyle(Color.tsInk)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                    .fixedSize(horizontal: false, vertical: true)
                if let profile = person.profile {
                    Text(profile.headline)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
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
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color.tsMutedInk)
                .frame(minHeight: 48)
        }
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.tsLine)
                .frame(height: 1)
        }
    }
}

private struct PursuitPreviewBoundary: View {
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        Label(
            appLanguage.text(
                "Preview data · changes are unavailable",
                zhHans: "预览数据 · 暂不能保存更改"
            ),
            systemImage: "eye"
        )
        .font(.caption2)
        .foregroundStyle(Color.tsMutedInk)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityIdentifier("workspace-preview-boundary")
    }
}

private struct WorkspaceSearchField: View {
    @Binding var query: String
    let placeholder: String
    let accessibilityIdentifier: String
    @FocusState private var isFocused: Bool
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Color.tsMutedInk)
                .accessibilityHidden(true)
            TextField(placeholder, text: $query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .padding(.vertical, 11)
                .focused($isFocused)
                .accessibilityIdentifier(accessibilityIdentifier)
            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.body)
                        .foregroundStyle(Color.tsMutedInk)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(appLanguage.text("Clear search"))
                .accessibilityIdentifier("\(accessibilityIdentifier)-clear")
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, query.isEmpty ? 14 : 0)
        .frame(minHeight: 46)
        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.tsInk.opacity(0.07), lineWidth: 1)
        }
        .contentShape(Rectangle())
        .onTapGesture { isFocused = true }
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("\(accessibilityIdentifier)-container")
    }
}

private struct WorkspaceRetrievalSectionHeader: View {
    let title: String
    let count: Int
    let accessibilityIdentifier: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title.uppercased())
                .font(.caption2.weight(.bold))
                .tracking(1.05)
                .foregroundStyle(Color.tsInk)
            Spacer()
            Text(verbatim: "\(count)")
                .font(.caption2)
                .monospacedDigit()
                .foregroundStyle(Color.tsMutedInk)
        }
        .frame(minHeight: 36)
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
        .accessibilityValue(String(count))
        .accessibilityIdentifier(accessibilityIdentifier)
    }
}

private struct WorkspaceRetrievalEmptyState: View {
    let title: String
    let detail: String
    let accessibilityIdentifier: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.title3)
                .foregroundStyle(Color.tsMutedInk)
                .accessibilityHidden(true)
            Text(title)
                .font(.headline)
                .foregroundStyle(Color.tsInk)
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(.horizontal, 24)
        .padding(.top, 42)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(accessibilityIdentifier)
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
    let backLabel: String?
    let onBack: (() -> Void)?
    let onOpenProposal: (WorkspaceProposal) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appLanguage) private var appLanguage
    @State private var completingActionID: String?
    @AccessibilityFocusState private var isHeadingFocused: Bool

    init(
        pursuit: WorkspacePursuit,
        snapshot: PursuitWorkspaceSnapshot?,
        currentUserID: String?,
        workspaceStore: PursuitWorkspaceStore,
        targetActionID: String? = nil,
        backLabel: String? = nil,
        onBack: (() -> Void)? = nil,
        onOpenProposal: @escaping (WorkspaceProposal) -> Void
    ) {
        _pursuit = State(initialValue: pursuit)
        self.snapshot = snapshot
        self.currentUserID = currentUserID
        self.workspaceStore = workspaceStore
        self.targetActionID = targetActionID
        self.backLabel = backLabel
        self.onBack = onBack
        self.onOpenProposal = onOpenProposal
    }

    var body: some View {
        Group {
            if onBack != nil {
                pursuitContent
            } else {
                NavigationStack {
                    pursuitContent
                        .navigationTitle(appLanguage.text("Pursuit"))
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button(
                                    appLanguage.text("Close"),
                                    action: dismiss.callAsFunction
                                )
                            }
                        }
                }
            }
        }
        .accessibilityIdentifier("pursuit-detail")
        .onChange(of: snapshot?.pursuit(id: pursuit.id)) { updatedPursuit in
            guard let updatedPursuit else { return }
            pursuit = updatedPursuit
        }
    }

    private var pursuitContent: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let onBack {
                        Button(action: onBack) {
                            Label(
                                backLabel ?? appLanguage.text("Back"),
                                systemImage: "chevron.left"
                            )
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.tsInk)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(
                            String(
                                format: appLanguage.text("Back to %@"),
                                locale: appLanguage.locale,
                                backLabel ?? appLanguage.text("workspace")
                            )
                        )
                        .accessibilityIdentifier("pursuit-detail-back")
                        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    }
                    RelationshipEyebrow(
                        String(
                            format: appLanguage.text("%1$@ · revision %2$lld"),
                            locale: appLanguage.locale,
                            appLanguage.workspaceValue(pursuit.status),
                            pursuit.revision
                        )
                    )
                        .padding(.top, onBack == nil ? 26 : 8)
                    Text(pursuit.title)
                        .font(.custom("Georgia", size: 32, relativeTo: .title))
                        .foregroundStyle(Color.tsInk)
                        .tracking(-0.6)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityFocused($isHeadingFocused)
                        .accessibilityIdentifier("pursuit-detail-title")
                        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    PursuitDefinitionSection(
                        title: appLanguage.text("Current frame"),
                        rows: [
                            (
                                appLanguage.text("Target outcome"),
                                pursuit.targetOutcome.workspacePhrase
                            ),
                            (
                                appLanguage.text("Target date"),
                                appLanguage.shortDate(pursuit.targetDate)
                            ),
                            (
                                appLanguage.text("Milestone"),
                                appLanguage.workspaceValue(pursuit.milestone)
                            ),
                            (
                                appLanguage.text("Current blocker"),
                                primaryGap?.title
                                    ?? appLanguage.text("No open blocker")
                            ),
                            (
                                appLanguage.text("Next action"),
                                primaryAction?.title
                                    ?? appLanguage.text(
                                        "No owned action awaiting outcome"
                                    )
                            ),
                        ],
                        accessibilityIdentifier: "pursuit-current-frame"
                    )

                    if ["partial", "unavailable"].contains(
                        pursuit.milestoneAuthority.evidenceState.availability
                    ) {
                        VStack(alignment: .leading, spacing: 8) {
                            Label(
                                appLanguage.text("Milestone source authority changed"),
                                systemImage: "exclamationmark.shield"
                            )
                            .font(.headline)
                            .foregroundStyle(Color.tsVermilion)
                            Text(String(
                                format: appLanguage.text(
                                    "The recruiter-confirmed decision and revision remain in history, but %@. Review or correct the milestone before treating it as current evidence-backed truth."
                                ),
                                locale: appLanguage.locale,
                                appLanguage.evidenceExplanation(
                                    pursuit.milestoneAuthority.evidenceState
                                ).lowercased()
                            ))
                            .font(.subheadline)
                            .foregroundStyle(Color.tsMutedInk)
                            .fixedSize(horizontal: false, vertical: true)
                            if let receiptID = pursuit.milestoneAuthority.receiptID {
                                Text(String(
                                    format: appLanguage.text("Decision receipt %@"),
                                    locale: appLanguage.locale,
                                    String(receiptID.prefix(8))
                                ))
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
                        RelationshipEyebrow(appLanguage.text("Waiting for review"))
                            .padding(.top, 30)
                        ForEach(pendingProposals) { proposal in
                            Button { onOpenProposal(proposal) } label: {
                                VStack(alignment: .leading, spacing: 7) {
                                    Text(proposal.summary)
                                        .font(.headline)
                                        .foregroundStyle(Color.tsInk)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Text(String(
                                        format: appLanguage.text(
                                            "%1$@ · %2$@ · base revision %3$lld"
                                        ),
                                        locale: appLanguage.locale,
                                        proposal.subjectDisplayLabel,
                                        appLanguage.workspaceValue(proposal.status),
                                        proposal.baseRevision
                                    ))
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
                                appLanguage.text("Proposal is out of date"),
                                systemImage: "clock.badge.exclamationmark"
                            )
                            .font(.headline)
                            .foregroundStyle(Color.tsVermilion)
                            Text(String(
                                format: appLanguage.text(
                                    "This Pursuit is now revision %lld. An older Proposal cannot be reviewed and has no execution authority. Current workspace readback will replace it."
                                ),
                                locale: appLanguage.locale,
                                currentPursuitRevision
                            ))
                            .font(.subheadline)
                            .foregroundStyle(Color.tsMutedInk)
                            .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14)
                        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 14))
                        .padding(.top, 24)
                        .accessibilityIdentifier("pursuit-stale-proposal")
                    }

                    RelationshipEyebrow(appLanguage.text("Open gaps"))
                        .padding(.top, 30)
                    if pursuit.gaps.filter({ $0.status == "open" }).isEmpty {
                        Text(appLanguage.text("No open gap is recorded."))
                            .font(.subheadline)
                            .foregroundStyle(Color.tsMutedInk)
                            .padding(.top, 12)
                    } else {
                        ForEach(pursuit.gaps.filter { $0.status == "open" }) { gap in
                            VStack(alignment: .leading, spacing: 7) {
                                Text(gap.title)
                                    .font(.headline)
                                    .foregroundStyle(Color.tsInk)
                                Text(
                                    "\(localizedTemporalAuthorityLabel(gap.basis)) · \(appLanguage.evidenceAttentionLabel(gap.basis.evidenceState))"
                                )
                                    .font(.caption)
                                    .foregroundStyle(
                                        gap.basis.evidenceState.availability == "available"
                                            ? Color.tsMutedInk
                                            : Color.tsVermilion
                                    )
                                Text(appLanguage.evidenceExplanation(gap.basis.evidenceState))
                                    .font(.caption2)
                                    .foregroundStyle(Color.tsMutedInk)
                                Text(gap.basis.summary)
                                    .font(.subheadline)
                                    .foregroundStyle(Color.tsMutedInk)
                                Text(String(
                                    format: appLanguage.text("Close when: %@"),
                                    locale: appLanguage.locale,
                                    gap.closeCondition
                                ))
                                    .font(.caption)
                                    .foregroundStyle(Color.tsMutedInk)
                            }
                            .padding(.vertical, 16)
                            .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
                        }
                    }

                    RelationshipEyebrow(appLanguage.text("Owned internal actions"))
                        .padding(.top, 30)
                    if let completion = recordedActionCompletion {
                        VStack(alignment: .leading, spacing: 8) {
                            Label(
                                appLanguage.text("Observed outcome recorded"),
                                systemImage: "checkmark.seal"
                            )
                                .font(.headline)
                            Text(completion.action.title)
                                .font(.subheadline.weight(.semibold))
                            Text(String(
                                format: appLanguage.text("Owner: %1$@ · %2$@"),
                                locale: appLanguage.locale,
                                completion.action.ownerDisplayName,
                                appLanguage.recordedDate(
                                    at: completion.result.receipt.occurredAt,
                                    sourceTimezone: TimeZone.current.identifier
                                )
                            ))
                                .font(.caption)
                                .foregroundStyle(Color.tsMutedInk)
                            Text(String(
                                format: appLanguage.text(
                                    "Canonical revision %1$lld → %2$lld"
                                ),
                                locale: appLanguage.locale,
                                completion.result.receipt.entityRef.beforeRevision,
                                completion.result.receipt.entityRef.afterRevision
                            ))
                                .font(.caption)
                                .foregroundStyle(Color.tsMutedInk)
                            DisclosureGroup(appLanguage.text("Audit details")) {
                                Text(String(
                                    format: appLanguage.text(
                                        "Operation %1$@ · receipt %2$@"
                                    ),
                                    locale: appLanguage.locale,
                                    String(completion.result.receipt.operationID.prefix(8)),
                                    String(completion.result.receipt.id.prefix(8))
                                ))
                                    .font(.caption2)
                                    .foregroundStyle(Color.tsMutedInk)
                            }
                            Label(
                                appLanguage.text(
                                    "No message, calendar event, or external write"
                                ),
                                systemImage: "lock.shield"
                            )
                                .font(.caption)
                                .foregroundStyle(Color.tsMutedInk)
                        }
                        .padding(14)
                        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 14))
                        .accessibilityIdentifier("pursuit-action-completion-receipt")
                    }
                    if pursuit.actions.isEmpty {
                        Text(appLanguage.text("No action is recorded."))
                            .font(.subheadline)
                            .foregroundStyle(Color.tsMutedInk)
                            .padding(.top, 12)
                    } else {
                        ForEach(pursuit.actions) { action in
                            VStack(alignment: .leading, spacing: 7) {
                                if action.id == targetActionID {
                                    Label(
                                        appLanguage.text("Referenced in Ask"),
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
                                Text(
                                    "\(appLanguage.workspaceValue(action.status)) · \(action.dueAt.map(appLanguage.shortDate) ?? appLanguage.text("No due date"))"
                                )
                                    .font(.caption)
                                    .foregroundStyle(Color.tsMutedInk)
                                Text(String(
                                    format: appLanguage.text("Owner: %@"),
                                    locale: appLanguage.locale,
                                    action.ownerDisplayName
                                ))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(Color.tsInk)
                                    .accessibilityIdentifier("pursuit-action-owner-\(action.id)")
                                if let outcome = action.outcomeSummary,
                                   let completedAt = action.completedAt {
                                    Text(String(
                                        format: appLanguage.text("Observed outcome: %@"),
                                        locale: appLanguage.locale,
                                        outcome
                                    ))
                                        .font(.subheadline)
                                        .foregroundStyle(Color.tsInk)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Text(appLanguage.recordedDate(
                                        at: completedAt,
                                        sourceTimezone: TimeZone.current.identifier
                                    ))
                                        .font(.caption2)
                                        .foregroundStyle(Color.tsMutedInk)
                                }
                                Label(
                                    action.externalEffects.isEmpty
                                        ? appLanguage.text(
                                            "No message, calendar event, or external write"
                                        )
                                        : appLanguage.text(
                                            "External effect requires separate verification"
                                        ),
                                    systemImage: "lock.shield"
                                )
                                .font(.caption)
                                .foregroundStyle(Color.tsMutedInk)

                                if !["completed", "cancelled"].contains(action.status),
                                   action.ownerUserID == currentUserID {
                                    if completingActionID == action.id {
                                        actionCompletionControls(for: action)
                                    } else {
                                        Button(appLanguage.text("Record observed outcome")) {
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

                    PursuitDefinitionSection(
                        title: appLanguage.text("Decision record"),
                        rows: [
                            (
                                appLanguage.text("Milestone authority"),
                                "\(appLanguage.workspaceValue(pursuit.milestoneAuthority.kind)) · \(appLanguage.evidenceAttentionLabel(pursuit.milestoneAuthority.evidenceState))"
                            ),
                            (appLanguage.text("Confirmed"), milestoneConfirmationSummary),
                            (
                                appLanguage.text("Pursuit type"),
                                appLanguage.workspaceValue(pursuit.type)
                            ),
                        ]
                    )
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
            .background(Color.tsSurface.ignoresSafeArea())
            .task {
                if onBack != nil {
                    await Task.yield()
                    isHeadingFocused = true
                }
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

    private var pendingProposals: [WorkspaceProposal] {
        workspaceStore.snapshot?.openProposals.filter {
            $0.pursuitID == pursuit.id
                && $0.baseRevision == currentPursuitRevision
        } ?? []
    }

    private var primaryGap: WorkspaceGap? {
        pursuit.gaps.first { $0.status == "open" }
    }

    private var primaryAction: WorkspaceAction? {
        let currentActions = pursuit.actions.filter {
            !["completed", "cancelled"].contains($0.status)
        }
        if let targetActionID,
           let targeted = currentActions.first(where: { $0.id == targetActionID }) {
            return targeted
        }
        return currentActions.first(where: { $0.ownerUserID == currentUserID })
            ?? currentActions.first
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
            actor = snapshot?.currentUserName ?? appLanguage.text("Current recruiter")
        } else if pursuit.milestoneAuthority.confirmedByUserID != nil {
            actor = appLanguage.text("Workspace member")
        } else {
            actor = appLanguage.text("Actor unavailable")
        }
        let confirmation = pursuit.milestoneAuthority.confirmedAt.map {
            appLanguage.recordedDate(
                at: $0,
                sourceTimezone: TimeZone.current.identifier
            )
        } ?? appLanguage.text("Time unavailable")
        return "\(actor) · \(confirmation)"
    }

    private func localizedTemporalAuthorityLabel(
        _ basis: WorkspaceGap.Basis
    ) -> String {
        if basis.kind == "evidence_supported",
           basis.evidenceState.availability != "available" {
            return appLanguage.text("Originally evidence-supported")
        }
        return appLanguage.workspaceValue(basis.kind)
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
                appLanguage.text(
                    "Recording with one saved recovery reference. Success waits for canonical readback."
                ),
                systemImage: "arrow.triangle.2.circlepath"
            )
            .font(.caption)
            .foregroundStyle(Color.tsMutedInk)
            .accessibilityIdentifier("pursuit-action-confirming")
        case let .unknownLocked(operationID):
            VStack(alignment: .leading, spacing: 10) {
                Label(
                    appLanguage.text("Outcome unknown — operation locked"),
                    systemImage: "exclamationmark.shield"
                )
                .font(.subheadline.weight(.semibold))
                Text(appLanguage.text(
                    "The saved recovery reference will be checked before another write is allowed."
                ))
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                DisclosureGroup(appLanguage.text("Audit details")) {
                    Text(String(
                        format: appLanguage.text("Recovery reference %@"),
                        locale: appLanguage.locale,
                        operationID.uuidString.lowercased()
                    ))
                        .font(.caption2)
                        .foregroundStyle(Color.tsMutedInk)
                }
                Button(appLanguage.text("Check canonical result")) {
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
            Text(appLanguage.text("Directly observed outcome"))
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsInk)
            TextField(
                appLanguage.text("What was directly observed?"),
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
                Button(appLanguage.text("Cancel")) {
                    workspaceStore.cancelActionCompletion(actionID: action.id)
                    completingActionID = nil
                }
                .frame(minHeight: 44)
                Button(appLanguage.text("Record outcome")) {
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
    var accessibilityIdentifier: String? = nil
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(spacing: 0) {
            RelationshipEyebrow(title)
                .accessibilityIdentifier(accessibilityIdentifier ?? "")
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 30)
                .padding(.bottom, 8)
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { entry in
                        definitionRow(entry)
                    }
                }
            } else {
                Grid(alignment: .leading, horizontalSpacing: 20, verticalSpacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { entry in
                        let row = entry.element
                        let rowIdentifier = rowIdentifier(entry.offset)
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

    private func definitionRow(
        _ entry: EnumeratedSequence<[(String, String)]>.Element
    ) -> some View {
        let row = entry.element
        let identifier = rowIdentifier(entry.offset)
        return VStack(alignment: .leading, spacing: 5) {
            Text(row.0)
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .accessibilityIdentifier("\(identifier)-label")
            Text(row.1)
                .font(.subheadline)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("\(identifier)-value")
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) {
            Divider().overlay(Color.tsLine)
        }
    }

    private func rowIdentifier(_ offset: Int) -> String {
        "definition-\(title.lowercased().replacingOccurrences(of: " ", with: "-"))-row-\(offset)"
    }
}

private struct WorkspacePersonDetailView: View {
    let person: WorkspacePerson
    let roles: [WorkspacePersonRole]
    let onBack: () -> Void
    let onOpenPursuit: (String) -> Void
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @AccessibilityFocusState private var isHeadingFocused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Button(action: onBack) {
                    Label(
                        appLanguage.text("Directory"),
                        systemImage: "chevron.left"
                    )
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(appLanguage.text("Back to People"))
                .accessibilityIdentifier("person-detail-back")
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)

                HStack(alignment: .top, spacing: 14) {
                    if !dynamicTypeSize.isAccessibilitySize {
                        RelationshipInitials(
                            initials: relationshipInitials(person.displayLabel),
                            size: 56
                        )
                    }
                    VStack(alignment: .leading, spacing: 7) {
                        Text(person.displayLabel)
                            .font(.custom("Georgia", size: 32, relativeTo: .title))
                            .foregroundStyle(Color.tsInk)
                            .tracking(-0.55)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                            .accessibilityFocused($isHeadingFocused)
                        if let profile = person.profile {
                            Text(profile.headline)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(Color.tsMutedInk)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(.top, 8)

                WorkspacePersonSectionHeader(appLanguage.text("Current work"))
                    .padding(.top, 28)
                if roles.isEmpty {
                    Text(appLanguage.text("No active Pursuit role is recorded."))
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)
                } else {
                    ForEach(roles) { role in
                        WorkspacePersonPursuitRow(role: role) {
                            onOpenPursuit(role.pursuitID)
                        }
                    }
                }

                if let profile = person.profile {
                    WorkspacePersonSectionHeader(appLanguage.text("About"))
                        .padding(.top, 28)
                    Text(profile.summary)
                        .font(.body)
                        .foregroundStyle(Color.tsInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)
                    Label(
                        appLanguage.text("Written by the workspace owner"),
                        systemImage: "person.crop.circle.badge.checkmark"
                    )
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .padding(.top, 10)
                }

                WorkspacePersonIdentitySection(person: person)
                    .padding(.top, 28)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
        .background(Color.tsSurface)
        .accessibilityIdentifier("workspace-person-detail")
        .task {
            await Task.yield()
            isHeadingFocused = true
        }
    }
}

private struct WorkspacePersonSectionHeader: View {
    let title: String

    init(_ title: String) {
        self.title = title
    }

    var body: some View {
        Text(title.uppercased())
            .font(.caption2.weight(.bold))
            .tracking(1.05)
            .foregroundStyle(Color.tsInk)
            .fixedSize(horizontal: false, vertical: true)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    }
}

private struct WorkspacePersonPursuitRow: View {
    let role: WorkspacePersonRole
    let action: () -> Void
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 7) {
                    Text(role.pursuitTitle)
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(role.targetOutcome.workspacePhrase)
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(role.roleType.humanized) · \(role.status.humanized)")
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                    Label(evidenceSummary, systemImage: evidenceIcon)
                        .font(.caption2)
                        .foregroundStyle(
                            role.evidenceState.availability == "unavailable"
                                ? Color.tsVermilion
                                : Color.tsMutedInk
                        )
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color.tsMutedInk)
                    .frame(minHeight: 44)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
        .accessibilityIdentifier("person-pursuit-\(role.pursuitID)")
    }

    private var evidenceIcon: String {
        switch role.evidenceState.availability {
        case "available": return "checkmark.seal"
        case "not_required": return "person.crop.circle.badge.checkmark"
        default: return "exclamationmark.triangle"
        }
    }

    private var evidenceSummary: String {
        switch role.evidenceState.availability {
        case "available":
            let count = role.evidenceState.availableReferenceCount
            let key = count == 1 ? "%lld reviewed source" : "%lld reviewed sources"
            return String(
                format: appLanguage.text(key),
                locale: appLanguage.locale,
                Int64(count)
            )
        case "partial":
            return String(
                format: appLanguage.text("%1$lld of %2$lld sources available"),
                locale: appLanguage.locale,
                Int64(role.evidenceState.availableReferenceCount),
                Int64(role.evidenceState.referenceCount)
            )
        case "not_required":
            return appLanguage.text("Recorded by the recruiter")
        default:
            return appLanguage.text("Source unavailable · review needed")
        }
    }
}

private struct WorkspacePersonIdentitySection: View {
    let person: WorkspacePerson
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WorkspacePersonSectionHeader(appLanguage.text("Governed identity"))
            identityRow(
                label: appLanguage.text("Sources"),
                value: person.captureCount,
                identifier: "definition-governed-identity-row-0"
            )
            identityRow(
                label: appLanguage.text("Identity clues"),
                value: person.confirmedIdentityCount,
                identifier: "definition-governed-identity-row-1"
            )
            identityRow(
                label: appLanguage.text("Contexts"),
                value: person.contextCount,
                identifier: "definition-governed-identity-row-2"
            )
        }
    }

    private func identityRow(
        label: String,
        value: Int,
        identifier: String
    ) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .accessibilityIdentifier("\(identifier)-label")
            Spacer(minLength: 12)
            Text(verbatim: "\(value)")
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(Color.tsInk)
                .accessibilityIdentifier("\(identifier)-value")
        }
        .padding(.vertical, 13)
        .overlay(alignment: .bottom) { Divider().overlay(Color.tsLine) }
    }
}

private struct RelationshipGuideRail: View {
    let onGuide: () -> Void
    let onCapture: () -> Void
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        HStack(spacing: 4) {
            Button(action: onCapture) {
                Image(systemName: "paperclip")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color.tsInk)
                    .frame(width: 44, height: 48)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                appLanguage.text("Add a conversation screenshot")
            )
            .accessibilityIdentifier("capture-relationship-moment")

            Button(action: onGuide) {
                HStack(spacing: 10) {
                    Text(
                        appLanguage.text("Tell the Agent anything…")
                    )
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(1)
                    Spacer(minLength: 6)
                    Image(systemName: "waveform")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.tsVermilion)
                }
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .padding(.trailing, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                appLanguage.text("Open the global Agent input")
            )
            .accessibilityIdentifier("relationship-guide")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background(Color.tsCanvas, in: Capsule())
        .overlay {
            Capsule().stroke(Color.tsInk.opacity(0.07), lineWidth: 1)
        }
        .shadow(color: Color.tsInk.opacity(0.055), radius: 18, y: 8)
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
        .background(Color.tsSurface.opacity(0.97))
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
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
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
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
    var isEmphasized = false

    var body: some View {
        Text(initials)
            .font(.custom("Georgia", fixedSize: size * 0.32))
            .foregroundStyle(isEmphasized ? Color.tsSurface : Color.tsMutedInk)
            .frame(width: size, height: size)
            .background(isEmphasized ? Color.tsInk : Color.tsCanvas, in: Circle())
            .overlay {
                if !isEmphasized {
                    Circle().stroke(Color.tsLine, lineWidth: 1)
                }
            }
            .accessibilityHidden(true)
    }
}

private func relationshipInitials(_ name: String) -> String {
    let parts = name.split(whereSeparator: \.isWhitespace)
    if parts.count > 1 {
        return parts.prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }
    return String(name.prefix(2)).uppercased()
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
        TalentSignalBrandMark()
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
