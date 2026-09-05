import Foundation
import Security
import XCTest
@testable import TalentSignal

@MainActor
final class LabWorkspaceTests: XCTestCase {
    private let endpoint = URL(string: "https://workspace.example.test")!

    func testProtectedKeychainJournalRoundTripsOnlyInsideEndpointScope() throws {
        let service = "com.talentsignal.test.lab-workspace." + UUID().uuidString
        let store = KeychainLabWorkspaceJourneyStore(endpoint: endpoint, service: service)
        let other = KeychainLabWorkspaceJourneyStore(endpoint: URL(string: "https://other.example.test")!, service: service)
        defer {
            SecItemDelete([kSecClass as String: kSecClassGenericPassword,
                           kSecAttrService as String: service] as CFDictionary)
        }
        var value = LabWorkspaceJourney(owner: owner(), durationHours: 4,
            accessToken: Data(repeating: 7, count: 32).base64URLEncodedString)
        value.workspace = workspace(id: value.id)
        value.targetAccountID = value.workspace?.accountID
        value.targetUserID = value.workspace?.userID
        value.phase = .entryReady
        try store.save(value)
        let restored = try XCTUnwrap(store.load())
        XCTAssertEqual(restored.id, value.id)
        XCTAssertEqual(restored.entryID, value.entryID)
        XCTAssertEqual(restored.phase, .entryReady)
        XCTAssertEqual(restored.originalSession, value.originalSession)
        XCTAssertEqual(restored.childAccessToken, value.childAccessToken)
        XCTAssertEqual(restored.workspace?.id, value.workspace?.id)
        XCTAssertEqual(restored.workspace?.dataRows, 0)
        XCTAssertLessThan(abs(restored.startedAt.timeIntervalSince(value.startedAt)), 0.001)
        XCTAssertNil(try other.load())
        try store.delete()
        XCTAssertNil(try store.load())
    }

    func testProductionKeychainStoresAdoptAProtectedSimulatedJourney() async throws {
        let port = Int.random(in: 54_000...59_000)
        let url = URL(string: "http://127.0.0.1:\(port)")!
        let original = TalentSignalSession(baseURL: url, accessToken: "owner-token",
            expiresAt: Date(timeIntervalSince1970: 2_000_000_000),
            account: .init(id: "owner-account", slug: "fixture-alpha", name: "Original workspace"),
            user: .init(id: "owner-user", email: "reviewer@alpha.local",
                displayName: "Reviewer", kind: "simulated_human"))
        let credentials = KeychainTalentSignalSessionStore(baseURL: url)
        let journal = KeychainLabWorkspaceJourneyStore(endpoint: url)
        try? credentials.delete(); try? journal.delete()
        defer { try? credentials.delete(); try? journal.delete() }
        try credentials.save(original)
        let auth = WorkspaceAuthentication()
        let app = AppSessionStore(baseURL: url, persistence: credentials, client: auth,
            endings: MemoryAppSessionEndings())
        await app.restore(allowOfflineWorkspace: false)
        let api = WorkspaceServiceFixture(owner: original)
        let store = LabWorkspaceStore(sessionStore: app, persistenceFactory: { _ in journal },
            clientFactory: { _ in api })

        await store.createAndEnter(durationHours: 4)

        XCTAssertEqual(app.currentSession?.user.kind, "lab_human")
        XCTAssertEqual(store.journey?.phase, .childActive)
        XCTAssertFalse(store.secureStoreFailed)
        XCTAssertEqual(try journal.load(), store.journey)
    }

