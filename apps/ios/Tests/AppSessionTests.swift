import Foundation
import XCTest
@testable import TalentSignal

@MainActor
final class AppSessionTests: XCTestCase {
    func testFailedAppleSignInRefreshesChallengeWithoutAnotherTap() async {
        let persistence = MemorySessionStore(session: nil)
        let authentication = StubAuthentication(signInFailure: StubFailure.invalidToken)
        let store = AppSessionStore(
            baseURL: .fixtureBackend,
            persistence: persistence,
            client: authentication,
            endings: MemoryAppSessionEndings()
        )

        await store.restore()
        let firstChallengeID = store.challenge?.id
        await store.signIn(
            identityToken: Data("fixture-identity-token".utf8),
            fullName: nil
        )

        XCTAssertEqual(store.phase, .signedOut)
        XCTAssertEqual(authentication.challengeCallCount, 2)
        XCTAssertNotEqual(store.challenge?.id, firstChallengeID)
        XCTAssertFalse(store.isWorking)
        XCTAssertTrue(store.notice?.contains("invalidToken") == true)
    }

    func testRemoteLogoutFailureStillClearsProtectedLocalSession() async {
        let persistence = MemorySessionStore(session: .fixture)
        let authentication = StubAuthentication(logoutFailure: StubFailure.offline)
        let store = AppSessionStore(
            baseURL: .fixtureBackend,
            persistence: persistence,
            client: authentication,
            endings: MemoryAppSessionEndings()
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
            client: authentication,
            endings: MemoryAppSessionEndings()
        )

        await store.restore()
        await store.signOut()

        XCTAssertEqual(store.phase, .signedOut, "A persisted ending intent closes content even when both cleanup steps need retry")
        XCTAssertNotNil(persistence.session)
        XCTAssertTrue(store.notice?.contains("Sign out is incomplete") == true)
    }

    func testServerRevocationEndsTheLocalSessionEvenWhenKeychainRemovalFails() async {
        let persistence = MemorySessionStore(session: .fixture)
        persistence.deleteFailure = StubFailure.protectedStore
        let store = AppSessionStore(
            baseURL: .fixtureBackend,
            persistence: persistence,
            client: StubAuthentication(),
            endings: MemoryAppSessionEndings()
        )

        await store.restore()
        await store.signOut()

        XCTAssertEqual(store.phase, .signedOut)
        XCTAssertEqual(store.endingReceipts.first?.remote, .revoked)
        XCTAssertEqual(store.endingReceipts.first?.local, .failed)
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
    let signInFailure: Error?
    private(set) var challengeCallCount = 0

    init(
        logoutFailure: Error? = nil,
        signInFailure: Error? = nil
    ) {
        self.logoutFailure = logoutFailure
        self.signInFailure = signInFailure
    }

    func challenge() async throws -> AppleLoginChallenge {
        challengeCallCount += 1
        return AppleLoginChallenge(
            contractVersion: TalentSignalAPIContract.version,
            id: "challenge-\(challengeCallCount)",
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
        if let signInFailure { throw signInFailure }
        return .fixture
    }

    func validate(_ stored: TalentSignalSession) async throws -> TalentSignalSession {
        stored
    }

    func logout(_ stored: TalentSignalSession) async throws {
        if let logoutFailure { throw logoutFailure }
    }
}

private enum StubFailure: LocalizedError {
    case invalidToken
    case offline
    case protectedStore

    var errorDescription: String? {
        switch self {
        case .invalidToken: "invalidToken"
        case .offline: "offline"
        case .protectedStore: "protectedStore"
        }
    }
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
