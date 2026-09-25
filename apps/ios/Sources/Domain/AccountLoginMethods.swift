import Foundation

/// Native Settings sign-in methods (ADR 0018): one row per provider with its
/// real state, step-up verification of the CURRENT identity kept separate from
/// new-provider confirmation, and recoverable failure/cancel states that never
/// claim success without an authoritative backend settings readback.
enum AccountLoginProvider: String, Codable, CaseIterable, Sendable {
    case apple
    case google
    case password

    var isFederated: Bool { self != .password }
}

enum AccountLoginMethodState: String, Codable, Sendable {
    case connected
    case unconnected
    case legacyUnverified = "legacy_unverified"
}

struct AccountSignInMethod: Codable, Equatable, Sendable {
    var provider: AccountLoginProvider
    var state: AccountLoginMethodState
    var hint: String?
    var can_unlink: Bool
}

struct AccountCredentialsSnapshot: Codable, Equatable, Sendable {
    var account_id: String
    var user_id: String
    var account_revision: Int
    var user_revision: Int
    var methods: [AccountSignInMethod]
    var email_ownership_state: String

    func method(_ provider: AccountLoginProvider) -> AccountSignInMethod? {
        methods.first(where: { $0.provider == provider })
    }

    var connectedProviders: [AccountLoginProvider] {
        methods.filter { $0.state == .connected }.map(\.provider)
    }
}

/// The operation a step-up verifies. Current-identity proof and new-provider
/// proof are distinct purposes.
enum AccountCredentialIntent: String, Codable, Sendable {
    case linkProvider = "link_provider"
    case unlinkProvider = "unlink_provider"
    case setPassword = "set_password"
    case changePassword = "change_password"
}

struct ProviderChallengeRef: Codable, Equatable, Sendable {
    var challenge_id: String
    var nonce: String
}

struct AccountCredentialAttempt: Codable, Equatable, Sendable {
    var attempt_id: String
    /// Returned exactly once and held in memory for the current attempt only.
    var attempt_secret: String
    var intent: AccountCredentialIntent
    var provider: AccountLoginProvider?
    var expires_at: String
    /// Challenge binding the NEW provider proof of a link operation. It is
    /// retained (not discarded) so the native authorization round trip can use
    /// its exact nonce.
    var providerChallenge: ProviderChallengeRef?
}

/// Current-identity proof for a credential change. Password and already-linked
/// provider reauthentication are distinct from the NEW provider proof.
enum AccountStepUpProof: Equatable, Sendable {
    case password(String)
    case linkedProvider(provider: AccountLoginProvider, challengeID: String, identityToken: String)
}

/// The captured actor every async operation is bound to: same account, user,
/// session and backend across start, completion and readback.
struct AccountOperationActor: Equatable, Sendable {
    var accountID: String
    var userID: String
    var accountRevision: Int
    var userRevision: Int
}

/// UI phase machine for one sign-in-method operation. Pure and reducer-driven
/// so error, cancel and retry behavior is testable without a device.
enum AccountLoginMethodsPhase: Equatable, Sendable {
    case idle
    /// Verifying the current identity (password or linked provider).
    case verifyingCurrentIdentity(operation: AccountCredentialIntent, provider: AccountLoginProvider?)
    /// Waiting for the NEW provider's proof after current-identity verification.
    case awaitingProviderProof(operation: AccountCredentialIntent, provider: AccountLoginProvider)
    /// Waiting for the new password, collected only after reauthentication.
    case awaitingNewPassword
    case working
    /// Recoverable failure: the account was not changed by THIS step.
    case failed(message: String, retryable: Bool)
    /// Provider cancelled or the flow stopped; the account is unchanged.
    case cancelled(message: String)
}

struct AccountLoginMethodsState: Equatable, Sendable {
    var snapshot: AccountCredentialsSnapshot
    var phase: AccountLoginMethodsPhase = .idle
    var pendingAttempt: AccountCredentialAttempt?
    var notice: String = ""

    var isBusy: Bool {
        switch phase {
        case .verifyingCurrentIdentity, .awaitingProviderProof, .awaitingNewPassword, .working:
            return true
        case .idle, .failed, .cancelled:
            return false
        }
    }
}

enum AccountLoginMethodsAction: Equatable, Sendable {
    case begin(operation: AccountCredentialIntent, provider: AccountLoginProvider?)
    case stepUpVerified(AccountCredentialAttempt)
    case providerProofReady
    case newPasswordCollected
    case completed(AccountCredentialsSnapshot, outcome: String)
    case failed(message: String, retryable: Bool)
    case cancelled(message: String)
    case reset
}

enum AccountLoginMethodsReducer {
    /// Chinese copy follows the frozen design vocabulary.
    static func label(for provider: AccountLoginProvider) -> String {
        switch provider {
        case .apple: return "Apple"
        case .google: return "Google"
        case .password: return "密码"
        }
    }

    static func stateLabel(_ state: AccountLoginMethodState) -> String {
        switch state {
        case .connected: return "已绑定"
        case .unconnected: return "未绑定"
        case .legacyUnverified: return "需要验证邮箱"
        }
    }

    static func reduce(
        _ state: AccountLoginMethodsState,
        action: AccountLoginMethodsAction
    ) -> AccountLoginMethodsState {
        var next = state
        switch action {
        case let .begin(operation, provider):
            next.phase = .verifyingCurrentIdentity(operation: operation, provider: provider)
            next.notice = ""
            next.pendingAttempt = nil
        case let .stepUpVerified(attempt):
            next.pendingAttempt = attempt
            if attempt.intent == .setPassword || attempt.intent == .changePassword {
                next.phase = .awaitingNewPassword
            } else if let provider = attempt.provider, attempt.intent == .linkProvider {
                next.phase = .awaitingProviderProof(operation: attempt.intent, provider: provider)
            } else {
                next.phase = .working
            }
        case .providerProofReady:
            next.phase = .working
        case .newPasswordCollected:
            next.phase = .working
        case let .completed(snapshot, outcome):
            next.snapshot = snapshot
            next.pendingAttempt = nil
            next.phase = .idle
            // Success is claimed only from the authoritative readback.
            next.notice = snapshot.connectedProviders.isEmpty
                ? "请核对下方登录方式的实际状态。"
                : outcome
        case let .failed(message, retryable):
            next.pendingAttempt = nil
            next.phase = .failed(message: message, retryable: retryable)
            next.notice = message
        case let .cancelled(message):
            next.pendingAttempt = nil
            next.phase = .cancelled(message: message)
            next.notice = message
        case .reset:
            next.phase = .idle
            next.notice = ""
            next.pendingAttempt = nil
        }
        return next
    }
}
