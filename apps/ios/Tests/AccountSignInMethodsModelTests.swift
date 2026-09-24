import XCTest
@testable import TalentSignal

/// Real Model -> real AccountLoginMethodsClient factory -> captured HTTP.
/// The sequences reproduce the repair-13/14 defects: cached-client scope
/// leaks, Apple unreachable current proof, round ownership, operation
/// replacement, and truthful readback after lost responses.
@MainActor
final class AccountSignInMethodsModelTests: XCTestCase {
    final class Gate: @unchecked Sendable {
        private let lock = NSLock()
        private var entered = false
        private var enteredWaiters: [CheckedContinuation<Void, Never>] = []
        private var released = false
        private var releaseWaiters: [CheckedContinuation<Void, Never>] = []

        func markEntered() {
            lock.lock()
            entered = true
            let waiters = enteredWaiters
            enteredWaiters = []
            lock.unlock()
            for waiter in waiters { waiter.resume() }
        }
        func waitUntilEntered() async throws {
            for _ in 0..<400 {
                lock.lock(); let done = entered; lock.unlock()
                if done { return }
                try await Task.sleep(nanoseconds: 5_000_000)
            }
            XCTFail("request never entered the scripted transport")
            throw URLError(.timedOut)
        }
        func release() {
            lock.lock()
            released = true
            let waiters = releaseWaiters
            releaseWaiters = []
            lock.unlock()
            for waiter in waiters { waiter.resume() }
        }
        func waitUntilReleased() async {
            await withCheckedContinuation { continuation in
                lock.lock()
                if released { lock.unlock(); continuation.resume(); return }
                releaseWaiters.append(continuation)
                lock.unlock()
            }
        }
    }

    final class ScriptedURLProtocol: URLProtocol, @unchecked Sendable {
        struct Rule {
            let match: String
            let status: Int
            let body: String
            var once: Bool = false
            var gate: Gate? = nil
            var used: Bool = false
        }

        private static let lock = NSLock()
        private static var rules: [Rule] = []
        private static var observed: [(url: String, authorization: String?, body: String?)] = []

        static func script(_ rules: [Rule]) {
            lock.lock(); self.rules = rules; observed = []; lock.unlock()
        }
        static func observedRequests() -> [(url: String, authorization: String?, body: String?)] {
            lock.lock(); defer { lock.unlock() }; return observed
        }
        static func writeCount() -> Int {
            observedRequests().count { !$0.url.contains("/v1/account/settings") }
        }

