import SwiftUI

enum AgentWorkShowcaseScenario: String, CaseIterable, Identifiable {
    case existingContact
    case newContact

    var id: String { rawValue }

    var title: String {
        switch self {
        case .existingContact: return "Update an existing contact"
        case .newContact: return "Create a new contact"
        }
    }

    var detail: String {
        switch self {
        case .existingContact:
            return "The selected evidence belongs to a known person. The Agent proposes contact updates and a meeting for separate review."
        case .newContact:
            return "No matching person is assumed. The Agent proposes a new contact only after identity and channel facts are reviewed."
        }
    }

    var systemImage: String {
        switch self {
        case .existingContact: return "person.crop.circle.badge.checkmark"
        case .newContact: return "person.crop.circle.badge.plus"
        }
    }

    var fixture: FixtureCase {
        switch self {
        case .existingContact:
            return HeroLoopCatalog.alexDecision(
                recruiterContext: HeroLoopCatalog.defaultRecruiterContext
            )
        case .newContact:
            return HeroLoopCatalog.newContact()
        }
    }

    var proposedActionCount: Int {
        switch self {
        case .existingContact: return 2
        case .newContact: return 1
        }
    }

    var taskID: String {
        "task.agent-showcase.\(rawValue)"
    }
}

enum AgentWorkShowcasePhase: Equatable {
    case idle
    case processing(AgentWorkStage)
    case factReview
    case actionReview
    case outcome(ReviewOutcome)
    case boundaryAtlas(AgentWorkBoundaryAtlasFixture)
    case routeRejected
}

enum AgentWorkBoundaryAtlasFixture: String, CaseIterable, Identifiable {
    case partial
    case failed
    case unknown
    case stale

    var id: String { rawValue }

    static func configured(arguments: [String]) -> Self? {
        guard let index = arguments.firstIndex(of: "--agent-work-atlas"),
              arguments.indices.contains(index + 1) else {
            return nil
        }
        return Self(rawValue: arguments[index + 1])
    }

    var title: String {
        switch self {
        case .partial: return "Partial result"
        case .failed: return "Failed safely"
        case .unknown: return "Unknown outcome"
        case .stale: return "Delayed update"
        }
    }

    var detail: String {
        switch self {
        case .partial:
            return "Some reviewable actions are available, while incomplete evidence stays marked."
        case .failed:
            return "Processing stopped and asks the recruiter to resolve it in the App."
        case .unknown:
            return "The outcome cannot be confirmed, so the surface makes no success claim."
        case .stale:
            return "The task remains in its last known stage while freshness is visibly delayed."
        }
    }

    var state: AgentWorkActivityAttributes.ContentState {
        let now = Date()
        switch self {
        case .partial:
            return .init(
                execution: .partial,
                attention: .review,
                freshness: .fresh,
                stage: .readyForReview,
                reviewActionCount: 2,
                eventRevision: 2,
                updatedAt: now
            )
        case .failed:
            return .init(
                execution: .failed,
                attention: .resolve,
                freshness: .fresh,
                stage: .reconcilingOutcome,
                reviewActionCount: 0,
                eventRevision: 2,
                updatedAt: now
            )
        case .unknown:
            return .init(
                execution: .unknown,
                attention: .resolve,
                freshness: .fresh,
                stage: .reconcilingOutcome,
                reviewActionCount: 0,
                eventRevision: 2,
                updatedAt: now
            )
        case .stale:
            return .init(
                execution: .running,
                attention: .observe,
                freshness: .stale,
                stage: .preparingActions,
                reviewActionCount: 0,
                eventRevision: 2,
                updatedAt: now
            )
        }
    }
}

@MainActor
final class AgentWorkShowcaseStore: ObservableObject {
    @Published var scenario: AgentWorkShowcaseScenario = .existingContact
    @Published private(set) var phase: AgentWorkShowcasePhase = .idle
    @Published private(set) var session: ReviewSession?
    @Published private(set) var identity: AgentWorkActivityIdentity?
    @Published private(set) var statusMessage = "Ready for a synthetic Agent run."

    private let controller: any AgentWorkActivityControlling
    private var revision: Int64 = 0