    func testCreateRelaunchReturnAndDeletePreservesOriginalAndProducesReceipt() async throws {
        let credentials = WorkspaceSessionMemory(owner())
        let auth = WorkspaceAuthentication()
        let app = AppSessionStore(baseURL: endpoint, persistence: credentials, client: auth,
            endings: MemoryAppSessionEndings())
        await app.restore(allowOfflineWorkspace: false)
        let journal = WorkspaceJourneyMemory()
        let api = WorkspaceServiceFixture(owner: owner())
        api.journal = journal
        let store = makeStore(app: app, journal: journal, api: api)

        await store.createAndEnter(durationHours: 4)
        guard case let .signedIn(child) = app.phase else { return XCTFail("Expected child session") }
        XCTAssertEqual(child.user.kind, "lab_human")
        XCTAssertTrue(store.allowsDisplay(child))
        XCTAssertEqual(store.journey?.phase, .childActive)
        XCTAssertEqual(store.journey?.originalSession, owner())
        XCTAssertEqual(store.journey?.childAccessToken, api.receivedEntryToken)
        XCTAssertTrue(api.createSawProtectedIntent)
        XCTAssertTrue(api.enterSawWorkspaceReadback)

        let relaunchedApp = AppSessionStore(baseURL: endpoint, persistence: credentials, client: auth,
            endings: MemoryAppSessionEndings())
        await relaunchedApp.restore(allowOfflineWorkspace: false)
        let relaunched = makeStore(app: relaunchedApp, journal: journal, api: api)
        XCTAssertTrue(relaunched.requiresOnlineRestore)
        await relaunched.reconcile()
        XCTAssertEqual(relaunched.journey?.phase, .childActive)
        XCTAssertEqual(api.readTokens.last, child.accessToken)

        await relaunched.endCurrentWorkspace()
        XCTAssertEqual(relaunchedApp.currentSession, owner())
        XCTAssertEqual(relaunched.journey?.phase, .finished)
        XCTAssertNil(relaunched.journey?.originalSession)
        XCTAssertNil(relaunched.journey?.childAccessToken)
        XCTAssertEqual(relaunched.receipt?.state, .deleted)
        XCTAssertEqual(relaunched.receipt?.dataRows, 0)
        XCTAssertEqual(api.events.suffix(2), ["leave", "stop"])
        XCTAssertTrue(api.stopSawDurableIntent)
    }

    func testNetworkRetryAndMaintenanceBarrierKeepSameProtectedIntent() async throws {
        let credentials = WorkspaceSessionMemory(owner())
        let auth = WorkspaceAuthentication()
        let app = AppSessionStore(baseURL: endpoint, persistence: credentials, client: auth,
            endings: MemoryAppSessionEndings())
        await app.restore(allowOfflineWorkspace: false)
        let journal = WorkspaceJourneyMemory()
        let api = WorkspaceServiceFixture(owner: owner())
        api.journal = journal
        api.createFailures = 1
        let store = makeStore(app: app, journal: journal, api: api)

        await store.createAndEnter()
        let firstID = try XCTUnwrap(store.journey?.id)
        let firstEntry = try XCTUnwrap(store.journey?.entryID)
        let firstToken = try XCTUnwrap(store.journey?.childAccessToken)
        XCTAssertEqual(store.journey?.phase, .preparing)
        XCTAssertEqual(app.currentSession, owner())

        let recording = try RuntimeWorkRegistry.shared.begin(.recording)
        await store.retry()
        XCTAssertEqual(store.journey?.id, firstID)
        XCTAssertEqual(store.journey?.entryID, firstEntry)
        XCTAssertEqual(store.journey?.childAccessToken, firstToken)
        XCTAssertEqual(store.journey?.phase, .entryReady)
        XCTAssertEqual(app.currentSession, owner())
        RuntimeWorkRegistry.shared.end(recording)

        await store.retry()
        XCTAssertEqual(app.currentSession?.user.kind, "lab_human")
        XCTAssertEqual(api.createdIDs, [firstID, firstID])
        XCTAssertEqual(Set(api.entryIDs), Set([firstEntry]))
        XCTAssertEqual(Set(api.entryTokens), Set([firstToken]))
    }

    func testSignedOutPreparingJourneyRecoversOwnerBeforeResumingSameIntent() async throws {
        let firstCredentials = WorkspaceSessionMemory(owner())
        let auth = WorkspaceAuthentication()
        let firstApp = AppSessionStore(baseURL: endpoint, persistence: firstCredentials, client: auth,
            endings: MemoryAppSessionEndings())
        await firstApp.restore(allowOfflineWorkspace: false)
        let journal = WorkspaceJourneyMemory()
        let api = WorkspaceServiceFixture(owner: owner())
        api.createFailures = 1
        let first = makeStore(app: firstApp, journal: journal, api: api)
        await first.createAndEnter()
        let operationID = try XCTUnwrap(first.journey?.id)
        let entryID = try XCTUnwrap(first.journey?.entryID)

        let relaunchedApp = AppSessionStore(baseURL: endpoint,
            persistence: WorkspaceSessionMemory(nil), client: auth, endings: MemoryAppSessionEndings())
        await relaunchedApp.restore(allowOfflineWorkspace: false)
        let relaunched = makeStore(app: relaunchedApp, journal: journal, api: api)
        await relaunched.recoverOriginalSession()

        XCTAssertEqual(relaunchedApp.currentSession?.user.kind, "lab_human")
        XCTAssertEqual(relaunched.journey?.phase, .childActive)
        XCTAssertEqual(relaunched.journey?.id, operationID)
        XCTAssertEqual(relaunched.journey?.entryID, entryID)
        XCTAssertEqual(api.createdIDs, [operationID, operationID])
    }