        override class func canInit(with request: URLRequest) -> Bool { true }
        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
        override func startLoading() {
            let url = request.url!
            var bodyText: String?
            if let data = request.httpBody {
                bodyText = String(data: data, encoding: .utf8)
            } else if let stream = request.httpBodyStream {
                stream.open()
                var data = Data()
                var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let read = stream.read(&buffer, maxLength: buffer.count)
                    if read <= 0 { break }
                    data.append(buffer, count: read)
                }
                stream.close()
                bodyText = String(data: data, encoding: .utf8)
            }
            let authorization = request.value(forHTTPHeaderField: "Authorization")
            Self.lock.lock()
            Self.observed.append((url: url.absoluteString, authorization: authorization, body: bodyText))
            var chosen: ScriptedURLProtocol.Rule?
            for index in Self.rules.indices {
                let rule = Self.rules[index]
                if url.path.contains(rule.match) && (!rule.once || !rule.used) {
                    Self.rules[index].used = true
                    chosen = Self.rules[index]
                    break
                }
            }
            Self.lock.unlock()
            guard let rule = chosen else {
                // Unmatched requests fail immediately and identify themselves.
                let failure = NSError(
                    domain: "ScriptedURLProtocol",
                    code: 404,
                    userInfo: [NSLocalizedDescriptionKey: "unexpected request \(url.absoluteString)"]
                )
                client?.urlProtocol(self, didFailWithError: failure)
                return
            }
            let gate = rule.gate
            Task {
                gate?.markEntered()
                await gate?.waitUntilReleased()
                let data = Data(rule.body.utf8)
                let response = HTTPURLResponse(url: url, statusCode: rule.status,
                    httpVersion: "HTTP/1.1", headerFields: ["content-type": "application/json"])!
                self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                self.client?.urlProtocol(self, didLoad: data)
                self.client?.urlProtocolDidFinishLoading(self)
            }
        }
        override func stopLoading() {}
    }

    final class LiveBox: @unchecked Sendable {
        var value: (baseURL: URL, accessToken: String, accountID: String, userID: String)?
    }

    final class FactoryRecorder: @unchecked Sendable {
        private let lock = NSLock()
        private(set) var scopes: [AccountOperationScope] = []
        let session: URLSession
        init(session: URLSession) { self.session = session }
        var factory: AccountSignInMethodsModel.ServiceFactory {
            { [self] scope in
                lock.lock()
                scopes.append(scope)
                lock.unlock()
                return AccountLoginMethodsClient(
                    baseURL: scope.baseURL,
                    bearerToken: scope.accessToken,
                    session: session
                )
            }
        }
        func observed() -> [AccountOperationScope] {
            lock.lock(); defer { lock.unlock() }; return scopes
        }
    }

    private var session: URLSession!
    private var liveBox: LiveBox!
    private var recorder: FactoryRecorder!
    private var model: AccountSignInMethodsModel!

    private func settingsJSON(
        accountID: String = "20000000-0000-4000-8000-000000000002",
        userID: String = "10000000-0000-4000-8000-000000000001",
        passwordState: String = "unconnected"
    ) -> String {
        """
        {"contract_version":"\(TalentSignalAPIContract.version)",
         "user":{"id":"\(userID)","revision":2,"email_verified_at":"2026-09-25T00:00:00.000Z"},
         "workspace":{"id":"\(accountID)","revision":3},
         "sign_in_methods":[
           {"provider":"apple","state":"connected","hint":"relay@privaterelay.appleid.com","can_unlink":true},
           {"provider":"google","state":"connected","hint":"owner@example.test","can_unlink":true},
           {"provider":"password","state":"\(passwordState)","hint":null,"can_unlink":\(passwordState == "connected")}],
         "email_ownership_state":"verified",
         "sessions":[]}
        """
    }

    private func attemptJSON(intent: String, provider: String?, challenge: Bool) -> String {
        """
        {"contract_version":"\(TalentSignalAPIContract.version)",
         "attempt_id":"attempt-1","attempt_secret":"secret-once","intent":"\(intent)",
         "provider":\(provider.map { "\"\($0)\"" } ?? "null"),
         "expires_at":"2030-01-01T00:00:00.000Z",
         "provider_challenge":\(challenge
            ? "{\"challenge_id\":\"challenge-target\",\"nonce\":\"nonce-target\",\"expires_at\":\"2030-01-01T00:00:00.000Z\"}"
            : "null")}
        """
    }

    override func setUp() {
        super.setUp()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScriptedURLProtocol.self]
        session = URLSession(configuration: configuration)
        let liveBox = LiveBox()
        liveBox.value = (
            URL(string: "https://api-T1.example.test")!,
            "token-T1",
            "20000000-0000-4000-8000-000000000002",
            "10000000-0000-4000-8000-000000000001"
        )
        self.liveBox = liveBox
        recorder = FactoryRecorder(session: session)
        model = AccountSignInMethodsModel(
            serviceFactory: recorder.factory,
            liveSession: { liveBox.value }
        )
    }

    func testServiceFactoryBindsEachRequestToTheCapturedScope() async throws {
        ScriptedURLProtocol.script([
            .init(match: "v1/account/settings", status: 200, body: settingsJSON()),
            .init(match: "login-methods/attempts", status: 201,
                  body: attemptJSON(intent: "set_password", provider: nil, challenge: false)),
        ])
        await model.reload()
        await model.begin(intent: .setPassword, provider: .password, currentAuthProvider: .password)
        await model.startWithPasswordProof("current-password")
        // The first operation used the T1 endpoint and token.
        let first = ScriptedURLProtocol.observedRequests()
        XCTAssertTrue(first.allSatisfy { $0.url.contains("api-T1.example.test") })
        XCTAssertTrue(first.allSatisfy { $0.authorization == "Bearer token-T1" })
        // Token AND endpoint switch: every later request must rebind.
        var live = liveBox.value!
        live.baseURL = URL(string: "https://api-T2.example.test")!
        live.accessToken = "token-T2"
        liveBox.value = live
        await model.reload()
        let second = ScriptedURLProtocol.observedRequests().filter {
            !$0.url.contains("api-T1.example.test")
        }
        XCTAssertFalse(second.isEmpty, "the T2 reload must issue real T2 requests")
        XCTAssertTrue(second.allSatisfy { $0.url.contains("api-T2.example.test") })
        XCTAssertTrue(second.allSatisfy { $0.authorization == "Bearer token-T2" })
        XCTAssertEqual(recorder.observed().last?.accessToken, "token-T2")
    }

    func testLateT1ResponseCannotPublishAfterT2Reload() async throws {
        let gate = Gate()
        ScriptedURLProtocol.script([
            .init(match: "v1/account/settings", status: 200, body: settingsJSON()),
            .init(match: "login-methods/attempts", status: 201,
                  body: attemptJSON(intent: "set_password", provider: nil, challenge: false), once: true, gate: gate),
            .init(match: "login-methods/attempts", status: 201,
                  body: attemptJSON(intent: "set_password", provider: nil, challenge: false), once: true),
        ])
        await model.reload()
        await model.begin(intent: .setPassword, provider: .password, currentAuthProvider: .password)
        let t1 = Task { await self.model.startWithPasswordProof("current-password") }
        try await gate.waitUntilEntered()
        // The live reader switches (same account/user) and a reload runs.
        var live = liveBox.value!
        live.accessToken = "token-T2"
        liveBox.value = live
        await model.reload()
        gate.release()
        await t1.value
        XCTAssertFalse(model.awaitingNewPassword, "a stale-scope success cannot publish")
    }

    func testAppleCurrentProofIsReachableForPasswordAccountsAndRoundsAreOwned() async throws {
        ScriptedURLProtocol.script([
            .init(match: "v1/account/settings", status: 200, body: settingsJSON(passwordState: "connected")),
            .init(match: "v1/auth/apple/challenges", status: 201, body: """
              {"contract_version":"\(TalentSignalAPIContract.version)",
               "challenge_id":"challenge-apple","nonce":"nonce-apple","expires_at":"2030-01-01T00:00:00.000Z"}
              """),
            .init(match: "login-methods/attempts", status: 201,
                  body: attemptJSON(intent: "change_password", provider: nil, challenge: false)),
        ])
        await model.reload()
        await model.begin(intent: .changePassword, provider: .password, currentAuthProvider: .password)
        // Explicit selection: a password account chooses Apple and gets its
        // challenge; the RETURNED round is the only authority.
        let appleRound = await model.selectCurrentVerification(.apple)
        XCTAssertEqual(appleRound?.provider, .apple)
        XCTAssertEqual(appleRound?.purpose, .currentIdentity)
        XCTAssertEqual(appleRound?.challengeID, "challenge-apple")
        // Hold round A; prepare round B; A's results never touch B.
        let staleRound = appleRound!
        let secondRound = await model.selectCurrentVerification(.apple)
        XCTAssertEqual(secondRound?.requestID != staleRound.requestID, true)
        await model.acceptCurrentProof(round: staleRound, identityToken: "old-token")
        await model.failProof(round: staleRound, cancelled: true)
        XCTAssertEqual(model.currentRound, secondRound, "stale results cannot touch the newer round")
    }

    func testGoogleClickPreparesItsGoogleChallengeInOneClick() async throws {
        ScriptedURLProtocol.script([
            .init(match: "v1/account/settings", status: 200, body: settingsJSON()),
            .init(match: "v1/auth/google/challenges", status: 201, body: """
              {"contract_version":"\(TalentSignalAPIContract.version)",
               "challenge_id":"challenge-google","nonce":"nonce-google","expires_at":"2030-01-01T00:00:00.000Z"}
              """),
            .init(match: "login-methods/attempts", status: 201,
                  body: attemptJSON(intent: "set_password", provider: nil, challenge: false)),
        ])
        await model.reload()
        var captured: ProviderRound?
        await model.beginGoogle(intent: .setPassword, provider: .password) { round in
            captured = round
            return "google-identity-token"
        }
        XCTAssertEqual(captured?.provider, .google)
        XCTAssertEqual(captured?.challengeID, "challenge-google")
        // The Google identity was submitted as a Google provider proof.
        let body = ScriptedURLProtocol.observedRequests().map { $0.body ?? "" }.joined()
        XCTAssertTrue(body.contains("google-identity-token"))
        XCTAssertTrue(body.contains("challenge-google"))
    }

    func testOperationIsolationReadbackTruthAndReadOnlyRetry() async throws {
        ScriptedURLProtocol.script([
            .init(match: "v1/account/settings", status: 200, body: settingsJSON(passwordState: "connected")),
            .init(match: "v1/auth/apple/challenges", status: 201, body: """
              {"contract_version":"\(TalentSignalAPIContract.version)",
               "challenge_id":"challenge-apple","nonce":"nonce-apple","expires_at":"2030-01-01T00:00:00.000Z"}
              """),
            .init(match: "login-methods/attempts", status: 201,
                  body: attemptJSON(intent: "change_password", provider: nil, challenge: false)),
        ])
        await model.reload()
        await model.begin(intent: .changePassword, provider: .password, currentAuthProvider: .password)
        await model.startWithPasswordProof("current-password")
        XCTAssertTrue(model.awaitingNewPassword)
        // A: password change holds its attempt; B replaces the operation.
        await model.begin(intent: .linkProvider, provider: .apple, currentAuthProvider: .apple)
        XCTAssertFalse(model.awaitingNewPassword, "A's password stage never survives B")

        // Complete-response loss: dispatched write, unknown outcome, GET-only
        // recheck, no repeated write.
        let gate = Gate()
        ScriptedURLProtocol.script([
            .init(match: "v1/account/settings", status: 200, body: settingsJSON(passwordState: "connected")),
            .init(match: "login-methods/attempts", status: 201,
                  body: attemptJSON(intent: "change_password", provider: nil, challenge: false)),
            .init(match: "login-methods/complete", status: 503,
                  body: "{\"error\":{\"code\":\"UNAVAILABLE\",\"message\":\"x\",\"request_id\":\"r\",\"details\":null}}"),
        ])
        await model.begin(intent: .changePassword, provider: .password, currentAuthProvider: .password)
        await model.startWithPasswordProof("current-password")
        await model.finishWithPassword("brand-new-password")
        XCTAssertTrue(model.outcomeUnknown, "a dispatched write with a lost response is unknown")
        let writes = ScriptedURLProtocol.writeCount()
        await model.checkResultAgain()
        XCTAssertEqual(ScriptedURLProtocol.writeCount(), writes, "the recheck is read-only")
        XCTAssertNotNil(model.pendingOutcome, "an inconclusive read keeps the retry")

        // A successful acknowledgement plus an explicit connected state
        // confirms; two successive operations work in one model instance.
        ScriptedURLProtocol.script([
            .init(match: "v1/account/settings", status: 200, body: settingsJSON(passwordState: "connected")),
            .init(match: "login-methods/attempts", status: 201,
                  body: attemptJSON(intent: "change_password", provider: nil, challenge: false)),
            .init(match: "login-methods/complete", status: 200, body: """
              {"contract_version":"\(TalentSignalAPIContract.version)","status":"password_set",
               "settings":\(settingsJSON(passwordState: "connected"))}
              """),
        ])
        await model.begin(intent: .changePassword, provider: .password, currentAuthProvider: .password)
        await model.startWithPasswordProof("current-password")
        await model.finishWithPassword("brand-new-password")
        XCTAssertFalse(model.outcomeUnknown)
        XCTAssertEqual(model.notice, "Saved and verified.")
        ScriptedURLProtocol.script([
            .init(match: "v1/account/settings", status: 200, body: settingsJSON(passwordState: "connected")),
            .init(match: "login-methods/attempts", status: 201,
                  body: attemptJSON(intent: "unlink_provider", provider: "google", challenge: false), once: true),
            .init(match: "login-methods/complete", status: 200, body: """
              {"contract_version":"\(TalentSignalAPIContract.version)","status":"unlinked",
               "settings":\(settingsJSON(passwordState: "connected"))}
              """),
        ])
        await model.begin(intent: .unlinkProvider, provider: .google, currentAuthProvider: .password)
        await model.startWithPasswordProof("current-password")
        XCTAssertTrue(model.notice.contains("verified") || model.notice.contains("not confirmed"))
    }

    func testWrongActorReadbackIsRejectedBeforePublishing() async throws {
        // Ordered settings reads: correct actor A first, wrong actor B only on
        // the post-mutation readback.
        ScriptedURLProtocol.script([
            .init(match: "v1/account/settings", status: 200, body: settingsJSON(), once: true),
            .init(match: "login-methods/attempts", status: 201,
                  body: attemptJSON(intent: "set_password", provider: nil, challenge: false)),
            .init(match: "login-methods/complete", status: 200, body: """
              {"contract_version":"\(TalentSignalAPIContract.version)","status":"password_set",
               "settings":\(settingsJSON())}
              """),
            .init(match: "v1/account/settings", status: 200, body: settingsJSON(
                accountID: "90000000-0000-4000-8000-000000000009"
            )),
        ])
        await model.reload()
        let actorBefore = model.actor
        await model.begin(intent: .setPassword, provider: .password, currentAuthProvider: .password)
        await model.startWithPasswordProof("current-password")
        await model.finishWithPassword("brand-new-password")
        XCTAssertEqual(model.actor?.accountID, actorBefore?.accountID, "the wrong readback is not adopted")
        XCTAssertTrue(model.failureNotice.contains("different account") || model.outcomeUnknown)
    }

    func testUnknownDeviceRevocationKeepsTheExactDeviceID() async throws {
        ScriptedURLProtocol.script([
            .init(match: "v1/account/settings", status: 200, body: settingsJSON(), once: true),
            .init(match: "v1/account/settings", status: 503,
                  body: "{\"error\":{\"code\":\"UNAVAILABLE\",\"message\":\"x\",\"request_id\":\"r\",\"details\":null}}"),
        ])
        await model.reload()
        await model.revokeDevice("30000000-0000-4000-8000-000000000003")
        XCTAssertTrue(model.outcomeUnknown)
        guard case let .revokeDevice(sessionID, _)? = model.pendingOutcome else {
            return XCTFail("the exact device id is retained for read-only retry")
        }
        XCTAssertEqual(sessionID, "30000000-0000-4000-8000-000000000003")
    }
}
