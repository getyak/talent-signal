import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

enum GoogleSignInError: LocalizedError {
    case unavailable, invalidCallback, tokenExchange
    var errorDescription: String? {
        switch self {
        case .unavailable: return "Google sign-in is not available in this build. Use Apple or email."
        case .invalidCallback: return "Google sign-in could not be verified. Please try again."
        case .tokenExchange: return "Google sign-in could not finish. Please try again."
        }
    }
}

/// System browser authorization code flow. The app holds a public client ID,
/// never a client secret. PKCE, state and the backend nonce bind each attempt.
@MainActor
final class GoogleSignInFlow: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var browserSession: ASWebAuthenticationSession?
    private var pendingCallback: CheckedContinuation<URL, Error>?

    static var clientID: String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "TalentSignalGoogleClientID") as? String,
              value.hasSuffix(".apps.googleusercontent.com"), !value.contains("$(") else { return nil }
        return value
    }

    func identityToken(nonce: String) async throws -> String {
        guard let clientID = Self.clientID else { throw GoogleSignInError.unavailable }
        let scheme = clientID.split(separator: ".").reversed().joined(separator: ".")
        let redirect = "\(scheme):/oauth2redirect"
        let verifier = try Self.randomToken()
        let state = try Self.randomToken()
        let digest = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
        var authorize = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        authorize.queryItems = [
            .init(name: "client_id", value: clientID), .init(name: "redirect_uri", value: redirect),
            .init(name: "response_type", value: "code"), .init(name: "scope", value: "openid email profile"),
            .init(name: "state", value: state), .init(name: "nonce", value: SHA256.hex(nonce)),
            .init(name: "code_challenge", value: digest), .init(name: "code_challenge_method", value: "S256"),
        ]
        defer { browserSession = nil; pendingCallback = nil }
        let callback: URL = try await withCheckedThrowingContinuation { continuation in
            pendingCallback = continuation
            let session = ASWebAuthenticationSession(url: authorize.url!, callbackURLScheme: scheme) { [weak self] url, error in
                Task { @MainActor in
                    if let error { self?.finishCallback(.failure(error)) }
                    else if let url { self?.finishCallback(.success(url)) }
                    else { self?.finishCallback(.failure(GoogleSignInError.invalidCallback)) }
                }
            }
            session.presentationContextProvider = self
            browserSession = session
            if !session.start() { finishCallback(.failure(GoogleSignInError.unavailable)) }
        }
        let code = try Self.authorizationCode(callback: callback, scheme: scheme, expectedState: state)
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var body = URLComponents()
        body.queryItems = [.init(name: "client_id", value: clientID), .init(name: "code", value: code),
            .init(name: "redirect_uri", value: redirect), .init(name: "code_verifier", value: verifier),
            .init(name: "grant_type", value: "authorization_code")]
        request.httpBody = body.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B").data(using: .utf8)
        request.timeoutInterval = 30
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = object["id_token"] as? String else { throw GoogleSignInError.tokenExchange }
        return token
    }

    private func finishCallback(_ result: Result<URL, Error>) {
        guard let callback = pendingCallback else { return }
        pendingCallback = nil
        callback.resume(with: result)
    }

    static func authorizationCode(callback: URL, scheme: String, expectedState: String) throws -> String {
        guard callback.scheme == scheme, callback.host == nil, callback.fragment == nil, callback.path == "/oauth2redirect",
              let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
              items.filter({ $0.name == "state" }).count == 1,
              items.filter({ $0.name == "code" }).count == 1,
              !items.contains(where: { $0.name == "error" }),
              items.first(where: { $0.name == "state" })?.value == expectedState,
              let code = items.first(where: { $0.name == "code" })?.value, !code.isEmpty else {
            throw GoogleSignInError.invalidCallback
        }
        return code
    }

    private static func randomToken() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw GoogleSignInError.unavailable
        }
        return Data(bytes).base64URL
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
            .flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}

private extension Data {
    var base64URL: String { base64EncodedString().replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
}
