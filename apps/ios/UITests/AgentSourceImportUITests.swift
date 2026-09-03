import XCTest

@MainActor
final class AgentSourceImportUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = [
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
            "-talent-signal.interface-language", "en",
            "--fixture-agent-contact-import",
        ]
        app.launchEnvironment["TS_IOS_UI_TEST_PREVIEW_WORKSPACE"] = "true"
    }

    func testContactFileBecomesReviewableWithoutRetainingRawSource() {
        app.launch()

        XCTAssertTrue(element("editorial-today").waitForExistence(timeout: 8))
        app.buttons["relationship-agent-studio"].tap()
        XCTAssertTrue(element("agent-studio").waitForExistence(timeout: 5))
        app.buttons["agent-open-sources"].tap()

        XCTAssertTrue(element("agent-import-review").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Connections.csv"].exists)
        XCTAssertTrue(app.staticTexts["On-device review"].exists)
        XCTAssertTrue(app.staticTexts["Not mapped"].exists)
        XCTAssertTrue(app.staticTexts["Private note"].exists)
        XCTAssertTrue(app.staticTexts["Exact duplicate of row 2"].exists)
        XCTAssertTrue(app.staticTexts["Missing name"].exists)
        preserveScreenshot("Contact import separates reviewable blocked and unmapped data")

        app.staticTexts["Maya Chen"].tap()
        XCTAssertTrue(element("agent-import-person-review").waitForExistence(timeout: 5))
        let rawFileStatus = element("agent-import-raw-file-status")
        XCTAssertTrue(rawFileStatus.exists)
        let rawFileDescription = [
            rawFileStatus.label,
            rawFileStatus.value as? String ?? "",
        ].joined(separator: " ")
        XCTAssertTrue(rawFileDescription.contains("Raw file"))
        XCTAssertTrue(rawFileDescription.contains("Not retained"))
        let sourceBoundary = app.staticTexts[
            "Organization and position remain source evidence in this slice; they are not silently promoted to confirmed profile fields."
        ]
        scrollToVisible(sourceBoundary)
        XCTAssertTrue(sourceBoundary.exists)
        let createPerson = app.switches["Create a new person"]
        scrollToVisible(createPerson)
        XCTAssertTrue(createPerson.exists)
        XCTAssertEqual(createPerson.value as? String, "0")
        let save = app.buttons["agent-import-save-person"]
        scrollToVisible(save)
        XCTAssertTrue(save.exists)
        XCTAssertFalse(save.isEnabled)
        XCTAssertTrue(app.staticTexts["Preview workspace: file review works, but no canonical Person can be saved."].exists)
        preserveScreenshot("Contact import makes one exact identity decision")
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    private func scrollToVisible(_ element: XCUIElement) {
        for _ in 0 ..< 8 where !element.isHittable {
            app.swipeUp()
        }
    }

    private func preserveScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
