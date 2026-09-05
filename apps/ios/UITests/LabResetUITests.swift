import XCTest

@MainActor
final class LabResetUITests: XCTestCase {
    func testLocalResetPreviewRetainedResultAndRelaunch() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "--auth-backend-url", "http://127.0.0.1:4341", "-talent-signal.interface-language", "zh-Hans"]
        app.launchEnvironment["TS_IOS_UI_TEST_RESET_NAMESPACE"] = UUID().uuidString
        app.launch(); openReset(app)
        capture("reset-selected-steps-zh")
        reveal(app.buttons["lab-reset-review"], app); app.buttons["lab-reset-review"].tap()
        capture("reset-reviewed-scope-zh")
        let confirm = app.buttons["lab-reset-confirm"]; reveal(confirm, app); confirm.tap()
        let result = app.descendants(matching: .any).matching(NSPredicate(format: "identifier == %@ OR identifier == %@", "lab-reset-result-networkCache-verified", "lab-reset-result-networkCache-needsRetry")).firstMatch
        reveal(result, app)
        XCTAssertTrue(result.exists)
        let resultID = result.identifier
        let operation = app.staticTexts["lab-reset-operation"].firstMatch
        let id = operation.label
        XCTAssertFalse(id.isEmpty)
        capture("reset-observed-result-zh")
        app.terminate(); app.launch(); openReset(app)
        reveal(app.staticTexts["lab-reset-operation"].firstMatch, app)
        XCTAssertEqual(app.staticTexts["lab-reset-operation"].firstMatch.label, id)
        XCTAssertTrue(app.descendants(matching: .any)[resultID].firstMatch.exists)
        capture("reset-retained-after-relaunch-zh")
        if resultID.hasSuffix("needsRetry") {
            let stop = app.buttons["lab-reset-stop"]; reveal(stop, app); stop.tap()
            app.buttons["停止剩余步骤"].firstMatch.tap()
            let stopped = app.staticTexts["lab-reset-operation-status-stopped"].firstMatch
            reveal(stopped, app); XCTAssertTrue(stopped.exists)
            XCTAssertFalse(app.staticTexts["lab-reset-operation-status-verified"].firstMatch.exists)
            capture("reset-stopped-with-uncertain-result-zh")
        }
    }
    func testSignOutPartialResultRelaunchAndSameOperationRetry() async throws {
        continueAfterFailure = false
        let before = try await json("/test/metadata")
        XCTAssertEqual(before["purpose"] as? String, "lab-reset-native-proof-v1")
        let fixture = try await json("/test/fixture", method: "POST")
        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "--auth-backend-url", "http://127.0.0.1:4341", "-talent-signal.interface-language", "en"]
        app.launchEnvironment["TS_IOS_UI_TEST_AUTHENTICATED_SESSION"] = try JSONSerialization.data(withJSONObject: fixture).base64EncodedString()
        app.launch()
        let entry = app.buttons["talent-signal-lab-capsule"]
        XCTAssertTrue(entry.waitForExistence(timeout: 15)); entry.tap()
        reveal(app.buttons["product-lab-maintenance"], app); app.buttons["product-lab-maintenance"].tap()
        reveal(app.buttons["lab-ending-open"], app); app.buttons["lab-ending-open"].tap()
        XCTAssertTrue(app.buttons["lab-ending-sign-out"].waitForExistence(timeout: 5))
        app.buttons["lab-ending-sign-out"].tap()
        app.buttons["Sign out"].firstMatch.tap()
        let recovery = app.buttons["login-ending-recovery"]
        let available = recovery.waitForExistence(timeout: 12)
        if !available { XCTFail(app.debugDescription); return }
        XCTAssertFalse(app.buttons["talent-signal-lab-capsule"].exists)
        recovery.tap()
        XCTAssertTrue(app.descendants(matching: .any)["lab-ending-local-removed"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["lab-ending-remote-unverified"].firstMatch.exists)
        let id = try XCTUnwrap(app.staticTexts["lab-ending-operation"].firstMatch.value as? String)
        capture("reset-signout-partial")
        app.terminate(); app.launchEnvironment.removeValue(forKey: "TS_IOS_UI_TEST_AUTHENTICATED_SESSION"); app.launch()
        XCTAssertTrue(app.buttons["login-ending-recovery"].waitForExistence(timeout: 12))
        XCTAssertFalse(app.buttons["talent-signal-lab-capsule"].exists)
        app.buttons["login-ending-recovery"].tap()
        XCTAssertEqual(app.staticTexts["lab-ending-operation"].firstMatch.value as? String, id)
        let retry = app.buttons["lab-ending-retry"].firstMatch; reveal(retry, app); retry.tap()
        let result = app.descendants(matching: .any)["lab-ending-remote-revoked"].firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["lab-ending-operation"].firstMatch.value as? String, id)
        capture("reset-signout-retry-verified")
        let after = try await json("/test/metadata")
        XCTAssertEqual((after["logout_attempts"] as? Int ?? -100) - (before["logout_attempts"] as? Int ?? 0), 2)
        XCTAssertEqual((after["revoked_sessions"] as? Int ?? -100) - (before["revoked_sessions"] as? Int ?? 0), 1)
        XCTAssertEqual(after["external_model_calls"] as? Int, 0); XCTAssertEqual(after["business_writes"] as? Int, 0)
    }
    func testChineseAccessibilityResetControlsRemainReachable() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "--auth-backend-url", "http://127.0.0.1:4341", "--force-dark",
            "-talent-signal.interface-language", "zh-Hans", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launchEnvironment["TS_IOS_UI_TEST_RESET_NAMESPACE"] = UUID().uuidString
        app.launch(); openReset(app)
        let review = app.buttons["lab-reset-review"]; reveal(review, app)
        XCTAssertGreaterThanOrEqual(review.frame.height, 44); review.tap()
        let confirm = app.buttons["lab-reset-confirm"]; reveal(confirm, app)
        XCTAssertGreaterThanOrEqual(confirm.frame.height, 44)
        capture("reset-reviewed-scope-zh-ax5-dark")
    }
    private func openReset(_ app: XCUIApplication) {
        let lab = app.buttons["login-product-lab"]
        XCTAssertTrue(lab.waitForExistence(timeout: 15)); lab.tap()
        reveal(app.buttons["product-lab-maintenance"], app); app.buttons["product-lab-maintenance"].tap()
        let reset = app.buttons["lab-reset-open"]; reveal(reset, app); reset.tap()
    }
    private func reveal(_ element: XCUIElement, _ app: XCUIApplication) {
        for _ in 0..<20 { if element.isHittable { return }; app.swipeUp() }
        XCTAssertTrue(element.isHittable)
    }
    private func json(_ path: String, method: String = "GET") async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:4341" + path)!); request.httpMethod = method
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
    private func capture(_ name: String) {
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); image.name = name; image.lifetime = .keepAlways; add(image)
    }
}
