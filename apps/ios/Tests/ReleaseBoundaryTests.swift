import XCTest
@testable import TalentSignal

@MainActor
final class ReleaseBoundaryTests: XCTestCase {
    func testCompiledAuthenticationURLAcceptsOnlyEncodedHTTPS() {
        let validURL = "https://api.example.test/A~"
        let encoded = base64URL(validURL)
        XCTAssertTrue(encoded.contains("-"))

        XCTAssertEqual(
            TalentSignalAuthenticationConfiguration.baseURL(
                arguments: ["TalentSignal"],
                infoDictionary: ["TalentSignalAPIBaseURLBase64URL": encoded]
            ),
            URL(string: validURL)
        )
        XCTAssertNil(
            TalentSignalAuthenticationConfiguration.baseURL(
                arguments: ["TalentSignal"],
                infoDictionary: [
                    "TalentSignalAPIBaseURLBase64URL": base64URL(
                        "http://127.0.0.1:4317"
                    ),
                ]
            )
        )
        XCTAssertNil(
            TalentSignalAuthenticationConfiguration.baseURL(
                arguments: ["TalentSignal"],
                infoDictionary: ["TalentSignalAPIBaseURLBase64URL": "not base64"]
            )
        )
        XCTAssertNil(
            TalentSignalAuthenticationConfiguration.baseURL(
                arguments: ["TalentSignal"],
                infoDictionary: ["TalentSignalAPIBaseURL": validURL]
            )
        )
    }

    private func base64URL(_ value: String) -> String {
        Data(value.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

#if DEBUG
    func testAuthenticationDebugDefaultsToPreviewAndAllowsOnlyLoopbackHTTP() {
        XCTAssertFalse(
            TalentSignalAuthenticationConfiguration.requiresAuthentication(
                arguments: ["TalentSignal"],
                environment: [:]
            )
        )
        XCTAssertFalse(
            TalentSignalAuthenticationConfiguration.requiresAuthentication(
                arguments: ["TalentSignal", "--preview-workspace"],
                environment: [:]
            )
        )
        XCTAssertFalse(
            TalentSignalAuthenticationConfiguration.requiresAuthentication(
                arguments: ["TalentSignal"],
                environment: [
                    TalentSignalAuthenticationConfiguration
                        .previewWorkspaceEnvironmentKey: "true",
                ]
            )
        )
        XCTAssertTrue(
            TalentSignalAuthenticationConfiguration.requiresAuthentication(
                arguments: ["TalentSignal", "--show-login"],
                environment: [
                    TalentSignalAuthenticationConfiguration
                        .previewWorkspaceEnvironmentKey: "true",
                ]
            )
        )
        XCTAssertTrue(
            TalentSignalAuthenticationConfiguration.requiresAuthentication(
                arguments: [
                    "TalentSignal",
                    "--preview-workspace",
                    "--auth-backend-url", "http://127.0.0.1:4317",
                ],
                environment: [:]
            )
        )
        XCTAssertFalse(
            TalentSignalAuthenticationConfiguration.requiresAuthentication(
                arguments: [
                    "TalentSignal",
                    "--workspace-backend-url", "http://127.0.0.1:4317",
                ],
                environment: [:]
            )
        )
        XCTAssertEqual(
            TalentSignalAuthenticationConfiguration.baseURL(
                arguments: [
                    "TalentSignal",
                    "--auth-backend-url",
                    "http://127.0.0.1:4318",
                ]
            ),
            URL(string: "http://127.0.0.1:4318")
        )
        XCTAssertNil(
            TalentSignalAuthenticationConfiguration.baseURL(
                arguments: [
                    "TalentSignal",
                    "--auth-backend-url",
                    "http://example.com",
                ],
                infoDictionary: [:]
            )
        )
    }
#endif

    func testSyntheticLaunchArgumentsAreInertOutsideDebugBuilds() {
#if DEBUG
        XCTAssertTrue(
            TalentSignalRootRoute.opensReviewWorkbench(
                arguments: ["TalentSignal", "--fixture-id", "TS-CORE-01"]
            )
        )
        XCTAssertTrue(
            StandaloneOnboardingConfiguration.isEnabled(
                arguments: ["TalentSignal", "--standalone-onboarding-reset"]
            )
        )
        XCTAssertTrue(
            StandaloneOnboardingConfiguration.opens(
                url: URL(string: "talentsignal://standalone")
            )
        )
        XCTAssertTrue(
            TalentSignalRootRoute.opensAgentWorkShowcase(
                arguments: ["TalentSignal", "--agent-work-showcase"]
            )
        )
        XCTAssertTrue(
            TalentSignalRootRoute.opensResearchShowcase(
                arguments: ["TalentSignal", "--synthetic-research-showcase"]
            )
        )
#else
        let arguments = [
            "TalentSignal",
            "--scenario", "audio-signal-capture",
            "--fixture-id", "TS-CORE-01",
            "--backend-url", "http://127.0.0.1:4320",
            "--workspace-backend-url", "http://127.0.0.1:4320",
            "--pursuit-proposal-id", "00000000-0000-4000-8000-000000000001",
            "--text-signal-seed", "00000000-0000-4000-8000-000000000002",
            "--standalone-onboarding-reset",
            "--standalone-demo",
            "--demo-proposal-engine",
            "--simulate-action-button",
            "--agent-work-showcase",
            "--synthetic-research-showcase",
        ]

        XCTAssertFalse(TalentSignalRootRoute.opensReviewWorkbench(arguments: arguments))
        XCTAssertNil(AudioSignalCaptureSession.configured(arguments: arguments))
        XCTAssertNil(TextSignalCaptureSession.configured(arguments: arguments))
        XCTAssertNil(PursuitProposalReviewSession.configured(arguments: arguments))
        XCTAssertNil(PursuitWorkspaceSession.configured(arguments: arguments))
        XCTAssertEqual(AppLaunchConfiguration.parse(arguments: arguments).scenario, .idle)
        XCTAssertFalse(
            CaptureHandoffStore.shared.configureDeterministicLaunch(
                arguments: arguments
            )
        )
        XCTAssertFalse(
            StandaloneOnboardingConfiguration.isEnabled(arguments: arguments)
        )
        XCTAssertFalse(
            StandaloneOnboardingConfiguration.opens(
                url: URL(string: "talentsignal://standalone")
            )
        )
        XCTAssertFalse(
            TalentSignalRootRoute.opensAgentWorkShowcase(arguments: arguments)
        )
        XCTAssertFalse(
            TalentSignalRootRoute.opensResearchShowcase(arguments: arguments)
        )
#endif
    }

    func testStandaloneSystemSurfacesMatchTheCompiledConfiguration() {
#if DEBUG
        XCTAssertTrue(StandaloneSharedCaptureConfiguration.isEnabled)
#else
        XCTAssertFalse(StandaloneSharedCaptureConfiguration.isEnabled)
#endif
    }
}
