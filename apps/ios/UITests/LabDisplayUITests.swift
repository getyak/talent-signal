import XCTest

@MainActor
final class LabDisplayUITests: XCTestCase {
    private func launch(accessibility: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--preview-workspace", "-talent-signal.interface-language", "en", "-talent-signal.display.appearance", "light"]
        if accessibility { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] }
        app.launchEnvironment["TS_IOS_UI_TEST_DISPLAY_PROBE"] = "true"
        app.launch()
        XCTAssertTrue(app.buttons["talent-signal-lab-capsule"].waitForExistence(timeout: 12))
        return app
    }
    private func openAppearance(_ app: XCUIApplication) {
        app.buttons["talent-signal-lab-capsule"].tap()
        let entry = app.buttons["product-lab-appearance"]
        reveal(entry, app)
        entry.tap()
        XCTAssertTrue(app.navigationBars["Appearance & accessibility"].waitForExistence(timeout: 5))
    }
    private func reveal(_ element: XCUIElement, _ app: XCUIApplication, above: Bool = false) {
        if element.isHittable { return }
        for _ in 0..<18 {
            let targetIsAbove = element.exists && !element.frame.isEmpty ? element.frame.midY < app.frame.midY : above
            if targetIsAbove { app.swipeDown() } else { app.swipeUp() }
            if element.isHittable { return }
        }
        for _ in 0..<18 { if above { app.swipeUp() } else { app.swipeDown() }; if element.isHittable { return } }
        XCTFail("Unreachable control: \(element.identifier)")
    }
    private func choose(_ identifier: String, _ value: String, _ app: XCUIApplication, above: Bool = false) {
        let picker = app.buttons[identifier]
        reveal(picker, app, above: above)
        picker.tap()
        // UIKit presents these Picker choices in a menu collection, separate
        // from equally named workspace tabs behind the Lab presentation.
        let option = app.collectionViews.buttons.matching(identifier: value).firstMatch
        XCTAssertTrue(option.waitForExistence(timeout: 3), "Missing option: \(value)")
        option.tap()
        XCTAssertTrue(picker.label.hasSuffix(", \(value)"), "The selected option must read back from the picker label.")
    }
    private func openPreview(_ app: XCUIApplication) {
        let open = app.buttons["product-lab-live-preview"]
        reveal(open, app, above: true); open.tap()
        XCTAssertTrue(app.buttons["lab-preview-close"].waitForExistence(timeout: 5))
    }
    private func closePreview(_ app: XCUIApplication) {
        let close = app.buttons["lab-preview-close"]
        XCTAssertTrue(close.waitForExistence(timeout: 5))
        XCTAssertTrue(close.isHittable)
        // The named element disappears as it dismisses. Tap its observed target
        // and verify the destination instead of re-querying the disappearing button.
        close.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.buttons["lab-appearance-page"].waitForExistence(timeout: 5))
    }
    private func capture(_ name: String) {
        // SwiftUI's 0.18-second page crossfade may outlive XCTest's idle signal.
        // Let its final frame render before preserving visual evidence.
        Thread.sleep(forTimeInterval: 0.6)
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    func testRealPageStatesAndIsolatedInteractions() {
        let app = launch()
        openAppearance(app)
        choose("lab-appearance-state", "Failed", app)
        openPreview(app)
        XCTAssertTrue(app.staticTexts["workspace-failed"].waitForExistence(timeout: 5))
        capture("lab-appearance-failure-before-retry")
        app.buttons["retry-workspace-read"].tap()
        XCTAssertTrue(app.staticTexts["workspace-failed-attempt-2"].exists)
        capture("lab-appearance-failed-retry")
        closePreview(app)
        choose("lab-appearance-state", "Long names & content", app)
        openPreview(app)
        let person = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'workspace-person-' ")).firstMatch
        XCTAssertTrue(person.waitForExistence(timeout: 5))
        person.tap()
        XCTAssertTrue(app.alerts["Preview interaction"].waitForExistence(timeout: 3))
        app.alerts.buttons["Done"].tap()
        capture("lab-appearance-people-long")
        closePreview(app)
        choose("lab-appearance-page", "Review · full evidence", app)
        openPreview(app)
        XCTAssertTrue(app.descendants(matching: .any)["standalone-content-size"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["standalone-use-own-signal"].isHittable)
        capture("lab-appearance-review-evidence")
        closePreview(app)
        choose("lab-appearance-page", "Sessions", app)
        choose("lab-appearance-state", "Stale read", app)
        openPreview(app)
        XCTAssertTrue(app.descendants(matching: .any)["workspace-refresh-notice"].firstMatch.waitForExistence(timeout: 5))
        capture("lab-appearance-sessions-stale")
    }
    func testTemporaryAppDisplayRestoresAndPresetDoesNotAutoApply() {
        let app = launch()
        let baseline = app.descendants(matching: .any)["lab-effective-display"].firstMatch.value as? String
        openAppearance(app)
        choose("product-lab-theme", "Dark", app)
        choose("lab-display-language", "简体中文", app)
        choose("lab-display-density", "Comfortable", app)
        let save = app.buttons["lab-display-save-preset"]; reveal(save, app); save.tap()
        let name = "Appearance proof \(UUID().uuidString.prefix(6))"
        let nameField = app.alerts.textFields.firstMatch
        XCTAssertTrue(nameField.waitForExistence(timeout: 3))
        nameField.typeText(name)
        app.alerts.buttons["Save"].tap()
        let apply = app.buttons["lab-display-apply"]; reveal(apply, app, above: true); apply.tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["product-lab-done"].tap()
        let probe = app.descendants(matching: .any)["lab-effective-display"].firstMatch
        XCTAssertTrue(app.buttons["lab-display-stop"].waitForExistence(timeout: 5))
        XCTAssertTrue((probe.value as? String)?.contains("zh-Hans|dark|") == true)
        XCTAssertTrue((probe.value as? String)?.hasSuffix("|comfortable") == true)
        XCTAssertGreaterThanOrEqual(app.buttons["lab-display-stop"].frame.height + 0.001, 44)
        XCTAssertTrue(app.buttons["archive-tab-people"].isHittable, "Display trial must preserve workspace navigation.")
        app.buttons["archive-tab-people"].tap()
        XCTAssertTrue(app.buttons["lab-display-stop"].exists)
        app.buttons["archive-tab-today"].tap()
        capture("lab-appearance-current-app-chinese-dark")
        app.buttons["lab-display-stop"].tap()
        XCTAssertEqual(probe.value as? String, baseline)
        openAppearance(app)
        let preset = app.buttons[name]; reveal(preset, app); preset.tap()
        let applyAgain = app.buttons["lab-display-apply"]; reveal(applyAgain, app, above: true); applyAgain.tap()
        app.terminate(); app.launch()
        XCTAssertFalse(app.buttons["lab-display-stop"].exists)
        XCTAssertEqual(app.descendants(matching: .any)["lab-effective-display"].firstMatch.value as? String, baseline)
        openAppearance(app)
        reveal(app.buttons[name], app)
        XCTAssertTrue(app.buttons[name].exists)
        capture("lab-appearance-saved-preset-after-relaunch")
        let delete = app.buttons["Delete preset \(name)"]; delete.tap()
        XCTAssertFalse(app.buttons[name].exists)
    }
    func testSystemAX5PreviewKeepsCloseAndDisplayControlsReachable() {
        let app = launch(accessibility: true)
        openAppearance(app)
        choose("lab-display-text-size", "Large", app)
        choose("lab-display-language", "简体中文", app, above: true)
        choose("product-lab-theme", "Dark", app, above: true)
        choose("lab-appearance-page", "Onboarding", app, above: true)
        openPreview(app)
        let size = app.descendants(matching: .any)["standalone-content-size"].firstMatch
        XCTAssertTrue(size.waitForExistence(timeout: 5))
        XCTAssertEqual(size.value as? String, "accessibility")
        XCTAssertEqual(app.descendants(matching: .any)["standalone-appearance"].firstMatch.value as? String, "dark")
        XCTAssertTrue(app.buttons["lab-preview-close"].isHittable)
        XCTAssertGreaterThanOrEqual(app.buttons["lab-preview-close"].frame.minY, 44, "Preview controls must remain below the device status area.")
        // AX frame subtraction can report 44 points as 43.999999999999986.
        XCTAssertGreaterThanOrEqual(app.buttons["lab-preview-close"].frame.height + 0.001, 44)
        XCTAssertTrue(app.buttons["lab-preview-controls"].isHittable)
        capture("lab-appearance-chinese-dark-system-ax5")
        app.buttons["lab-preview-controls"].tap()
        XCTAssertTrue(app.buttons["product-lab-theme"].waitForExistence(timeout: 5))
    }
}
