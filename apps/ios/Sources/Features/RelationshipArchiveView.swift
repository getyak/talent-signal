import Foundation
import SwiftUI

@MainActor
struct RelationshipArchiveView: View {
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var captureHandoff = CaptureHandoffStore.shared
    @StateObject private var captureIntentRouter = CaptureIntentRouter.shared
    @StateObject private var workspaceStore: PursuitWorkspaceStore
    @StateObject private var sessionStore: AgentSessionStore
    @State private var selectedPage: RelationshipArchivePage = .today
    @State private var retrievalIntentGeneration = 0
    @State private var sessionScrollPosition: UUID?
    @State private var peopleScrollPosition: String?
    @State private var sessionRestorationPosition: UUID?
    @State private var peopleRestorationPosition: String?
    @State private var presentedSheet: RelationshipArchiveSheet?
    @State private var askPresentation: RelationshipAskPresentation?
    @State private var capturePresentation: RelationshipCapturePresentation?
    @State private var intakePresentation: AgentIntakePresentation?
    @State private var isRelationshipCalendarPresented = false
    @State private var relationshipCalendarActivities: [RelationshipCalendarActivity] = []
    @State private var deferredIntakePresentation: AgentIntakePresentation?
    @State private var deferredArchiveSheet: RelationshipArchiveSheet?
    @State private var deferredAskPresentation: RelationshipAskPresentation?
    @State private var deferredCapturePresentation: RelationshipCapturePresentation?
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
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        let previewSnapshot: PursuitWorkspaceSnapshot
        if arguments.contains("--preview-long-people-list") {
            previewSnapshot = .previewLongPeople
        } else if arguments.contains("--preview-multi-context-person") {
            previewSnapshot = .previewMultiContextPerson
        } else {
            previewSnapshot = .preview
        }
        let previewSessionCount = arguments.contains("--preview-long-session-list")
            ? 50
            : 2
#else
        let previewSnapshot: PursuitWorkspaceSnapshot = .preview
        let previewSessionCount = 2
#endif
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
                } ?? UserDefaultsPursuitActionCompletionStore(),
                previewSnapshot: previewSnapshot
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
            resolvedSessionStore = AgentSessionStore.preview(
                snapshot: previewSnapshot,
                sessionCount: previewSessionCount
            )
        } else {
            let canonicalStore = AgentSessionStore(
                persistence: session?.accountID.map {
                    FileAgentSessionPersistence(accountID: $0)
                }
            )
            if ProcessInfo.processInfo.arguments.contains(
                "--reset-agent-sessions"
            ) {
                _ = canonicalStore.deleteAll()
            }
            resolvedSessionStore = canonicalStore
        }
