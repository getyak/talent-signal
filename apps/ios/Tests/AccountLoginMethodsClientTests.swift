import XCTest
@testable import TalentSignal

/// Concrete HTTP contract tests for the REAL AccountLoginMethodsClient: the
/// exact request construction the Settings view produces, plus success,
/// rejection, unknown and stale responses. No stub client is involved.
final class AccountLoginMethodsClientTests: XCTestCase {
    final class ScriptedURLProtocol: URLProtocol, @unchecked Sendable {
        struct Rule {
            let match: String
            let status: Int
            let body: String
        }
        private static let lock = NSLock()
        private static var rules: [Rule] = []
        private static var observed: [(path: String, method: String, body: String?)] = []

        static func script(_ rules: [Rule]) {
            lock.lock(); self.rules = rules; observed = []; lock.unlock()
        }
        static func observedRequests() -> [(path: String, method: String, body: String?)] {
            lock.lock(); defer { lock.unlock() }; return observed
        }

        override class func canInit(with request: URLRequest) -> Bool { true }
        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
        override func startLoading() {
            guard let url = request.url else { return }
            var body = (request.httpBody).flatMap { String(data: $0, encoding: .utf8) }
            if body == nil, let stream = request.httpBodyStream {
                stream.open()
                var data = Data()
                var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let read = stream.read(&buffer, maxLength: buffer.count)
                    if read <= 0 { break }
                    data.append(buffer, count: read)
                }
                stream.close()
                body = String(data: data, encoding: .utf8)
            }
            Self.lock.lock()
            Self.observed.append((path: url.path, method: request.httpMethod ?? "GET", body: body))
            let rule = Self.rules.first { url.path.contains($0.match) }
            Self.lock.unlock()
            guard let rule, let data = rule.body.data(using: .utf8) else {
                // Unmatched requests fail immediately and identify themselves.
                client?.urlProtocol(self, didFailWithError: NSError(
                    domain: "ScriptedURLProtocol", code: 404,
                    userInfo: [NSLocalizedDescriptionKey: "unexpected request \(url.absoluteString)"]
                ))
                return
            }
            let response = HTTPURLResponse(url: url, statusCode: rule.status,
                httpVersion: "HTTP/1.1", headerFields: ["content-type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        }
        override func stopLoading() {}
    }

    private var session: URLSession!
    private var client: AccountLoginMethodsClient!

    override func setUp() {
        super.setUp()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScriptedURLProtocol.self]
        session = URLSession(configuration: configuration)
        client = AccountLoginMethodsClient(
            baseURL: URL(string: "https://api.example.test")!,
            bearerToken: "fixture-bearer",
            session: session
        )
    }

    private func settingsJSON(methods: String = """
      [{"provider":"google","state":"connected","hint":"owner@example.test","can_unlink":true},
       {"provider":"apple","state":"unconnected","hint":null,"can_unlink":false},
       {"provider":"password","state":"unconnected","hint":null,"can_unlink":false}]
      """) -> String {
        """
        {"contract_version":"\(TalentSignalAPIContract.version)",
         "user":{"id":"10000000-0000-4000-8000-000000000001","revision":2,"email_verified_at":null},
         "workspace":{"id":"20000000-0000-4000-8000-000000000002","revision":3},
         "sign_in_methods":\(methods),
         "email_ownership_state":"verified",
         "sessions":[{"id":"30000000-0000-4000-8000-000000000003","client_label":"ios",
           "created_at":"2026-09-25T00:00:00.000Z","expires_at":"2030-01-01T00:00:00.000Z","is_current":true}]}
        """
    }

    func testSettingsDecodeCarriesActorAndDevices() async throws {
        ScriptedURLProtocol.script([.init(match: "v1/account/settings", status: 200, body: settingsJSON())])
        let (snapshot, sessions) = try await client.settings()
        XCTAssertEqual(snapshot.account_revision, 3)
        XCTAssertEqual(snapshot.user_revision, 2)
        XCTAssertEqual(snapshot.methods.first?.hint, "owner@example.test")
        XCTAssertEqual(sessions.first?.client_label, "ios")
        let request = ScriptedURLProtocol.observedRequests().first
        XCTAssertEqual(request?.path, "/v1/account/settings")
    }

    func testPasswordIntentSendsNoProviderAndTheAuthorizedRevisions() async throws {
        ScriptedURLProtocol.script([
            .init(match: "login-methods/attempts", status: 201, body: """
              {"contract_version":"\(TalentSignalAPIContract.version)",
               "attempt_id":"attempt-1","attempt_secret":"secret-once",
               "intent":"set_password","provider":null,
               "expires_at":"2030-01-01T00:00:00.000Z","provider_challenge":null}
              """),
        ])
        // A caller may pass provider:.password; the client boundary must
        // normalize it away for password intents.
        let attempt = try await client.startChange(
            intent: .setPassword,
            provider: .password,
            stepUp: .password("current-password"),
            clientLabel: "ios",
            expectedAccountRevision: 3,
            expectedUserRevision: 2
        )
        XCTAssertEqual(attempt.attempt_secret, "secret-once")
        XCTAssertNil(attempt.providerChallenge)
        let body = ScriptedURLProtocol.observedRequests().first?.body ?? ""
        // The view normalizes provider to nil for password intents; the wire
        // body must not carry provider=password (the backend rejects it).
        XCTAssertFalse(body.contains("\"provider\":\"password\""))
        XCTAssertTrue(body.contains("\"expected_account_revision\":3"))
        XCTAssertTrue(body.contains("\"expected_user_revision\":2"))
        XCTAssertTrue(body.contains("\"kind\":\"password\""))
    }