    init(controller: (any AgentWorkActivityControlling)? = nil) {
        self.controller = controller ?? AgentWorkActivityController.shared
    }

    func start() async {
        session = nil
        revision = 1
        identity = await controller.startSyntheticTask(
            scopeID: "debug.local",
            taskID: scenario.taskID,
            now: Date(),
            fixtureLifetime: 30 * 60
        )
        phase = .processing(.received)
        statusMessage = identity == nil
            ? "Live Activities are unavailable here. The in-App lifecycle remains usable."
            : "Signal received. The system surface is now following this task."
    }

    func advance() async {
        guard case let .processing(stage) = phase else { return }
        let next: AgentWorkStage
        switch stage {
        case .received: next = .readingEvidence
        case .readingEvidence: next = .resolvingIdentity
        case .resolvingIdentity: next = .preparingActions
        case .preparingActions: next = .readyForReview
        case .readyForReview, .reconcilingOutcome, .ended:
            return
        }

        let nextRevision = revision + 1
        let state = state(for: next, revision: nextRevision)
        var continuedWithoutSystemSurface = false
        if let identity {
            let result = await controller.update(
                identity: identity,
                state: state,
                now: Date()
            )
            switch result {
            case .applied, .noOp:
                break
            case .missing, .unavailable, .systemFailure:
                self.identity = nil
                continuedWithoutSystemSurface = true
            case .ignoredOlder, .identityMismatch, .sameRevisionConflict,
                    .terminalRegression, .invalidPayload:
                statusMessage = "The unsafe or conflicting update was stopped. The App still owns the review."
                return
            }
        }
        revision = nextRevision

        if next == .readyForReview {
            session = ReviewSession(fixture: scenario.fixture)
            phase = .factReview
            statusMessage = continuedWithoutSystemSurface
                ? "The system surface is unavailable. Suggested actions are still ready for review in the App."
                : "Suggested actions are ready. Review evidence before choosing any change."
        } else {
            phase = .processing(next)
            statusMessage = continuedWithoutSystemSurface
                ? "The system surface is unavailable. The in-App lifecycle continues safely."
                : stageMessage(next)
        }
    }

    func startBoundaryAtlas(_ fixture: AgentWorkBoundaryAtlasFixture) async {
        session = nil
        revision = 1
        let atlasTaskID = "task.agent-atlas.\(fixture.rawValue)"
        identity = await controller.startSyntheticTask(
            scopeID: "debug.local",
            taskID: atlasTaskID,
            now: Date(),
            fixtureLifetime: 15 * 60
        )
        guard let identity else {
            phase = .boundaryAtlas(fixture)
            statusMessage = "Live Activities are unavailable. This atlas state was not recorded."
            return
        }
        let result = await controller.update(
            identity: identity,
            state: fixture.state,
            now: Date()
        )
        switch result {
        case .applied, .noOp:
            revision = fixture.state.eventRevision
            phase = .boundaryAtlas(fixture)
            statusMessage = "Boundary atlas fixture is active on the real system surface."
        default:
            self.identity = nil
            phase = .routeRejected
            statusMessage = "The boundary atlas fixture could not be displayed safely."
        }
    }