#else
        if resolvedService == nil {
            resolvedSessionStore = AgentSessionStore.preview(
                snapshot: previewSnapshot,
                sessionCount: previewSessionCount
            )
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
                .id(retrievalIntentGeneration)
        }
        .overlay(alignment: .top) {
            if let notice = workspaceStore.refreshNotice {
                PursuitWorkspaceRefreshNotice(message: notice)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
#if DEBUG
        .overlay(alignment: .bottomTrailing) {
            if ProcessInfo.processInfo.arguments.contains(
                "--fixture-record-retrieval-anchor"
            ) {
                Text(sessionScrollPosition?.uuidString.lowercased() ?? "none")
                    .font(.system(size: 1))
                    .foregroundStyle(Color.clear)
                    .frame(width: 1, height: 1)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(appLanguage.text("Session scroll anchor"))
                    .accessibilityValue(
                        sessionScrollPosition?.uuidString.lowercased() ?? "none"
                    )
                    .accessibilityIdentifier("session-scroll-anchor-probe")
                Text(peopleScrollPosition ?? "none")
                    .font(.system(size: 1))
                    .foregroundStyle(Color.clear)
                    .frame(width: 1, height: 1)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(appLanguage.text("People scroll anchor"))
                    .accessibilityValue(peopleScrollPosition ?? "none")
                    .accessibilityIdentifier("people-scroll-anchor-probe")
            }
        }
#endif
        .safeAreaInset(edge: .top, spacing: 0) {
            RelationshipArchiveHeader(
                selectedPage: Binding(
                    get: { selectedPage },
                    set: { selectedPage in
                        selectPage(selectedPage)
                    }
                ),
                onOpenMenu: {
                    clearTransientRetrievalIntent()
                    presentedSheet = .menu
                },
                onOpenCalendar: {
                    clearTransientRetrievalIntent()
                    isRelationshipCalendarPresented = true
                }
            )
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            RelationshipGuideRail(
                onGuide: {
                    clearTransientRetrievalIntent()
                    askPresentation = .init(
                        sessionID: nil,
                        seed: nil,
                        preferredPersonID: nil,
                        preferredPersonLabel: nil,
                        entryMode: .text
                    )
                },
                onAttach: {
                    clearTransientRetrievalIntent()
                    askPresentation = .init(
                        sessionID: nil,
                        seed: nil,
                        preferredPersonID: nil,
                        preferredPersonLabel: nil,
                        entryMode: .attachment
                    )
                },
                onVoice: {
                    clearTransientRetrievalIntent()
                    askPresentation = .init(
                        sessionID: nil,
                        seed: nil,
                        preferredPersonID: nil,
                        preferredPersonLabel: nil,
                        entryMode: .voice
                    )
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
        .sheet(item: $askPresentation, onDismiss: completeDeferredTransition) { presentation in
            if let snapshot = workspaceStore.snapshot {
                RelationshipAskView(
                    snapshot: snapshot,
                    isCanonical: workspaceStore.isCanonical,
                    workspaceStore: workspaceStore,
                    sessionStore: sessionStore,
                    sessionID: presentation.sessionID,
                    initialSeed: presentation.seed,
                    preferredPersonID: presentation.preferredPersonID,
                    preferredPersonLabel: presentation.preferredPersonLabel,
                    initialEntryMode: presentation.entryMode,
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
                        askPresentation = nil
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
                        askPresentation = nil
                    },
                    onOpenPerson: { personID in
                        guard let currentSnapshot = workspaceStore.snapshot,
                              let person = currentSnapshot.people.first(where: {
                                $0.id == personID
                              }) else { return }
                        deferredArchiveSheet = .workspacePerson(
                            person,
                            roles(for: person.id, in: currentSnapshot)
                        )
                        askPresentation = nil
                    },
                    voiceTranscriber: composerVoiceTranscriber
                )
            } else {
                PursuitWorkspaceLoadingView()
            }
        }
        .fullScreenCover(
            item: $capturePresentation,
            onDismiss: completeDeferredTransition
        ) { presentation in
            switch presentation {
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
            onDismiss: {
                reloadRelationshipCalendarActivities()
                completeDeferredTransition()
            }
        ) {
            if let snapshot = workspaceStore.snapshot {
                RelationshipCalendarView(
                    snapshot: snapshot,
                    isPreview: !workspaceStore.isCanonical,
                    initialActivities: relationshipCalendarActivities,
                    onPrepare: stageCalendarPreparation
                )
            } else {
                PursuitWorkspaceLoadingView()
            }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else {
                clearTransientRetrievalIntent()
                return
            }
            Task {
                sessionStore.pruneExpired()
                reloadRelationshipCalendarActivities()
                await revalidateSessionEvidence()
            }
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
            case .hub, .foregroundAudio:
                intakePresentation = .init(initialDestination: request.destination)
            case .latestProposal:
                if let proposal = workspaceStore.snapshot?.openProposals.first {
                    presentedSheet = .proposal(proposal)
                }
            case let .pursuit(id):
                if let pursuit = workspaceStore.snapshot?.pursuits.first(where: { $0.id == id }) {
                    presentedSheet = .pursuit(pursuit)
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
                intakePresentation = .init(initialDestination: nil)
            }
        }
        .task {
            await workspaceStore.load()
            reloadRelationshipCalendarActivities()
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
                if selectedPage == .today {
                    archivePage(.today) {
                        PursuitTodayView(
                            snapshot: snapshot,
                            isPreview: !workspaceStore.isCanonical,
                            calendarActivities: relationshipCalendarActivities,
                            unreadSessions: sessionStore.unreadSessions,
                            actionRecovery: workspaceStore.latestActionRecovery(
                                in: snapshot
                            ),
                            onOpenSession: openSession,
                            onOpenCalendar: {
                                clearTransientRetrievalIntent()
                                isRelationshipCalendarPresented = true
                            },
                            onOpenAttention: openAttention,
                            onOpenPursuit: { presentedSheet = .pursuit($0) },
                            onOpenActionRecovery: { pursuitID in
                                guard let pursuit = snapshot.pursuit(id: pursuitID) else {
                                    return
                                }
                                presentedSheet = .pursuit(pursuit)
                            }
                        )
                    }
                } else if selectedPage == .sessions {
                    archivePage(.sessions) {
                        AgentSessionListView(
                            sessions: sessionStore.sessions,
                            isPreview: !workspaceStore.isCanonical,
                            persistenceNotice: sessionStore.persistenceNotice,
                            restorationPosition: sessionRestorationPosition,
                            scrollPosition: Binding(
                                get: { sessionScrollPosition },
                                set: { newPosition in
                                    if let newPosition {
                                        sessionScrollPosition = newPosition
                                    }
                                }
                            ),
                            onOpen: openSession,
                            onMarkRead: sessionStore.markRead,
                            onMarkUnread: sessionStore.markUnread,
                            onDelete: sessionStore.delete
                        )
                    }
                } else {
                    archivePage(.people) {
                        WorkspacePeopleView(
                            snapshot: snapshot,
                            isPreview: !workspaceStore.isCanonical,
                            restorationPosition: peopleRestorationPosition,
                            scrollPosition: Binding(
                                get: { peopleScrollPosition },
                                set: { newPosition in
                                    if let newPosition {
                                        peopleScrollPosition = newPosition
                                    }
                                }
                            ),
                            onSelect: { person in
                                presentedSheet = .workspacePerson(
                                    person,
                                    roles(for: person.id, in: snapshot)
                                )
                            },
                            onAsk: askAboutPerson
                        )
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .animation(
                reduceMotion ? nil : .easeInOut(duration: 0.18),
                value: selectedPage
            )
        }
    }

    @ViewBuilder
    private func archivePage<Content: View>(
        _ page: RelationshipArchivePage,
        @ViewBuilder content: () -> Content
    ) -> some View {
        content()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .transition(reduceMotion ? .identity : .opacity)
    }

    private func openSession(_ session: AgentSession) {
        clearTransientRetrievalIntent()
        sessionStore.markRead(session.id)
        askPresentation = .init(
            sessionID: session.id,
            seed: nil,
            preferredPersonID: nil,
            preferredPersonLabel: nil,
            entryMode: .text
        )
    }

    private func askAboutPerson(_ person: WorkspacePerson) {
        clearTransientRetrievalIntent()
        askPresentation = .init(
            sessionID: nil,
            seed: nil,
            preferredPersonID: person.id,
            preferredPersonLabel: person.displayLabel,
            entryMode: .text
        )
    }

    private func selectPage(_ page: RelationshipArchivePage) {
        guard page != selectedPage else {
            clearTransientRetrievalIntent()
            return
        }
        captureRetrievalPositions()
        selectedPage = page
    }

    private func clearTransientRetrievalIntent() {
        captureRetrievalPositions()
        retrievalIntentGeneration &+= 1
    }

    private func captureRetrievalPositions() {
        sessionRestorationPosition = sessionScrollPosition
        peopleRestorationPosition = peopleScrollPosition
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
            deferredAskPresentation = .init(
                sessionID: matchingSession.id,
                seed: nil,
                preferredPersonID: nil,
                preferredPersonLabel: nil,
                entryMode: .text
            )
        } else {
            deferredAskPresentation = .init(
                sessionID: nil,
                seed: .meetingPreparation(
                    personID: activity.personID,
                    relationshipContextID: activity.relationshipContextID,
                    suggestedObjective: objective
                ),
                preferredPersonID: nil,
                preferredPersonLabel: nil,
                entryMode: .text
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

    private func reloadRelationshipCalendarActivities() {
        guard let snapshot = workspaceStore.snapshot else {
            relationshipCalendarActivities = []
            return
        }
        let projected = RelationshipCalendarProjection.activities(
            snapshot: snapshot,
            isPreview: !workspaceStore.isCanonical
        )
        let stored: [RelationshipCalendarActivity]
        if workspaceStore.isCanonical {
            stored = (try? FileRelationshipCalendarActivityStore(
                accountID: snapshot.workspaceID
            ).activities(in: snapshot)) ?? []
        } else {
            stored = []
        }
        var merged = projected
        for activity in stored where !merged.contains(where: { $0.id == activity.id }) {
            merged.append(activity)
        }
        relationshipCalendarActivities = merged.sorted { $0.startDate < $1.startDate }
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
        if let deferredAskPresentation {
            askPresentation = deferredAskPresentation
            self.deferredAskPresentation = nil
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
            deferredAskPresentation = .init(
                sessionID: nil,
                seed: seed,
                preferredPersonID: nil,
                preferredPersonLabel: nil,
                entryMode: .text
            )
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

private struct RelationshipAskPresentation: Identifiable {
    let id = UUID()
    let sessionID: UUID?
    let seed: AgentSessionSeed?
    let preferredPersonID: String?
    let preferredPersonLabel: String?
    let entryMode: RelationshipAskEntryMode
}

private enum RelationshipCapturePresentation: Identifiable {
    case screenshot

    var id: String {
        switch self {
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
    let onOpenCalendar: () -> Void
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var selectionNamespace

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onOpenMenu) {
                ZStack {
                    Color.clear
                    RelationshipSignalOrb()
                        .frame(width: 36, height: 36)
                }
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(width: 44, height: 44)
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
                                    .frame(height: 38)
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
                        .frame(minHeight: 44)
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

            Button(action: onOpenCalendar) {
                ZStack {
                    Color.clear
                    Image(systemName: "calendar")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                }
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(width: 44, height: 44)
            .accessibilityLabel(
                appLanguage.text(
                    "Open relationship calendar",
                    zhHans: "打开关系日历"
                )
            )
            .accessibilityIdentifier("today-calendar-peek")
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
    let calendarActivities: [RelationshipCalendarActivity]
    let unreadSessions: [AgentSession]
    let actionRecovery: PursuitActionRecoveryItem?
    let onOpenSession: (AgentSession) -> Void
    let onOpenCalendar: () -> Void
    let onOpenAttention: (PursuitAttentionItem) -> Void
    let onOpenPursuit: (WorkspacePursuit) -> Void
    let onOpenActionRecovery: (String) -> Void
    @State private var showsAllAttention = false
    @State private var decisionStates: [String: TodayInlineDecisionStatus] = [:]
    @State private var decisionOverrides: [String: TodayInlineDecision] = [:]
    @State private var expandedEvidenceDecisionID: String?
    @State private var editingDecision: TodayInlineDecision?
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    RelationshipEyebrow(formattedToday, color: .tsInk)
                    Spacer(minLength: 8)
                    if isPreview {
                        PursuitPreviewBoundary(compact: true)
                    }
                }
                Text(appLanguage.text("Today", zhHans: "今天"))
                    .font(.custom("Georgia", size: 38, relativeTo: .largeTitle))
                    .foregroundStyle(Color.tsInk)
                    .tracking(-1.1)
                    .padding(.top, 5)

                if !calendarActivities.isEmpty {
                    TodayRelationshipCalendarPeek(
                        activities: calendarActivities,
                        onOpen: onOpenCalendar
                    )
                    .padding(.top, 14)
                }

                if isPreview {
                    previewDecisionContent
                } else {
                    canonicalAttentionContent
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .accessibilityIdentifier(
            isPreview ? "editorial-today" : "canonical-pursuit-today"
        )
        .sheet(item: $editingDecision) { decision in
            TodayInlineDecisionEditor(decision: decision) { updated in
                decisionOverrides[decision.id] = updated
                editingDecision = nil
            }
        }
    }

    private var previewDecisionContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(
                String(
                    format: appLanguage.text("Needs your decision · %d"),
                    locale: appLanguage.locale,
                    pendingDecisionCount
                )
            )
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.tsMutedInk)
            .padding(.top, 24)
            .accessibilityIdentifier("today-attention-summary")

            ForEach(Array(previewDecisions.enumerated()), id: \.element.id) {
                index,
                decision in
                let current = decisionOverrides[decision.id] ?? decision
                let state = decisionStates[decision.id] ?? .pending
                TodayInlineDecisionCard(
                    decision: current,
                    status: state,
                    showsEvidence: expandedEvidenceDecisionID == decision.id,
                    onApprove: {
                        decisionStates[decision.id] = .approved
                        expandedEvidenceDecisionID = nil
                    },
                    onEdit: { editingDecision = current },
                    onDismiss: {
                        decisionStates[decision.id] = .dismissed
                        expandedEvidenceDecisionID = nil
                    },
                    onToggleEvidence: {
                        expandedEvidenceDecisionID = expandedEvidenceDecisionID == decision.id
                            ? nil
                            : decision.id
                    },
                    onRestore: { decisionStates[decision.id] = .pending }
                )
                .padding(.top, index == 0 ? 12 : 10)
                .accessibilityIdentifier(
                    index == 0 ? "today-focus" : "today-inline-decision-\(decision.id)"
                )
            }

            if let firstAttention = attentionItems.first {
                Button { openPrimary(firstAttention) } label: {
                    HStack(spacing: 8) {
                        Text(
                            String(
                                format: appLanguage.text("%d more to handle later"),
                                locale: appLanguage.locale,
                                attentionItems.count
                            )
                        )
                        .font(.caption)
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                    }
                    .foregroundStyle(Color.tsMutedInk)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
                .accessibilityIdentifier(
                    firstAttention.kind == .review
                        ? "today-review-proposal-\(firstAttention.pursuitID)"
                        : "today-attention-pursuit-\(firstAttention.pursuitID)"
                )
            }
        }
    }

    @ViewBuilder
    private var canonicalAttentionContent: some View {
        if !attentionItems.isEmpty || actionRecovery != nil {
                    Text(summary)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .padding(.top, 6)
                        .accessibilityIdentifier("today-attention-summary")
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

        if let actionRecovery = attentionRecovery {
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
            if attentionRecovery == nil {
                PursuitNoActionView()
                    .padding(.top, topWorkSpacing)
            }
        } else if let focus = attentionItems.first {
                    Text(
                        appLanguage.text(
                            "People needing attention",
                            zhHans: "需要关注的人"
                        )
                    )
                    .font(.caption.weight(.bold))
                    .tracking(1.1)
                    .foregroundStyle(Color.tsMutedInk)
                    .padding(.top, topWorkSpacing)

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
                    .padding(.top, 6)

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
    }

    private var previewDecisions: [TodayInlineDecision] {
        TodayInlineDecision.preview(in: appLanguage)
    }

    private var pendingDecisionCount: Int {
        previewDecisions.filter {
            (decisionStates[$0.id] ?? .pending) == .pending
        }.count
    }

    private var summary: String {
        let total = attentionItems.count
            + unreadSessions.count
            + (attentionRecovery == nil ? 0 : 1)
        if total == 0 {
            return ""
        }
        return appLanguage.text(
            "\(total) to consider",
            zhHans: "\(total) 件待判断"
        )
    }

    private var topWorkSpacing: CGFloat {
        unreadSessions.isEmpty && attentionRecovery == nil ? 34 : 24
    }

    private var formattedToday: String {
        if appLanguage.usesSimplifiedChinese() {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "zh-Hans")
            formatter.dateFormat = "M月d日 · EEE"
            return formatter.string(from: .now)
        }
        return Date.now.formatted(
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
        guard let actionRecovery = attentionRecovery else { return snapshot.todayItems }
        return snapshot.todayItems.filter {
            $0.pursuitID != actionRecovery.pursuitID
        }
    }

    private var attentionRecovery: PursuitActionRecoveryItem? {
        return actionRecovery
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

}

private enum TodayInlineDecisionStatus: Equatable {
    case pending
    case approved
    case dismissed
}

private struct TodayInlineDecision: Identifiable, Equatable {
    enum Kind: Equatable {
        case contact
        case calendar

        func title(in language: AppLanguage) -> String {
            switch self {
            case .contact:
                return language.usesSimplifiedChinese() ? "联系人" : "Contact"
            case .calendar:
                return language.usesSimplifiedChinese() ? "日程" : "Calendar"
            }
        }

        func destination(in language: AppLanguage) -> String {
            switch self {
            case .contact:
                return language.text("Contacts")
            case .calendar:
                return language.text("Apple Calendar")
            }
        }
    }

    let id: String
    let kind: Kind
    var question: String
    var effectPrimary: String
    var effectSecondary: String
    let evidenceLabel: String
    let evidenceQuote: String

    static func preview(in language: AppLanguage) -> [TodayInlineDecision] {
        [
            TodayInlineDecision(
                id: "preview-contact",
                kind: .contact,
                question: language.text("Add Maya Ortiz?"),
                effectPrimary: "maya@example.test",
                effectSecondary: language.text("Create new contact"),
                evidenceLabel: language.text("Conversation evidence · 1"),
                evidenceQuote: "Maya Ortiz · maya@example.test"
            ),
            TodayInlineDecision(
                id: "preview-calendar",
                kind: .calendar,
                question: language.text("Add a video call with Alex Chen?"),
                effectPrimary: language.text("Tomorrow 15:00–15:30"),
                effectSecondary: language.text(
                    "Singapore time · Apple Calendar"
                ),
                evidenceLabel: language.text("Conversation evidence · 1"),
                evidenceQuote: language.text(
                    "Tomorrow at 3pm Singapore time works for a 30-minute video call."
                )
            ),
        ]
    }
}

private struct TodayInlineDecisionCard: View {
    let decision: TodayInlineDecision
    let status: TodayInlineDecisionStatus
    let showsEvidence: Bool
    let onApprove: () -> Void
    let onEdit: () -> Void
    let onDismiss: () -> Void
    let onToggleEvidence: () -> Void
    let onRestore: () -> Void

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if status == .pending {
                proposal
            } else {
                receipt
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            Color.tsCanvas,
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.tsLine, lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
    }

    private var proposal: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(decision.kind.title(in: appLanguage))
                .font(.caption.weight(.bold))
                .tracking(0.8)
                .foregroundStyle(Color.tsVermilion)

            Text(decision.question)
                .font(.custom("Georgia", size: 23, relativeTo: .title3))
                .foregroundStyle(Color.tsInk)
                .tracking(-0.35)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)

            VStack(alignment: .leading, spacing: 0) {
                effectCopy
            }
                .padding(.top, 7)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("today-decision-effect-\(decision.id)")

            Button(action: onToggleEvidence) {
                HStack(spacing: 10) {
                    Image(systemName: "text.bubble")
                        .font(.subheadline.weight(.semibold))
                        .accessibilityHidden(true)
                    Text(decision.evidenceLabel)
                        .font(.caption)
                    Spacer(minLength: 8)
                    Image(systemName: showsEvidence ? "chevron.up" : "chevron.right")
                        .font(.caption.weight(.semibold))
                        .accessibilityHidden(true)
                }
                .foregroundStyle(Color.tsMutedInk)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
            .accessibilityLabel(decision.evidenceLabel)
            .accessibilityValue(
                appLanguage.text(showsEvidence ? "Expanded" : "Collapsed")
            )
            .accessibilityIdentifier("today-decision-evidence-\(decision.id)")

            if showsEvidence {
                Text(verbatim: "“\(decision.evidenceQuote)”")
                    .font(.caption)
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        Color.tsEvidence,
                        in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                    )
                    .padding(.bottom, 8)
                    .accessibilityIdentifier(
                        "today-decision-evidence-quote-\(decision.id)"
                    )
            }

            Divider().overlay(Color.tsLine)
            decisionActions
                .padding(.top, 10)
        }
    }

    @ViewBuilder
    private var decisionActions: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: 8) {
                approveButton
                editButton
                dismissButton
            }
        } else {
            HStack(spacing: 9) {
                approveButton
                editButton
                dismissButton
            }
        }
    }

    @ViewBuilder
    private var effectCopy: some View {
        if decision.kind == .calendar {
            VStack(alignment: .leading, spacing: 3) {
                Text(decision.effectPrimary)
                Text(decision.effectSecondary)
                    .foregroundStyle(Color.tsMutedInk.opacity(0.88))
            }
            .font(.subheadline)
            .foregroundStyle(Color.tsMutedInk)
            .fixedSize(horizontal: false, vertical: true)
        } else {
            Text(verbatim: "\(decision.effectPrimary) · \(decision.effectSecondary)")
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var approveButton: some View {
        Button(action: onApprove) {
            Text(appLanguage.text("Add"))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.tsSurface)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(
                    Color.tsInk,
                    in: RoundedRectangle(cornerRadius: 13, style: .continuous)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            String(
                format: appLanguage.text("Approve this %@ proposal"),
                locale: appLanguage.locale,
                decision.kind.title(in: appLanguage).lowercased()
            )
        )
        .accessibilityHint(
            appLanguage.text(
                "Records a preview decision only. No external write occurs."
            )
        )
        .accessibilityIdentifier("today-decision-add-\(decision.id)")
    }

    private var editButton: some View {
        Button(action: onEdit) {
            Text(appLanguage.usesSimplifiedChinese() ? "编辑" : "Edit")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.tsInk)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(
                    Color.tsCanvas,
                    in: RoundedRectangle(cornerRadius: 13, style: .continuous)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .stroke(Color.tsInk.opacity(0.72), lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("today-decision-edit-\(decision.id)")
    }

    private var dismissButton: some View {
        Button(role: .destructive, action: onDismiss) {
            Text(appLanguage.usesSimplifiedChinese() ? "忽略" : "Dismiss")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Color.tsMutedInk)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("today-decision-dismiss-\(decision.id)")
    }

    private var receipt: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(
                systemName: status == .approved
                    ? "checkmark.circle.fill"
                    : "minus.circle"
            )
            .font(.title3)
            .foregroundStyle(
                status == .approved ? Color.tsConfirmed : Color.tsMutedInk
            )
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(
                    status == .approved
                        ? appLanguage.text("Preview decision recorded")
                        : appLanguage.text("Proposal dismissed")
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.tsInk)
                .accessibilityIdentifier(
                    "today-decision-receipt-\(decision.id)"
                )
                Text(
                    String(
                        format: appLanguage.text("No write was made to %@."),
                        locale: appLanguage.locale,
                        decision.kind.destination(in: appLanguage)
                    )
                )
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
            }

            Spacer(minLength: 8)

            Button(action: onRestore) {
                Text(appLanguage.text("Undo"))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
                .buttonStyle(.plain)
                .accessibilityIdentifier("today-decision-restore-\(decision.id)")
        }
    }
}

private struct TodayInlineDecisionEditor: View {
    let decision: TodayInlineDecision
    let onSave: (TodayInlineDecision) -> Void

    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dismiss) private var dismiss
    @State private var question: String
    @State private var effectPrimary: String
    @State private var effectSecondary: String

    init(
        decision: TodayInlineDecision,
        onSave: @escaping (TodayInlineDecision) -> Void
    ) {
        self.decision = decision
        self.onSave = onSave
        _question = State(initialValue: decision.question)
        _effectPrimary = State(initialValue: decision.effectPrimary)
        _effectSecondary = State(initialValue: decision.effectSecondary)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(appLanguage.text("Proposal")) {
                    TextField(
                        appLanguage.text("Decision question"),
                        text: $question,
                        axis: .vertical
                    )
                    .accessibilityIdentifier("today-decision-editor-question")
                }

                Section(appLanguage.text("Exact effect")) {
                    TextField(
                        appLanguage.text("Primary detail"),
                        text: $effectPrimary,
                        axis: .vertical
                    )
                    .accessibilityIdentifier("today-decision-editor-primary")
                    TextField(
                        appLanguage.text("Destination"),
                        text: $effectSecondary,
                        axis: .vertical
                    )
                    .accessibilityIdentifier("today-decision-editor-secondary")
                }

                Section {
                    Text(
                        appLanguage.text(
                            "Editing changes this proposal only. The preview cannot write to an external app."
                        )
                    )
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                }
            }
            .navigationTitle(appLanguage.text("Edit proposal"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(appLanguage.text("Cancel")) {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(appLanguage.text("Save")) {
                        var updated = decision
                        updated.question = question.trimmingCharacters(
                            in: .whitespacesAndNewlines
                        )
                        updated.effectPrimary = effectPrimary.trimmingCharacters(
                            in: .whitespacesAndNewlines
                        )
                        updated.effectSecondary = effectSecondary.trimmingCharacters(
                            in: .whitespacesAndNewlines
                        )
                        onSave(updated)
                    }
                    .disabled(!canSave)
                    .accessibilityIdentifier("today-decision-editor-save")
                }
            }
        }
        .accessibilityIdentifier("today-decision-editor")
    }

    private var canSave: Bool {
        !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !effectPrimary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !effectSecondary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
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
                    Text(appLanguage.dueDate(due))
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
                if let evidence = localizedEvidenceSummary {
                    Label(evidence, systemImage: "link")
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

    private var localizedEvidenceSummary: String? {
        if let observedAt = item.evidenceObservedAt {
            return shortEvidence(
                appLanguage.evidenceFreshness(
                    observedAt: observedAt,
                    sourceTimezone: item.evidenceSourceTimezone
                )
            )
        }
        return item.evidenceState.map(appLanguage.evidenceExplanation)
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
                            [
                                item.owner,
                                item.due.map { appLanguage.dueDate($0) }
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
                    Text(appLanguage.dueDate(due))
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
                    value: "\(owner)\(item.due.map { appLanguage.dueDate($0, prefixed: true) } ?? "")"
                )
            }
            if let blocker = item.blocker {
                TodayDecisionContextLine(
                    label: appLanguage.text("Blocker", zhHans: "阻碍"),
                    value: blocker
                )
            }
            if let evidenceFreshness = localizedEvidenceSummary {
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

    private var localizedEvidenceSummary: String? {
        if let observedAt = item.evidenceObservedAt {
            return appLanguage.evidenceFreshness(
                observedAt: observedAt,
                sourceTimezone: item.evidenceSourceTimezone
            )
        }
        return item.evidenceState.map(appLanguage.evidenceExplanation)
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
    let restorationPosition: UUID?
    @Binding var scrollPosition: UUID?
    let onOpen: (AgentSession) -> Void
    let onMarkRead: (UUID) -> Void
    let onMarkUnread: (UUID) -> Void
    let onDelete: (UUID) -> Bool
    @Environment(\.appLanguage) private var appLanguage
    @State private var presentedAlert: AgentSessionAlert?
    @State private var isRestoringScroll = false

    var body: some View {
        VStack(spacing: 0) {
            if isPreview {
                PursuitPreviewBoundary()
                    .padding(.horizontal, 20)
                    .padding(.top, 14)
                    .padding(.bottom, 6)
            }

            if let persistenceNotice {
                Label(persistenceNotice, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .padding(.horizontal, 20)
                    .padding(.top, isPreview ? 0 : 14)
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
                        appLanguage.text("Use the field below to begin.")
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
                sessionList
            }
        }
        .background(Color.tsSurface)
        .alert(item: $presentedAlert) { alert in
            switch alert {
            case let .delete(session):
                return Alert(
                    title: Text(
                        appLanguage.text("Delete this session history from this device?")
                    ),
                    message: Text(
                        appLanguage.text(
                            "This deletes this session’s local messages, Agent responses, and receipts. Saved drafts, People, Pursuits, and workspace evidence stay unchanged."
                        )
                    ),
                    primaryButton: .destructive(
                        Text(
                            appLanguage.text("Delete session history from this device")
                        )
                    ) {
                        guard !onDelete(session.id) else {
                            if scrollPosition == session.id {
                                scrollPosition = nil
                            }
                            return
                        }
                        Task { @MainActor in
                            await Task.yield()
                            presentedAlert = .failure
                        }
                    },
                    secondaryButton: .cancel(
                        Text(appLanguage.text("Cancel"))
                    )
                )
            case .failure:
                return Alert(
                    title: Text(
                        appLanguage.text("Session history was not deleted")
                    ),
                    message: Text(
                        appLanguage.text(
                            "The local save failed, so the original session is still here. Nothing was removed."
                        )
                    ),
                    dismissButton: .cancel(
                        Text(appLanguage.text("OK"))
                    )
                )
            }
        }
    }

    private var sessionList: some View {
        ScrollViewReader { proxy in
            sessionListContent
                .onAppear {
                    guard let restorationPosition else { return }
                    isRestoringScroll = true
                    DispatchQueue.main.async {
                        withAnimation(nil) {
                            proxy.scrollTo(restorationPosition, anchor: .top)
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                            scrollPosition = restorationPosition
                            isRestoringScroll = false
                        }
                    }
                }
        }
    }

    private var sessionListContent: some View {
        List {
                    ForEach(sessions) { session in
                        Button { onOpen(session) } label: {
                            AgentSessionRow(session: session)
                        }
                        .buttonStyle(RelationshipRetrievalButtonStyle())
                        .background {
                            GeometryReader { proxy in
                                Color.clear.preference(
                                    key: AgentSessionRowPositionKey.self,
                                    value: [
                                        session.id: proxy.frame(
                                            in: .global
                                        ).minY,
                                    ]
                                )
                            }
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(
                            EdgeInsets(top: 6, leading: 20, bottom: 6, trailing: 20)
                        )
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button {
                                toggleReadState(for: session)
                            } label: {
                                Label(
                                    session.isUnread
                                        ? appLanguage.text("Read")
                                        : appLanguage.text("Unread"),
                                    systemImage: session.isUnread ? "circle" : "circle.fill"
                                )
                            }
                            .tint(Color.tsMutedInk)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                presentedAlert = .delete(session)
                            } label: {
                                Label(
                                    appLanguage.text("Delete session history"),
                                    systemImage: "trash"
                                )
                            }
                            .accessibilityLabel(
                                appLanguage.text("Delete session history from this device")
                            )
                            .accessibilityIdentifier("delete-session-history")
                        }
                        .contextMenu {
                            Button {
                                onOpen(session)
                            } label: {
                                Label(
                                    appLanguage.text("Open session"),
                                    systemImage: "arrow.up.right"
                                )
                            }
                            Button {
                                toggleReadState(for: session)
                            } label: {
                                Label(
                                    session.isUnread
                                        ? appLanguage.text("Mark as read")
                                        : appLanguage.text("Mark as unread"),
                                    systemImage: session.isUnread ? "circle" : "circle.fill"
                                )
                            }
                            Button(role: .destructive) {
                                presentedAlert = .delete(session)
                            } label: {
                                Label(
                                    appLanguage.text("Delete session history from this device"),
                                    systemImage: "trash"
                                )
                            }
                        }
                        .accessibilityAction(
                            named: Text(appLanguage.text("Open session"))
                        ) {
                            onOpen(session)
                        }
                        .accessibilityAction(
                            named: Text(
                                session.isUnread
                                    ? appLanguage.text("Mark as read")
                                    : appLanguage.text("Mark as unread")
                            )
                        ) {
                            toggleReadState(for: session)
                        }
                        .accessibilityAction(
                            named: Text(
                                appLanguage.text("Delete session history from this device")
                            )
                        ) {
                            presentedAlert = .delete(session)
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(Color.tsSurface)
                .onPreferenceChange(AgentSessionRowPositionKey.self) {
                    positions in
                    guard !isRestoringScroll else { return }
                    if let anchor = closestTopAnchor(in: positions) {
                        scrollPosition = anchor
                    }
                }
                .accessibilityIdentifier("agent-session-list")
    }

    private func closestTopAnchor(in positions: [UUID: CGFloat]) -> UUID? {
        let fullyVisible = positions.filter {
            $0.value >= Self.minimumInteractiveRowY
        }
        if let firstVisible = fullyVisible.min(by: { $0.value < $1.value }) {
            return firstVisible.key
        }
        return positions.max(by: { $0.value < $1.value })?.key
    }

    private static let minimumInteractiveRowY: CGFloat = 120

    private func toggleReadState(for session: AgentSession) {
        if session.isUnread {
            onMarkRead(session.id)
        } else {
            onMarkUnread(session.id)
        }
    }
}

private enum AgentSessionAlert: Identifiable {
    case delete(AgentSession)
    case failure

    var id: String {
        switch self {
        case let .delete(session):
            return "delete-\(session.id.uuidString)"
        case .failure:
            return "failure"
        }
    }
}

private struct AgentSessionRowPositionKey: PreferenceKey {
    static var defaultValue: [UUID: CGFloat] { [:] }

    static func reduce(
        value: inout [UUID: CGFloat],
        nextValue: () -> [UUID: CGFloat]
    ) {
        value.merge(nextValue(), uniquingKeysWith: { _, latest in latest })
    }
}

private struct AgentSessionRow: View {
    let session: AgentSession
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            RelationshipInitials(
                initials: String(session.personDisplayLabel.prefix(2)).uppercased(),
                size: 46
            )

            VStack(alignment: .leading, spacing: 6) {
                if dynamicTypeSize.isAccessibilitySize {
                    sessionTitle
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        sessionTitle
                        Spacer(minLength: 8)
                        relativeTime
                    }
                }
                Text(
                    "\(session.personDisplayLabel) · \(session.displayContextLabel(in: appLanguage))"
                )
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(2)
                Text(session.latestPreview)
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .lineLimit(2)

                if dynamicTypeSize.isAccessibilitySize {
                    HStack(spacing: 10) {
                        relativeTime
                        if session.isUnread { unreadStatus }
                    }
                } else if session.isUnread {
                    unreadStatus
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            Color.tsCanvas,
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(sessionAccessibilityLabel)
        .accessibilityIdentifier("agent-session-\(session.id.uuidString)")
    }

    private var sessionTitle: some View {
        Text(session.displayTitle(in: appLanguage))
            .font(.headline)
            .foregroundStyle(Color.tsInk)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var relativeTime: some View {
        Text(
            session.updatedAt.formatted(
                .relative(presentation: .numeric, unitsStyle: .abbreviated)
            )
        )
        .font(.caption2.weight(.medium))
        .foregroundStyle(Color.tsMutedInk)
        .fixedSize()
    }

    private var unreadStatus: some View {
        Label(
            appLanguage.text("Unread"),
            systemImage: "circle.fill"
        )
        .font(.caption2.weight(.semibold))
        .foregroundStyle(Color.tsVermilion)
    }

    private var sessionAccessibilityLabel: String {
        String(
            format: appLanguage.text("%@, %@, %@, %@%@"),
            locale: appLanguage.locale,
            session.displayTitle(in: appLanguage),
            session.personDisplayLabel,
            session.displayContextLabel(in: appLanguage),
            session.latestPreview,
            session.isUnread ? appLanguage.text(", unread") : ""
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
    let restorationPosition: String?
    @Binding var scrollPosition: String?
    let onSelect: (WorkspacePerson) -> Void
    let onAsk: (WorkspacePerson) -> Void
    @Environment(\.appLanguage) private var appLanguage
    @State private var isRestoringScroll = false

    var body: some View {
        VStack(spacing: 0) {
            if snapshot.people.isEmpty {
                Spacer(minLength: 0)
            }
            peopleList
        }
        .background(Color.tsSurface)
        .accessibilityIdentifier("relationship-people")
    }

    private var peopleList: some View {
        ScrollViewReader { proxy in
            peopleListContent
                .onAppear {
                    guard let restorationPosition else { return }
                    isRestoringScroll = true
                    DispatchQueue.main.async {
                        withAnimation(nil) {
                            proxy.scrollTo(restorationPosition, anchor: .top)
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                            scrollPosition = restorationPosition
                            isRestoringScroll = false
                        }
                    }
                }
        }
    }

    private var peopleListContent: some View {
        List {
                if isPreview {
                    PursuitPreviewBoundary()
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(
                            EdgeInsets(top: 14, leading: 20, bottom: 2, trailing: 20)
                        )
                }
                ForEach(snapshot.people) { person in
                    Button { onSelect(person) } label: {
                        WorkspacePersonRow(
                            person: person,
                            roles: personRoles(person.id)
                        )
                    }
                    .buttonStyle(RelationshipRetrievalButtonStyle())
                    .background {
                        GeometryReader { proxy in
                            Color.clear.preference(
                                key: WorkspacePersonRowPositionKey.self,
                                value: [
                                    person.id: proxy.frame(
                                        in: .global
                                    ).minY,
                                ]
                            )
                        }
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(
                        EdgeInsets(top: 6, leading: 20, bottom: 6, trailing: 20)
                    )
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button {
                            onAsk(person)
                        } label: {
                            Label(
                                appLanguage.text("Ask about this person"),
                                systemImage: "bubble.left.and.text.bubble.right"
                            )
                        }
                        .tint(Color.tsInk)
                    }
                    .contextMenu {
                        Button {
                            onSelect(person)
                        } label: {
                            Label(
                                appLanguage.text("Open person"),
                                systemImage: "person.crop.circle"
                            )
                        }
                        Button {
                            onAsk(person)
                        } label: {
                            Label(
                                appLanguage.text("Ask about this person"),
                                systemImage: "bubble.left.and.text.bubble.right"
                            )
                        }
                    }
                    .accessibilityAction(
                        named: Text(appLanguage.text("Open person"))
                    ) {
                        onSelect(person)
                    }
                    .accessibilityAction(
                        named: Text(
                            appLanguage.text("Ask about this person")
                        )
                    ) {
                        onAsk(person)
                    }
                    .accessibilityIdentifier("workspace-person-\(person.id)")
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Color.tsSurface)
            .onPreferenceChange(WorkspacePersonRowPositionKey.self) {
                positions in
                guard !isRestoringScroll else { return }
                let fullyVisible = positions.filter {
                    $0.value >= Self.minimumInteractiveRowY
                }
                let anchor = fullyVisible.min(by: { $0.value < $1.value })?.key
                    ?? positions.max(by: { $0.value < $1.value })?.key
                if let anchor {
                    scrollPosition = anchor
                }
            }
    }

    private static let minimumInteractiveRowY: CGFloat = 120

    private func personRoles(_ personID: String) -> [String] {
        snapshot.pursuits.flatMap { pursuit in
            pursuit.personRoles
                .filter { $0.subjectRef.id == personID }
                .map { "\($0.roleType.humanized) · \(pursuit.title)" }
        }
    }
}

private struct WorkspacePersonRowPositionKey: PreferenceKey {
    static var defaultValue: [String: CGFloat] { [:] }

    static func reduce(
        value: inout [String: CGFloat],
        nextValue: () -> [String: CGFloat]
    ) {
        value.merge(nextValue(), uniquingKeysWith: { _, latest in latest })
    }
}

private struct WorkspacePersonRow: View {
    let person: WorkspacePerson
    let roles: [String]
    @Environment(\.appLanguage) private var appLanguage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

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
                if let profile = person.profile {
                    Text(profile.headline)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let role = roles.first {
                    Text(roleSummary(role))
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                provenanceSummary
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            Color.tsCanvas,
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func roleSummary(_ firstRole: String) -> String {
        guard roles.count > 1 else { return firstRole }
        return String(
            format: appLanguage.text("%@ · +%lld more"),
            locale: appLanguage.locale,
            firstRole,
            Int64(roles.count - 1)
        )
    }

    @ViewBuilder
    private var provenanceSummary: some View {
        let source = Label(
            String(
                format: appLanguage.text(
                    person.captureCount == 1 ? "%lld source" : "%lld sources"
                ),
                locale: appLanguage.locale,
                Int64(person.captureCount)
            ),
            systemImage: "doc.text"
        )
        let identity = Label(
            String(
                format: appLanguage.text("%lld confirmed"),
                locale: appLanguage.locale,
                Int64(person.confirmedIdentityCount)
            ),
            systemImage: "checkmark.seal"
        )

        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 5) {
                    source
                    identity
                }
            } else {
                HStack(spacing: 12) {
                    source
                    identity
                }
            }
        }
        .font(.caption2.weight(.medium))
        .foregroundStyle(Color.tsMutedInk.opacity(0.88))
    }
}

private struct RelationshipRetrievalButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.82 : 1)
            .scaleEffect(
                configuration.isPressed && !reduceMotion ? 0.992 : 1,
                anchor: .center
            )
            .animation(
                reduceMotion ? nil : .easeOut(duration: 0.14),
                value: configuration.isPressed
            )
    }
}

private struct PursuitPreviewBoundary: View {
    var compact = false
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        Label(
            appLanguage.text(
                compact
                    ? "Synthetic preview"
                    : "Synthetic preview · canonical backend not connected",
                zhHans: compact
                    ? "合成预览"
                    : "合成预览 · 尚未连接权威后端"
            ),
            systemImage: "eye.trianglebadge.exclamationmark"
        )
        .font((compact ? Font.caption2 : Font.caption).weight(.semibold))
        .foregroundStyle(Color.tsMutedInk)
        .padding(.vertical, compact ? 0 : 12)
        .frame(maxWidth: compact ? nil : .infinity, alignment: .leading)
        .overlay(alignment: .top) {
            if !compact {
                Rectangle()
                    .fill(Color.tsLine)
                    .frame(height: 1)
            }
        }
        .overlay(alignment: .bottom) {
            if !compact {
                Rectangle()
                    .fill(Color.tsLine)
                    .frame(height: 1)
            }
        }
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
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    RelationshipEyebrow(appLanguage.text("Stable person identity"))
                        .padding(.top, 26)
                    Text(person.displayLabel)
                        .font(.custom("Georgia", size: 38, relativeTo: .largeTitle))
                        .foregroundStyle(Color.tsInk)
                        .tracking(-0.8)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                    Text(
                        appLanguage.text(
                            "Roles below are contextual. They do not redefine identity or rank this person."
                        )
                    )
                        .font(.body)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)

                    if let profile = person.profile {
                        RelationshipEyebrow(appLanguage.text("About"))
                            .padding(.top, 30)
                        Text(profile.headline)
                            .font(.headline)
                            .foregroundStyle(Color.tsInk)
                            .padding(.top, 12)
                        Text(profile.summary)
                            .font(.body)
                            .foregroundStyle(Color.tsInk)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 8)
                        Label(
                            appLanguage.text("Written by the workspace owner"),
                            systemImage: "person.crop.circle.badge.checkmark"
                        )
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .padding(.top, 10)
                    }

                    RelationshipEyebrow(appLanguage.text("Pursuit roles"))
                        .padding(.top, 30)
                    if roles.isEmpty {
                        Text(appLanguage.text("No active Pursuit role is recorded."))
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
                        title: appLanguage.text("Governed identity"),
                        rows: [
                            (appLanguage.text("Sources"), "\(person.captureCount)"),
                            (appLanguage.text("Identity clues"), "\(person.confirmedIdentityCount)"),
                            (appLanguage.text("Contexts"), "\(person.contextCount)"),
                        ]
                    )
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 40)
            }
            .background(Color.tsSurface.ignoresSafeArea())
            .navigationTitle(appLanguage.text("Person"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(appLanguage.text("Close"), action: dismiss.callAsFunction)
                }
            }
        }
        .accessibilityIdentifier("workspace-person-detail")
    }
}

private struct RelationshipGuideRail: View {
    let onGuide: () -> Void
    let onAttach: () -> Void
    let onVoice: () -> Void
    @Environment(\.appLanguage) private var appLanguage

    var body: some View {
        HStack(spacing: 0) {
            Button(action: onAttach) {
                ZStack {
                    Color.clear
                    Image(systemName: "plus")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                }
                .frame(width: 48, height: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(width: 48, height: 48)
            .accessibilityLabel(
                appLanguage.text("Choose what to add to an Agent message")
            )
            .accessibilityIdentifier("open-agent-attachments")

            Button(action: onGuide) {
                HStack(spacing: 10) {
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

            Button(action: onVoice) {
                ZStack {
                    Color.clear
                    Image(systemName: "waveform")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                }
                .frame(width: 48, height: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(width: 48, height: 48)
            .accessibilityLabel(
                appLanguage.text(
                    "Dictate an Agent message",
                    zhHans: "用语音输入 Agent 消息"
                )
            )
            .accessibilityIdentifier("dictate-agent-message")
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
