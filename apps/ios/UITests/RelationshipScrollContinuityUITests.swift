import XCTest
import UIKit

@MainActor
final class RelationshipScrollContinuityUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment["TS_IOS_UI_TEST_PREVIEW_WORKSPACE"] = "true"
        app.launchArguments = [
            "-AppleLanguages", "(en)", "-AppleLocale", "en_US",
            "-talent-signal.interface-language", "en",
            "-UIPreferredContentSizeCategoryName", UIContentSizeCategory.large.rawValue,
        ]
    }

    func testTodayEndOfContentClearsComposerInBothScrollDirections() {
        app.launch()
        assertTodayClearance()
    }

    func testTodayEndOfContentClearsComposerAtAX5InDarkMode() {
        let categoryIndex = app.launchArguments.firstIndex(
            of: "-UIPreferredContentSizeCategoryName"
        )!
        app.launchArguments[categoryIndex + 1] =
            UIContentSizeCategory.accessibilityExtraExtraExtraLarge.rawValue
        app.launchArguments += [
            "--force-dark",
            "-UIAccessibilityReduceMotionEnabled", "YES",
        ]
        app.launch()
        let effect = app.staticTexts["today-decision-effect-preview-contact"]
        XCTAssertTrue(effect.waitForExistence(timeout: 8))
        XCTAssertGreaterThan(effect.frame.height, 50, "Verify AX5 actually changes text layout")
        assertTodayClearance()
    }

    func testPeopleActuallyScrollBothWaysAndRestoreADeepAnchor() throws {
        app.launchArguments += [
            "--preview-long-people-list", "--fixture-record-retrieval-anchor",
        ]
        app.launch()
        app.buttons["archive-tab-people"].tap()
        let list = app.descendants(matching: .any)["workspace-people-list"].firstMatch
        XCTAssertTrue(list.waitForExistence(timeout: 8))
        XCTAssertGreaterThan(list.frame.height, 200, "Gesture target must be the real List")
        let probe = app.descendants(matching: .any)["people-scroll-anchor-probe"].firstMatch
        let firstID = "20000000-0000-4000-8000-000000000001"
        for _ in 0..<3 { list.swipeUp(velocity: .slow) }
        let deepID = try XCTUnwrap(probe.value as? String)
        XCTAssertNotEqual(deepID, "none")
        XCTAssertNotEqual(deepID, firstID, "The test must leave the initial viewport")
        list.swipeDown(velocity: .slow)
        let returnedID = try XCTUnwrap(probe.value as? String)
        XCTAssertNotEqual(returnedID, deepID, "Reverse scrolling must move the viewport")
        let row = app.buttons["workspace-person-\(returnedID)"]
        XCTAssertTrue(row.isHittable)
        let before = row.frame

        app.buttons["archive-tab-sessions"].tap()
        app.buttons["archive-tab-people"].tap()
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        XCTAssertTrue(row.isHittable)
        XCTAssertLessThanOrEqual(abs(row.frame.minY - before.minY), before.height + 8)
        let restingY = row.frame.minY
        // Observe settled continuity; this is not an FPS assertion.
        for _ in 0..<4 {
            XCTAssertEqual(row.frame.minY, restingY, accuracy: 2)
        }
        capture("People deep scroll restored without idle drift")
    }

    private func assertTodayClearance() {
        let scroll = app.scrollViews["editorial-today"]
        XCTAssertTrue(scroll.waitForExistence(timeout: 8))
        let footer = app.buttons["today-review-proposal-30000000-0000-4000-8000-000000000001"]
        let guide = app.buttons["relationship-guide"]
        let calendarDismiss = app.buttons["today-decision-dismiss-preview-calendar"]
        for pass in 0..<2 {
            for _ in 0..<12 {
                if footer.exists && footer.frame.maxY <= guide.frame.minY - 8 {
                    break
                }
                scroll.swipeUp(velocity: .slow)
            }
            XCTAssertTrue(footer.exists)
            XCTAssertLessThanOrEqual(footer.frame.maxY, guide.frame.minY - 8)
            XCTAssertLessThanOrEqual(calendarDismiss.frame.maxY, guide.frame.minY - 8)
            XCTAssertGreaterThanOrEqual(guide.frame.height, 44)
            capture("Today lower resting position pass \(pass)")
            scroll.swipeDown(velocity: .slow)
        }
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
