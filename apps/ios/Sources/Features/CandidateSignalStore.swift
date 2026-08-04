import Foundation

enum ImportKind: Equatable {
    case fixture(String)
    case selectedImage
    case localhost

    var title: String {
        switch self {
        case .fixture:
            return "Opening synthetic fixture"
        case .selectedImage:
            return "Reading selected image"
        case .localhost:
            return "Syncing localhost fixtures"
        }
    }
}

struct ImportFailure: Equatable {
    let kind: ImportKind
    let message: String
}

enum OutcomeKind: Equatable {
    case localHandoff
    case noAction
    case clarification
    case refused
    case noRetainedFacts
}

struct ReviewOutcome: Equatable {
    let kind: OutcomeKind
    let title: String
    let detail: String
}

enum SignalFlowStage: Equatable {
    case idle
    case importing(ImportKind)
    case importCancelled(ImportKind)
    case importFailed(ImportFailure)
    case reviewingFixture
    case reviewingUnboundImage
    case actionPreview
    case outcome(ReviewOutcome)
}

@MainActor
final class CandidateSignalStore: ObservableObject {
    @Published private(set) var stage: SignalFlowStage = .idle
    @Published private(set) var suite = FixtureCatalog.bundled
    @Published private(set) var session: ReviewSession?
    @Published var selectedFixtureID = "TS-CORE-01"
    @Published var localhostAddress = "http://127.0.0.1:8787/candidate-momentum-v1.json"
    @Published private(set) var sourceNotice = "Bundled synthetic suite · 8 cases · \(FixtureCatalog.version)"

    private let loader: FixtureLoading
    private let importDelayNanoseconds: UInt64
    private var importTask: Task<Void, Never>?

    init(
        loader: FixtureLoading = URLFixtureLoader(),
        importDelayNanoseconds: UInt64 = 2_000_000_000,
        launchConfiguration: AppLaunchConfiguration = .current
    ) {
        self.loader = loader
        self.importDelayNanoseconds = importDelayNanoseconds
        apply(launchConfiguration)
    }

    deinit {
        importTask?.cancel()
    }

    func beginFixtureImport() {
        let fixtureID = selectedFixtureID
        start(kind: .fixture(fixtureID)) { [weak self] in
            guard let self else { return }
            try await Task.sleep(nanoseconds: importDelayNanoseconds)
            try Task.checkCancellation()
            guard let fixture = FixtureCatalog.fixture(id: fixtureID, in: suite) else {
                throw StoreError.fixtureMissing
            }
            open(fixture)
        }
    }

    func beginSelectedImageImport() {
        cancelCurrentTask()
        session = nil
        stage = .importing(.selectedImage)
    }

    func finishSelectedImageImport() {
        guard stage == .importing(.selectedImage) else { return }
        session = nil
        sourceNotice = "User-selected image · unbound · no extraction performed"
        stage = .reviewingUnboundImage
    }

    func failSelectedImageImport(message: String) {
        guard stage == .importing(.selectedImage) else { return }
        session = nil
        stage = .importFailed(
            ImportFailure(kind: .selectedImage, message: message)
        )
    }

    func syncFromLocalhost() {
        guard let url = URL(string: localhostAddress) else {
            stage = .importFailed(
                ImportFailure(
                    kind: .localhost,
                    message: FixtureSyncError.invalidAddress.localizedDescription
                )
            )
            return
        }

        start(kind: .localhost) { [weak self] in
            guard let self else { return }
            let loadedSuite = try await loader.load(from: url)
            try Task.checkCancellation()
            suite = loadedSuite
            sourceNotice = "Read-only localhost sync · \(loadedSuite.cases.count) synthetic cases · \(loadedSuite.version)"
            guard let fixture = FixtureCatalog.fixture(id: selectedFixtureID, in: loadedSuite)
                ?? loadedSuite.cases.first else {
                throw StoreError.fixtureMissing
            }
            selectedFixtureID = fixture.id
            open(fixture)
        }
    }

    func cancelImport() {
        guard case let .importing(kind) = stage else { return }
        cancelCurrentTask()
        session = nil
        stage = .importCancelled(kind)
    }

    func retryImport() {
        guard case let .importFailed(failure) = stage else { return }
        switch failure.kind {
        case let .fixture(id):
            selectedFixtureID = id
            beginFixtureImport()
        case .selectedImage:
            reset()
        case .localhost:
            syncFromLocalhost()
        }
    }

    func confirmFact(id: String) -> Bool {
        mutateSession { $0.confirm(factID: id) }
    }

    func editFact(id: String, value: String) -> Bool {
        mutateSession { $0.edit(factID: id, value: value) }
    }

    func dismissFact(id: String) -> Bool {
        mutateSession { $0.dismiss(factID: id) }
    }

    func showActionPreview() -> Bool {
        guard var updated = session, updated.makeActionPreview() != nil else {
            return false
        }
        session = updated
        stage = .actionPreview
        return true
    }

    func returnToReview() {
        guard session != nil else { return }
        stage = .reviewingFixture
    }

