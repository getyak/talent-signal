import XCTest

final class LabDemoResetUITests: XCTestCase {
    func testReviewedDemoResetReturnsToWelcomeAndRetainsReceiptAfterRelaunch() throws {
        continueAfterFailure = false
        let app = application()
        app.launch(); openDemoReset(app)
        tap("lab-reset-review", app)
        reveal(app.buttons["lab-reset-confirm"], app)
        capture("demo-reset-reviewed-scope-zh", app)
        tap("lab-reset-confirm", app)
        let result = app.descendants(matching: .any)["lab-reset-result-demo-verified"].firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 8))
        let operation = app.staticTexts["lab-reset-operation"].firstMatch.label
        XCTAssertNotNil(UUID(uuidString: operation))
        capture("demo-reset-verified-zh", app)
        app.terminate()
        app.launchArguments.removeAll { $0 == "--standalone-onboarding-reset" }
        app.launch()
        XCTAssertTrue(app.buttons["standalone-start-example"].waitForExistence(timeout: 10))
        capture("demo-reset-welcome-after-relaunch-zh", app)
        tap("standalone-manage-retained-sources", app)
        tap("standalone-reset-demo-data", app)
        reveal(app.staticTexts["lab-reset-operation"].firstMatch, app)
        XCTAssertEqual(app.staticTexts["lab-reset-operation"].firstMatch.label, operation)
        XCTAssertTrue(result.exists)
        XCTAssertFalse(app.buttons["lab-reset-review"].isEnabled)
        capture("demo-reset-retained-receipt-zh", app)
    }

    func testDemoResetReviewAtAccessibilitySizeInDarkMode() {
        continueAfterFailure = false
        let app = application()
        app.launchArguments += ["--force-dark", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch(); openDemoReset(app)
        tap("lab-reset-review", app)
        let button = app.buttons["lab-reset-confirm"]
        reveal(button, app)
        XCTAssertGreaterThanOrEqual(button.frame.height, 44)
        capture("demo-reset-reviewed-scope-zh-ax5-dark", app)
    }

    private func application() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--standalone-onboarding", "--standalone-onboarding-reset", "--standalone-demo", "--simulate-action-button",
            "-talent-signal.interface-language", "zh-Hans", "-UIAccessibilityReduceMotionEnabled", "YES"]
        let namespace = UUID().uuidString
        app.launchEnvironment["TS_IOS_UI_TEST_RESET_NAMESPACE"] = namespace
        app.launchEnvironment["TS_IOS_UI_TEST_ONBOARDING_NAMESPACE"] = namespace
        return app
    }
    private func openDemoReset(_ app: XCUIApplication) {
        tap("standalone-start-example", app)
        tap("standalone-focused-confirm", app)
        tap("standalone-see-today", app)
        tap("standalone-open-settings", app)
        tap("standalone-reset-demo-data", app)
        XCTAssertTrue(app.switches["lab-reset-select-demo"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.switches["lab-reset-select-demo"].isEnabled)
    }
    private func tap(_ id: String, _ app: XCUIApplication) {
        let element = app.descendants(matching: .any)[id].firstMatch
        _ = element.waitForExistence(timeout: 2)
        reveal(element, app); element.tap()
    }
    private func reveal(_ element: XCUIElement, _ app: XCUIApplication) {
        for _ in 0..<16 { if element.isHittable { return }; app.swipeUp() }
        XCTAssertTrue(element.isHittable, app.debugDescription)
    }
    private func capture(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