    func testMismatchedDelegatedIdentityNeverReplacesOriginalSession() async throws {
        let credentials = WorkspaceSessionMemory(owner())
        let auth = WorkspaceAuthentication()
        let app = AppSessionStore(baseURL: endpoint, persistence: credentials, client: auth,
            endings: MemoryAppSessionEndings())
        await app.restore(allowOfflineWorkspace: false)
        let journal = WorkspaceJourneyMemory()
        let api = WorkspaceServiceFixture(owner: owner())
        api.entryAccountID = "unexpected-account"
        let store = makeStore(app: app, journal: journal, api: api)

        await store.createAndEnter()

        XCTAssertEqual(app.currentSession, owner())
        XCTAssertEqual(store.journey?.phase, .preparing)
        XCTAssertNotNil(store.journey?.workspace)
        XCTAssertEqual(store.notice, LabWorkspaceError.invalidResponse.localizedDescription)
    }

    func testFreshOwnerReauthenticationCompletesReturnWhenSavedOwnerCredentialExpired() async throws {
        let credentials = WorkspaceSessionMemory(owner())
        let auth = WorkspaceAuthentication()
        let app = AppSessionStore(baseURL: endpoint, persistence: credentials, client: auth,
            endings: MemoryAppSessionEndings())
        await app.restore(allowOfflineWorkspace: false)
        let journal = WorkspaceJourneyMemory()
        let api = WorkspaceServiceFixture(owner: owner())
        let store = makeStore(app: app, journal: journal, api: api)
        await store.createAndEnter()

        var retained = try XCTUnwrap(journal.value)
        retained.originalSession = expiredOwner()
        try journal.save(retained)
        _ = await app.signOut()
        let relaunched = makeStore(app: app, journal: journal, api: api)
        await relaunched.recoverOriginalSession()
        XCTAssertEqual(app.phase, .signedOut)
        XCTAssertNotNil(relaunched.journey?.originalSession)

        auth.signInResponse = owner(token: "fresh-owner-token")
        await app.prepareChallenge()
        await app.signIn(identityToken: Data("fixture".utf8), fullName: nil)
        XCTAssertEqual(app.currentSession?.accessToken, "fresh-owner-token")
        await relaunched.reconcile()
        XCTAssertNil(relaunched.journey)
        XCTAssertEqual(api.events.last, "leave")
        XCTAssertNil(journal.value)
    }

