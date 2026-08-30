import XCTest

final class StandaloneOnboardingUITests: XCTestCase {
    @MainActor
    func testStandaloneThirtySecondExampleCreatesVerifiedToday() throws {
        let app = englishApp()
        app.launchArguments += [
            "--standalone-onboarding-reset",
            "--standalone-demo",
            "--demo-proposal-engine",
            "--simulate-action-button",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launch()

        let welcomeAttachment = XCTAttachment(screenshot: app.screenshot())
        welcomeAttachment.name = "Standalone first-progress welcome"
        welcomeAttachment.lifetime = .keepAlways
        add(welcomeAttachment)

        tap("standalone-start-example", in: app)
        let focusedConfirm = app.buttons["standalone-focused-confirm"]
        XCTAssertTrue(focusedConfirm.waitForExistence(timeout: 5))
        let reviewAttachment = XCTAttachment(screenshot: app.screenshot())
        reviewAttachment.name = "Standalone focused fact review"
        reviewAttachment.lifetime = .keepAlways
        add(reviewAttachment)
        focusedConfirm.tap()
        tap("standalone-see-today", in: app)

        XCTAssertTrue(
            app.descendants(matching: .any)["standalone-today-primary-card"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.staticTexts["Hire a VP of Engineering"].exists)
        XCTAssertTrue(app.staticTexts["SOURCE EVIDENCE"].exists)
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
        let app = englishApp()
        app.launchArguments += ["--standalone-onboarding-reset", "--standalone-demo"]
        app.launch()

        startOwnSetup(in: app)
        tap("standalone-source-calendar", in: app)

        XCTAssertTrue(app.staticTexts["Connect the conversation to the right moment."].exists)
        XCTAssertTrue(app.staticTexts["No Calendar writes"].exists)
        XCTAssertTrue(app.buttons["standalone-allow-calendar"].exists)
    }

    @MainActor
    func testStandaloneArbitraryTextCompletesThroughManualNoModelReview() {
        let app = englishApp()
        app.launchArguments += [
            "--standalone-onboarding-reset",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launch()

        startOwnSetup(in: app)
        tap("standalone-source-type-a-signal", in: app)
        let signal = app.textViews["standalone-signal-text"]
        XCTAssertTrue(signal.waitForExistence(timeout: 5))
        signal.tap()
        signal.typeText("Candidate requested a four-day week; compensation remains unresolved.")
        app.swipeUp()
        app.swipeUp()
        tap("standalone-review-without-ai", in: app)

        XCTAssertTrue(app.staticTexts["MANUAL STRUCTURE · NO MODEL"].waitForExistence(timeout: 8))
        let confirm = app.buttons["standalone-focused-confirm"]
        if !confirm.waitForExistence(timeout: 2) { app.swipeUp() }
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["standalone-see-today"]
                .waitForExistence(timeout: 5)
        )
    }

    @MainActor
    func testStandaloneAX5LongMixedSignalHasKeyboardExitAndReachableManualReview() {
        let app = englishApp()
        app.launchArguments += [
            "--standalone-onboarding-reset",
            "--force-dark",
            "--simulate-action-button",
            "--standalone-clear-pending-shortcut-fixtures",
            "-AppleInterfaceStyle", "Dark",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launch()

        let appearance = app.descendants(matching: .any)["standalone-appearance"]
        XCTAssertTrue(appearance.waitForExistence(timeout: 5))
        XCTAssertEqual(appearance.value as? String, "dark")
        let contentSize = app.descendants(matching: .any)["standalone-content-size"]
        XCTAssertTrue(contentSize.waitForExistence(timeout: 5))
        XCTAssertEqual(contentSize.value as? String, "accessibility")

        startOwnSetup(in: app)
        tap("standalone-source-type-a-signal", in: app)

        let signal = app.textViews["standalone-signal-text"]
        XCTAssertTrue(signal.waitForExistence(timeout: 5))
        signal.tap()
        signal.typeText(
            "候选人希望每周四天远程工作，并要求在书面 offer 前澄清薪酬区间、签证支持和跨时区协作方式。 "
                + "The recruiter must preserve this exact mixed-script source, keep compensation unresolved, "
                + "and avoid converting preference or uncertainty into a confirmed fact."
        )

        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        let dismissKeyboard = app.buttons["standalone-dismiss-signal-keyboard"]
        XCTAssertTrue(dismissKeyboard.waitForExistence(timeout: 5))
        XCTAssertTrue(dismissKeyboard.isHittable)
        let keyboardAttachment = XCTAttachment(screenshot: app.screenshot())
        keyboardAttachment.name = "Standalone AX5 dark long mixed Signal with keyboard exit"
        keyboardAttachment.lifetime = .keepAlways
        add(keyboardAttachment)

        dismissKeyboard.tap()
        XCTAssertFalse(app.keyboards.firstMatch.waitForExistence(timeout: 2))
        let manualReview = app.buttons["standalone-review-without-ai"]
        for _ in 0..<6 where !manualReview.isHittable { app.swipeUp() }
        XCTAssertTrue(manualReview.waitForExistence(timeout: 5))
        XCTAssertTrue(manualReview.isHittable)
        manualReview.tap()

        XCTAssertTrue(app.staticTexts["MANUAL STRUCTURE · NO MODEL"].waitForExistence(timeout: 8))
        let proposalAttachment = XCTAttachment(screenshot: app.screenshot())
        proposalAttachment.name = "Standalone AX5 dark manual Proposal"
        proposalAttachment.lifetime = .keepAlways
        add(proposalAttachment)

        let confirm = app.buttons["standalone-focused-confirm"]
        for _ in 0..<6 where !confirm.isHittable { app.swipeUp() }
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()

        tap("standalone-see-today", in: app)
        XCTAssertTrue(
            app.descendants(matching: .any)["standalone-today-primary-card"]
                .waitForExistence(timeout: 5)
        )
        let todayAttachment = XCTAttachment(screenshot: app.screenshot())
        todayAttachment.name = "Standalone AX5 dark Today"
        todayAttachment.lifetime = .keepAlways
        add(todayAttachment)
    }

    @MainActor
    func testFreshWelcomeCanDeleteRetainedSourceAfterReset() {
        let fixtureID = UUID()
        let app = englishApp()
        app.launchArguments += [
            "--standalone-onboarding-reset",
            "--standalone-retained-source-fixture", fixtureID.uuidString,
        ]
        app.launch()

        let manage = app.buttons["standalone-manage-retained-sources"]
        XCTAssertTrue(manage.waitForExistence(timeout: 5))
        XCTAssertTrue(manage.isHittable)
        manage.tap()

        let delete = app.buttons[
            "standalone-delete-retained-source-\(fixtureID.uuidString.lowercased())"
        ]
        for _ in 0..<4 where !delete.exists { app.swipeUp() }
        XCTAssertTrue(delete.waitForExistence(timeout: 5))
        delete.tap()
        let confirm = app.buttons["Delete Source and Derived State"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()

        XCTAssertTrue(
            app.staticTexts["standalone-no-retained-sources"]
                .waitForExistence(timeout: 5)
        )
    }

    @MainActor
    func testQueuedShortcutRetriesAfterPursuitCreationAndLeavesNoHiddenQueue() {
        let fixtureID = UUID()
        let app = englishApp()
        app.launchArguments += [
            "--standalone-onboarding-reset",
            "--standalone-clear-pending-shortcut-fixtures",
            "--standalone-pending-shortcut-fixture", fixtureID.uuidString,
        ]
        app.launch()

        XCTAssertTrue(
            app.descendants(matching: .any)["standalone-queued-shortcut-source"]
                .waitForExistence(timeout: 5)
        )
        startOwnSetup(in: app)

        XCTAssertTrue(app.textViews["standalone-signal-text"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["SHARE SHEET SOURCE"].exists)
        XCTAssertFalse(
            app.descendants(matching: .any)["standalone-queued-shortcut-source"].exists
        )
    }

    @MainActor
    func testFreshWelcomeCanDeleteQueuedShortcutCaptureAfterReset() {
        let fixtureID = UUID()
        let app = englishApp()
        app.launchArguments += [
            "--standalone-onboarding-reset",
            "--standalone-clear-pending-shortcut-fixtures",
            "--standalone-pending-shortcut-fixture", fixtureID.uuidString,
        ]
        app.launch()

        let queuedSource = app.descendants(matching: .any)["standalone-queued-shortcut-source"]
        XCTAssertTrue(queuedSource.waitForExistence(timeout: 5))
        let delete = app.buttons["Delete Queued Capture"]
        XCTAssertTrue(delete.waitForExistence(timeout: 5))
        if !delete.isHittable { app.swipeUp() }
        XCTAssertTrue(delete.isHittable)
        delete.tap()

        let confirm = app.alerts["Delete queued Shortcut capture?"]
            .buttons["Delete Queued Capture"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()

        XCTAssertFalse(queuedSource.waitForExistence(timeout: 2))
    }

    @MainActor
    private func englishApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
            "-talent-signal.interface-language", "en",
        ]
        return app
    }

    @MainActor
    private func tap(_ identifier: String, in app: XCUIApplication) {
        let element = app.descendants(matching: .any)[identifier]
        XCTAssertTrue(element.waitForExistence(timeout: 5), "Missing \(identifier)")
        if !element.isHittable { app.swipeUp() }
        element.tap()
    }

    @MainActor
    private func startOwnSetup(in app: XCUIApplication) {
        tap("standalone-use-own-signal", in: app)
        tap("standalone-use-identity", in: app)
        tap("standalone-create-pursuit", in: app)
    }
}
