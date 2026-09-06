import XCTest

@MainActor
final class LabRuntimeUITests: XCTestCase {
    func testVerifySwitchRelaunchRejectMismatchAndReturn() async throws {
        continueAfterFailure = false
        guard let (_, response) = try? await URLSession.shared.data(from: URL(string: "http://127.0.0.1:4331/health/ready")!),
              (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw XCTSkip("Run startLabRuntimeFixtureServer.ts and build with its approved profiles.")
        }
        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "--auth-backend-url", "http://127.0.0.1:4331",
            "-talent-signal.interface-language", "en"]
        app.launch()
        openEnvironments(app)
        XCTAssertTrue(app.buttons["lab-environment-fixture-b"].exists, "The proof build must contain its approved target directory")
        app.buttons["lab-environment-fixture-b"].tap()
        let switchButton = app.buttons["lab-environment-switch"]
        scrollTo(switchButton, in: app)
        XCTAssertTrue(switchButton.waitForExistence(timeout: 8))
        capture("runtime-verified-b")
        switchButton.tap()
        app.buttons["lab-environment-confirm"].firstMatch.tap()
        XCTAssertTrue(app.buttons["login-product-lab"].waitForExistence(timeout: 10))
        app.terminate()
        app.launch()
        openEnvironments(app)
        XCTAssertEqual(app.descendants(matching: .any)["lab-current-environment"].firstMatch.value as? String, "fixture-b")
        capture("runtime-b-after-relaunch")
        app.buttons["lab-environment-bad"].tap()
        XCTAssertTrue(app.staticTexts["The deployed backend identity does not match the approved target."].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["lab-environment-switch"].exists)
        capture("runtime-mismatch-blocked")
        app.buttons["lab-environment-build-default"].tap()
        scrollTo(app.buttons["lab-environment-switch"], in: app)
        app.buttons["lab-environment-switch"].tap()
        app.buttons["lab-environment-confirm"].firstMatch.tap()
        XCTAssertTrue(app.buttons["login-product-lab"].waitForExistence(timeout: 10))
        openEnvironments(app)
        XCTAssertEqual(app.descendants(matching: .any)["lab-current-environment"].firstMatch.value as? String, "build-default")
        capture("runtime-returned-a")
    }

    private func openEnvironments(_ app: XCUIApplication) {
        let entry = app.buttons["login-product-lab"]
        XCTAssertTrue(entry.waitForExistence(timeout: 12))
        entry.tap()
        app.buttons["product-lab-environment"].tap()
        let environments = app.buttons["lab-runtime-environments"]
        scrollTo(environments, in: app)
        environments.tap()
    }
    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<8 {
            if element.isHittable { return }
            app.swipeUp()
        }
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
