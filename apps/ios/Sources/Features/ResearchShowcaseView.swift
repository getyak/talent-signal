import SwiftUI

enum ResearchShowcasePhase: Equatable {
    case idle
    case running
    case review(openedFromActivity: Bool)
    case routeRejected
}

struct SyntheticResearchPage: Identifiable, Equatable {
    let id: String
    let title: String
    let source: String
    let purpose: String
}

@MainActor
final class ResearchShowcaseStore: ObservableObject {
    static let taskID = "task.synthetic-research.showcase"
    static let pages = [
        SyntheticResearchPage(
            id: "page.product-principles",
            title: "Relationship intelligence principles",
            source: "public.example.test/principles",
            purpose: "Synthetic public-page fixture for product context"
        ),
        SyntheticResearchPage(
            id: "page.activity-surfaces",
            title: "Activity state and system surfaces",
            source: "developer.example.test/activity-state",
            purpose: "Synthetic public-page fixture for lifecycle context"
        ),
        SyntheticResearchPage(
            id: "page.review-boundary",
            title: "Human review boundary",
            source: "research.example.test/review-boundary",
            purpose: "Synthetic public-page fixture for review context"
        ),
    ]

    @Published private(set) var phase: ResearchShowcasePhase = .idle
    @Published private(set) var identity: ResearchActivityIdentity?
    @Published private(set) var statusMessage =
        "Ready to start the deterministic synthetic research task."

    private let controller: any ResearchActivityControlling

    init(controller: (any ResearchActivityControlling)? = nil) {
        self.controller = controller ?? ResearchActivityController.shared
    }

    func start() async {
        identity = await controller.startSyntheticResearch(
            scopeID: "debug.local",
            taskID: Self.taskID,
            now: Date(),
            fixtureLifetime: 30 * 60
        )
        phase = .running
        statusMessage = identity == nil
            ? "Live Activities are unavailable here. The in-App Debug flow remains inspectable."
            : "Reading approved pages. You can leave the App."
    }

    func completeResearch() async {
        guard phase == .running else { return }
        let state = ResearchActivityAttributes.ContentState(
            execution: .completed,
            stage: .pagesReadyForReview,
            eventRevision: 2,
            updatedAt: Date()
        )
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
            case .ignoredOlder, .identityMismatch, .sameRevisionConflict,
                    .terminalRegression, .invalidPayload:
                statusMessage =
                    "The conflicting research update was stopped. Nothing was promoted to reviewed state."
                return
            }
        }
        phase = .review(openedFromActivity: false)
        statusMessage = "Pages are ready. Review is required before use."
    }

    func open(_ link: ResearchDeepLink) async {
        guard link.identity.taskID == Self.taskID else {
            rejectRoute()
            return
        }
        let restored = await controller.restoreOrCleanExpired(now: Date())
        guard let snapshot = restored?.identity == link.identity
                ? restored
                : controller.activeSnapshot(identity: link.identity) else {
            rejectRoute()
            return
        }

        switch link.destination {
        case .status:
            guard snapshot.state.execution == .running,
                  snapshot.state.stage == .readingApprovedPages else {
                rejectRoute()
                return
            }
            identity = link.identity
            phase = .running
            statusMessage = "Reading approved pages. You can leave the App."
        case .review:
            guard snapshot.state.execution == .completed,
                  snapshot.state.stage == .pagesReadyForReview else {
                rejectRoute()
                return
            }
            identity = link.identity
            _ = await controller.end(
                identity: link.identity,
                dismissImmediately: true,
                now: Date()
            )
            identity = nil
            phase = .review(openedFromActivity: true)
            statusMessage =
                "The exact Live Activity ended. Synthetic page review is open in the App."
        }
    }

    func restore() async {
        guard phase == .idle,
              let snapshot = await controller.restoreOrCleanExpired(now: Date()),
              snapshot.identity.taskID == Self.taskID else {
            return
        }
        identity = snapshot.identity
        switch (snapshot.state.execution, snapshot.state.stage) {
        case (.running, .readingApprovedPages):
            phase = .running
            statusMessage = "Reading approved pages. You can leave the App."
        case (.completed, .pagesReadyForReview):
            phase = .review(openedFromActivity: false)
            statusMessage = "Pages are ready. Review is required before use."
        default:
            rejectRoute()
        }
    }

    func refreshSystemSurface() async {
        _ = await controller.restoreOrCleanExpired(now: Date())
    }

    func reset() async {
        if let identity {
            _ = await controller.end(
                identity: identity,
                dismissImmediately: true,
                now: Date()
            )
        }
        identity = nil
        phase = .idle
        statusMessage = "Ready to start the deterministic synthetic research task."
    }

    private func rejectRoute() {
        identity = nil
        phase = .routeRejected
        statusMessage =
            "The task or Activity instance was not current. Nothing was ended or used."
    }
}

