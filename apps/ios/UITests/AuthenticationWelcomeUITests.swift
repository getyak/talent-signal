import XCTest

final class AuthenticationWelcomeUITests: XCTestCase {
    func testFirstMeetingSwipeRevealAndEmailRecovery() {
        let app = XCUIApplication()
        app.launchArguments = ["--auth-backend-url", "http://localhost:4317", "-AppleLanguages", "(zh-Hans)"]
        app.launch()
        let skip = app.buttons["welcome-skip"]
        XCTAssertTrue(skip.waitForExistence(timeout: 15))
        if !app.buttons["welcome-enter"].exists { skip.tap() }
        let invitation = app.buttons["welcome-enter"]
        XCTAssertTrue(invitation.waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["sign-in-with-google"].exists)
        save(app, "01-first-meeting")
        invitation.swipeUp()
        let google = app.buttons["sign-in-with-google"]
        XCTAssertTrue(google.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["sign-in-with-email"].exists)
        save(app, "02-emergence")
        app.buttons["sign-in-with-email"].tap()
        let email = app.textFields["login-email"]
        XCTAssertTrue(email.waitForExistence(timeout: 3))
        email.tap(); email.typeText("get6-unregistered@example.invalid")
        let password = app.secureTextFields["login-password"]
        password.tap(); password.typeText("wrong-fixture-password")
        app.buttons["login-email-submit"].tap()
        XCTAssertTrue(app.navigationBars.firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["邮箱或密码不正确，请重试。"].waitForExistence(timeout: 8))
        save(app, "03-email-recovery")
        let cancel = app.buttons["Cancel"].exists ? app.buttons["Cancel"] : app.buttons["取消"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 5))
        let ready = NSPredicate(format: "enabled == true")
        expectation(for: ready, evaluatedWith: cancel)
        waitForExpectations(timeout: 15)
        cancel.tap()
        let passwordPrompt = app.buttons["Not Now"]
        if passwordPrompt.waitForExistence(timeout: 2) { passwordPrompt.tap() }
        XCTAssertTrue(google.waitForExistence(timeout: 3))
        skip.tap()
        XCTAssertTrue(invitation.waitForExistence(timeout: 3))
        XCTAssertFalse(google.exists)
        save(app, "04-replay-reset")
    }
    func testReducedMotionDarkEntryRemainsAccessible() {
        let app = XCUIApplication()
        app.launchArguments = ["--auth-backend-url", "http://localhost:4317", "-AppleLanguages", "(zh-Hans)", "--force-dark", "--reduce-motion"]
        app.launch()
        let skip = app.buttons["welcome-skip"]
        XCTAssertTrue(skip.waitForExistence(timeout: 15))
        if !app.buttons["welcome-enter"].exists { skip.tap() }
        save(app, "05-dark-first-meeting")
        app.buttons["welcome-enter"].tap()
        XCTAssertTrue(app.buttons["sign-in-with-google"].waitForExistence(timeout: 5))
        save(app, "07-dark-reduced-motion")
    }

    private func save(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