    func open(_ link: AgentWorkDeepLink) async {
        let linkedScenario = scenario(for: link.identity.taskID)
        let linkedAtlas = AgentWorkBoundaryAtlasFixture.allCases.first {
            link.identity.taskID == "task.agent-atlas.\($0.rawValue)"
        }
        guard linkedScenario != nil || linkedAtlas != nil else {
            phase = .routeRejected
            statusMessage = "The task is not an authorized showcase fixture."
            return
        }

        let restored = await controller.restoreOrCleanExpired(now: Date())
        guard let snapshot = restored?.identity == link.identity
                ? restored
                : controller.activeSnapshot(identity: link.identity) else {
            phase = .routeRejected
            statusMessage = "This Live Activity is no longer the current task. Nothing was ended or changed."
            return
        }
        if let fixture = linkedAtlas {
            let expected = fixture.state
            let expectedDestination: AgentWorkDeepLinkDestination = fixture == .stale ? .status : .resolve
            guard link.destination == expectedDestination,
                  snapshot.state.execution == expected.execution,
                  snapshot.state.attention == expected.attention,
                  snapshot.state.freshness == expected.freshness,
                  snapshot.state.stage == expected.stage,
                  snapshot.state.reviewActionCount == expected.reviewActionCount,
                  snapshot.state.eventRevision == expected.eventRevision else {
                rejectStateMismatch()
                return
            }
            identity = snapshot.identity
            revision = snapshot.state.eventRevision
            session = nil
            phase = .boundaryAtlas(fixture)
            statusMessage = "The exact synthetic issue is open. No retry or write happened automatically."
            return
        }
        guard let linkedScenario else { return }
        scenario = linkedScenario

        switch link.destination {
        case .status:
            guard isProcessing(snapshot.state) else {
                rejectStateMismatch()
                return
            }
            restore(snapshot)
        case .actions:
            guard isReadyForReview(snapshot.state) else {
                rejectStateMismatch()
                return
            }
            identity = link.identity
            revision = snapshot.state.eventRevision
            session = ReviewSession(fixture: scenario.fixture)
            phase = .factReview
            _ = await controller.end(
                identity: link.identity,
                dismissImmediately: true,
                now: Date()
            )
            identity = nil
            statusMessage = "The exact Live Activity was closed. Action review continues in the App."
        case .resolve:
            guard isResolutionState(snapshot.state) else {
                rejectStateMismatch()
                return
            }
            phase = .routeRejected
            statusMessage = "This synthetic issue needs a fresh run. No retry or write happened automatically."
        }
    }

    func restore() async {
        guard phase == .idle,
              let snapshot = await controller.restoreOrCleanExpired(now: Date()),
              scenario(for: snapshot.identity.taskID) != nil else {
            return
        }
        restore(snapshot)
    }

    func refreshSystemSurface() async {
        _ = await controller.restoreOrCleanExpired(now: Date())
    }

    func openReviewInApp() async {
        guard session != nil else { return }
        if let identity {
            _ = await controller.end(
                identity: identity,
                dismissImmediately: true,
                now: Date()
            )
            self.identity = nil
        }
        statusMessage = "Live handoff complete. Review remains local until you decide."
    }

    func confirmFact(id: String) {
        mutateSession { $0.confirm(factID: id) }
    }

    func editFact(id: String, value: String) {
        mutateSession { $0.edit(factID: id, value: value) }
    }

    func dismissFact(id: String) {
        mutateSession { $0.dismiss(factID: id) }
    }

    func showActionPreview() {
        guard var session, session.makeActionPreview() != nil else { return }
        self.session = session
        phase = .actionReview
    }

    func approveAction(id: String) {
        mutateSession { $0.approveAction(cardID: id) }
    }

    func dismissAction(id: String) {
        mutateSession { $0.dismissAction(cardID: id) }
    }

    func returnToFactReview() {
        guard session != nil else { return }
        phase = .factReview
    }

    func finishWithoutAction() {
        phase = .outcome(
            ReviewOutcome(
                kind: .noRetainedFacts,
                title: "No action was selected",
                detail: "The reviewed evidence remains in this synthetic run. No contact, meeting, message, reminder, ATS, or CRM write occurred."
            )
        )
    }

    func completeLocalHandoff() {
        guard let session, session.isPreviewCurrent else { return }
        if session.preview?.cards.isEmpty == false,
           !session.allActionCardsReviewed {
            return
        }
        let approved = session.approvedActionCards.count
        phase = .outcome(
            ReviewOutcome(
                kind: .localHandoff,
                title: approved == 0
                    ? "No action was selected"
                    : "\(approved) action\(approved == 1 ? "" : "s") approved for handoff",
                detail: "This demo records only your review decision. Device or external writes still require their own exact-effect confirmation and verified result."
            )
        )
    }

    func reset() async {
        if let identity {
            _ = await controller.end(
                identity: identity,
                dismissImmediately: true,
                now: Date()
            )
        }
        self.identity = nil
        session = nil
        revision = 0
        phase = .idle
        statusMessage = "Ready for a synthetic Agent run."
    }

    private func mutateSession(_ change: (inout ReviewSession) -> Bool) {
        guard var session, change(&session) else { return }
        self.session = session
    }

