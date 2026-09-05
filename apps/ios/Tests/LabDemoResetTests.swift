import XCTest
@testable import TalentSignal

@MainActor
final class LabDemoResetTests: XCTestCase {
    func testRealFileResetRetainsMediaLedgerAndCalendarChoices() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = FileStandaloneOnboardingStore(fileURL: directory.appendingPathComponent("session.json"))
        var state = example()
        state.importedSharedEnvelopeIDs = [UUID(), UUID()]
        state.unassignedSystemCaptureID = UUID()
        state.selectedCalendarIDs = ["synthetic-calendar"]
        state.lastObservedCalendarPermission = .fullAccess
        state.calendarWindow = .recentAndUpcoming
        try persistence.save(state)
        let media = directory.appendingPathComponent("Recordings/private-original.m4a")
        try FileManager.default.createDirectory(at: media.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("synthetic-retained-recording".utf8).write(to: media)
        let files = DemoResetFiles(), store = LabResetStore(files: files, enabled: true)
        let runner = LabResetExecutor(session: nil, display: nil, onboarding: persistence)
        await store.start(actions: [.demo], reviewedContext: runner.context, executor: runner)
        let operation = try XCTUnwrap(store.operations.first)
        XCTAssertTrue(operation.complete)
        let result = try XCTUnwrap(persistence.load())
        XCTAssertEqual(result.sessionID, operation.id)
        XCTAssertNil(result.account); XCTAssertNil(result.pursuit); XCTAssertNil(result.proposal); XCTAssertNil(result.progress)
        XCTAssertEqual(result.route, .welcome)
        XCTAssertEqual(result.importedSharedEnvelopeIDs, state.importedSharedEnvelopeIDs)
        XCTAssertEqual(result.unassignedSystemCaptureID, state.unassignedSystemCaptureID)
        XCTAssertEqual(result.selectedCalendarIDs, state.selectedCalendarIDs)
        XCTAssertEqual(result.lastObservedCalendarPermission, .fullAccess)
        XCTAssertEqual(result.calendarWindow, .recentAndUpcoming)
        XCTAssertEqual(try Data(contentsOf: media), Data("synthetic-retained-recording".utf8))
        let receipt = String(decoding: try XCTUnwrap(files.data), as: UTF8.self)
        XCTAssertFalse(receipt.contains(state.captureDraft!.text))
        XCTAssertFalse(receipt.contains("synthetic-calendar"))
    }

    func testPersonalMixedEditedAndActiveCaptureAreIneligible() throws {
        var personal = example()
        personal.begin(displayName: "Personal", demoAccount: false)
        personal.account = .init(id: UUID(), displayName: "Personal", isDemo: false)
        var recorded = example(); recorded.captureDraft?.audioFileName = "retained.m4a"
        var imported = example(); imported.captureDraft?.sharedEnvelopeID = UUID()
        var typed = example(); typed.captureDraft?.text = "Private source typed into a Demo account"
        var edited = example(); edited.proposal?.facts[0].proposedValue = "User correction must stay"
        var active = example(); active.captureDraft?.state = .processing
        for state in [personal, recorded, imported, typed, edited, active] {
            XCTAssertNil(try LabDemoReset.target(state))
        }
        XCTAssertNotNil(try LabDemoReset.target(example()))
    }

    func testRevisionDoesNotDependOnSetInsertionOrder() throws {
        var first = example(), second = first
        let ids = (0..<50).map { _ in UUID() }
        first.importedSharedEnvelopeIDs = Set(ids)
        second.importedSharedEnvelopeIDs = Set(ids.reversed())
        XCTAssertEqual(try LabDemoReset.target(first), try LabDemoReset.target(second))
    }

    func testChangedReviewAndNewSessionCannotBeResetByAnOldIntent() async throws {
        let persistence = DemoOnboardingMemory(example())
        let runner = LabResetExecutor(session: nil, display: nil, onboarding: persistence)
        let context = runner.context
        persistence.state.captureDraft?.text = "A later user input"
        let store = LabResetStore(files: DemoResetFiles(), enabled: true)
        await store.start(actions: [.demo], reviewedContext: context, executor: runner)
        XCTAssertTrue(store.operations.isEmpty); XCTAssertEqual(persistence.saves, 0)
        let operation = LabResetOperation(id: UUID(), startedAt: Date(), context: context, steps: [.init(action: .demo)])
        do { _ = try await runner.perform(.demo, operation: operation); XCTFail("Stale review must not mutate newer input") }
        catch { XCTAssertEqual(persistence.saves, 0) }
        persistence.state = example()
        do { _ = try await runner.perform(.demo, operation: operation); XCTFail("A new Demo requires a new review") }
        catch { XCTAssertEqual(persistence.saves, 0) }
    }