struct ResearchShowcaseView: View {
    let initialURL: URL?
    let onClose: (() -> Void)?
    let resetsFixtureOnInitialLaunch: Bool

    @StateObject private var store: ResearchShowcaseStore
    @Environment(\.scenePhase) private var scenePhase

    init(
        initialURL: URL? = nil,
        onClose: (() -> Void)? = nil,
        store: ResearchShowcaseStore? = nil,
        arguments: [String] = ProcessInfo.processInfo.arguments
    ) {
        self.initialURL = initialURL
        self.onClose = onClose
        resetsFixtureOnInitialLaunch = arguments.contains(
            "--synthetic-research-reset"
        )
        _store = StateObject(wrappedValue: store ?? ResearchShowcaseStore())
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.tsCanvas.ignoresSafeArea()
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 22) {
                            if store.phase == .idle {
                                header
                                disclosure
                            }
                            statusStrip
                                .id("research-phase-start")
                            content
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 18)
                        .padding(.bottom, 44)
                    }
                    .onChange(of: store.phase) { _ in
                        proxy.scrollTo("research-phase-start", anchor: .top)
                    }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if onClose != nil { closeBar }
        }
        .tint(.tsVermilion)
        .task(id: initialURL) {
            if let initialURL, let link = ResearchDeepLink.parse(initialURL) {
                await store.open(link)
            } else if resetsFixtureOnInitialLaunch {
                await store.reset()
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
                Text("RESEARCH ACTIVITY · DEBUG")
                    .font(.caption.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(Color.tsVermilion)
            }
            Text("Synthetic Research\nShowcase")
                .font(.custom("Georgia", size: 38, relativeTo: .largeTitle))
                .tracking(-0.7)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
            Text(
                "Inspect a real ActivityKit handoff from approved-page reading to explicit in-App review."
            )
            .font(.body)
            .foregroundStyle(Color.tsMutedInk)
            .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("research-showcase-header")
    }

    private var disclosure: some View {
        Label(
            "Deterministic Debug showcase · synthetic task and pages · public-source boundary · no candidate data · no external writes",
            systemImage: "testtube.2"
        )
        .font(.caption.weight(.semibold))
        .foregroundStyle(Color.tsMutedInk)
        .fixedSize(horizontal: false, vertical: true)
        .padding(14)
        .background(Color.tsSurfaceMuted, in: RoundedRectangle(cornerRadius: 14))
        .accessibilityIdentifier("research-synthetic-disclosure")
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
                Text("CURRENT RESEARCH STATE")
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
        .accessibilityIdentifier("research-status")
    }

    @ViewBuilder
    private var content: some View {
        switch store.phase {
        case .idle:
            setup
        case .running:
            running
        case let .review(openedFromActivity):
            review(openedFromActivity: openedFromActivity)
        case .routeRejected:
            rejected
        }
    }

    private var setup: some View {
        VStack(alignment: .leading, spacing: 18) {
            SectionLabel(text: "Approved synthetic manifest")
            Text("Three redacted page fixtures are in scope. No candidate, customer, account, or private-source data is present.")
                .font(.body)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            pageManifest
            Button {
                Task { await store.start() }
            } label: {
                Label("Start synthetic research", systemImage: "doc.text.magnifyingglass")
            }
            .buttonStyle(TSPrimaryButtonStyle())
            .accessibilityIdentifier("research-start")
        }
        .tsCard()
    }

    private var running: some View {
        VStack(alignment: .leading, spacing: 18) {
            SectionLabel(text: "Reading approved pages")
            Label("You can leave", systemImage: "arrow.down.right.and.arrow.up.left")
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.tsInk)
            Label("Public sources only", systemImage: "lock.shield")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
            Text(
                "Use Home, the Dynamic Island, or the Lock Screen to inspect the same task instance. This Debug control advances a deterministic fixture; it does not claim background network delivery."
            )
            .font(.body)
            .foregroundStyle(Color.tsMutedInk)
            .fixedSize(horizontal: false, vertical: true)
            Button {
                Task { await store.completeResearch() }
            } label: {
                Label("Mark pages ready for review", systemImage: "checkmark.circle")
            }
            .buttonStyle(TSPrimaryButtonStyle())
            .accessibilityIdentifier("research-complete")
            Button("End showcase") {
                Task { await store.reset() }
            }
            .buttonStyle(TSSecondaryButtonStyle())
            .accessibilityIdentifier("research-end")
        }
        .tsCard()
    }

    private func review(openedFromActivity: Bool) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            SectionLabel(text: "Pages ready for review")
            Text("Review required before use")
                .font(.title2.weight(.semibold))
                .foregroundStyle(Color.tsInk)
            Label("Nothing was used automatically", systemImage: "lock.shield")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
            if openedFromActivity {
                Label("Exact Live Activity ended", systemImage: "checkmark.circle")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .accessibilityIdentifier("research-exact-activity-ended")
            } else if store.identity != nil {
                Text("Leave the App and choose Open review on the Live Activity to prove the exact deep-link handoff.")
                    .font(.body)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            pageManifest
            identityReceipt
            Button("End showcase") {
                Task { await store.reset() }
            }
            .buttonStyle(TSSecondaryButtonStyle())
            .accessibilityIdentifier("research-review-end")
        }
        .tsCard()
        .accessibilityIdentifier(
            openedFromActivity
                ? "research-review-from-activity"
                : "research-review"
        )
    }

    private var pageManifest: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(ResearchShowcaseStore.pages) { page in
                VStack(alignment: .leading, spacing: 4) {
                    Text(page.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.tsInk)
                    Text(page.source)
                        .font(.caption.monospaced())
                        .foregroundStyle(Color.tsMutedInk)
                    Text(page.purpose)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(
                    Color.tsSurfaceMuted,
                    in: RoundedRectangle(cornerRadius: 12)
                )
            }
        }
        .accessibilityIdentifier("research-page-manifest")
    }

    private var identityReceipt: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("INSTANCE RECEIPT · REDACTED")
                .font(.caption2.weight(.bold))
                .tracking(0.8)
                .foregroundStyle(Color.tsMutedInk)
            Text("Task · \(redacted(ResearchShowcaseStore.taskID))")
            Text("Activity · \(redacted(store.identity?.activityInstanceID))")
        }
        .font(.caption.monospaced())
        .foregroundStyle(Color.tsMutedInk)
        .accessibilityIdentifier("research-instance-receipt")
    }

    private var rejected: some View {
        StateMessage(
            eyebrow: "Safe fallback",
            icon: "link.badge.plus",
            title: "This research Activity is no longer current",
            detail: "The task, instance, or stage did not match current local state. Nothing was ended or used."
        ) {
            Button("Start a fresh showcase") {
                Task { await store.reset() }
            }
            .buttonStyle(TSPrimaryButtonStyle())
        }
    }

    private var statusIcon: String {
        switch store.phase {
        case .idle: return "circle.dotted"
        case .running: return "doc.text.magnifyingglass"
        case .review: return "hand.raised"
        case .routeRejected: return "exclamationmark.triangle"
        }
    }

    private var closeBar: some View {
        HStack {
            Button { onClose?() } label: {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Close Synthetic Research Showcase")
            Spacer()
            Text("Synthetic Research")
                .font(.headline)
                .foregroundStyle(Color.tsInk)
            Spacer()
            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal, 12)
        .background(Color.tsCanvas)
    }

    private func redacted(_ value: String?) -> String {
        guard let value, !value.isEmpty else { return "ended" }
        return "••••\(value.suffix(8))"
    }
}

#Preview("Synthetic Research Showcase") {
    ResearchShowcaseView()
}
