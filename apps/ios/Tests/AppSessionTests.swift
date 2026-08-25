import Foundation
import XCTest
@testable import TalentSignal

@MainActor
final class AppSessionTests: XCTestCase {
    func testRemoteLogoutFailureStillClearsProtectedLocalSession() async {
        let persistence = MemorySessionStore(session: .fixture)
        let authentication = StubAuthentication(logoutFailure: StubFailure.offline)
        let store = AppSessionStore(
            baseURL: .fixtureBackend,
            persistence: persistence,
            client: authentication
        )

        await store.restore()
        await store.signOut()

        XCTAssertEqual(store.phase, .signedOut)
        XCTAssertNil(persistence.session)
        XCTAssertTrue(store.notice?.contains("remote session could not be revoked") == true)
    }

    func testSignOutStaysRetryableWhenNeitherRevocationNorLocalRemovalIsVerified() async {
        let persistence = MemorySessionStore(session: .fixture)
        persistence.deleteFailure = StubFailure.protectedStore
        let authentication = StubAuthentication(logoutFailure: StubFailure.offline)
        let store = AppSessionStore(
            baseURL: .fixtureBackend,
            persistence: persistence,
            client: authentication
        )

        await store.restore()
        await store.signOut()

        XCTAssertEqual(store.phase, .signedIn(.fixture))
        XCTAssertNotNil(persistence.session)
        XCTAssertTrue(store.notice?.contains("Sign out is incomplete") == true)
    }

    func testServerRevocationEndsTheLocalSessionEvenWhenKeychainRemovalFails() async {
        let persistence = MemorySessionStore(session: .fixture)
        persistence.deleteFailure = StubFailure.protectedStore
        let store = AppSessionStore(
            baseURL: .fixtureBackend,
            persistence: persistence,
            client: StubAuthentication()
        )

        await store.restore()
        await store.signOut()

        XCTAssertEqual(store.phase, .signedOut)
        XCTAssertTrue(store.notice?.contains("server revoked this session") == true)
    }
}

private final class MemorySessionStore: TalentSignalSessionPersisting {
    var session: TalentSignalSession?
    var deleteFailure: Error?

    init(session: TalentSignalSession?) {
        self.session = session
    }

    func load() throws -> TalentSignalSession? { session }
    func save(_ session: TalentSignalSession) throws { self.session = session }
    func delete() throws {
        if let deleteFailure { throw deleteFailure }
        session = nil
    }
}

private final class StubAuthentication: AppAuthenticationServing {
    let logoutFailure: Error?

    init(logoutFailure: Error? = nil) {
        self.logoutFailure = logoutFailure
    }

    func challenge() async throws -> AppleLoginChallenge {
        AppleLoginChallenge(
            contractVersion: TalentSignalAPIContract.version,
            id: "challenge",
            nonce: "nonce",
            expiresAt: Date.now.addingTimeInterval(300)
        )
    }

    func signIn(
        identityToken: String,
        challengeID: String,
        givenName: String?,
        familyName: String?
    ) async throws -> TalentSignalSession {
        .fixture
    }

    func validate(_ stored: TalentSignalSession) async throws -> TalentSignalSession {
        stored
    }

    func logout(_ stored: TalentSignalSession) async throws {
        if let logoutFailure { throw logoutFailure }
    }
}

private enum StubFailure: Error {
    case offline
    case protectedStore
}

private extension TalentSignalSession {
    static let fixture = TalentSignalSession(
        baseURL: .fixtureBackend,
        accessToken: "fixture-token",
        expiresAt: Date.now.addingTimeInterval(3_600),
        account: .init(id: "account-1", slug: "account-1", name: "Account 1"),
        user: .init(
            id: "user-1",
            email: "recruiter@example.test",
            displayName: "Recruiter",
            kind: "apple_human"
        )
    )
}

private extension URL {
    static let fixtureBackend = URL(string: "https://example.test")!
}
