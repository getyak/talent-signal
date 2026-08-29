import XCTest

@MainActor
final class AgentWorkShowcaseUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    func testExistingContactLifecycleEndsInSeparateReviewableCards() {
        launchShowcase()

        XCTAssertTrue(element("agent-work-synthetic-disclosure").exists)
        preserveScreenshot("Agent lifecycle before processing")

        runProcessingLifecycle()
        XCTAssertTrue(app.staticTexts["Alex Chen"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Nothing has been applied"].exists)
        preserveScreenshot("Agent lifecycle actions ready")

        reviewFacts([
            "competing_process-hero-m1",
            "decision_deadline-hero-m1",
            "work_mode_preference-hero-m1",
            "next_meeting-hero-m1",
        ])

        tapWhenVisible(app.buttons["review-action"])
        XCTAssertTrue(element("action-card-update-contact").waitForExistence(timeout: 5))
        XCTAssertTrue(element("action-card-create-meeting").exists)
        preserveScreenshot("Agent update contact action cards")

        tapWhenVisible(app.buttons["Approve card"].firstMatch)
        tapWhenVisible(app.buttons["Approve card"].firstMatch)
        tapWhenVisible(app.buttons["complete-handoff"])
        XCTAssertTrue(app.staticTexts["2 actions approved for handoff"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["No external changes"].exists)
        tapWhenVisible(app.buttons["agent-work-run-again"])
    }

    func testNewContactRequiresIdentityAndChannelReviewBeforeCardAppears() {
        launchShowcase()

        tapWhenVisible(app.buttons["agent-work-scenario-newContact"])
        runProcessingLifecycle()
        XCTAssertTrue(app.staticTexts["Identity not bound"].waitForExistence(timeout: 5))

        reviewFacts([
            "contact_name-new-contact-m1",
            "email-new-contact-m1",
        ])

        tapWhenVisible(app.buttons["review-action"])
        XCTAssertTrue(element("action-card-create-contact").waitForExistence(timeout: 5))
        tapWhenVisible(app.buttons["Approve card"].firstMatch)
        XCTAssertTrue(app.buttons["Approved"].waitForExistence(timeout: 3))
        preserveScreenshot("Agent create contact action card")
        tapWhenVisible(app.buttons["back-to-review"])
        tapWhenVisible(app.buttons["agent-work-close-live-activity"])
    }

    func testRealDynamicIslandMovesFromAwayToReview() {
        launchShowcase()

        tapWhenVisible(app.buttons["agent-work-start"])
        XCTAssertTrue(app.buttons["Read selected evidence"].waitForExistence(timeout: 5))
        tapWhenVisible(app.buttons["agent-work-advance"])
        XCTAssertTrue(app.buttons["Check the right person"].waitForExistence(timeout: 5))

        XCUIDevice.shared.press(.home)
        waitForSystemSurface()
        preserveSystemScreenshot("Dynamic Island while Agent can work away")

        tapDynamicIsland()
        XCTAssertTrue(element("agent-work-showcase-header").waitForExistence(timeout: 8))
        for _ in 0..<3 {
            tapWhenVisible(app.buttons["agent-work-advance"])
            waitForSystemSurface()
        }
        XCTAssertTrue(scrollUntilExists(element("fixture-banner")))

        XCUIDevice.shared.press(.home)
        waitForSystemSurface()
        preserveSystemScreenshot("Dynamic Island when actions need review")

        tapDynamicIsland()
        XCTAssertTrue(element("fixture-banner").waitForExistence(timeout: 8))
        XCTAssertTrue(
            app.buttons["agent-work-close-live-activity"]
                .waitForNonExistence(timeout: 5)
        )
    }

    private func launchShowcase() {
        configureLaunchArguments()
        app.launch()
        if !element("agent-work-showcase-header").waitForExistence(timeout: 10) {
            app.terminate()
            configureLaunchArguments()
            app.launch()
        }
        XCTAssertTrue(element("agent-work-showcase-header").waitForExistence(timeout: 10))
    }

    private func configureLaunchArguments() {
        app.launchArguments = [
            "--agent-work-showcase",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
    }

    private func waitForSystemSurface() {
        let delay = XCTestExpectation(description: "Allow the system Live Activity surface to settle")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            delay.fulfill()
        }
        wait(for: [delay], timeout: 2)
    }

    private func tapDynamicIsland() {
        XCUIApplication(bundleIdentifier: "com.apple.springboard").coordinate(
            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.06)
        ).tap()
    }

    private func runProcessingLifecycle() {
        tapWhenVisible(app.buttons["agent-work-start"])
        XCTAssertTrue(app.buttons["Read selected evidence"].waitForExistence(timeout: 5))

        let nextTitles = [
            "Check the right person",
            "Prepare review actions",
            "Finish Agent processing",
        ]
        for title in nextTitles {
            tapWhenVisible(app.buttons["agent-work-advance"])
            XCTAssertTrue(app.buttons[title].waitForExistence(timeout: 5))
        }

        tapWhenVisible(app.buttons["agent-work-advance"])
        XCTAssertTrue(element("fixture-banner").waitForExistence(timeout: 5))
    }

    private func reviewFacts(_ factIDs: [String]) {
        for factID in factIDs {
            tapWhenVisible(app.buttons["fact-confirm-\(factID)"])
            XCTAssertTrue(
                app.staticTexts.matching(identifier: "fact-decision-\(factID)")
                    .element.waitForExistence(timeout: 3)
            )
        }
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }

    private func tapWhenVisible(_ element: XCUIElement, maxSwipes: Int = 16) {
        var swipes = 0
        while (!element.exists || !element.isHittable), swipes < maxSwipes {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(element.exists, "Expected \(element) after scrolling")
        element.tap()
    }

    private func scrollUntilExists(
        _ element: XCUIElement,
        maxSwipes: Int = 12
    ) -> Bool {
        if element.waitForExistence(timeout: 3) { return true }
        for _ in 0..<maxSwipes {
            app.swipeUp()
            if element.exists { return true }
        }
        return false
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
