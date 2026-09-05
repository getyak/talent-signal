import XCTest

@MainActor
final class LabDiagnosticsUITests: XCTestCase {
    func testAutomaticAudioAndPresentationStagesReachReviewedReport() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = [
            "--preview-workspace",
            "--deterministic-voice-input",
            "-voice-input-cloud-disclosure-v1", "NO",
            "-talent-signal.interface-language", "en",
        ]
        app.launch()
        openLab(app)
        let start = app.buttons["lab-diagnostics-start"]
        XCTAssertTrue(start.waitForExistence(timeout: 5)); start.tap()
        let activeReport = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'lab-diagnostics-report-' ")
        ).firstMatch
        reveal(activeReport, app)
        let reportID = activeReport.identifier
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["product-lab-done"].tap()

        let voice = app.buttons["dictate-agent-message"]
        XCTAssertTrue(voice.waitForExistence(timeout: 5)); voice.tap()
        let disclosure = app.buttons["confirm-voice-input-disclosure"].firstMatch
        XCTAssertTrue(disclosure.waitForExistence(timeout: 5)); disclosure.tap()
        XCTAssertTrue(app.staticTexts["ask-voice-recording"].waitForExistence(timeout: 5))
        let stopVoice = app.buttons["ask-voice"]
        XCTAssertTrue(stopVoice.waitForExistence(timeout: 3)); stopVoice.tap()
        XCTAssertTrue(app.buttons["ask-send"].waitForExistence(timeout: 5))
        let stopRecording = app.buttons["lab-diagnostics-quick-stop"]
        XCTAssertTrue(stopRecording.waitForExistence(timeout: 5)); stopRecording.tap()
        app.terminate(); app.launch()
        openLab(app)
        let report = app.buttons[reportID]
        reveal(report, app); report.tap()
        let firstDisplay = app.staticTexts["First display callback after presentation"]
        reveal(firstDisplay, app)
        XCTAssertTrue(firstDisplay.exists)
        let audioPreparation = app.staticTexts["Audio session preparation"]
        reveal(audioPreparation, app)
        XCTAssertTrue(audioPreparation.exists)
        let transcription = app.staticTexts["Voice transcription client"]
        reveal(transcription, app)
        XCTAssertTrue(transcription.exists)
        capture("lab-automatic-audio-presentation-stages")

        let export = app.buttons["lab-diagnostics-export"]
        reveal(export, app, up: true); export.tap()
        let json = app.staticTexts["lab-diagnostics-export-json"]
        XCTAssertTrue(json.waitForExistence(timeout: 5))
        let archive = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(json.label.utf8)) as? [String: Any]
        )
        let reports = try XCTUnwrap(archive["reports"] as? [[String: Any]])
        let spans = try XCTUnwrap(reports.first?["clientSpans"] as? [[String: Any]])
        let kinds = Set(spans.compactMap { $0["kind"] as? String })
        XCTAssertTrue(kinds.isSuperset(of: [
            "audioSessionPreparation",
            "audioPayloadFinalization",
            "voiceTranscription",
            "firstDisplayCallback",
        ]))
        XCTAssertTrue(spans.allSatisfy { $0["outcome"] as? String != "unfinished" })
        XCTAssertFalse(json.label.contains("What changed in this search?"))
    }

    func testRecordRealDeviceSamplesMarkersReviewExportAndRelaunch() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--preview-workspace", "-talent-signal.interface-language", "en"]
        app.launch()
        openLab(app)
        let start = app.buttons["lab-diagnostics-start"]
        XCTAssertTrue(start.waitForExistence(timeout: 5)); start.tap()
        let report = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'lab-diagnostics-report-' ")).firstMatch
        reveal(report, app)
        let reportID = report.identifier
        reveal(app.buttons["lab-diagnostics-mark-reproduce"], app, up: true)
        app.buttons["lab-diagnostics-mark-reproduce"].tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["product-lab-done"].tap()
        let stop = app.buttons["lab-diagnostics-quick-stop"]
        XCTAssertTrue(stop.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(stop.frame.height + 0.001, 44)
        XCTAssertTrue(app.buttons["archive-tab-people"].isHittable)
        app.buttons["archive-tab-people"].tap()
        app.swipeUp(); app.swipeDown()
        app.buttons["lab-diagnostics-quick-mark"].tap()
        Thread.sleep(forTimeInterval: 2.2)
        capture("lab-diagnostics-active-workspace")
        stop.tap()
        XCTAssertFalse(app.buttons["lab-diagnostics-quick-stop"].exists)
        openLab(app)
        let saved = app.buttons[reportID]; reveal(saved, app); saved.tap()
        let export = app.buttons["lab-diagnostics-export"]
        XCTAssertTrue(export.waitForExistence(timeout: 5)); export.tap()
        let json = app.staticTexts["lab-diagnostics-export-json"]
        XCTAssertTrue(json.waitForExistence(timeout: 5))
        let bytes = Data(json.label.utf8)
        let archive = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
        let reports = try XCTUnwrap(archive["reports"] as? [[String: Any]])
        let value = try XCTUnwrap(reports.first)
        XCTAssertEqual(value["ended"] as? String, "stopped")
        let samples = try XCTUnwrap(value["samples"] as? [[String: Any]])
        XCTAssertFalse(samples.isEmpty)
        XCTAssertNotNil(samples.first?["physicalFootprintBytes"])
        XCTAssertGreaterThan(samples.compactMap { $0["callbackCount"] as? Int }.reduce(0,+), 0)
        let markers = try XCTUnwrap(value["markers"] as? [[String: Any]])
        XCTAssertTrue(markers.contains { $0["marker"] as? String == "problem" })
        capture("lab-diagnostics-reviewed-json")
        app.buttons["lab-diagnostics-export-close"].tap()
        capture("lab-diagnostics-report")
        app.terminate(); app.launch()
        XCTAssertFalse(app.buttons["lab-diagnostics-quick-stop"].exists)
        openLab(app)
        let recovered = app.buttons[reportID]; reveal(recovered, app)
        XCTAssertTrue(recovered.exists)
        capture("lab-diagnostics-restored-report")
    }

    func testBackgroundStopsRecordingAndOfflineProbeIsMeasured() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "--auth-backend-url", "http://127.0.0.1:1", "-talent-signal.interface-language", "en"]
        app.launch()
        let entry = app.buttons["login-product-lab"]
        XCTAssertTrue(entry.waitForExistence(timeout: 15)); entry.tap()
        app.buttons["product-lab-diagnostics"].tap()
        app.buttons["lab-diagnostics-start"].tap()
        let probe = app.buttons["product-lab-probe"]; reveal(probe, app); probe.tap()
        XCTAssertTrue(app.staticTexts["lab-diagnostics-probe-result"].waitForExistence(timeout: 12))
        let report = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'lab-diagnostics-report-' ")).firstMatch
        reveal(report, app); let reportID = report.identifier
        XCUIDevice.shared.press(.home); app.activate()
        let recovered = app.buttons[reportID]; reveal(recovered, app); recovered.tap()
        app.buttons["lab-diagnostics-export"].tap()
        let json = app.staticTexts["lab-diagnostics-export-json"]
        XCTAssertTrue(json.waitForExistence(timeout: 5))
        let archive = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.label.utf8)) as? [String: Any])
        let reports = try XCTUnwrap(archive["reports"] as? [[String: Any]])
        XCTAssertEqual(reports.first?["ended"] as? String, "background")
        let requests = try XCTUnwrap(reports.first?["requests"] as? [[String: Any]])
        XCTAssertTrue(requests.contains { $0["route"] as? String == "health" && $0["failure"] as? String == "transport" })
        XCTAssertFalse(json.label.contains("127.0.0.1"))
        capture("lab-diagnostics-offline-background")
    }

    func testExportDiagnosticFileWithSystemPicker() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--preview-workspace", "-talent-signal.interface-language", "en"]
        app.launch(); openLab(app)
        app.buttons["lab-diagnostics-start"].tap()
        app.buttons["lab-diagnostics-stop"].tap()
        let report = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'lab-diagnostics-report-' ")).firstMatch
        reveal(report, app); report.tap()
        app.buttons["lab-diagnostics-export"].tap()
        app.buttons["Export JSON"].tap()
        let onDevice = app.buttons["On My iPhone"]
        if onDevice.waitForExistence(timeout: 3) { onDevice.tap() }
        let debug = XCTAttachment(string: app.debugDescription)
        debug.name = "diagnostic-file-picker"; debug.lifetime = .keepAlways; add(debug)
        capture("lab-diagnostics-file-picker")
        let save = app.buttons["Export"].exists ? app.buttons["Export"] : app.buttons["Save"]
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        guard save.exists else { return }
        save.tap()
        let replace = app.buttons["Replace"]
        XCTAssertFalse(replace.waitForExistence(timeout: 2), "A fresh report must use a unique filename and preserve existing exports")
        let result = app.staticTexts["Diagnostic file saved and verified. No issue was submitted."]
        reveal(result, app)
        XCTAssertTrue(result.waitForExistence(timeout: 5))
        capture("lab-diagnostics-file-verified")
    }

    private func openLab(_ app: XCUIApplication) {
        let entry = app.buttons["talent-signal-lab-capsule"]
        XCTAssertTrue(entry.waitForExistence(timeout: 12)); entry.tap()
        let diagnostics = app.buttons["product-lab-diagnostics"]
        reveal(diagnostics, app); diagnostics.tap()
    }
    private func reveal(_ element: XCUIElement, _ app: XCUIApplication, up: Bool = false) {
        for _ in 0..<14 {
            if element.isHittable { return }
            if up { app.swipeDown() } else { app.swipeUp() }
        }
        XCTAssertTrue(element.isHittable, "Expected reachable control: \(element.identifier)")
    }
    private func capture(_ name: String) {
        Thread.sleep(forTimeInterval: 0.6)
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
