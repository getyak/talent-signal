import XCTest

final class StandaloneOnboardingUITests: XCTestCase {
    @MainActor
    func testStandaloneDemoMeetingJourneyCreatesVerifiedToday() throws {
        let app = XCUIApplication()
        app.launchArguments = [
            "--standalone-onboarding-reset",
            "--standalone-demo",
            "--demo-proposal-engine",
            "--simulate-action-button",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launch()

        tap("standalone-demo-user", in: app)
        tap("standalone-create-pursuit", in: app)
        tap("standalone-finish-demo", in: app)
        tap("standalone-source-calendar", in: app)
        tap("standalone-calendar-demo-meeting", in: app)

        app.buttons["Text"].tap()
        tap("standalone-use-example-signal", in: app)
        tap("standalone-process-signal", in: app)

        let confirm = app.buttons["standalone-confirm-proposal"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 8))
        let factToggle = app.switches["Confirm this sourced change"].firstMatch
        XCTAssertTrue(factToggle.waitForExistence(timeout: 5))
        factToggle.tap()
        confirm.tap()
        tap("standalone-offer-action-button", in: app)
        tap("standalone-practice-capture", in: app)
        tap("standalone-simulate-action-button", in: app)
        tap("standalone-enter-today", in: app)

        XCTAssertTrue(
            app.descendants(matching: .any)["standalone-today-primary-card"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.staticTexts["Hire a VP of Engineering"].exists)
        let evidenceLink = app.buttons["standalone-today-evidence-link"]
        XCTAssertTrue(evidenceLink.waitForExistence(timeout: 5))
        XCTAssertTrue(evidenceLink.isHittable, "Source evidence should be reachable in the initial Today viewport")
        XCTAssertGreaterThanOrEqual(evidenceLink.frame.minY, app.frame.minY)
        XCTAssertLessThanOrEqual(
            evidenceLink.frame.maxY,
            app.frame.maxY,
            "Source evidence should be fully visible without inheriting the prior route's scroll offset"
        )
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Remote preferred'")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'visa'")).firstMatch.exists)
        XCTAssertFalse(
            app.staticTexts["Clarify the open dependency"].exists,
            "An unaccepted Proposal action must not be presented as Today's current next action"
        )
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Standalone Today with source evidence"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    @MainActor
    func testStandaloneCalendarExplainsPurposeBeforeSystemPrompt() {
        let app = XCUIApplication()
        app.launchArguments = ["--standalone-onboarding-reset", "--standalone-demo"]
        app.launch()

        tap("standalone-demo-user", in: app)
        tap("standalone-create-pursuit", in: app)
        tap("standalone-finish-demo", in: app)
        tap("standalone-source-calendar", in: app)

        XCTAssertTrue(app.staticTexts["Connect the conversation to the right moment."].exists)
        XCTAssertTrue(app.staticTexts["No Calendar writes"].exists)
        XCTAssertTrue(app.buttons["standalone-allow-calendar"].exists)
    }

    @MainActor
    func testStandaloneArbitraryTextCompletesThroughManualNoModelReview() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--standalone-onboarding-reset",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launch()

        tap("standalone-demo-user", in: app)
        tap("standalone-create-pursuit", in: app)
        tap("standalone-finish-demo", in: app)
        tap("standalone-source-type-a-signal", in: app)
        let signal = app.textViews["standalone-signal-text"]
        XCTAssertTrue(signal.waitForExistence(timeout: 5))
        signal.tap()
        signal.typeText("Candidate requested a four-day week; compensation remains unresolved.")
        app.swipeUp()
        app.swipeUp()
        tap("standalone-review-without-ai", in: app)

        XCTAssertTrue(app.staticTexts["MANUAL STRUCTURE · NO MODEL"].waitForExistence(timeout: 8))
        let factToggle = app.switches["Confirm this sourced change"].firstMatch
        if !factToggle.waitForExistence(timeout: 2) { app.swipeUp() }
        XCTAssertTrue(factToggle.waitForExistence(timeout: 5))
        factToggle.tap()
        tap("standalone-confirm-proposal", in: app)

        XCTAssertTrue(
            app.descendants(matching: .any)["standalone-offer-action-button"]
                .waitForExistence(timeout: 5)
        )
    }

    @MainActor
    private func tap(_ identifier: String, in app: XCUIApplication) {
        let element = app.descendants(matching: .any)[identifier]
        XCTAssertTrue(element.waitForExistence(timeout: 5), "Missing \(identifier)")
        if !element.isHittable { app.swipeUp() }
        element.tap()
    }
}
