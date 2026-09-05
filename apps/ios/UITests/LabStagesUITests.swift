import XCTest

@MainActor
final class LabStagesUITests: XCTestCase {
    func testNativeProbeMatchesServerStagesAndRetainsExactReportAfterRelaunch() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "--auth-backend-url", "http://127.0.0.1:4340", "-talent-signal.interface-language", "en"]
        app.launch()
        open(app)
        let start = app.buttons["lab-diagnostics-start"]
        XCTAssertTrue(start.waitForExistence(timeout: 5)); start.tap()
        let probe = app.buttons["product-lab-probe"]; reveal(probe, app); probe.tap()
        XCTAssertTrue(app.staticTexts["lab-diagnostics-probe-result"].waitForExistence(timeout: 8))
        let report = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'lab-diagnostics-report-' ")).firstMatch
        reveal(report, app); let id = report.identifier
        let stop = app.buttons["lab-diagnostics-stop"]; reveal(stop, app, up: true); stop.tap()
        let saved = app.buttons[id]; reveal(saved, app); saved.tap()
        let client = app.staticTexts["Health probe client"]; reveal(client, app)
        XCTAssertTrue(client.exists)
        capture("lab-stages-client-operation")
        let request = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'lab-diagnostic-request-' ")).firstMatch
        reveal(request, app); request.tap()
        let origin = app.staticTexts["lab-diagnostic-server-origin"]; reveal(origin, app)
        XCTAssertEqual(origin.label, "Synthetic server fixture measurement")
        let model = app.staticTexts["Model adapter"]; reveal(model, app)
        XCTAssertTrue(model.exists)
        capture("lab-stages-matched-server")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let export = app.buttons["lab-diagnostics-export"]; reveal(export, app, up: true); export.tap()
        let json = app.staticTexts["lab-diagnostics-export-json"]
        XCTAssertTrue(json.waitForExistence(timeout: 5))
        let archive = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.label.utf8)) as? [String: Any])
        let records = try XCTUnwrap(archive["reports"] as? [[String: Any]])
        let requests = try XCTUnwrap(records.first?["requests"] as? [[String: Any]])
        let record = try XCTUnwrap(requests.first { $0["serverTrace"] != nil })
        let trace = try XCTUnwrap(record["serverTrace"] as? [String: Any])
        XCTAssertEqual((trace["request_id"] as? String)?.lowercased(), (record["id"] as? String)?.lowercased())
        XCTAssertEqual(trace["origin"] as? String, "synthetic_fixture")
        let clients = try XCTUnwrap(records.first?["clientSpans"] as? [[String: Any]])
        let parent = try XCTUnwrap(clients.first { $0["id"] as? String == record["clientSpanID"] as? String })
        XCTAssertEqual(parent["kind"] as? String, "healthProbe")
        XCTAssertEqual(parent["outcome"] as? String, "completed")
        XCTAssertFalse(json.label.contains("synthetic-diagnostic-objective"))
        XCTAssertFalse(json.label.contains("127.0.0.1"))
        capture("lab-stages-reviewed-export")
        app.terminate(); app.launch(); open(app)
        let restored = app.buttons[id]; reveal(restored, app); restored.tap()
        let restoredRequest = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'lab-diagnostic-request-' ")).firstMatch
        reveal(restoredRequest, app); restoredRequest.tap()
        reveal(app.staticTexts["lab-diagnostic-server-origin"], app)
        XCTAssertEqual(app.staticTexts["lab-diagnostic-server-origin"].label, "Synthetic server fixture measurement")
        capture("lab-stages-restored-server")
    }
    private func open(_ app: XCUIApplication) {
        let lab = app.buttons["login-product-lab"]
        XCTAssertTrue(lab.waitForExistence(timeout: 15)); lab.tap()
        app.buttons["product-lab-diagnostics"].tap()
    }
    private func reveal(_ element: XCUIElement, _ app: XCUIApplication, up: Bool = false) {
        for _ in 0..<18 {
            if element.isHittable { return }
            if up { app.swipeDown() } else { app.swipeUp() }
        }
        XCTAssertTrue(element.isHittable)
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
