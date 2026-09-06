import XCTest

@MainActor
final class AgentAskLiveActivityUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    func testDynamicIslandKeepsAskLifecycleBriefAndDistinct() {
        let fixtures = [
            (phase: "thinking", title: "Agent"),
            (phase: "review", title: "Review"),
            (phase: "failed", title: "Couldn't connect"),
            (phase: "timedOut", title: "Still waiting"),
        ]

        for fixture in fixtures {
            app.launchArguments = [
                "--preview-workspace",
                "--fixture-agent-ask-activity",
                "--fixture-agent-ask-phase", fixture.phase,
                "-AppleLanguages", "(en)",
                "-AppleLocale", "en_US",
                "-talent-signal.interface-language", "en",
                "-UIAccessibilityReduceMotionEnabled", "YES",
            ]
            app.launch()
            XCTAssertTrue(
                app.descendants(matching: .any)["editorial-today"]
                    .waitForExistence(timeout: 8)
            )
            waitForSystemSurface()

            XCUIDevice.shared.press(.home)
            waitForSystemSurface()
            let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
            springboard.coordinate(
                withNormalizedOffset: CGVector(dx: 0.5, dy: 0.04)
            ).press(forDuration: 1)
            waitForSystemSurface()

            XCTAssertTrue(
                springboard.staticTexts.matching(
                    NSPredicate(format: "label CONTAINS %@", fixture.title)
                ).firstMatch.waitForExistence(timeout: 8)
            )
            preserveSystemScreenshot("Ask Dynamic Island \(fixture.phase)")
            app.activate()
            app.terminate()
        }
    }

    private func waitForSystemSurface() {
        let settled = XCTestExpectation(description: "Live Activity settled")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            settled.fulfill()
        }
        wait(for: [settled], timeout: 2)
    }

    private func preserveSystemScreenshot(_ name: String) {
        let attachment = XCTAttachment(
            screenshot: XCUIScreen.main.screenshot()
        )
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