    private func scenario(for taskID: String) -> AgentWorkShowcaseScenario? {
        AgentWorkShowcaseScenario.allCases.first { $0.taskID == taskID }
    }

    private func restore(_ snapshot: AgentWorkActivitySnapshot) {
        guard let restoredScenario = scenario(for: snapshot.identity.taskID) else {
            return
        }
        scenario = restoredScenario
        identity = snapshot.identity
        revision = snapshot.state.eventRevision
        session = nil

        if isProcessing(snapshot.state) {
            phase = .processing(snapshot.state.stage)
            statusMessage = "The exact Agent task resumed from its current system state."
        } else if isReadyForReview(snapshot.state) {
            session = ReviewSession(fixture: restoredScenario.fixture)
            phase = .factReview
            statusMessage = "Suggested actions are ready. Review evidence before choosing any change."
        } else if isResolutionState(snapshot.state) {
            phase = .routeRejected
            statusMessage = "This synthetic issue needs a fresh run. No retry or write happened automatically."
        } else {
            rejectStateMismatch()
        }
    }

    private func isProcessing(
        _ state: AgentWorkActivityAttributes.ContentState
    ) -> Bool {
        switch (state.execution, state.attention, state.stage) {
        case (.preparing, .observe, .received),
                (.running, .observe, .readingEvidence),
                (.running, .observe, .resolvingIdentity),
                (.running, .observe, .preparingActions):
            return state.reviewActionCount == 0
        default:
            return false
        }
    }

    private func isReadyForReview(
        _ state: AgentWorkActivityAttributes.ContentState
    ) -> Bool {
        state.execution == .completed
            && state.attention == .review
            && state.stage == .readyForReview
            && state.reviewActionCount == scenario.proposedActionCount
    }

    private func isResolutionState(
        _ state: AgentWorkActivityAttributes.ContentState
    ) -> Bool {
        if state.execution == .partial,
           state.attention == .review,
           state.stage == .readyForReview,
           (1 ... 9).contains(state.reviewActionCount) {
            return true
        }
        return (state.execution == .failed || state.execution == .unknown)
            && state.attention == .resolve
            && state.stage == .reconcilingOutcome
            && state.reviewActionCount == 0
    }

    private func rejectStateMismatch() {
        identity = nil
        session = nil
        phase = .routeRejected
        statusMessage = "The link did not match the Activity's current stage. Nothing was ended or changed."
    }

    private func state(
        for stage: AgentWorkStage,
        revision: Int64
    ) -> AgentWorkActivityAttributes.ContentState {
        let execution: AgentWorkExecution
        let attention: AgentWorkAttention
        let actionCount: Int
        switch stage {
        case .received:
            execution = .preparing
            attention = .observe
            actionCount = 0
        case .readingEvidence, .resolvingIdentity, .preparingActions:
            execution = .running
            attention = .observe
            actionCount = 0
        case .readyForReview:
            execution = .completed
            attention = .review
            actionCount = scenario.proposedActionCount
        case .reconcilingOutcome:
            execution = .unknown
            attention = .resolve
            actionCount = 0
        case .ended:
            execution = .cancelled
            attention = .none
            actionCount = 0
        }
        return AgentWorkActivityAttributes.ContentState(
            execution: execution,
            attention: attention,
            freshness: .fresh,
            stage: stage,
            reviewActionCount: actionCount,
            eventRevision: revision,
            updatedAt: Date()
        )
    }

    private func stageMessage(_ stage: AgentWorkStage) -> String {
        switch stage {
        case .received: return "Signal received."
        case .readingEvidence: return "Reading only the selected evidence."
        case .resolvingIdentity: return "Checking whether this belongs to an existing person."
        case .preparingActions: return "Preparing reversible actions for review."
        case .readyForReview: return "Actions are ready for review."
        case .reconcilingOutcome: return "Reconciling an unknown result."
        case .ended: return "The task ended without a write."
        }
    }
}

struct AgentWorkShowcaseView: View {
    let initialURL: URL?
    let onClose: (() -> Void)?
    let atlasFixture: AgentWorkBoundaryAtlasFixture?

    @StateObject private var store = AgentWorkShowcaseStore()
    @ObservedObject private var controller = AgentWorkActivityController.shared
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
    @Environment(\.scenePhase) private var scenePhase

