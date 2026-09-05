import XCTest

@MainActor
final class ProductLabUITests: XCTestCase {
    func testDeviceToolsWorkWithoutBackendAndOnboardingIsIsolated() {
        let app = XCUIApplication()
        app.launchArguments = ["--preview-workspace", "-talent-signal.interface-language", "zh-Hans"]
        app.launch()
        let lab = app.buttons["talent-signal-lab-capsule"]
        XCTAssertTrue(lab.waitForExistence(timeout: 12))
        lab.tap()
        XCTAssertTrue(app.buttons["product-lab-maintenance"].waitForExistence(timeout: 5))
        capture("lab-v2-home-zh")
        app.buttons["product-lab-maintenance"].tap()
        app.buttons["product-lab-clear-cache"].tap()
        XCTAssertTrue(app.staticTexts["product-lab-cache-cleared"].waitForExistence(timeout: 5)
            || app.otherElements["product-lab-cache-cleared"].exists)
        capture("lab-v2-maintenance-zh")
        app.buttons["product-lab-onboarding"].tap()
        XCTAssertTrue(app.buttons["standalone-start-example"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["standalone-use-own-signal"].isHittable)
        app.buttons["standalone-start-example"].tap()
        capture("lab-v2-onboarding-review-zh")
    }

    func testLabIsAvailableAtLoginWithUnavailableBackend() {
        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "--auth-backend-url", "http://127.0.0.1:1",
            "-talent-signal.interface-language", "en"]
        app.launch()
        let lab = app.buttons["login-product-lab"]
        XCTAssertTrue(lab.waitForExistence(timeout: 15))
        lab.tap()
        XCTAssertTrue(app.buttons["product-lab-experiments"].waitForExistence(timeout: 5))
        app.buttons["product-lab-experiments"].tap()
        XCTAssertTrue(app.staticTexts["Connect an internal backend"].exists)
        capture("lab-v2-offline-experiments")
    }

    func testAppearancePreviewIsInteractive() {
        let app = XCUIApplication()
        app.launchArguments = ["--preview-workspace", "--force-dark", "-talent-signal.interface-language", "en"]
        app.launch()
        app.buttons["talent-signal-lab-capsule"].tap()
        app.buttons["product-lab-appearance"].tap()
        capture("lab-v2-appearance-dark")
        app.buttons["product-lab-live-preview"].tap()
        XCTAssertTrue(app.buttons["lab-preview-close"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'workspace-person-' ")).firstMatch.exists)
        capture("lab-v2-live-preview-dark")
    }

    func testChineseAccessibilityLayoutKeepsToolsReachable() {
        let app = XCUIApplication()
        app.launchArguments = ["--preview-workspace", "--force-dark", "-talent-signal.interface-language", "zh-Hans",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
            "-UIAccessibilityReduceMotionEnabled", "YES"]
        app.launch()
        let entry = app.buttons["talent-signal-lab-capsule"]
        XCTAssertTrue(entry.waitForExistence(timeout: 12))
        entry.tap()
        capture("lab-v2-home-zh-ax5")
        let tool = app.buttons["product-lab-maintenance"]
        scrollTo(tool, in: app)
        XCTAssertGreaterThanOrEqual(tool.frame.height, 44)
        XCTAssertGreaterThan(tool.frame.height, 100, "Verify that accessibility text size actually took effect.")
        tool.tap()
        let replay = app.buttons["product-lab-onboarding"]
        scrollTo(replay, in: app)
        XCTAssertTrue(replay.isHittable)
        capture("lab-v2-maintenance-zh-ax5")
    }

    func testReadAndReviewSavedRealModelExperiment() async throws {
        // Reads a separately authorized live proof; this UI test never starts paid model calls.
        let baseURL = "http://127.0.0.1:4329"
        guard let (_, response) = try? await URLSession.shared.data(from: URL(string: baseURL + "/health/ready")!),
              (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw XCTSkip("Start the disposable Lab proof backend on loopback 4329 and create its real run first.")
        }
        let app = XCUIApplication()
        app.launchArguments = ["--workspace-backend-url", baseURL, "--workspace-account-slug", "fixture-alpha",
            "--workspace-user-email", "reviewer@alpha.local", "-talent-signal.interface-language", "zh-Hans"]
        app.launch()
        let entry = app.buttons["talent-signal-lab-capsule"]
        XCTAssertTrue(entry.waitForExistence(timeout: 15))
        entry.tap()
        app.buttons["product-lab-experiments"].tap()
        let previous = app.buttons["lab-job-previous-comparisons"]
        scrollTo(previous, in: app)
        previous.tap()
        XCTAssertTrue(app.buttons["lab-experiment-run"].waitForExistence(timeout: 10))
        capture("lab-v2-real-experiment-config")
        app.swipeUp()
        capture("lab-v2-real-model-answer")
        let save = app.buttons["lab-experiment-save-review"]
        scrollTo(save, in: app)
        XCTAssertTrue(save.isHittable)
        save.tap()
        let review = app.descendants(matching: .any)["lab-experiment-review-value"].firstMatch
        XCTAssertTrue(review.waitForExistence(timeout: 8))
        capture("lab-v2-real-model-review")
    }

    func testFeatureOverrideShowsEffectiveValueAndRestoresDefault() async throws {
        let baseURL = "http://127.0.0.1:4330"
        guard let (_, response) = try? await URLSession.shared.data(from: URL(string: baseURL + "/health/ready")!),
              (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw XCTSkip("Start the disposable Lab feature proof backend on loopback 4330 first.")
        }
        let app = XCUIApplication()
        app.launchArguments = ["--workspace-backend-url", baseURL,
            "--workspace-account-slug", "fixture-alpha", "--workspace-user-email", "recruiter@alpha.local",
            "-talent-signal.interface-language", "en"]
        app.launch()
        let lab = app.buttons["talent-signal-lab-capsule"]
        XCTAssertTrue(lab.waitForExistence(timeout: 15))
        lab.tap()
        let feature = app.buttons["product-lab-feature-overrides"]
        XCTAssertTrue(feature.waitForExistence(timeout: 8))
        feature.tap()
        XCTAssertTrue(app.descendants(matching: .any)["lab-feature-effective-value"].waitForExistence(timeout: 8))
        capture("lab-v2-feature-default")

        app.buttons["lab-feature-start"].tap()
        let confirmStart = app.buttons["lab-feature-confirm-start"].firstMatch
        XCTAssertTrue(confirmStart.waitForExistence(timeout: 3))
        confirmStart.tap()
        XCTAssertTrue(app.staticTexts["Source with exact excerpt"].waitForExistence(timeout: 8))
        capture("lab-v2-feature-active")

        app.buttons["lab-feature-stop"].tap()
        let confirmStop = app.buttons["lab-feature-confirm-stop"].firstMatch
        XCTAssertTrue(confirmStop.waitForExistence(timeout: 3))
        confirmStop.tap()
        XCTAssertTrue(app.staticTexts["Source card only"].waitForExistence(timeout: 8))
        capture("lab-v2-feature-restored")
    }

    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<18 {
            if element.isHittable { return }
            app.swipeUp()
        }
        XCTFail("Expected Lab control is not reachable: \(element.identifier)")
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
