import XCTest

final class CandidateSignalUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    func testTSCORE01EvidenceFactReviewActionPreviewAndHandoff() {
        launch(fixtureID: "TS-CORE-01")

        XCTAssertTrue(element("fixture-banner").waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Alex Chen"].exists)
        XCTAssertTrue(element("message-m1").exists)
        preserveScreenshot("TS-CORE-01 evidence and proposals")

        let factIDs = [
            "competing_process-m1",
            "decision_deadline-m1",
            "availability-m1",
            "work_mode_preference-m1"
        ]
        for factID in factIDs {
            tapWhenVisible(app.buttons["fact-confirm-\(factID)"])
            XCTAssertTrue(
                app.staticTexts.matching(identifier: "fact-decision-\(factID)")
                    .element.waitForExistence(timeout: 2)
            )
        }

        tapWhenVisible(app.buttons["review-action"])
        let actionTitle = app.staticTexts["Prepare one question—locally"]
        XCTAssertTrue(actionTitle.waitForExistence(timeout: 4))
        XCTAssertGreaterThan(actionTitle.frame.minY, 59)
        XCTAssertTrue(app.staticTexts["client remote-work policy"].exists)
        XCTAssertTrue(
            app.staticTexts[
                "Prepare a recruiter-owned question for a local handoff. No message, meeting, contact, ATS record, or reminder will be created."
            ].exists
        )
        preserveScreenshot("TS-CORE-01 separate action preview")

        tapWhenVisible(app.buttons["complete-handoff"])
        let outcomeTitle = app.staticTexts["Local handoff is ready"]
        XCTAssertTrue(outcomeTitle.waitForExistence(timeout: 4))
        XCTAssertGreaterThan(outcomeTitle.frame.minY, 59)
        XCTAssertTrue(app.staticTexts["No external changes"].exists)
        preserveScreenshot("TS-CORE-01 local outcome")
    }

