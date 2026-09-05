import XCTest
@testable import TalentSignal

@MainActor
final class LabFaultTests: XCTestCase {
    func testOneShotHTTPFaultsTraverseActualWorkspaceDecoderAndRecover() async throws {
        for (preset, status) in [(LabFaultPreset.unauthorizedOnce, 401), (.rateLimitedOnce, 429), (.serverErrorOnce, 500)] {
            let service = try LabFaultWorkspaceService(preset: preset, seconds: 60, enabled: true)
            do {
                _ = try await service.loadWorkspace()
                XCTFail("Expected the injected read to fail")
            } catch {
                guard case let PursuitWorkspaceClientError.backend(code, _) = error else { XCTFail("Unexpected error: \(error)"); await service.close(); continue }
                XCTAssertEqual(code, "LAB_SYNTHETIC_\(status)")
            }
            let snapshot = try await service.loadWorkspace()
            XCTAssertEqual(snapshot.workspaceID, LabFaultFixtures.workspaceID)
            XCTAssertEqual(snapshot.people.first?.id, LabFaultFixtures.personID)
            let state = await service.engine.state()
            XCTAssertEqual(state.events.filter { $0.injected && $0.status == status }.count, 1)
            XCTAssertEqual(state.events.first { $0.injected }?.route, .people)
            await service.close()
            XCTAssertNil(LabFaultRegistry.shared.engine(host: service.baseURL.host))
        }
    }

    func testInterruptedResponseDoesNotAdoptPartialJSONAndRetryWorks() async throws {
        let service = try LabFaultWorkspaceService(preset: .interruptedOnce, seconds: 60, enabled: true)
        do { _ = try await service.loadWorkspace(); XCTFail("Partial JSON must not be adopted") }
        catch { XCTAssertEqual((error as? URLError)?.code, .networkConnectionLost) }
        let snapshot = try await service.loadWorkspace()
        XCTAssertEqual(snapshot.people.count, 1)
        await service.close()
    }

    func testMonotonicExpiryDisablesOfflineInjection() async throws {
        let clock = LabFaultTestClock()
        let service = try LabFaultWorkspaceService(preset: .offline, seconds: 1, enabled: true, clock: clock.read)
        do { _ = try await service.loadWorkspace(); XCTFail("Expected offline") }
        catch { XCTAssertEqual((error as? URLError)?.code, .notConnectedToInternet) }
        clock.advance(2)
        let snapshot = try await service.loadWorkspace()
        XCTAssertEqual(snapshot.people.count, 1)
        let state = await service.engine.state()
        XCTAssertEqual(state.ended, .expired)
        await service.close()
    }

    func testExpiredEvidenceChangesActualTodayProjectionAndCanBeRestored() async throws {
        let service = try LabFaultWorkspaceService(preset: .staleEvidence, seconds: 60, enabled: true)
        let expired = try await service.loadWorkspace()
        XCTAssertEqual(expired.todayItems.first?.evidenceState?.availability, "unavailable")
        XCTAssertEqual(expired.proposals.first?.items.first?.evidenceState.availableReferenceCount, 0)
        await service.end(.stopped)
        let restored = try await service.loadWorkspace()
        XCTAssertEqual(restored.todayItems.first?.evidenceState?.availability, "available")
        XCTAssertEqual(restored.proposals.first?.id, expired.proposals.first?.id)
        XCTAssertEqual(restored.people, expired.people)
        await service.close()
    }

    func testCloseCancelsDelayedTransportAndDoesNotChangeRuntimeSession() async throws {
        XCTAssertFalse(LabFaultURLProtocol.isIsolated(TalentSignalNetworking.session))
        let service = try LabFaultWorkspaceService(preset: .latency, seconds: 60, enabled: true)
        let read = Task { try await service.loadWorkspace() }
        try await Task.sleep(for: .milliseconds(100))
        await service.close()
        do { _ = try await read.value; XCTFail("Closed session must not complete its delayed read") } catch {}
        let state = await service.engine.state()
        XCTAssertTrue(state.events.allSatisfy { $0.result == .cancelled })
        XCTAssertNil(LabFaultRegistry.shared.engine(host: service.baseURL.host))
        XCTAssertFalse(LabFaultURLProtocol.isIsolated(TalentSignalNetworking.session))
        do { _ = try await service.loadWorkspace(); XCTFail("Closed fixture must not fall through to networking") }
        catch { XCTAssertEqual((error as? URLError)?.code, .unsupportedURL) }
    }

