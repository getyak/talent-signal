import XCTest
@testable import TalentSignal

@MainActor
final class GoogleSignInFlowTests: XCTestCase {
    func testCallbackRequiresExactStateSchemeAndUniqueAuthorizationCode() throws {
        let scheme = "com.googleusercontent.apps.fixture"
        let valid = URL(string: "\(scheme):/oauth2redirect?state=known-state&code=auth-code")!
        XCTAssertEqual(try GoogleSignInFlow.authorizationCode(callback: valid, scheme: scheme, expectedState: "known-state"), "auth-code")
        let invalid = [
            "\(scheme):/oauth2redirect?state=wrong&code=auth-code",
            "other.scheme:/oauth2redirect?state=known-state&code=auth-code",
            "\(scheme)://attacker.test/oauth2redirect?state=known-state&code=auth-code",
            "\(scheme):/wrong?state=known-state&code=auth-code",
            "\(scheme):/oauth2redirect?state=known-state&state=known-state&code=auth-code",
            "\(scheme):/oauth2redirect?state=known-state&code=one&code=two",
            "\(scheme):/oauth2redirect?state=known-state&error=access_denied",
            "\(scheme):/oauth2redirect?state=known-state&code=",
            "\(scheme):/oauth2redirect?state=known-state&code=auth-code#fragment",
        ]
        for url in invalid {
            XCTAssertThrowsError(try GoogleSignInFlow.authorizationCode(callback: URL(string: url)!, scheme: scheme, expectedState: "known-state"), url)
        }
    }
}

@MainActor
final class EmailAuthenticationTests: XCTestCase {
    func testEmailSessionRequiresSuccessfulMatchingReadback() async {
        for mode in [0, 1, 2] {
            let persistence = EmailMemorySession()
            let client = EmailAuthenticationStub(mode: mode)
            let store = AppSessionStore(baseURL: client.session.baseURL, persistence: persistence, client: client, endings: MemoryAppSessionEndings())
            await store.restore()
            await store.signInWithEmail(email: "fixture@example.test", password: "fixture-password", registering: false)
            XCTAssertFalse(store.isWorking)
            if mode == 0 {
                XCTAssertEqual(persistence.value, client.session)
                XCTAssertEqual(store.phase, .signedIn(client.session))
            } else {
                XCTAssertNil(persistence.value)
                XCTAssertEqual(store.phase, .signedOut)
                XCTAssertNotNil(store.notice)
            }
        }
    }
}
private final class EmailMemorySession: TalentSignalSessionPersisting {
    var value: TalentSignalSession?
    func load() throws -> TalentSignalSession? { value }
    func save(_ session: TalentSignalSession) throws { value = session }
    func delete() throws { value = nil }
}
private final class EmailAuthenticationStub: AppAuthenticationServing {
    let mode: Int
    init(mode: Int) { self.mode = mode }
    let session = TalentSignalSession(baseURL: URL(string: "https://fixture.example.test")!, accessToken: "fixture-opaque-token", expiresAt: .now.addingTimeInterval(3600), account: .init(id: "one", slug: "one", name: "One"), user: .init(id: "user-one", email: "fixture@example.test", displayName: "Fixture", kind: "password_human"))
    func challenge() async throws -> AppleLoginChallenge { throw GoogleSignInError.unavailable }
    func signIn(identityToken: String, challengeID: String, givenName: String?, familyName: String?) async throws -> TalentSignalSession { session }
    func signInEmail(email: String, password: String, registering: Bool) async throws -> TalentSignalSession { session }
    func validate(_ stored: TalentSignalSession) async throws -> TalentSignalSession {
        if mode == 1 { throw URLError(.notConnectedToInternet) }
        if mode == 2 { return TalentSignalSession(baseURL: session.baseURL, accessToken: session.accessToken, expiresAt: session.expiresAt, account: .init(id: "other", slug: "other", name: "Other"), user: session.user) }
        return stored
    }
    func logout(_ stored: TalentSignalSession) async throws {}
}
