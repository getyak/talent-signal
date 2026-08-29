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
    case routeRejected
}

@MainActor
final class AgentWorkShowcaseStore: ObservableObject {
    @Published var scenario: AgentWorkShowcaseScenario = .existingContact
    @Published private(set) var phase: AgentWorkShowcasePhase = .idle
    @Published private(set) var session: ReviewSession?
    @Published private(set) var identity: AgentWorkActivityIdentity?
    @Published private(set) var statusMessage = "Ready for a synthetic Agent run."

    private let controller: AgentWorkActivityController
    private var revision: Int64 = 0

    init(controller: AgentWorkActivityController? = nil) {
        self.controller = controller ?? .shared
    }

    func start() async {
        session = nil
        revision = 1
        identity = await controller.startSyntheticTask(taskID: scenario.taskID)
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

        revision += 1
        let state = state(for: next, revision: revision)
        if let identity {
            let result = await controller.update(identity: identity, state: state)
            guard [.applied, .noOp, .ignoredOlder].contains(result) else {
                statusMessage = "The unsafe or conflicting update was stopped. The App still owns the review."
                return
            }
        }

        if next == .readyForReview {
            session = ReviewSession(fixture: scenario.fixture)
            phase = .factReview
            statusMessage = "Suggested actions are ready. Review evidence before choosing any change."
        } else {
            phase = .processing(next)
            statusMessage = stageMessage(next)
        }
    }

    func open(_ link: AgentWorkDeepLink) async {
        guard controller.validatesActiveIdentity(link.identity) else {
            phase = .routeRejected
            statusMessage = "This Live Activity is no longer the current task. Nothing was ended or changed."
            return
        }
        identity = link.identity
        if link.identity.taskID == AgentWorkShowcaseScenario.newContact.taskID {
            scenario = .newContact
        } else if link.identity.taskID == AgentWorkShowcaseScenario.existingContact.taskID {
            scenario = .existingContact
        } else {
            phase = .routeRejected
            statusMessage = "The task is not an authorized showcase fixture."
            return
        }

        switch link.destination {
        case .status:
            await controller.restoreOrCleanExpired()
            statusMessage = "The exact Agent task is still active."
        case .actions:
            session = ReviewSession(fixture: scenario.fixture)
            phase = .factReview
            _ = await controller.end(identity: link.identity)
            identity = nil
            statusMessage = "The exact Live Activity was closed. Action review continues in the App."
        case .resolve:
            phase = .routeRejected
            statusMessage = "This synthetic issue needs a fresh run. No retry or write happened automatically."
        }
    }

    func openReviewInApp() async {
        guard session != nil else { return }
        if let identity {
            _ = await controller.end(identity: identity)
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
            _ = await controller.end(identity: identity)
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

    @StateObject private var store = AgentWorkShowcaseStore()
    @ObservedObject private var controller = AgentWorkActivityController.shared
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
    @Environment(\.scenePhase) private var scenePhase

    init(initialURL: URL? = nil, onClose: (() -> Void)? = nil) {
        self.initialURL = initialURL
        self.onClose = onClose
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
            await controller.restoreOrCleanExpired()
            if let initialURL, let link = AgentWorkDeepLink.parse(initialURL) {
                await store.open(link)
            }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            Task { await controller.restoreOrCleanExpired() }
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
        case .routeRejected:
            routeRejected
        }
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