    func completeLocalHandoff() {
        guard let session, session.isPreviewCurrent else { return }
        stage = .outcome(
            ReviewOutcome(
                kind: .localHandoff,
                title: "Local handoff is ready",
                detail: "The reviewed context remains in this demo. No message, meeting, contact, ATS record, or reminder was created."
            )
        )
    }

    func finishWithoutAction() {
        guard let session else { return }

        let outcome: ReviewOutcome
        switch session.fixture.expected.disposition {
        case .noAction:
            outcome = ReviewOutcome(
                kind: .noAction,
                title: "No action is the result",
                detail: "The evidence is preserved for this local review without manufacturing urgency or a follow-up task."
            )
        case .clarify:
            outcome = ReviewOutcome(
                kind: .clarification,
                title: "Clarification is required",
                detail: "Identity, date, or timezone remains unresolved. No candidate fact was persisted and no action was created."
            )
        case .block:
            outcome = ReviewOutcome(
                kind: .refused,
                title: "Candidate scoring was refused",
                detail: "Response speed, tone, and shared interests are not evidence for culture fit, candidate quality, or acceptance likelihood."
            )
        case .proposeAction:
            outcome = ReviewOutcome(
                kind: .noRetainedFacts,
                title: "No reviewed fact remains",
                detail: "All proposed facts were dismissed, so the action proposal was not carried forward."
            )
        }
        stage = .outcome(outcome)
    }

    func reset() {
        cancelCurrentTask()
        session = nil
        suite = FixtureCatalog.bundled
        sourceNotice = "Bundled synthetic suite · 8 cases · \(FixtureCatalog.version)"
        stage = .idle
    }

    private func mutateSession(_ mutation: (inout ReviewSession) -> Bool) -> Bool {
        guard var updated = session, mutation(&updated) else {
            return false
        }
        session = updated
        return true
    }

    private func open(_ fixture: FixtureCase) {
        session = ReviewSession(fixture: fixture)
        stage = .reviewingFixture
    }

    private func start(
        kind: ImportKind,
        operation: @escaping @MainActor () async throws -> Void
    ) {
        cancelCurrentTask()
        session = nil
        stage = .importing(kind)
        importTask = Task { [weak self] in
            do {
                try await operation()
            } catch is CancellationError {
                return
            } catch {
                guard let self, case .importing = self.stage else { return }
                self.stage = .importFailed(
                    ImportFailure(kind: kind, message: error.localizedDescription)
                )
            }
        }
    }

    private func cancelCurrentTask() {
        importTask?.cancel()
        importTask = nil
    }

    private func apply(_ configuration: AppLaunchConfiguration) {
        if let endpoint = configuration.endpoint {
            localhostAddress = endpoint
        }

        switch configuration.scenario {
        case let .fixture(id):
            selectedFixtureID = id
            if let fixture = FixtureCatalog.fixture(id: id) {
                open(fixture)
            }
        case .unrelatedImage:
            session = nil
            sourceNotice = "User-selected image · unbound · no extraction performed"
            stage = .reviewingUnboundImage
        case .importCancelled:
            stage = .importCancelled(.selectedImage)
        case .importFailed:
            stage = .importFailed(
                ImportFailure(
                    kind: .localhost,
                    message: "The local fixture server could not be reached. No review state changed."
                )
            )
        case .stalePreview:
            guard let fixture = FixtureCatalog.fixture(id: "TS-CORE-01") else { return }
            var staleSession = ReviewSession(fixture: fixture)
            for fact in staleSession.facts {
                _ = staleSession.confirm(factID: fact.id)
            }
            _ = staleSession.makeActionPreview()
            staleSession.invalidatePreviewForTesting()
            session = staleSession
            selectedFixtureID = fixture.id
            stage = .actionPreview
        case .idle:
            break
        }
    }
}

enum StoreError: LocalizedError {
    case fixtureMissing

    var errorDescription: String? {
        "The selected synthetic fixture is not present in this suite."
    }
}

struct AppLaunchConfiguration: Equatable {
    enum Scenario: Equatable {
        case idle
        case fixture(String)
        case unrelatedImage
        case importCancelled
        case importFailed
        case stalePreview
    }

    let scenario: Scenario
    let endpoint: String?

    static var current: AppLaunchConfiguration {
        parse(arguments: ProcessInfo.processInfo.arguments)
    }

    static func parse(arguments: [String]) -> AppLaunchConfiguration {
        let fixtureID = value(after: "--fixture-id", in: arguments)
        let scenarioValue = value(after: "--scenario", in: arguments)
        let endpoint = value(after: "--endpoint", in: arguments)

        let scenario: Scenario
        if let fixtureID {
            scenario = .fixture(fixtureID)
        } else {
            switch scenarioValue {
            case "unrelated-image":
                scenario = .unrelatedImage
            case "import-cancelled":
                scenario = .importCancelled
            case "import-failed":
                scenario = .importFailed
            case "stale-preview":
                scenario = .stalePreview
            default:
                scenario = .idle
            }
        }
        return AppLaunchConfiguration(scenario: scenario, endpoint: endpoint)
    }

    private static func value(after flag: String, in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: flag),
              arguments.indices.contains(index + 1) else {
            return nil
        }
        return arguments[index + 1]
    }
}