    func testURLClientUsesOwnerTokenAndDecodesVerifiedEmptyWorkspace() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LabWorkspaceURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel(); LabWorkspaceURLProtocol.handler = nil }
        let id = UUID()
        LabWorkspaceURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/v1/lab/workspaces")
            XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer owner-token")
            let body = try XCTUnwrap(Self.bodyData(request))
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(json["id"] as? String, id.uuidString)
            XCTAssertEqual(json["duration_hours"] as? Int, 4)
            let response: [String: Any] = [
                "contract_version": TalentSignalAPIContract.version,
                "workspace": Self.workspaceJSON(id: id)
            ]
            return (200, try JSONSerialization.data(withJSONObject: response))
        }
        let client = URLLabWorkspaceClient(baseURL: endpoint, network: network)
        let result = try await client.create(id: id, durationHours: 4, using: owner())
        XCTAssertEqual(result.id, id)
        XCTAssertTrue(result.isEmptyAndIsolated)
    }

    private func makeStore(app: AppSessionStore, journal: WorkspaceJourneyMemory,
                           api: WorkspaceServiceFixture) -> LabWorkspaceStore {
        LabWorkspaceStore(sessionStore: app, persistenceFactory: { _ in journal }, clientFactory: { _ in api })
    }

    private func owner(token: String = "owner-token") -> TalentSignalSession {
        TalentSignalSession(baseURL: endpoint, accessToken: token,
            expiresAt: Date(timeIntervalSince1970: 2_000_000_000),
            account: .init(id: "owner-account", slug: "owner", name: "Original workspace"),
            user: .init(id: "owner-user", email: "owner@example.test", displayName: "Owner", kind: "human"))
    }

    private func expiredOwner() -> TalentSignalSession {
        TalentSignalSession(baseURL: endpoint, accessToken: "expired-owner",
            expiresAt: Date(timeIntervalSince1970: 1), account: owner().account, user: owner().user)
    }

    private func workspace(id: UUID, state: LabWorkspace.State = .active) -> LabWorkspace {
        LabWorkspace(id: id, ownerAccountID: "owner-account", ownerUserID: "owner-user",
            accountID: "test-account", userID: "test-user", name: "Test workspace · \(id.uuidString.prefix(8))",
            state: state, createdAt: Date(timeIntervalSince1970: 1_900_000_000),
            emptyVerifiedAt: Date(timeIntervalSince1970: 1_900_000_001),
            expiresAt: Date(timeIntervalSince1970: 2_000_000_000), durationHours: 4,
            stopID: nil, stopReason: nil, stoppedAt: nil, deletedAt: nil, cleanupError: nil,
            dataRows: 0, activeSessions: state == .active ? 1 : 0, pendingMediaWrites: 0,
            scope: "isolated_test_account")
    }

    private static func workspaceJSON(id: UUID) -> [String: Any] {
        ["id": id.uuidString.lowercased(), "owner_account_id": "owner-account",
         "owner_user_id": "owner-user", "account_id": "test-account", "user_id": "test-user",
         "name": "Test workspace", "state": "active", "created_at": "2030-01-01T00:00:00Z",
         "empty_verified_at": "2030-01-01T00:00:01Z", "expires_at": "2030-01-01T04:00:00Z",
         "duration_hours": 4, "stop_id": NSNull(), "stop_reason": NSNull(), "stopped_at": NSNull(),
         "deleted_at": NSNull(), "cleanup_error": NSNull(), "data_rows": 0, "active_sessions": 0,
         "pending_media_writes": 0, "scope": "isolated_test_account"]
    }

    private static func bodyData(_ request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open(); defer { stream.close() }
        var result = Data(), buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count < 0 { return nil }
            if count == 0 { break }
            result.append(buffer, count: count)
        }
        return result
    }
}

private final class WorkspaceJourneyMemory: LabWorkspaceJourneyPersisting {
    var value: LabWorkspaceJourney?
    var writes: [LabWorkspaceJourney] = []
    func load() throws -> LabWorkspaceJourney? { value }
    func save(_ journey: LabWorkspaceJourney) throws { value = journey; writes.append(journey) }
    func delete() throws { value = nil }
}

private final class WorkspaceSessionMemory: TalentSignalSessionPersisting {
    var value: TalentSignalSession?
    init(_ value: TalentSignalSession?) { self.value = value }
    func load() throws -> TalentSignalSession? { value }
    func save(_ session: TalentSignalSession) throws { value = session }
    func delete() throws { value = nil }
}

private final class WorkspaceAuthentication: AppAuthenticationServing {
    var signInResponse: TalentSignalSession?
    func challenge() async throws -> AppleLoginChallenge {
        .init(contractVersion: TalentSignalAPIContract.version, id: "challenge", nonce: "nonce",
              expiresAt: .now.addingTimeInterval(300))
    }
    func signIn(identityToken: String, challengeID: String, givenName: String?,
                familyName: String?) async throws -> TalentSignalSession {
        guard let signInResponse else { throw AppSessionError.invalidIdentityToken }
        return signInResponse
    }
    func validate(_ stored: TalentSignalSession) async throws -> TalentSignalSession {
        guard stored.expiresAt > .now else {
            throw AppSessionError.backend(status: 401, code: "SESSION_INVALID", message: "Expired")
        }
        return stored
    }
    func logout(_ stored: TalentSignalSession) async throws {}
}