    func testLostReceiptRelaunchReconcilesSameResetWithoutClearingNewWork() async throws {
        let persistence = DemoOnboardingMemory(example()), files = DemoResetFiles()
        files.failures = [3, 4]
        let runner = LabResetExecutor(session: nil, display: nil, onboarding: persistence)
        let store = LabResetStore(files: files, enabled: true)
        await store.start(actions: [.demo], reviewedContext: runner.context, executor: runner)
        XCTAssertEqual(persistence.saves, 1)
        let id = persistence.state.sessionID
        persistence.state.startFirstProgressExample()
        let newer = persistence.state
        files.failures = []
        let restored = LabResetStore(files: files, enabled: true)
        XCTAssertEqual(restored.unfinished?.id, id)
        await restored.resume(id, executor: runner)
        XCTAssertTrue(restored.operations.first?.complete == true)
        XCTAssertEqual(persistence.saves, 1)
        XCTAssertEqual(persistence.state, newer, "Receipt reconciliation never resets work created afterward")
    }

    func testIntentAndStateSaveFailuresPreserveOriginalThenRetrySameID() async throws {
        let original = example(), persistence = DemoOnboardingMemory(example()), files = DemoResetFiles()
        persistence.state = original
        let runner = LabResetExecutor(session: nil, display: nil, onboarding: persistence)
        let store = LabResetStore(files: files, enabled: true)
        files.failures = [1]
        await store.start(actions: [.demo], reviewedContext: runner.context, executor: runner)
        XCTAssertEqual(persistence.saves, 0); XCTAssertEqual(persistence.state, original)
        files.failures = []; persistence.rejectSaves = true
        await store.start(actions: [.demo], reviewedContext: runner.context, executor: runner)
        let pending = try XCTUnwrap(store.unfinished)
        XCTAssertEqual(persistence.state, original)
        persistence.rejectSaves = false
        await store.resume(pending.id, executor: runner)
        XCTAssertTrue(store.operations.first?.complete == true)
        XCTAssertEqual(persistence.state.sessionID, pending.id)
    }

    func testActiveRecordingBlocksDemoReset() async throws {
        let persistence = DemoOnboardingMemory(example())
        let runner = LabResetExecutor(session: nil, display: nil, onboarding: persistence)
        let operation = LabResetOperation(id: UUID(), startedAt: Date(), context: runner.context, steps: [.init(action: .demo)])
        let lease = try RuntimeWorkLease(.recording)
        defer { withExtendedLifetime(lease) {} }
        do { _ = try await runner.perform(.demo, operation: operation); XCTFail("Recording must block cleanup") }
        catch { XCTAssertEqual(persistence.saves, 0) }
    }

    func testCompositeDemoThenOnboardingUsesOneReviewedReplacement() async throws {
        let persistence = DemoOnboardingMemory(example())
        let runner = LabResetExecutor(session: nil, display: nil, onboarding: persistence)
        let store = LabResetStore(files: DemoResetFiles(), enabled: true)
        await store.start(actions: [.onboarding, .demo], reviewedContext: runner.context, executor: runner)
        XCTAssertEqual(store.operations.first?.steps.map(\.action), [.demo, .onboarding])
        XCTAssertTrue(store.operations.first?.complete == true)
        XCTAssertEqual(persistence.state.route, .welcome)
        let count = store.operations.count
        await store.start(actions: [.demo], reviewedContext: runner.context, executor: runner)
        XCTAssertEqual(store.operations.count, count, "An ineligible Demo must not create an unreadable pending journal")
    }

    private func example() -> StandaloneOnboardingState {
        var state = StandaloneOnboardingState.fresh(); state.startFirstProgressExample()
        return state
    }
}

private final class DemoOnboardingMemory: StandaloneOnboardingPersisting {
    var state: StandaloneOnboardingState
    var saves = 0, rejectSaves = false
    init(_ state: StandaloneOnboardingState) { self.state = state }
    func load() throws -> StandaloneOnboardingState? { state }
    func save(_ state: StandaloneOnboardingState) throws {
        if rejectSaves { throw CocoaError(.fileWriteNoPermission) }
        saves += 1; self.state = state
    }
    func reset() throws { XCTFail("Demo reset must not call broad reset") }
}
private final class DemoResetFiles: LabDiagnosticPersisting {
    var data: Data?, writes = 0
    var failures = Set<Int>()
    func read() throws -> Data? { data }
    func write(_ value: Data) throws {
        writes += 1; if failures.contains(writes) { throw CocoaError(.fileWriteNoPermission) }
        data = value
    }
    func clear() throws { data = nil }
}