    init(
        initialURL: URL? = nil,
        onClose: (() -> Void)? = nil,
        arguments: [String] = ProcessInfo.processInfo.arguments
    ) {
        self.initialURL = initialURL
        self.onClose = onClose
        atlasFixture = AgentWorkBoundaryAtlasFixture.configured(
            arguments: arguments
        )
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.tsCanvas.ignoresSafeArea()
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            header
                            disclosure
                            statusStrip
                            content
                                .id("agent-work-phase-start")
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 18)
                        .padding(.bottom, 44)
                    }
                    .onChange(of: store.phase) { _ in
                        if accessibilityReduceMotion {
                            proxy.scrollTo("agent-work-phase-start", anchor: .top)
                        } else {
                            withAnimation(.easeInOut(duration: 0.25)) {
                                proxy.scrollTo("agent-work-phase-start", anchor: .top)
                            }
                        }
                    }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if onClose != nil {
                closeBar
            }
        }
        .tint(.tsVermilion)
        .task(id: initialURL) {
            if let initialURL, let link = AgentWorkDeepLink.parse(initialURL) {
                await store.open(link)
            } else if let atlasFixture {
                await store.startBoundaryAtlas(atlasFixture)
            } else {
                await store.restore()
            }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            Task { await store.refreshSystemSurface() }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 9) {
                TalentSignalBrandMark()
                    .frame(width: 24, height: 24)
                Text("AGENT HANDOFF · SYNTHETIC")
                    .font(.caption.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(Color.tsVermilion)
            }
            Text("Watch the work.\nChoose the change.")
                .font(.custom("Georgia", size: 38, relativeTo: .largeTitle))
                .tracking(-0.7)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
            Text("The Live Activity makes the Agent's trusted stage visible. The App keeps evidence review, identity, and every action decision in your hands.")
                .font(.body)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("agent-work-showcase-header")
    }

    private var disclosure: some View {
        Label(
            "Real ActivityKit UI · deterministic Debug stages · synthetic people and evidence · not proof of background delivery",
            systemImage: "testtube.2"
        )
        .font(.caption.weight(.semibold))
        .foregroundStyle(Color.tsMutedInk)
        .fixedSize(horizontal: false, vertical: true)
        .padding(14)
        .background(Color.tsSurfaceMuted, in: RoundedRectangle(cornerRadius: 14))
        .accessibilityIdentifier("agent-work-synthetic-disclosure")
    }

    private var statusStrip: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: statusIcon)
                .font(.body.weight(.semibold))
                .foregroundStyle(Color.tsVermilion)
                .frame(width: 30, height: 30)
                .background(Color.tsVermilion.opacity(0.1), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text("CURRENT HANDOFF")
                    .font(.caption2.weight(.bold))
                    .tracking(0.8)
                    .foregroundStyle(Color.tsMutedInk)
                Text(store.statusMessage)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18).stroke(Color.tsLine, lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("agent-work-status")
    }

    @ViewBuilder
    private var content: some View {
        switch store.phase {
        case .idle:
            setup
        case let .processing(stage):
            processing(stage)
        case .factReview:
            factReview
        case .actionReview:
            actionReview
        case let .outcome(outcome):
            outcomeView(outcome)
        case let .boundaryAtlas(fixture):
            boundaryAtlas(fixture)
        case .routeRejected:
            routeRejected
        }
    }

    private func boundaryAtlas(
        _ fixture: AgentWorkBoundaryAtlasFixture
    ) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionLabel(text: "Boundary atlas · \(fixture.rawValue)")
                .accessibilityIdentifier("agent-work-atlas-\(fixture.rawValue)")
            Text(fixture.title)
                .font(.title2.weight(.semibold))
                .foregroundStyle(Color.tsInk)
            Text(fixture.detail)
                .font(.body)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            Text("Synthetic Debug evidence only · no candidate data · no external write")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Task { await store.reset() }
            } label: {
                Text("End atlas fixture")
            }
            .buttonStyle(TSSecondaryButtonStyle())
            .accessibilityIdentifier("agent-work-atlas-end")
        }
        .tsCard()
    }

    private var setup: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 7) {
                SectionLabel(text: "Choose a synthetic identity outcome")
                Text("The Agent may propose creating a contact or updating an existing one. It never silently chooses or writes either.")
                    .font(.body)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }

            ForEach(AgentWorkShowcaseScenario.allCases) { scenario in
                scenarioButton(scenario)
            }

            lifecycleMap(current: nil)

            Button {
                Task { await store.start() }
            } label: {
                Label("Start Agent processing", systemImage: "sparkles")
            }
            .buttonStyle(TSPrimaryButtonStyle())
            .accessibilityIdentifier("agent-work-start")
        }
    }

    private func scenarioButton(
        _ scenario: AgentWorkShowcaseScenario
    ) -> some View {
        Button {
            store.scenario = scenario
        } label: {
            HStack(alignment: .top, spacing: 13) {
                Image(systemName: scenario.systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(
                        store.scenario == scenario ? Color.tsVermilion : Color.tsMutedInk
                    )
                    .frame(width: 32)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(scenario.title)
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                    Text(scenario.detail)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Image(
                    systemName: store.scenario == scenario
                        ? "checkmark.circle.fill"
                        : "circle"
                )
                .foregroundStyle(
                    store.scenario == scenario ? Color.tsVermilion : Color.tsLine
                )
                .accessibilityHidden(true)
            }
            .padding(16)
            .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .stroke(
                        store.scenario == scenario
                            ? Color.tsVermilion.opacity(0.55)
                            : Color.tsLine,
                        lineWidth: 1
                    )
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(store.scenario == scenario ? .isSelected : [])
        .accessibilityIdentifier("agent-work-scenario-\(scenario.rawValue)")
    }

    private func processing(_ stage: AgentWorkStage) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            lifecycleMap(current: stage)

            VStack(alignment: .leading, spacing: 12) {
                Label("You can leave the App", systemImage: "arrow.down.right.and.arrow.up.left")
                    .font(.headline)
                    .foregroundStyle(Color.tsInk)
                Text("Use Home, the Dynamic Island, or the Lock Screen to inspect the current phase. Return here to drive the next deterministic Debug stage.")
                    .font(.body)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)

                Button {
                    Task { await store.advance() }
                } label: {
                    Label(nextStageButtonTitle(stage), systemImage: "arrow.right")
                }
                .buttonStyle(TSPrimaryButtonStyle())
                .accessibilityIdentifier("agent-work-advance")

                Button {
                    Task { await store.reset() }
                } label: {
                    Text("End showcase")
                }
                .buttonStyle(TSSecondaryButtonStyle())
                .accessibilityIdentifier("agent-work-end")
            }
            .tsCard()
        }
    }

    private var factReview: some View {
        VStack(alignment: .leading, spacing: 20) {
            handoffCompleteCard
            if let session = store.session {
                FixtureReviewView(
                    session: session,
                    sourceNotice: "Synthetic Agent lifecycle · no OCR · no external writes",
                    dynamicTypeSize: dynamicTypeSize,
                    onConfirm: store.confirmFact,
                    onEdit: store.editFact,
                    onDismiss: store.dismissFact,
                    onPreviewAction: store.showActionPreview,
                    onFinishWithoutAction: store.finishWithoutAction,
                    onCancelReview: { Task { await store.reset() } }
                )
            }
        }
    }

    private var handoffCompleteCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: "Actions ready")
            Text("The Agent is done. Your decisions begin here.")
                .font(.title2.weight(.semibold))
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
            Text("Review the proposed facts first. Only then can an add-contact or update-contact card become selectable.")
                .font(.body)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            Label("Nothing has been applied", systemImage: "lock.shield")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.tsInk)

            if store.identity != nil {
                Button("Close Live Activity and review here") {
                    Task { await store.openReviewInApp() }
                }
                .buttonStyle(TSSecondaryButtonStyle())
                .accessibilityIdentifier("agent-work-close-live-activity")
            }
        }
        .tsCard()
    }

    private var actionReview: some View {
        Group {
            if let session = store.session {
                ActionPreviewView(
                    session: session,
                    sourceNotice: "Synthetic Agent lifecycle · action selection",
                    dynamicTypeSize: dynamicTypeSize,
                    onApproveAction: store.approveAction,
                    onDismissAction: store.dismissAction,
                    onReturnToReview: store.returnToFactReview,
                    onCompleteHandoff: store.completeLocalHandoff
                )
            }
        }
    }

    private func outcomeView(_ outcome: ReviewOutcome) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            StateMessage(
                eyebrow: "Observed outcome",
                icon: "checkmark.seal",
                title: outcome.title,
                detail: outcome.detail
            ) {
                VStack(alignment: .leading, spacing: 12) {
                    Label("No external changes", systemImage: "lock.shield")
                        .font(.headline)
                        .foregroundStyle(Color.tsInk)
                    Button("Run another lifecycle") {
                        Task { await store.reset() }
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier("agent-work-run-again")
                }
            }
        }
    }

    private var routeRejected: some View {
        StateMessage(
            eyebrow: "Safe fallback",
            icon: "link.badge.plus",
            title: "This Live Activity is no longer current",
            detail: "The task and Activity instance did not match current local state. No newer Activity was ended and no action was applied."
        ) {
            Button("Start a fresh showcase") {
                Task { await store.reset() }
            }
            .buttonStyle(TSPrimaryButtonStyle())
        }
    }

    private func lifecycleMap(current: AgentWorkStage?) -> some View {
        let stages: [(AgentWorkStage, String, String)] = [
            (.received, "Signal received", "Purpose-bound task created"),
            (.readingEvidence, "Read evidence", "Only the selected source"),
            (.resolvingIdentity, "Check identity", "Existing or new stays explicit"),
            (.preparingActions, "Prepare actions", "Nothing runs automatically"),
            (.readyForReview, "Review actions", "Human choice in the App"),
        ]
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(stages.enumerated()), id: \.element.0) { index, item in
                HStack(alignment: .top, spacing: 13) {
                    VStack(spacing: 0) {
                        Circle()
                            .fill(stageColor(item.0, current: current))
                            .frame(width: 12, height: 12)
                        if index < stages.count - 1 {
                            Rectangle()
                                .fill(Color.tsLine)
                                .frame(width: 1, height: 44)
                        }
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.1)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.tsInk)
                        Text(item.2)
                            .font(.caption)
                            .foregroundStyle(Color.tsMutedInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.bottom, index < stages.count - 1 ? 12 : 0)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 20))
        .overlay {
            RoundedRectangle(cornerRadius: 20).stroke(Color.tsLine, lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("agent-work-lifecycle")
    }

    private func stageColor(
        _ stage: AgentWorkStage,
        current: AgentWorkStage?
    ) -> Color {
        guard let current else {
            return stage == .received ? .tsVermilion : .tsLine
        }
        let order: [AgentWorkStage] = [
            .received,
            .readingEvidence,
            .resolvingIdentity,
            .preparingActions,
            .readyForReview,
        ]
        guard let target = order.firstIndex(of: stage),
              let active = order.firstIndex(of: current) else {
            return .tsLine
        }
        return target <= active ? .tsVermilion : .tsLine
    }

    private func nextStageButtonTitle(_ stage: AgentWorkStage) -> String {
        switch stage {
        case .received: return "Read selected evidence"
        case .readingEvidence: return "Check the right person"
        case .resolvingIdentity: return "Prepare review actions"
        case .preparingActions: return "Finish Agent processing"
        case .readyForReview, .reconcilingOutcome, .ended:
            return "Continue"
        }
    }

    private var statusIcon: String {
        switch store.phase {
        case .idle: return "circle.dotted"
        case .processing: return "sparkles"
        case .factReview, .actionReview: return "hand.raised"
        case .outcome: return "checkmark.seal"
        case .boundaryAtlas: return "rectangle.3.group"
        case .routeRejected: return "exclamationmark.triangle"
        }
    }

    private var closeBar: some View {
        HStack {
            Button {
                onClose?()
            } label: {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Close Agent lifecycle")
            Spacer()
            Text("Agent lifecycle")
                .font(.headline)
                .foregroundStyle(Color.tsInk)
            Spacer()
            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal, 12)
        .background(Color.tsCanvas)
    }
}

#Preview("Agent lifecycle") {
    AgentWorkShowcaseView()
}