    func testUnrelatedSelectedImageNeverShowsFixtureFacts() {
        launch(scenario: "unrelated-image")

        XCTAssertTrue(app.staticTexts["Unrelated image selected"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.staticTexts["Alex Chen"].exists)
        XCTAssertEqual(app.otherElements.matching(NSPredicate(format: "identifier BEGINSWITH 'fact-card-'")).count, 0)
    }

    func testProhibitedFitRequestIsRefused() {
        launch(fixtureID: "TS-BOUND-01")

        XCTAssertTrue(app.staticTexts["fit-refusal-message"].waitForExistence(timeout: 8))
        XCTAssertEqual(
            app.staticTexts["fit-refusal-message"].label,
            "Refused: conversation tone, response speed, and shared interests must not become culture-fit, quality, personality, or acceptance scores."
        )
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", ".*[0-9]+%.*")).firstMatch.exists)

        tapWhenVisible(app.buttons["finish-without-action"])
        XCTAssertTrue(app.staticTexts["Candidate scoring was refused"].waitForExistence(timeout: 4))
        XCTAssertTrue(app.staticTexts["No external changes"].exists)
    }

    func testStaleActionCannotComplete() {
        launch(scenario: "stale-preview")

        XCTAssertTrue(app.staticTexts["This preview is no longer current"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["complete-handoff"].exists)
        XCTAssertTrue(app.buttons["refresh-stale-preview"].exists)
    }

    func testImportCancellationAndRecovery() {
        app.launchArguments = [
            "--fixture-import-delay-seconds", "10"
        ]
        launch()

        tapWhenVisible(app.buttons["open-fixture"])
        XCTAssertTrue(element("importing-state").waitForExistence(timeout: 3))
        app.buttons["cancel-import"].tap()
        XCTAssertTrue(app.staticTexts["Opening synthetic fixture was cancelled"].waitForExistence(timeout: 4))
        XCTAssertFalse(app.staticTexts["Alex Chen"].exists)

        app.buttons["cancelled-recovery"].tap()
        XCTAssertTrue(app.buttons["open-fixture"].waitForExistence(timeout: 4))
    }

    func testBackendFailureHasTruthfulRecovery() {
        launch(scenario: "import-failed")

        XCTAssertTrue(app.staticTexts["Nothing was changed"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Nothing was changed"].exists)
        XCTAssertFalse(app.staticTexts["Alex Chen"].exists)

        app.buttons["failed-recovery"].tap()
        XCTAssertTrue(app.buttons["open-fixture"].waitForExistence(timeout: 4))
    }

    func testOfflineLocalhostFailureAndRecovery() {
        app.launchArguments = ["--endpoint", "http://127.0.0.1:1/fixtures.json"]
        app.launch()

        tapWhenVisible(app.buttons["Configure localhost fixture sync"])
        tapWhenVisible(app.buttons["sync-localhost"])
        XCTAssertTrue(app.staticTexts["Nothing was changed"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.staticTexts["Alex Chen"].exists)

        app.buttons["failed-recovery"].tap()
        XCTAssertTrue(app.buttons["open-fixture"].waitForExistence(timeout: 4))
    }

    @MainActor
    func testLocalhostSyncSuccess() async throws {
        let endpoint = URL(
            string: "http://127.0.0.1:8787/evals/candidate-momentum-v1.json"
        )!
        guard let (_, response) = try? await URLSession.shared.data(from: endpoint),
              let response = response as? HTTPURLResponse,
              response.statusCode == 200 else {
            throw XCTSkip("Run with the authorized local fixture server.")
        }

        app.launchArguments = [
            "--endpoint",
            endpoint.absoluteString
        ]
        app.launch()

        tapWhenVisible(app.buttons["Configure localhost fixture sync"])
        tapWhenVisible(app.buttons["sync-localhost"])
        XCTAssertTrue(element("fixture-banner").waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Alex Chen"].exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format: "label CONTAINS %@",
                    "Read-only localhost sync · 8 synthetic cases · 2026-08-05.1"
                )
            ).firstMatch.exists
        )
        preserveScreenshot("Localhost fixture provenance")
    }

    func testBackendCanonicalStateReadsConfirmedFactsFromLocalhost() {
        app.launchArguments = [
            "--backend-url", "http://127.0.0.1:4317"
        ]
        app.launch()

        XCTAssertTrue(element("fixture-banner").waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts["Alex Chen"].exists)
        XCTAssertTrue(element("message-m1").exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format: "label CONTAINS %@",
                    "Localhost canonical state · fixture-alpha"
                )
            ).firstMatch.exists
        )
        XCTAssertEqual(app.staticTexts.matching(identifier: "fact-decision-competing_process-m1").element.label, "Confirmed locally")
        XCTAssertEqual(app.staticTexts.matching(identifier: "fact-decision-decision_deadline-m1").element.label, "Confirmed locally")
        XCTAssertEqual(app.staticTexts.matching(identifier: "fact-decision-availability-m1").element.label, "Confirmed locally")
        XCTAssertEqual(app.staticTexts.matching(identifier: "fact-decision-work_mode_preference-m1").element.label, "Confirmed locally")
        XCTAssertTrue(app.buttons["review-action"].exists)
        preserveScreenshot("TS-CORE-01 canonical backend state")
    }

    func testBackgroundInterruptionPreservesReviewDecision() {
        launch(fixtureID: "TS-CORE-01")

        tapWhenVisible(app.buttons["fact-confirm-competing_process-m1"])
        XCTAssertTrue(app.staticTexts["Confirmed locally"].exists)

        XCUIDevice.shared.press(.home)
        app.activate()

        XCTAssertTrue(app.staticTexts["Confirmed locally"].waitForExistence(timeout: 5))
        XCTAssertTrue(element("fixture-banner").exists)
    }

    func testAX5DarkModeCriticalContentRemainsReachable() throws {
        app.launchArguments = [
            "--fixture-id", "TS-CORE-01",
            "--force-dark",
            "-AppleInterfaceStyle", "Dark",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge"
        ]
        app.launch()

        XCTAssertTrue(element("fixture-banner").waitForExistence(timeout: 8))
        XCTAssertTrue(element("message-m1").exists)
        tapWhenVisible(app.buttons["fact-confirm-competing_process-m1"])
        XCTAssertTrue(app.staticTexts["Confirmed locally"].exists)

        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: [
                .dynamicType,
                .contrast,
                .hitRegion,
                .sufficientElementDescription
            ])
        }
        preserveScreenshot("AX5 dark critical review")
    }

    func testAccessibilityOrderPlacesEvidenceBeforeFactDecision() {
        launch(fixtureID: "TS-CORE-01")

        let elements = app.descendants(matching: .any).allElementsBoundByIndex
        let messageIndex = elements.firstIndex { $0.identifier == "message-m1" }
        let factIndex = elements.firstIndex { $0.identifier == "fact-card-competing_process-m1" }

        XCTAssertNotNil(messageIndex)
        XCTAssertNotNil(factIndex)
        XCTAssertLessThan(messageIndex!, factIndex!)
    }

    private func launch(fixtureID: String? = nil, scenario: String? = nil) {
        if let fixtureID {
            app.launchArguments += ["--fixture-id", fixtureID]
        }
        if let scenario {
            app.launchArguments += ["--scenario", scenario]
        }
        app.launch()
    }

    private func tapWhenVisible(_ element: XCUIElement, maxSwipes: Int = 14) {
        var swipes = 0
        while (!element.exists || !element.isHittable), swipes < maxSwipes {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(element.exists, "Expected \(element) to exist after scrolling")
        XCTAssertTrue(element.isHittable, "Expected \(element) to be hittable after scrolling")
        element.tap()
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
