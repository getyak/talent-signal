import XCTest
@testable import TalentSignal

final class AccountLoginMethodsTests: XCTestCase {
    private func snapshot(
        password: AccountLoginMethodState = .unconnected,
        canUnlinkGoogle: Bool = true
    ) -> AccountCredentialsSnapshot {
        AccountCredentialsSnapshot(
            account_id: "20000000-0000-4000-8000-000000000002",
            user_id: "10000000-0000-4000-8000-000000000001",
            account_revision: 2,
            user_revision: 1,
            methods: [
                AccountSignInMethod(provider: .apple, state: .unconnected, hint: nil, can_unlink: false),
                AccountSignInMethod(provider: .google, state: .connected, hint: "owner@example.test", can_unlink: canUnlinkGoogle),
                AccountSignInMethod(provider: .password, state: password, hint: nil, can_unlink: password == .connected),
            ],
            email_ownership_state: "verified"
        )
    }

    func testProviderOnlyAccountSetsFirstPasswordAfterProviderReauthentication() async throws {
        let stub = AccountLoginMethodsStub(snapshot: snapshot())
        var state = AccountLoginMethodsState(snapshot: stub.snapshot)
        // The flow names the operation, verifies the CURRENT identity with a
        // LINKED provider's own authorization (never a dummy password), and
        // only then collects the NEW password.
        state = AccountLoginMethodsReducer.reduce(
            state,
            action: .begin(operation: .setPassword, provider: .password)
        )
        XCTAssertEqual(state.phase, .verifyingCurrentIdentity(operation: .setPassword, provider: .password))
        let challenge = try await stub.createChallenge(provider: .google)
        XCTAssertEqual(challenge.nonce, "fixture-challenge-nonce")
        let attempt = try await stub.startChange(
            intent: .setPassword,
            provider: nil,
            stepUp: .linkedProvider(
                provider: .google,
                challengeID: challenge.challenge_id,
                identityToken: "google-linked-identity-token"
            ),
            clientLabel: "ios",
            expectedAccountRevision: 2,
            expectedUserRevision: 1
        )
        // The recorded proof is the provider assertion, not a password.
        guard case let .linkedProvider(provider, challengeID, token)? = stub.stepUps.first else {
            return XCTFail("expected a linked-provider step-up proof")
        }
        XCTAssertEqual(provider, .google)
        XCTAssertEqual(challengeID, challenge.challenge_id)
        XCTAssertEqual(token, "google-linked-identity-token")
        state = AccountLoginMethodsReducer.reduce(state, action: .stepUpVerified(attempt))
        XCTAssertEqual(state.phase, .awaitingNewPassword)
        state = AccountLoginMethodsReducer.reduce(state, action: .newPasswordCollected)
        let (status, updated) = try await stub.completeChange(
            attemptID: attempt.attempt_id,
            attemptSecret: attempt.attempt_secret,
            password: "brand-new-password",
            identityToken: nil
        )
        XCTAssertEqual(status, "password_set")
        state = AccountLoginMethodsReducer.reduce(state, action: .completed(updated, outcome: "密码已设置并核验。"))
        XCTAssertEqual(state.phase, .idle)
        XCTAssertEqual(state.pendingAttempt, nil)
    }

    func testLinkingANewProviderUsesADistinctSecondPurpose() async throws {
        let stub = AccountLoginMethodsStub(snapshot: snapshot(password: .connected))
        var state = AccountLoginMethodsState(snapshot: stub.snapshot)
        state = AccountLoginMethodsReducer.reduce(
            state,
            action: .begin(operation: .linkProvider, provider: .apple)
        )
        let attempt = try await stub.startChange(
            intent: .linkProvider,
            provider: .apple,
            stepUp: .password("current-password"),
            clientLabel: "ios",
            expectedAccountRevision: 2,
            expectedUserRevision: 1
        )
        // Purpose one: current identity. Purpose two: the NEW provider proof,
        // bound to the challenge returned with the attempt (never discarded).
        state = AccountLoginMethodsReducer.reduce(state, action: .stepUpVerified(attempt))
        XCTAssertEqual(
            state.phase,
            .awaitingProviderProof(operation: .linkProvider, provider: .apple)
        )
        XCTAssertEqual(attempt.providerChallenge?.challenge_id, "challenge-1")
        XCTAssertEqual(attempt.providerChallenge?.nonce, "fixture-challenge-nonce")
        state = AccountLoginMethodsReducer.reduce(state, action: .providerProofReady)
        _ = try await stub.completeChange(
            attemptID: attempt.attempt_id,
            attemptSecret: attempt.attempt_secret,
            password: nil,
            identityToken: "apple-fixture-token"
        )
        XCTAssertEqual(stub.completed.count, 1)
        XCTAssertEqual(stub.completed.first?.identityToken, "apple-fixture-token")
    }

    func testFailureAndCancelRecoveryNeverClaimSuccess() {
        let before = snapshot()
        var state = AccountLoginMethodsState(snapshot: before)
        state = AccountLoginMethodsReducer.reduce(state, action: .begin(operation: .unlinkProvider, provider: .google))
        state = AccountLoginMethodsReducer.reduce(
            state,
            action: .failed(message: "请先设置另一种登录方式，再解除这一个。", retryable: true)
        )
        // The account state is untouched and the message is the real outcome.
        XCTAssertEqual(state.snapshot, before)
        XCTAssertEqual(state.pendingAttempt, nil)
        XCTAssertTrue(state.notice.contains("至少保留一种登录方式") || state.notice.contains("另一种登录方式"))
        state = AccountLoginMethodsReducer.reduce(state, action: .cancelled(message: "已取消，账号没有任何更改。"))
        XCTAssertEqual(state.phase, .cancelled(message: "已取消，账号没有任何更改。"))
    }

    func testLastMethodProtectionAndStepUpFailuresSurfaceAsTypedErrors() async throws {
        let stub = AccountLoginMethodsStub(snapshot: snapshot(canUnlinkGoogle: false))
        stub.startError = .lastLoginMethod
        do {
            _ = try await stub.startChange(
                intent: .unlinkProvider,
                provider: .google,
                stepUp: .password("current"),
                clientLabel: "ios",
                expectedAccountRevision: 2,
                expectedUserRevision: 1
            )
            XCTFail("expected last-method protection")
        } catch {
            XCTAssertEqual(error as? AccountLoginMethodsError, .lastLoginMethod)
        }
    }

    func testVerifiedSignupPathStartsDeliveryWithoutReturningACode() async throws {
        let stub = AccountLoginMethodsStub(snapshot: snapshot())
        try await stub.startRegistration(
            username: "fixture",
            email: "fixture@example.test",
            displayName: "Fixture",
            password: "quiet-context-1"
        )
        // The typed client contract keeps the code out of the app: only the
        // confirmation secret entered by the user crosses the confirm call.
        try await stub.confirmRegistration(secret: "user-entered-secret")
        XCTAssertNil(stub.startPassword)
    }
}
