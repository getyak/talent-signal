import XCTest
@testable import TalentSignal

@MainActor
final class LabResetTests: XCTestCase {
    func testIntentMustPersistBeforeEffectsAndCorruptionIsPreserved() async throws {
        let files = ResetMemoryFiles(), runner = ResetTestExecutor()
        let store = LabResetStore(files: files, enabled: true)
        files.failingWrites = [1]
        await store.start(actions: [.networkCache], reviewedContext: runner.context, executor: runner)
        XCTAssertTrue(runner.calls.isEmpty); XCTAssertTrue(store.operations.isEmpty)
        files.data = Data("broken-private-record".utf8)
        store.reload(); files.failingWrites = []
        await store.start(actions: [.networkCache], reviewedContext: runner.context, executor: runner)
        XCTAssertTrue(runner.calls.isEmpty); XCTAssertEqual(files.data, Data("broken-private-record".utf8))
    }
    func testRelaunchResumesOriginalIDAndSkipsVerifiedSteps() async throws {
        let files = ResetMemoryFiles(), runner = ResetTestExecutor()
        runner.failures = [.onboarding]
        let store = LabResetStore(files: files, enabled: true)
        await store.start(actions: [.networkCache, .onboarding, .workspace], reviewedContext: runner.context, executor: runner)
        let initial = try XCTUnwrap(store.unfinished)
        XCTAssertEqual(initial.steps.map(\.state), [.verified, .needsRetry, .pending])
        XCTAssertEqual(runner.calls, [.networkCache, .onboarding])
        let restored = LabResetStore(files: files, enabled: true)
        XCTAssertEqual(restored.unfinished?.id, initial.id)
        runner.failures = []
        await restored.resume(initial.id, executor: runner)
        XCTAssertEqual(runner.calls, [.networkCache, .onboarding, .onboarding, .workspace])
        XCTAssertEqual(restored.operations.first?.id, initial.id); XCTAssertTrue(restored.operations.first?.complete == true)
    }
    func testLostReceiptPreservesUnknownStepUntilExplicitRetry() async throws {
        let files = ResetMemoryFiles(), runner = ResetTestExecutor()
        files.failingWrites = [3, 4]
        let store = LabResetStore(files: files, enabled: true)
        await store.start(actions: [.networkCache], reviewedContext: runner.context, executor: runner)
        let persisted = try JSONDecoder().decode(LabResetArchive.self, from: XCTUnwrap(files.data))
        XCTAssertEqual(persisted.operations.first?.steps.first?.state, .running)
        XCTAssertEqual(runner.calls.count, 1)
        files.failingWrites = []
        let restored = LabResetStore(files: files, enabled: true)
        XCTAssertEqual(runner.calls.count, 1, "Relaunch does not silently repeat an effect")
        await restored.resume(try XCTUnwrap(restored.unfinished?.id), executor: runner)
        XCTAssertEqual(runner.calls.count, 2); XCTAssertTrue(restored.operations.first?.complete == true)
    }
    func testChangedScopeBlocksEffectsAndStoppingNeverClaimsVerification() async throws {
        let files = ResetMemoryFiles(), runner = ResetTestExecutor()
        runner.failures = [.onboarding]
        let store = LabResetStore(files: files, enabled: true)
        await store.start(actions: [.onboarding], reviewedContext: runner.context, executor: runner)
        let operation = try XCTUnwrap(store.unfinished)
        runner.context = .init(endpointScope: "different-environment", ownerScope: "different-account", credentialFingerprint: nil)
        await store.resume(operation.id, executor: runner)
        XCTAssertEqual(runner.calls, [.onboarding])
        store.stopRemaining(operation.id)
        XCTAssertNil(store.unfinished); XCTAssertFalse(try XCTUnwrap(store.operations.first).complete)
        XCTAssertEqual(store.operations.first?.steps.first?.state, .needsRetry)
        runner.failures = []
        await store.start(actions: [.networkCache], reviewedContext: runner.context, executor: runner)
        XCTAssertEqual(store.operations.count, 2)
        XCTAssertTrue(store.operations.first?.complete == true)
    }
    func testRealOnboardingResetKeepsEveryOtherFieldAndRecording() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("session-v1.json")
        let onboarding = FileStandaloneOnboardingStore(fileURL: file)
        var state = StandaloneOnboardingState.fresh(); state.startFirstProgressExample(); state.introCompleted = true
        try onboarding.save(state)
        let recordings = directory.appendingPathComponent("Recordings")
        try FileManager.default.createDirectory(at: recordings, withIntermediateDirectories: true)
        let original = recordings.appendingPathComponent("retained-source.m4a")
        try Data("synthetic-original-recording".utf8).write(to: original)
        var expected = try XCTUnwrap(onboarding.load()); expected.replayOnboarding()
        let runner = LabResetExecutor(session: nil, display: nil, onboarding: onboarding)
        let operation = LabResetOperation(id: UUID(), startedAt: Date(), context: runner.context, steps: [.init(action: .onboarding)])
        let result = try await runner.perform(.onboarding, operation: operation)
        XCTAssertTrue(result.verified); XCTAssertEqual(try onboarding.load(), expected)
        XCTAssertEqual(try Data(contentsOf: original), Data("synthetic-original-recording".utf8))
        let repeated = try await runner.perform(.onboarding, operation: operation)
        XCTAssertTrue(repeated.verified)
        XCTAssertEqual(try onboarding.load(), expected)
    }
    func testDisplayAndDiagnosticsResetPreserveIndependentStores() async throws {
        let suite = UUID().uuidString, defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("dark", forKey: LabDisplayStore.themeKey)
        defaults.set("protected-draft", forKey: "unrelated")
        let display = LabDisplayStore(defaults: defaults, enabled: true)
        display.savePreset(name: "Keep", configuration: .standard); display.apply(.standard, minutes: 5)
        let diagnostics = LabDiagnosticsStore(engine: LabDiagnosticsEngine(enabled: true), files: ResetMemoryFiles(), enabled: true, capturesDeviceSamples: false)
        diagnostics.start(.scrolling)
        let metrics = LabMetricKitStore(enabled: true, supportsDelivery: false, files: ResetMemoryFiles())
        let runner = LabResetExecutor(session: nil, display: display, diagnostics: diagnostics, metrics: metrics)
        let operation = LabResetOperation(id: UUID(), startedAt: Date(), context: runner.context, steps: [.init(action: .display), .init(action: .diagnostics)])
        let first = try await runner.perform(.display, operation: operation)
        XCTAssertTrue(first.verified); XCTAssertNil(display.active); XCTAssertNil(defaults.object(forKey: LabDisplayStore.themeKey))
        XCTAssertEqual(display.presets.count, 1); XCTAssertEqual(defaults.string(forKey: "unrelated"), "protected-draft")
        let cleared = try await runner.perform(.diagnostics, operation: operation)
        XCTAssertTrue(cleared.verified); XCTAssertNil(diagnostics.activeID); XCTAssertTrue(diagnostics.reports.isEmpty)
    }
    func testMaintenanceBlocksActualOnboardingAndStaleWorkspaceReadIsNotVerified() async throws {
        let onboarding = LabOnboardingMemoryStore(startsInReview: true)
        let original = try onboarding.load()
        let runner = LabResetExecutor(session: nil, display: nil, onboarding: onboarding, refreshWorkspace: { false })
        let operation = LabResetOperation(id: UUID(), startedAt: Date(), context: runner.context, steps: [.init(action: .onboarding), .init(action: .workspace)])
        let active = try RuntimeWorkRegistry.shared.begin(.recording)
        do { _ = try await runner.perform(.onboarding, operation: operation); XCTFail("Active recording blocks reset") }
        catch { XCTAssertTrue(error is RuntimeEnvironmentError) }
        RuntimeWorkRegistry.shared.end(active)
        XCTAssertEqual(try onboarding.load(), original)
        let stale = try await runner.perform(.workspace, operation: operation)
        XCTAssertFalse(stale.verified)
    }
    func testRealCacheReadbackAndCompositeSignOutKeepIndependentReceipts() async throws {
        let cache = URLCache(memoryCapacity: 100_000, diskCapacity: 0)
        let endpoint = URL(string: "https://reset-composite.example.test")!
        let request = URLRequest(url: endpoint)
        cache.storeCachedResponse(CachedURLResponse(response: URLResponse(url: endpoint, mimeType: "text/plain", expectedContentLength: 5, textEncodingName: nil), data: Data("cache".utf8)), for: request)
        let session = TalentSignalSession(baseURL: endpoint, accessToken: "synthetic-old-reset", expiresAt: Date() + 3600,
            account: .init(id: "fixture-a", slug: "fixture-a", name: "Synthetic"), user: .init(id: "fixture-u", email: "fixture@example.test", displayName: "Fixture", kind: "simulated_human"))
        let credentials = ResetSessionMemory(session), endings = MemoryAppSessionEndings(), client = ResetAuthentication()
        let auth = AppSessionStore(baseURL: endpoint, persistence: credentials, client: client, endings: endings)
        await auth.restore()
        let runner = LabResetExecutor(session: auth, display: nil, device: DeviceLabStore(cache: cache))
        let files = ResetMemoryFiles(), store = LabResetStore(files: files, enabled: true)
        await store.start(actions: [.networkCache, .signOut], reviewedContext: runner.context, executor: runner)
        let operation = try XCTUnwrap(store.unfinished), receipt = try XCTUnwrap(operation.steps.last?.receiptID)
        XCTAssertEqual(operation.steps.first?.state, .verified); XCTAssertEqual(operation.steps.first?.remainingCacheBytes, 0)
        XCTAssertNil(cache.cachedResponse(for: request)); XCTAssertNil(credentials.value)
        XCTAssertEqual(auth.phase, .signedOut); XCTAssertEqual(auth.endingReceipts.first?.id, receipt)
        let restored = LabResetStore(files: files, enabled: true)
        client.offline = false
        await restored.resume(operation.id, executor: runner)
        XCTAssertTrue(restored.operations.first?.complete == true)
        XCTAssertEqual(restored.operations.first?.id, operation.id)
        XCTAssertEqual(restored.operations.first?.steps.last?.receiptID, receipt)
        XCTAssertEqual(client.logouts, 2); XCTAssertNil(endings.values.first?.credential)
        let bytes = String(decoding: try XCTUnwrap(files.data), as: UTF8.self)
        XCTAssertFalse(bytes.contains(session.accessToken)); XCTAssertFalse(bytes.contains(session.user.email))
    }
}

