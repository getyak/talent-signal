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

    func testExactResearchActivityMovesFromWorkingToReviewAndEndsOnDeepLink() throws {
        try XCTSkipIf(Locale.preferredLanguages.first?.hasPrefix("zh") == true,
                      "Run the English receipt with English system language.")
        launchShowcase()
        XCTAssertTrue(element("research-synthetic-disclosure").exists)
        preserveScreenshot("TS-LA-01 Synthetic Research Showcase before start")
        observeSurface(seconds: 3)

        tapWhenVisible(app.buttons["research-start"])
        XCTAssertTrue(app.buttons["research-complete"].waitForExistence(timeout: 5))

        XCUIDevice.shared.press(.home)
        settleSystemSurface()
        assertSystemText("Working")
        preserveSystemScreenshot("TS-LA-02 Synthetic Research running compact")
        expandDynamicIsland(
            expectedTitle: "Reading approved pages",
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
        assertSystemText("To review")
        preserveSystemScreenshot("TS-LA-05 Synthetic Research review compact")
        expandDynamicIsland(
            expectedTitle: "Pages ready for review",
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

    func testResearchNotificationCenterCardKeepsItsExactHandoff() throws {
        try XCTSkipIf(Locale.preferredLanguages.first?.hasPrefix("zh") == true,
                      "Run the English system-card receipt with English system language.")
        launchShowcase()
        tapWhenVisible(app.buttons["research-start"])
        openNotificationCenter()
        assertSystemText("Reading approved pages")
        assertSystemText("Public sources only")
        preserveSystemScreenshot("Island research running system card")
        tapSystemAction("Open status")
        tapWhenVisible(app.buttons["research-complete"])
        openNotificationCenter()
        assertSystemText("Pages ready for review")
        assertSystemText("Nothing used automatically")
        preserveSystemScreenshot("Island research review system card")
        tapSystemAction("Open review")
        XCTAssertTrue(element("research-review-from-activity").waitForExistence(timeout: 8))
    }

    private func openNotificationCenter() {
        XCUIDevice.shared.press(.home)
        settleSystemSurface()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.005))
            .press(forDuration: 0.1, thenDragTo: springboard.coordinate(
                withNormalizedOffset: CGVector(dx: 0.15, dy: 0.75)
            ))
        settleSystemSurface()
    }

    func testChineseResearchHandoffUsesLocalizedSystemCopy() throws {
        try XCTSkipUnless(Locale.preferredLanguages.first?.hasPrefix("zh") == true,
                          "Live Activities use the Simulator system language; run this receipt in zh-Hans.")
        app.launchArguments = [
            "--synthetic-research-showcase", "--synthetic-research-reset",
            "-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN",
        ]
        launchShowcase()
        tapWhenVisible(app.buttons["research-start"])
        XCUIDevice.shared.press(.home)
        settleSystemSurface()
        assertSystemText("处理中")
        preserveSystemScreenshot("Island Chinese running compact")
        expandDynamicIsland(expectedTitle: "正在阅读选定资料",
                            expectedBoundary: "仅使用公开资料")
        preserveSystemScreenshot("Island Chinese running expanded")
        tapSystemAction("打开状态")
        openNotificationCenter()
        assertSystemText("正在阅读选定资料")
        assertSystemText("仅使用公开资料")
        preserveSystemScreenshot("Island Chinese running system card")
        tapSystemAction("打开状态")
        tapWhenVisible(app.buttons["research-complete"])
        XCUIDevice.shared.press(.home)
        settleSystemSurface()
        assertSystemText("待审阅")
        preserveSystemScreenshot("Island Chinese review compact")
        expandDynamicIsland(expectedTitle: "资料已整理，等待审阅",
                            expectedBoundary: "未经审阅不会使用")
        preserveSystemScreenshot("Island Chinese review expanded")
        openNotificationCenter()
        assertSystemText("资料已整理，等待审阅")
        assertSystemText("未经审阅不会使用")
        preserveSystemScreenshot("Island Chinese review system card")
        tapSystemAction("打开审阅")
        XCTAssertTrue(element("research-review-from-activity").waitForExistence(timeout: 8))
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
        expectedBoundary: String
    ) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        springboard.coordinate(
            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.06)
        ).press(forDuration: 1)
        settleSystemSurface()
        assertSystemText(expectedTitle)
        assertSystemText(expectedBoundary)
    }

    private func assertSystemText(_ text: String) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        XCTAssertTrue(springboard.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", text)
        ).firstMatch.waitForExistence(timeout: 5), "Missing system text: \(text)")
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
