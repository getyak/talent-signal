import AppIntents
import Foundation
import SwiftUI

@main
struct TalentSignalApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage(AppLanguage.storageKey) private var storedLanguage =
        AppLanguage.system.rawValue
    @StateObject private var appSessionStore: AppSessionStore

    init() {
        _appSessionStore = StateObject(
            wrappedValue: AppSessionStore(
                baseURL: TalentSignalAuthenticationConfiguration.baseURL(
                    arguments: ProcessInfo.processInfo.arguments
                )
            )
        )
    }

    private var appLanguage: AppLanguage {
        AppLanguage.stored(storedLanguage)
    }

    private var requestedColorScheme: ColorScheme? {
#if DEBUG
        ProcessInfo.processInfo.arguments.contains("--force-dark") ? .dark : nil
#else
        nil
#endif
    }

    private var opensReviewWorkbenchDirectly: Bool {
        TalentSignalRootRoute.opensReviewWorkbench(
            arguments: ProcessInfo.processInfo.arguments
        )
    }

    private var pursuitReviewSession: PursuitProposalReviewSession? {
        PursuitProposalReviewSession.configured(
            arguments: ProcessInfo.processInfo.arguments
        )
    }

    private var textSignalSession: TextSignalCaptureSession? {
        TextSignalCaptureSession.configured(
            arguments: ProcessInfo.processInfo.arguments
        )
    }

    private var pursuitWorkspaceSession: PursuitWorkspaceSession? {
        PursuitWorkspaceSession.configured(
            arguments: ProcessInfo.processInfo.arguments
        )
    }

    private var audioSignalStore: AudioSignalCaptureStore? {
#if DEBUG
        guard AudioSignalCaptureSession.configured(
            arguments: ProcessInfo.processInfo.arguments
        ) != nil else { return nil }
        return AudioSignalCaptureStore(recorder: DeterministicAudioSignalRecorder())
#else
        return nil
#endif
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if TalentSignalAuthenticationConfiguration.requiresAuthentication(
                    arguments: ProcessInfo.processInfo.arguments
                ) {
                    authenticatedRoot
                } else if let audioSignalStore {
                    AudioSignalCaptureView(store: audioSignalStore)
                } else if let textSignalSession {
                    TextSignalCaptureView(
                        backendURL: textSignalSession.baseURL,
                        recordID: textSignalSession.recordID
                    )
                } else if let pursuitReviewSession {
                    RelationshipChangeReviewView(
                        person: .leila,
                        reviewSession: pursuitReviewSession
                    )
                } else if opensReviewWorkbenchDirectly {
                    CandidateSignalView()
                } else {
                    RelationshipArchiveView(session: pursuitWorkspaceSession)
                }
            }
                .preferredColorScheme(requestedColorScheme)
                .environment(\.appLanguage, appLanguage)
                .environment(\.locale, appLanguage.locale)
                .task {
                    if TalentSignalAuthenticationConfiguration.requiresAuthentication(
                        arguments: ProcessInfo.processInfo.arguments
                    ), appSessionStore.phase == .restoring {
                        await appSessionStore.restore()
                    }
                    let configured = CaptureHandoffStore.shared
                        .configureDeterministicLaunch(
                            arguments: ProcessInfo.processInfo.arguments
                        )
                    if !configured {
                        await CaptureHandoffStore.shared.restorePendingCapture()
                    }
                    TalentSignalShortcuts.updateAppShortcutParameters()
                }
                .onChange(of: scenePhase) { phase in
                    guard phase == .active else { return }
                    Task {
                        await CaptureHandoffStore.shared.restorePendingCapture()
                    }
                }
        }
    }

    @ViewBuilder
    private var authenticatedRoot: some View {
        switch appSessionStore.phase {
        case .restoring:
            ZStack {
                Color.tsSurface.ignoresSafeArea()
                ProgressView()
            }
            .accessibilityIdentifier("authentication-restoring")
        case .signedOut:
            AppAuthenticationView(store: appSessionStore)
        case let .signedIn(session):
            RelationshipArchiveView(
                session: .authenticated(session),
                onSignOut: { await appSessionStore.signOut() }
            )
            .id(session.account.id)
        }
    }
}

enum TalentSignalAuthenticationConfiguration {
    static func requiresAuthentication(arguments: [String]) -> Bool {
#if DEBUG
        arguments.contains("--show-login")
            || value(after: "--auth-backend-url", in: arguments) != nil
#else
        true
#endif
    }

    static func baseURL(
        arguments: [String],
        infoDictionary: [String: Any] = Bundle.main.infoDictionary ?? [:]
    ) -> URL? {
#if DEBUG
        if let value = value(after: "--auth-backend-url", in: arguments),
           let url = URL(string: value),
           permitted(url, allowsLoopbackHTTP: true) {
            return url
        }
#endif
        guard let encoded = infoDictionary["TalentSignalAPIBaseURLBase64URL"] as? String,
              let data = decodeBase64URL(encoded),
              let value = String(data: data, encoding: .utf8),
              let url = URL(string: value),
              permitted(url, allowsLoopbackHTTP: false) else {
            return nil
        }
        return url
    }

    private static func decodeBase64URL(_ value: String) -> Data? {
        var normalized = value
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = normalized.count % 4
        guard remainder != 1 else { return nil }
        if remainder > 0 {
            normalized += String(repeating: "=", count: 4 - remainder)
        }
        return Data(base64Encoded: normalized)
    }

    private static func permitted(_ url: URL, allowsLoopbackHTTP: Bool) -> Bool {
        guard url.host != nil,
              url.user == nil,
              url.password == nil,
              url.query == nil,
              url.fragment == nil else {
            return false
        }
        if url.scheme == "https" { return true }
        guard allowsLoopbackHTTP, url.scheme == "http" else { return false }
        return ["127.0.0.1", "localhost", "::1"].contains(url.host)
    }

    private static func value(after argument: String, in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: argument),
              arguments.indices.contains(index + 1) else {
            return nil
        }
        return arguments[index + 1]
    }
}

enum TalentSignalRootRoute {
    private static let reviewArguments: Set<String> = [
        "--backend-url",
        "--capture-seed",
        "--endpoint",
        "--fixture-id",
        "--fixture-import-delay-seconds",
        "--scenario",
    ]

    static func opensReviewWorkbench(arguments: [String]) -> Bool {
#if DEBUG
        if value(after: "--scenario", in: arguments)
            == "relationship-capture-archive" {
            return false
        }
        return !reviewArguments.isDisjoint(with: Set(arguments))
#else
        false
#endif
    }

    private static func value(after argument: String, in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: argument),
              arguments.indices.contains(index + 1) else {
            return nil
        }
        return arguments[index + 1]
    }
}