private final class WorkspaceServiceFixture: LabWorkspaceServing {
    let owner: TalentSignalSession
    weak var journal: WorkspaceJourneyMemory?
    var createFailures = 0
    var createdIDs: [UUID] = []
    var entryIDs: [UUID] = []
    var entryTokens: [String] = []
    var receivedEntryToken: String?
    var readTokens: [String] = []
    var events: [String] = []
    var createSawProtectedIntent = false
    var enterSawWorkspaceReadback = false
    var stopSawDurableIntent = false
    var entryAccountID = "test-account"
    private var current: LabWorkspace?

    init(owner: TalentSignalSession) { self.owner = owner }

    func list(using session: TalentSignalSession) async throws -> [LabWorkspace] { current.map { [$0] } ?? [] }
    func create(id: UUID, durationHours: Int, using session: TalentSignalSession) async throws -> LabWorkspace {
        createdIDs.append(id)
        createSawProtectedIntent = journal?.value?.id == id
            && journal?.value?.phase == .preparing
            && journal?.value?.childAccessToken != nil
        if createFailures > 0 { createFailures -= 1; throw URLError(.networkConnectionLost) }
        let value = LabWorkspace(id: id, ownerAccountID: owner.account.id, ownerUserID: owner.user.id,
            accountID: "test-account", userID: "test-user", name: "Test workspace",
            state: .active, createdAt: .now, emptyVerifiedAt: .now,
            expiresAt: Date(timeIntervalSince1970: 2_000_000_000), durationHours: durationHours,
            stopID: nil, stopReason: nil, stoppedAt: nil, deletedAt: nil, cleanupError: nil,
            dataRows: 0, activeSessions: 0, pendingMediaWrites: 0, scope: "isolated_test_account")
        current = value
        events.append("create")
        return value
    }
    func read(id: UUID, using session: TalentSignalSession) async throws -> LabWorkspace {
        readTokens.append(session.accessToken)
        return try XCTUnwrap(current)
    }
    func enter(workspaceID: UUID, entryID: UUID, accessToken: String,
               using session: TalentSignalSession) async throws -> LabWorkspaceEntry {
        entryIDs.append(entryID); entryTokens.append(accessToken); receivedEntryToken = accessToken
        enterSawWorkspaceReadback = journal?.value?.workspace?.id == workspaceID
        events.append("enter")
        let expires = Date(timeIntervalSince1970: 2_000_000_000)
        return LabWorkspaceEntry(id: entryID, workspaceID: workspaceID, sessionID: UUID(),
            expiresAt: expires, revokedAt: nil, state: .active,
            session: .init(contractVersion: TalentSignalAPIContract.version, expiresAt: expires,
                account: .init(id: entryAccountID, slug: "lab-test", name: "Test workspace"),
                user: .init(id: "test-user", email: "test@lab.invalid", displayName: "Test user", kind: "lab_human")))
    }
    func leave(workspaceID: UUID, entryID: UUID,
               using session: TalentSignalSession) async throws -> LabWorkspaceEntry {
        events.append("leave")
        return LabWorkspaceEntry(id: entryID, workspaceID: workspaceID, sessionID: UUID(),
            expiresAt: .now, revokedAt: .now, state: .revoked, session: nil)
    }
    func stop(workspaceID: UUID, stopID: UUID,
              using session: TalentSignalSession) async throws -> LabWorkspace {
        stopSawDurableIntent = journal?.value?.stopID == stopID && journal?.value?.phase == .stopPending
        events.append("stop")
        let previous = try XCTUnwrap(current)
        let value = LabWorkspace(id: previous.id, ownerAccountID: previous.ownerAccountID,
            ownerUserID: previous.ownerUserID, accountID: previous.accountID, userID: previous.userID,
            name: previous.name, state: .deleted, createdAt: previous.createdAt,
            emptyVerifiedAt: previous.emptyVerifiedAt, expiresAt: previous.expiresAt,
            durationHours: previous.durationHours, stopID: stopID, stopReason: "manual",
            stoppedAt: .now, deletedAt: .now, cleanupError: nil, dataRows: 0,
            activeSessions: 0, pendingMediaWrites: 0, scope: previous.scope)
        current = value
        return value
    }
}

private final class LabWorkspaceURLProtocol: URLProtocol, @unchecked Sendable {
    static var handler: ((URLRequest) throws -> (Int, Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let result = try XCTUnwrap(Self.handler)(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: result.0, httpVersion: nil,
                headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: result.1)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