    func testLinkedProviderStepUpAndTargetChallengeDecode() async throws {
        ScriptedURLProtocol.script([
            .init(match: "login-methods/attempts", status: 201, body: """
              {"contract_version":"\(TalentSignalAPIContract.version)",
               "attempt_id":"attempt-2","attempt_secret":"secret-two",
               "intent":"link_provider","provider":"apple",
               "expires_at":"2030-01-01T00:00:00.000Z",
               "provider_challenge":{"challenge_id":"challenge-a","nonce":"nonce-a",
                 "expires_at":"2030-01-01T00:00:00.000Z"}}
              """),
        ])
        let attempt = try await client.startChange(
            intent: .linkProvider,
            provider: .apple,
            stepUp: .linkedProvider(provider: .google, challengeID: "challenge-s", identityToken: "linked-token"),
            clientLabel: "ios",
            expectedAccountRevision: 3,
            expectedUserRevision: 2
        )
        // The NEW provider challenge is retained, never discarded.
        XCTAssertEqual(attempt.providerChallenge?.challenge_id, "challenge-a")
        XCTAssertEqual(attempt.providerChallenge?.nonce, "nonce-a")
        let body = ScriptedURLProtocol.observedRequests().first?.body ?? ""
        XCTAssertTrue(body.contains("\"kind\":\"provider\""))
        XCTAssertTrue(body.contains("\"challenge_id\":\"challenge-s\""))
        XCTAssertTrue(body.contains("\"identity_token\":\"linked-token\""))
        XCTAssertTrue(body.contains("\"provider\":\"apple\""))
    }

    func testCompleteAndRevokeBodiesAndReadback() async throws {
        ScriptedURLProtocol.script([
            .init(match: "login-methods/complete", status: 200, body: """
              {"contract_version":"\(TalentSignalAPIContract.version)","status":"unlinked",
               "settings":\(settingsJSON())}
              """),
            .init(match: "v1/account/settings", status: 200, body: settingsJSON()),
        ])
        _ = try await client.completeChange(
            attemptID: "attempt-1", attemptSecret: "secret-once", password: nil, identityToken: "target-token"
        )
        let completeBody = ScriptedURLProtocol.observedRequests().first?.body ?? ""
        XCTAssertTrue(completeBody.contains("\"identity_token\":\"target-token\""))
        let (snapshot, _) = try await client.settings()
        XCTAssertEqual(snapshot.account_revision, 3)
        _ = try await client.revokeDeviceSession(id: "30000000-0000-4000-8000-000000000003", expectedAccountRevision: 3)
        let revoke = ScriptedURLProtocol.observedRequests().last?.body ?? ""
        XCTAssertTrue(revoke.contains("\"kind\":\"revoke_session\""))
        XCTAssertTrue(revoke.contains("30000000-0000-4000-8000-000000000003"))
    }

    func testRejectionUnknownAndStaleResponsesMapToTypedErrors() async throws {
        ScriptedURLProtocol.script([
            .init(match: "login-methods/attempts", status: 409, body: """
              {"error":{"code":"LAST_LOGIN_METHOD","message":"x","request_id":"r","details":null}}
              """),
        ])
        do {
            _ = try await client.startChange(
                intent: .unlinkProvider, provider: .google,
                stepUp: .password("current"), clientLabel: "ios",
                expectedAccountRevision: 3, expectedUserRevision: 2
            )
            XCTFail("expected last-method protection")
        } catch {
            XCTAssertEqual(error as? AccountLoginMethodsError, .lastLoginMethod)
        }
        ScriptedURLProtocol.script([
            .init(match: "login-methods/attempts", status: 503, body: """
              {"error":{"code":"EMAIL_DELIVERY_UNAVAILABLE","message":"x","request_id":"r","details":null}}
              """),
        ])
        do {
            _ = try await client.startChange(
                intent: .setPassword, provider: nil,
                stepUp: .password("current"), clientLabel: "ios",
                expectedAccountRevision: 3, expectedUserRevision: 2
            )
            XCTFail("expected unknown/unavailable")
        } catch {
            XCTAssertEqual(error as? AccountLoginMethodsError, .deliveryUnavailable)
        }
        ScriptedURLProtocol.script([
            .init(match: "login-methods/complete", status: 409, body: """
              {"error":{"code":"CREDENTIAL_ATTEMPT_STALE","message":"x","request_id":"r","details":null}}
              """),
        ])
        do {
            _ = try await client.completeChange(
                attemptID: "a", attemptSecret: "s", password: "p", identityToken: nil
            )
            XCTFail("expected stale attempt")
        } catch {
            XCTAssertEqual(error as? AccountLoginMethodsError, .attemptInvalid)
        }
    }
}
