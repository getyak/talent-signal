import XCTest

@MainActor
final class TalentSignalLabUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment["TS_IOS_UI_TEST_PREVIEW_WORKSPACE"] = "false"
    }

    func testNativeLabRunsTheRealQualityEvidenceJourney() async throws {
        let backendURL = testConfiguration(
            "TS_IOS_BACKEND_URL",
            fallback: "http://127.0.0.1:4320"
        )
        guard await labBackendIsAvailable(at: backendURL) else {
            throw XCTSkip("The capability-enabled Lab backend was not configured.")
        }

        app.launchArguments = [
            "--workspace-backend-url", backendURL,
            "--workspace-account-slug", "fixture-alpha",
            "--workspace-user-email", "reviewer@alpha.local",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
            "-talent-signal.interface-language", "en",
        ]
        app.launch()

        let capsule = app.buttons["talent-signal-lab-capsule"]
        guard capsule.waitForExistence(timeout: 20) else {
            XCTFail("The capability-gated native Lab capsule did not appear.")
            return
        }
        XCTAssertTrue(capsule.isHittable)
        XCTAssertGreaterThanOrEqual(capsule.frame.height, 44)
        preserveScreenshot("Native Lab entry capsule")
        capsule.tap()

        guard element("lab-isolation-seal").waitForExistence(timeout: 8) else {
            XCTFail("The Lab sheet did not expose its isolation boundary.")
            return
        }
        let scenario = app.buttons["身份存在歧义，不得自动合并"]
        scrollToVisible(scenario)
        scenario.tap()

        let run = app.buttons["Run Candidate"].firstMatch
        scrollToVisible(run)
        XCTAssertGreaterThanOrEqual(run.frame.height, 44)
        run.tap()

        let lens = app.buttons["Inspect why"]
        scrollToVisible(lens)
        lens.tap()
        XCTAssertTrue(app.buttons["signal-lens-done"].waitForExistence(timeout: 8))
        preserveScreenshot("Signal Lens evidence explanation")
        let lensCompare = app.buttons["signal-lens-compare-baseline"]
        scrollToVisible(lensCompare)
        lensCompare.tap()
        app.buttons["signal-lens-done"].tap()
        XCTAssertTrue(app.buttons["signal-lens-done"].waitForNonExistence(timeout: 8))

        let comparison = app.staticTexts["lab-comparison-heading"]
        scrollToVisible(comparison, maxSwipes: 30)
        preserveScreenshot("Lab baseline comparison")

        let record = app.buttons["lab-record-receipt"]
        scrollToVisible(record)
        record.tap()
        let receipt = app.staticTexts["lab-receipt-heading"]
        scrollToVisible(receipt, maxSwipes: 30)
        preserveScreenshot("Redacted Reality Receipt")

        let promote = app.buttons["lab-promote-receipt"]
        scrollToVisible(promote)
        promote.tap()
        let confirm = app.buttons["lab-confirm-promotion"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()

        let success = element("lab-eval-promotion-success")
        scrollToVisible(success)
        preserveScreenshot("Human promoted Eval release gate")
    }

    func testNativeLabSupportsChineseAX5AndReducedTransparency() async throws {
        let backendURL = testConfiguration(
            "TS_IOS_BACKEND_URL",
            fallback: "http://127.0.0.1:4320"
        )
        guard await labBackendIsAvailable(at: backendURL) else {
            throw XCTSkip("The capability-enabled Lab backend was not configured.")
        }

        app.launchArguments = [
            "--workspace-backend-url", backendURL,
            "--workspace-account-slug", "fixture-alpha",
            "--workspace-user-email", "reviewer@alpha.local",
            "--force-dark",
            "-AppleInterfaceStyle", "Dark",
            "-AppleLanguages", "(zh-Hans)",
            "-AppleLocale", "zh_CN",
            "-talent-signal.interface-language", "zh-Hans",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
            "-UIAccessibilityReduceMotionEnabled", "YES",
            "-UIAccessibilityReduceTransparencyEnabled", "YES",
        ]
        app.launch()

        let capsule = app.buttons["talent-signal-lab-capsule"]
        XCTAssertTrue(capsule.waitForExistence(timeout: 20))
        XCTAssertGreaterThanOrEqual(capsule.frame.height, 44)
        XCTAssertTrue(capsule.isHittable)
        capsule.tap()

        XCTAssertTrue(element("lab-isolation-seal").waitForExistence(timeout: 8))
        let scenario = app.buttons["一段新关系正在形成"]
        scrollToVisible(scenario)
        XCTAssertGreaterThanOrEqual(scenario.frame.height, 44)
        preserveScreenshot("Native Lab Chinese AX5 reduced transparency")
    }

    private func testConfiguration(_ key: String, fallback: String) -> String {
        if let value = ProcessInfo.processInfo.environment[key], !value.isEmpty {
            return value
        }
        if let value = Bundle(for: TalentSignalLabUITests.self)
            .object(forInfoDictionaryKey: key) as? String,
           !value.isEmpty,
           !value.contains("$(") {
            return value
        }
        return fallback
    }

    private func labBackendIsAvailable(at backendURL: String) async -> Bool {
        guard let baseURL = URL(string: backendURL) else { return false }
        var loginRequest = URLRequest(
            url: baseURL.appending(path: "v1/auth/simulated-login")
        )
        loginRequest.httpMethod = "POST"
        loginRequest.setValue("application/json", forHTTPHeaderField: "content-type")
        loginRequest.httpBody = try? JSONSerialization.data(withJSONObject: [
            "account_slug": "fixture-alpha",
            "user_email": "reviewer@alpha.local",
            "client_label": "ios-lab-ui-test-preflight",
        ])

        guard let (loginData, loginResponse) = try? await URLSession.shared.data(
            for: loginRequest
        ),
        let loginHTTP = loginResponse as? HTTPURLResponse,
        (200...299).contains(loginHTTP.statusCode),
        let loginJSON = try? JSONSerialization.jsonObject(with: loginData)
            as? [String: Any],
        let accessToken = loginJSON["access_token"] as? String else {
            return false
        }

        var manifestRequest = URLRequest(url: baseURL.appending(path: "v1/lab"))
        manifestRequest.setValue("Bearer \(accessToken)", forHTTPHeaderField: "authorization")
        guard let (manifestData, manifestResponse) = try? await URLSession.shared.data(
            for: manifestRequest
        ),
        let manifestHTTP = manifestResponse as? HTTPURLResponse,
        (200...299).contains(manifestHTTP.statusCode),
        let manifestJSON = try? JSONSerialization.jsonObject(with: manifestData)
            as? [String: Any],
        let capability = manifestJSON["capability"] as? [String: Any] else {
            return false
        }
        return capability["enabled"] as? Bool == true
            && capability["synthetic_evidence_only"] as? Bool == true
            && capability["production_data_access"] as? Bool == false
            && capability["canonical_write_access"] as? Bool == false
            && capability["external_effect_access"] as? Bool == false
    }

    private enum ScrollDirection {
        case up
        case down

        var opposite: Self {
            switch self {
            case .up: .down
            case .down: .up
            }
        }
    }

    private func scrollToVisible(
        _ element: XCUIElement,
        direction: ScrollDirection = .up,
        maxSwipes: Int = 18
    ) {
        if element.waitForExistence(timeout: 1), isSafelyVisible(element) {
            return
        }
        searchForVisible(element, direction: direction, maxSwipes: maxSwipes)
        if !isSafelyVisible(element) {
            searchForVisible(
                element,
                direction: direction.opposite,
                maxSwipes: maxSwipes
            )
        }
        let appeared = element.waitForExistence(timeout: 3)
        XCTAssertTrue(appeared, "Expected \(element) after scrolling")
        if appeared {
            XCTAssertTrue(
                isSafelyVisible(element),
                "Expected \(element) to be safely visible"
            )
        }
    }

    private func searchForVisible(
        _ element: XCUIElement,
        direction: ScrollDirection,
        maxSwipes: Int
    ) {
        var swipes = 0
        while !isSafelyVisible(element), swipes < maxSwipes {
            switch direction {
            case .up:
                app.swipeUp()
            case .down:
                app.swipeDown()
            }
            swipes += 1
        }
    }

    private func isSafelyVisible(_ element: XCUIElement) -> Bool {
        guard element.exists, element.isHittable, !element.frame.isEmpty else {
            return false
        }
        let safeFrame = app.frame.insetBy(dx: 0, dy: 96)
        let visibleFrame = safeFrame.intersection(element.frame)
        return !visibleFrame.isNull
            && visibleFrame.width >= 44
            && visibleFrame.height >= 44
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }

    private func preserveScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
