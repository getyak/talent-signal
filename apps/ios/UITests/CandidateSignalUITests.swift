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

    @MainActor
    func testBackendCanonicalStateReadsConfirmedFactsFromLocalhost() async throws {
        let endpoint = URL(string: "http://127.0.0.1:4317/health/ready")!
        guard let (_, response) = try? await URLSession.shared.data(from: endpoint),
              let response = response as? HTTPURLResponse,
              response.statusCode == 200 else {
            throw XCTSkip("Run with the authorized local Talent Signal backend.")
        }

        app.launchArguments = [
            "--backend-url", "http://127.0.0.1:4317"
        ]
        app.launch()

        XCTAssertTrue(element("fixture-banner").waitForExistence(timeout: 30))
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

    @MainActor
    func testRelationshipCaptureRequiresCurrentOwnerAndCompilesGoldWiki() async throws {
        let endpoint = URL(string: "http://127.0.0.1:4317/health/ready")!
        guard let (_, response) = try? await URLSession.shared.data(from: endpoint),
              let response = response as? HTTPURLResponse,
              response.statusCode == 200 else {
            throw XCTSkip("Run with the authorized local Talent Signal backend.")
        }

        app.launchArguments = [
            "--scenario", "relationship-capture",
            "--backend-url", "http://127.0.0.1:4317",
            "--capture-seed", "B2B2B2B2-B2B2-42B2-82B2-B2B2B2B2B2B2",
            "--capture-handle", "+6580805531",
            "--capture-name", "Current owner 080e5531"
        ]
        app.launch()

        XCTAssertTrue(element("reviewed-ocr-text").waitForExistence(timeout: 10))
        XCTAssertTrue(element("unknown-speaker-boundary").exists)
        tapWhenVisible(app.buttons["submit-reviewed-capture"])

        let currentID =
            "identity-candidate-054d4f41-ebe2-4c2f-9c55-3e83b680f725"
        let historicalID =
            "identity-candidate-e01fd3e7-3058-4d04-a40a-f91cf577185b"
        let current = app.buttons[currentID]
        let historical = app.buttons[historicalID]
        if !current.waitForExistence(timeout: 30) {
            let retry = app.buttons["retry-capture-step"]
            XCTAssertTrue(
                retry.waitForExistence(timeout: 5),
                "Identity review should load or expose a safe retry."
            )
            retry.tap()
        }
        XCTAssertTrue(current.waitForExistence(timeout: 30))
        XCTAssertTrue(historical.exists)
        XCTAssertFalse(current.isSelected)
        XCTAssertTrue(current.isEnabled)
        XCTAssertFalse(historical.isEnabled)
        XCTAssertTrue(element("identity-no-preselection").exists)
        XCTAssertTrue(element("historical-candidate-protected").exists)
        preserveScreenshot("Current and historical identity comparison")

        tapWhenVisible(current)
        XCTAssertTrue(current.isSelected)
        tapWhenVisible(app.buttons["bind-selected-person"])

        let verdict = element("wiki-quality-verdict")
        if !verdict.waitForExistence(timeout: 30) {
            let retry = app.buttons["retry-capture-step"]
            XCTAssertTrue(
                retry.waitForExistence(timeout: 5),
                "Wiki compilation should finish or expose a safe retry."
            )
            retry.tap()
        }
        XCTAssertTrue(verdict.waitForExistence(timeout: 30))
        XCTAssertEqual(verdict.label, "WIKI · GOLD")
        XCTAssertTrue(app.buttons["return-to-person"].exists)
        XCTAssertTrue(element("capture-completion-receipt").exists)
        preserveScreenshot("iOS relationship Wiki Gold receipt")
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
        let reviewInstruction = element("proposal-review-instruction")
        XCTAssertTrue(reviewInstruction.exists)
        let statusBar = XCUIApplication(bundleIdentifier: "com.apple.springboard")
            .statusBars.firstMatch
        XCTAssertTrue(statusBar.exists)
        positionBelowStatusBar(reviewInstruction, statusBar: statusBar)
        XCTAssertGreaterThanOrEqual(reviewInstruction.frame.minY, statusBar.frame.maxY)
        XCTAssertTrue(reviewInstruction.frame.intersects(app.windows.firstMatch.frame))
        preserveScreenshot("AX5 dark status-safe review")

        if #available(iOS 17.0, *) {
            try app.performAccessibilityAudit(for: [
                .dynamicType,
                .contrast,
                .hitRegion,
                .sufficientElementDescription
            ]) { issue in
                guard issue.auditType == .contrast,
                      let issueElement = issue.element else {
                    return false
                }
                let frame = issueElement.frame
                let window = self.app.windows.firstMatch.frame
                let scrollView = self.app.scrollViews.firstMatch
                let viewportBottom = scrollView.exists
                    ? scrollView.frame.maxY
                    : window.maxY
                let statusBottom = statusBar.frame.maxY
                let edgeTolerance: CGFloat = 1
                return frame.minY <= statusBottom + edgeTolerance
                    || frame.maxY >= viewportBottom - edgeTolerance
            }
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

    private func positionBelowStatusBar(
        _ element: XCUIElement,
        statusBar: XCUIElement
    ) {
        var attempts = 0
        while element.frame.minY < statusBar.frame.maxY, attempts < 3 {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.32))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.44))
            start.press(forDuration: 0.01, thenDragTo: end)
            attempts += 1
        }
    }

    private func preserveScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