    func testCancelledReadSettlesItsTraceAndSessionCanRecover() async throws {
        let service = try LabFaultWorkspaceService(preset: .latency, seconds: 60, enabled: true)
        let read = Task { try await service.loadWorkspace() }
        var before = await service.engine.state()
        for _ in 0..<100 where before.events.isEmpty {
            try await Task.sleep(for: .milliseconds(10))
            before = await service.engine.state()
        }
        XCTAssertFalse(before.events.isEmpty)
        read.cancel()
        do { _ = try await read.value; XCTFail("Cancelled read must not return a workspace") } catch {}
        var after = await service.engine.state()
        for _ in 0..<100 where after.events.contains(where: { $0.result == .pending }) {
            try await Task.sleep(for: .milliseconds(10))
            after = await service.engine.state()
        }
        XCTAssertTrue(after.events.allSatisfy { $0.result == .cancelled })
        XCTAssertNotNil(LabFaultRegistry.shared.engine(host: service.baseURL.host))
        await service.end(.stopped)
        let restored = try await service.loadWorkspace()
        XCTAssertEqual(restored.people.count, 1)
        await service.close()
    }

    func testIsolationRejectsUnexpectedOriginsCredentialsMethodsAndWrites() async throws {
        XCTAssertThrowsError(try LabFaultWorkspaceService(preset: .offline, seconds: 60, enabled: false))
        let service = try LabFaultWorkspaceService(preset: .offline, seconds: 60, enabled: true)
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [LabFaultURLProtocol.self]
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }
        var valid = URLRequest(url: service.baseURL.appendingPathComponent("v1/people"))
        valid.setValue("Bearer \(LabFaultFixtures.token)", forHTTPHeaderField: "Authorization")
        XCTAssertTrue(LabFaultURLProtocol.permits(valid))
        var wrongToken = valid; wrongToken.setValue("REAL_CREDENTIAL_MUST_NOT_LEAVE", forHTTPHeaderField: "Authorization")
        var wrongOrigin = valid; wrongOrigin.url = URL(string: "https://127.0.0.1:1/v1/people")!
        var wrongMethod = valid; wrongMethod.httpMethod = "POST"
        var wrongPath = valid; wrongPath.url = service.baseURL.appendingPathComponent("v1/secret")
        var body = valid; body.httpBody = Data("PRIVATE_CONTENT".utf8)
        for request in [wrongToken, wrongOrigin, wrongMethod, wrongPath, body] {
            XCTAssertFalse(LabFaultURLProtocol.permits(request))
            do { _ = try await TalentSignalNetworking.data(for: request, using: session); XCTFail("Unexpected fixture IO") }
            catch { XCTAssertEqual((error as? URLError)?.code, .unsupportedURL) }
        }
        do { _ = try await service.chatUnscoped(objective: "Must not dispatch", idempotencyKey: "synthetic"); XCTFail("Fixture services must not call a model") }
        catch { XCTAssertEqual(error as? PursuitWorkspaceClientError, .askUnavailable) }
        let state = await service.engine.state()
        XCTAssertTrue(state.events.isEmpty)
        await service.close()
    }

    func testDiagnosticsExplicitlyIdentifiesSyntheticTransport() async throws {
        XCTAssertNotNil(LabDiagnosticsEngine.shared.start(task: .requestFailure, now: Date()))
        let service = try LabFaultWorkspaceService(preset: .staleEvidence, seconds: 60, enabled: true)
        _ = try await service.loadWorkspace()
        let report = try XCTUnwrap(LabDiagnosticsEngine.shared.stop(.stopped))
        XCTAssertEqual(report.requests.count, 3)
        XCTAssertTrue(report.requests.allSatisfy { $0.origin == .syntheticFault })
        let json = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
        XCTAssertFalse(json.contains(service.baseURL.host!))
        XCTAssertFalse(json.contains(LabFaultFixtures.token))
        await service.close()
    }

    func testOldPreviewCloseDoesNotCloseANewSessionAndBackgroundStopsFault() async throws {
        let store = LabFaultStore(enabled: true)
        await store.start(.unauthorizedOnce, minutes: 1)
        let previous = try XCTUnwrap(store.sessionID)
        await store.close(ifSessionID: previous)
        await store.start(.offline, minutes: 1)
        let next = try XCTUnwrap(store.sessionID)
        await store.close(ifSessionID: previous)
        XCTAssertEqual(store.sessionID, next)
        await store.stop(.background)
        XCTAssertEqual(store.state?.ended, .background)
        store.reload()
        for _ in 0..<100 where store.isWorking { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertEqual(store.workspace?.snapshot?.people.first?.id, LabFaultFixtures.personID)
        await store.close(ifSessionID: next)
        XCTAssertNil(store.workspace)
    }
}

private final class LabFaultTestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0.0
    func read() -> Double { lock.lock(); defer { lock.unlock() }; return value }
    func advance(_ seconds: Double) { lock.lock(); value += seconds; lock.unlock() }
}
