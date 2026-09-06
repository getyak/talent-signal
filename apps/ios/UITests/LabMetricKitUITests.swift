import XCTest

@MainActor
final class LabMetricKitUITests: XCTestCase {
    func testSimulatorMissingReportAndExplicitSyntheticPreviewNeverBecomeHistory() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "-talent-signal.interface-language", "en"]
        app.launch(); open(app)
        XCTAssertTrue(app.staticTexts["lab-metrics-unavailable"].exists)
        XCTAssertFalse(app.buttons["lab-metrics-start"].exists)
        let empty = app.staticTexts["lab-metrics-empty"]; reveal(empty, app)
        XCTAssertEqual(empty.label, "No MetricKit summaries received")
        capture("lab-metrics-no-system-report")
        let example = app.buttons["lab-metrics-example"]; reveal(example, app); example.tap()
        XCTAssertTrue(app.staticTexts["lab-metrics-origin"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["lab-metrics-origin"].label, "Synthetic example · not a device measurement")
        XCTAssertFalse(app.buttons["lab-metrics-export"].exists)
        capture("lab-metrics-synthetic-summary")
        let histogram = app.staticTexts["Time to first draw distribution"]; reveal(histogram, app)
        XCTAssertTrue(histogram.exists)
        capture("lab-metrics-synthetic-distribution")
        app.terminate(); app.launch(); open(app)
        reveal(app.staticTexts["lab-metrics-empty"], app)
        XCTAssertEqual(app.staticTexts["lab-metrics-empty"].label, "No MetricKit summaries received")
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'lab-metrics-record-' ")).count, 0)
    }
    func testChineseAccessibilitySizeKeepsSyntheticAuthorityAndReturnReachable() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "-talent-signal.interface-language", "zh-Hans",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch(); open(app)
        let unavailable = app.staticTexts["lab-metrics-unavailable"]
        reveal(unavailable, app)
        XCTAssertTrue(unavailable.label.contains("真机"))
        capture("lab-metrics-chinese-ax5")
        let example = app.buttons["lab-metrics-example"]; reveal(example, app); example.tap()
        let origin = app.staticTexts["lab-metrics-origin"]
        XCTAssertTrue(origin.waitForExistence(timeout: 5))
        XCTAssertEqual(origin.label, "合成示例 · 非设备测量")
        capture("lab-metrics-chinese-example")
        let back = app.navigationBars.buttons.element(boundBy: 0)
        XCTAssertTrue(back.isHittable); back.tap()
        XCTAssertTrue(app.navigationBars["MetricKit 历史报告"].waitForExistence(timeout: 5))
    }
    private func open(_ app: XCUIApplication) {
        let lab = app.buttons["login-product-lab"]
        XCTAssertTrue(lab.waitForExistence(timeout: 15)); lab.tap()
        let diagnostics = app.buttons["product-lab-diagnostics"]; reveal(diagnostics, app); diagnostics.tap()
        let history = app.buttons["lab-diagnostics-metrickit"]
        XCTAssertTrue(history.waitForExistence(timeout: 5)); history.tap()
    }
    private func reveal(_ element: XCUIElement, _ app: XCUIApplication) {
        for _ in 0..<15 { if element.isHittable { return }; app.swipeUp() }
        XCTAssertTrue(element.isHittable)
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
