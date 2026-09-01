import XCTest

@MainActor
final class ResearchShowcaseUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = [
            "--synthetic-research-showcase",
            "--synthetic-research-reset",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
    }

    func testExactResearchActivityMovesFromAwayToReviewAndEndsOnDeepLink() {
        launchShowcase()
        XCTAssertTrue(element("research-synthetic-disclosure").exists)
        preserveScreenshot("TS-LA-01 Synthetic Research Showcase before start")
        observeSurface(seconds: 3)

        tapWhenVisible(app.buttons["research-start"])
        XCTAssertTrue(app.buttons["research-complete"].waitForExistence(timeout: 5))

        XCUIDevice.shared.press(.home)
        settleSystemSurface()
        preserveSystemScreenshot("TS-LA-02 Synthetic Research running compact")
        expandDynamicIsland(
            expectedTitle: "Reading approved pages",
            expectedSupporting: "You can leave",
            expectedBoundary: "Public sources only"
        )
        preserveSystemScreenshot("TS-LA-03 Synthetic Research running expanded")
        observeSurface(seconds: 3)

        tapSystemAction("Open status")
        XCTAssertEqual(app.state, .runningForeground)
        XCTAssertTrue(app.buttons["research-complete"].waitForExistence(timeout: 8))
        tapWhenVisible(app.buttons["research-complete"])
        XCTAssertTrue(element("research-review").waitForExistence(timeout: 5))

        XCUIDevice.shared.press(.home)
        settleSystemSurface()
        preserveSystemScreenshot("TS-LA-05 Synthetic Research review compact")
        expandDynamicIsland(
            expectedTitle: "Pages ready for review",
            expectedSupporting: "Review required before use",
            expectedBoundary: "Nothing used automatically"
        )
        preserveSystemScreenshot("TS-LA-06 Synthetic Research review expanded")
        observeSurface(seconds: 3)

        tapSystemAction("Open review")
        XCTAssertEqual(app.state, .runningForeground)
        XCTAssertTrue(
            element("research-review-from-activity")
                .waitForExistence(timeout: 8)
        )
        preserveScreenshot("TS-LA-09 Synthetic Research exact review opened and ended")
        observeSurface(seconds: 8)
    }

    func testAppFallbackKeepsExactBoundaryWithoutDynamicIsland() {
        launchShowcase()
        tapWhenVisible(app.buttons["research-start"])
        tapWhenVisible(app.buttons["research-complete"])

        XCTAssertTrue(element("research-review").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Review required before use"].exists)
        XCTAssertTrue(app.staticTexts["Nothing was used automatically"].exists)
        preserveScreenshot("TS-LA-10 Synthetic Research App fallback")
    }

    private func launchShowcase() {
        app.launch()
        if !element("research-showcase-header").waitForExistence(timeout: 10) {
            app.terminate()
            app.launch()
        }
        XCTAssertTrue(element("research-showcase-header").waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["research-start"].waitForExistence(timeout: 5))
    }

    private func tapSystemAction(_ title: String) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let action = springboard.buttons[title]
        XCTAssertTrue(action.waitForExistence(timeout: 5))
        action.tap()
    }

    private func expandDynamicIsland(
        expectedTitle: String,
        expectedSupporting: String,
        expectedBoundary: String
    ) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        springboard.coordinate(
            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.06)
        ).press(forDuration: 1)
        settleSystemSurface()
        XCTAssertTrue(
            springboard.staticTexts[expectedTitle].waitForExistence(timeout: 3)
        )
        XCTAssertTrue(
            springboard.staticTexts[expectedSupporting].waitForExistence(timeout: 3)
        )
        XCTAssertTrue(
            springboard.staticTexts[expectedBoundary].waitForExistence(timeout: 3)
        )
    }

    private func settleSystemSurface() {
        let expectation = XCTestExpectation(description: "system surface settles")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 2)
    }

    private func observeSurface(seconds: TimeInterval) {
        let expectation = XCTestExpectation(description: "surface remains readable")
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: seconds + 1)
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }

    private func tapWhenVisible(_ element: XCUIElement, maxSwipes: Int = 12) {
        var swipes = 0
        while (!element.exists || !element.isHittable), swipes < maxSwipes {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(element.exists, "Expected \(element) after scrolling")
        element.tap()
    }

    private func preserveScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func preserveSystemScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