private final class ResetSessionMemory: TalentSignalSessionPersisting {
    var value: TalentSignalSession?
    init(_ value: TalentSignalSession) { self.value = value }
    func load() throws -> TalentSignalSession? { value }
    func save(_ session: TalentSignalSession) throws { value = session }
    func delete() throws { value = nil }
}
private final class ResetAuthentication: AppAuthenticationServing {
    var offline = true
    var logouts = 0
    func challenge() async throws -> AppleLoginChallenge { .init(contractVersion: TalentSignalAPIContract.version, id: "fixture", nonce: "fixture", expiresAt: Date() + 300) }
    func validate(_ stored: TalentSignalSession) async throws -> TalentSignalSession { stored }
    func signIn(identityToken: String, challengeID: String, givenName: String?, familyName: String?) async throws -> TalentSignalSession { throw URLError(.unsupportedURL) }
    func logout(_ stored: TalentSignalSession) async throws { logouts += 1; if offline { throw URLError(.notConnectedToInternet) } }
}

private final class ResetMemoryFiles: LabDiagnosticPersisting {
    var data: Data?
    var writes = 0
    var failingWrites = Set<Int>()
    func read() throws -> Data? { data }
    func write(_ value: Data) throws { writes += 1; if failingWrites.contains(writes) { throw CocoaError(.fileWriteNoPermission) }; data = value }
    func clear() throws { data = nil }
}
@MainActor
private final class ResetTestExecutor: LabResetExecuting {
    var context = LabResetContext(endpointScope: "fixture-environment", ownerScope: "fixture-account", credentialFingerprint: nil)
    var failures = Set<LabResetAction>()
    var calls: [LabResetAction] = []
    func permits(_ operation: LabResetOperation, action: LabResetAction) -> Bool { operation.context == context }
    func perform(_ action: LabResetAction, operation: LabResetOperation) async throws -> LabResetStepResult {
        calls.append(action); return .init(verified: !failures.contains(action))
    }
}
