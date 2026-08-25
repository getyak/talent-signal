import AuthenticationServices
import CryptoKit
import SwiftUI

@MainActor
final class AppSessionStore: ObservableObject {
    enum Phase: Equatable {
        case restoring
        case signedOut
        case signedIn(TalentSignalSession)
    }

    @Published private(set) var phase: Phase = .restoring
    @Published private(set) var challenge: AppleLoginChallenge?
    @Published private(set) var isWorking = false
    @Published var notice: String?

    let baseURL: URL?
    private let client: (any AppAuthenticationServing)?
    private let persistence: TalentSignalSessionPersisting

    init(
        baseURL: URL?,
        persistence: TalentSignalSessionPersisting = KeychainTalentSignalSessionStore(),
        client: (any AppAuthenticationServing)? = nil
    ) {
        self.baseURL = baseURL
        self.persistence = persistence
        self.client = client ?? baseURL.map { AppAuthenticationClient(baseURL: $0) }
    }

    func restore() async {
        guard let client else {
            phase = .signedOut
            notice = "Set TALENT_SIGNAL_API_BASE_URL for this build."
            return
        }
        do {
            guard let stored = try persistence.load(), stored.expiresAt > .now else {
                try? persistence.delete()
                phase = .signedOut
                await prepareChallenge()
                return
            }
            phase = .signedIn(stored)
            do {
                let validated = try await client.validate(stored)
                try persistence.save(validated)
                phase = .signedIn(validated)
            } catch let error as AppSessionError where error.invalidatesSession {
                try? persistence.delete()
                phase = .signedOut
                notice = error.localizedDescription
                await prepareChallenge()
            } catch {
                notice = "Offline · showing the last verified workspace."
            }
        } catch {
            phase = .signedOut
            notice = error.localizedDescription
            await prepareChallenge()
        }
    }

    func prepareChallenge() async {
        guard let client, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            let challenge = try await client.challenge()
            guard challenge.expiresAt > .now,
                  challenge.contractVersion == TalentSignalAPIContract.version else {
                throw AppSessionError.contractMismatch
            }
            self.challenge = challenge
            notice = nil
        } catch {
            challenge = nil
            notice = error.localizedDescription
        }
    }

    func signIn(
        identityToken: Data?,
        fullName: PersonNameComponents?
    ) async {
        guard let identityToken,
              let token = String(data: identityToken, encoding: .utf8),
              let challenge,
              let client else {
            notice = AppSessionError.invalidIdentityToken.localizedDescription
            return
        }
        isWorking = true
        defer { isWorking = false }
        do {
            let session = try await client.signIn(
                identityToken: token,
                challengeID: challenge.id,
                givenName: fullName?.givenName,
                familyName: fullName?.familyName
            )
            try persistence.save(session)
            self.challenge = nil
            notice = nil
            phase = .signedIn(session)
        } catch {
            self.challenge = nil
            notice = error.localizedDescription
            await prepareChallenge()
        }
    }

    func signOut() async {
        guard case let .signedIn(session) = phase else { return }
        isWorking = true
        var serverWarning: String?
        if let client {
            do {
                try await client.logout(session)
            } catch {
                serverWarning = "Signed out on this device. The remote session could not be revoked and will expire automatically."
            }
        }
        var localWarning: String?
        do {
            try persistence.delete()
        } catch {
            if serverWarning != nil {
                notice = "Sign out is incomplete: neither remote revocation nor protected local removal could be verified. Try again before leaving this device."
                isWorking = false
                return
            }
            localWarning = "Signed out. The server revoked this session, but its protected local record could not be removed and will be rejected on the next launch."
        }
        phase = .signedOut
        challenge = nil
        let signOutNotice = [serverWarning, localWarning]
            .compactMap { $0 }
            .joined(separator: " ")
        isWorking = false
        await prepareChallenge()
        if !signOutNotice.isEmpty {
            notice = [signOutNotice, notice].compactMap { $0 }.joined(separator: " ")
        }
    }
}

struct AppAuthenticationView: View {
    @ObservedObject var store: AppSessionStore
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            Color.tsSurface.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                Spacer()

                RelationshipSignalOrb()
                    .frame(width: 58, height: 58)
                    .accessibilityHidden(true)

                Text("Talent Signal")
                    .font(.custom("Georgia", size: 42, relativeTo: .largeTitle))
                    .foregroundStyle(Color.tsInk)
                    .tracking(-1.1)
                    .padding(.top, 26)

                Text("Relationships, in context.")
                    .font(.title3)
                    .foregroundStyle(Color.tsMutedInk)
                    .padding(.top, 8)

                Spacer()

                if store.challenge != nil {
                    SignInWithAppleButton(.continue) { request in
                        request.requestedScopes = [.fullName, .email]
                        request.nonce = store.challenge.map { SHA256.hex($0.nonce) }
                    } onCompletion: { result in
                        switch result {
                        case let .success(authorization):
                            guard let credential = authorization.credential
                                as? ASAuthorizationAppleIDCredential else {
                                store.notice = AppSessionError.invalidIdentityToken
                                    .localizedDescription
                                return
                            }
                            Task {
                                await store.signIn(
                                    identityToken: credential.identityToken,
                                    fullName: credential.fullName
                                )
                            }
                        case let .failure(error):
                            if (error as? ASAuthorizationError)?.code != .canceled {
                                store.notice = error.localizedDescription
                            }
                        }
                    }
                    .signInWithAppleButtonStyle(
                        colorScheme == .dark ? .white : .black
                    )
                    .frame(height: 52)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .disabled(store.isWorking)
                    .accessibilityIdentifier("sign-in-with-apple")
                } else {
                    Button {
                        Task { await store.prepareChallenge() }
                    } label: {
                        HStack {
                            if store.isWorking { ProgressView() }
                            Text(store.isWorking ? "Connecting…" : "Try again")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(Color.tsCanvas, in: RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                    .disabled(store.isWorking || store.baseURL == nil)
                    .accessibilityIdentifier("retry-apple-challenge")
                }

                if let notice = store.notice {
                    Text(notice)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 14)
                        .accessibilityIdentifier("authentication-notice")
                }

                Label("Account-scoped · no automatic messages", systemImage: "lock")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .padding(.top, 20)
                    .padding(.bottom, 10)
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 24)
        }
        .task {
            if store.phase == .signedOut, store.challenge == nil {
                await store.prepareChallenge()
            }
        }
        .accessibilityIdentifier("authentication-screen")
    }
}
