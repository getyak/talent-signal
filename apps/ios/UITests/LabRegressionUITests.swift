import XCTest

@MainActor
final class LabRegressionUITests: XCTestCase {
    private let baseURL = "http://127.0.0.1:4329"
    func testSaveRelaunchRerunExportAndDelete() async throws {
        continueAfterFailure = false
        guard let proof = try? await json("/proof-state"), proof["purpose"] as? String == "owned-native-lab-job-proof",
              proof["real_provider"] as? Bool == false else { throw XCTSkip("Start the owned fixture-only Lab proof service.") }
        let login = try await json("/v1/auth/simulated-login", body: ["account_slug": "fixture-beta", "user_email": "recruiter@beta.local", "client_label": "native-lab-regression-" + UUID().uuidString])
        let token = try XCTUnwrap(login["access_token"] as? String)
        let catalog = try await json("/v1/lab/experiment-jobs", token: token), sourceID = UUID().uuidString.lowercased()
        _ = try await json("/v1/lab/experiment-jobs", token: token, body: ["id": sourceID, "catalog_revision": catalog["catalog_revision"]!,
            "case_ids": ["conflicting-evidence"], "configurations": [["model": "glm-5.3", "prompt_preset": "baseline"], ["model": "glm-5.3", "prompt_preset": "concise"]],
            "repetitions": 1, "call_limit": 2])
        let source = try await terminal(sourceID, token: token)
        let account = try XCTUnwrap(login["account"] as? [String: Any]), user = try XCTUnwrap(login["user"] as? [String: Any])
        let fixture: [String: Any] = ["baseURL": baseURL, "accessToken": token,
            "expiresAt": ISO8601DateFormatter().string(from: Date().addingTimeInterval(1800)), "account": account,
            "user": ["id": user["id"]!, "email": user["email"]!, "displayName": user["display_name"]!, "kind": user["kind"]!]]
        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "--auth-backend-url", baseURL, "-talent-signal.interface-language", "en"]
        app.launchEnvironment["TS_IOS_UI_TEST_AUTHENTICATED_SESSION"] = try JSONSerialization.data(withJSONObject: fixture).base64EncodedString()
        app.launch(); try openLab(app)
        app.buttons["product-lab-experiments"].tap()
        try scrollTo(app.buttons["lab-job-refresh"], in: app); app.buttons["lab-job-refresh"].tap()
        let sourceHistory = app.buttons["lab-job-history-\(sourceID)"]
        try scrollTo(sourceHistory, in: app); sourceHistory.tap()
        let caseLink = app.buttons["lab-job-case-conflicting-evidence"]
        try scrollTo(caseLink, in: app, up: false); caseLink.tap()
        let saveFailure = app.descendants(matching: .any)["lab-job-save-regression-0"].firstMatch
        try scrollTo(saveFailure, in: app); saveFailure.tap()
        let category = app.switches["lab-regression-category-missed_uncertainty"].firstMatch
        try scrollTo(category, in: app)
        category.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        _ = try XCTUnwrap(category.value as? String == "1" ? true : nil)
        let note = app.textViews["lab-regression-note"]
        try scrollTo(note, in: app); note.tap(); note.typeText("Synthetic UI note; not model input.")
        app.buttons["lab-regression-confirm-save"].tap()
        let openSaved = app.buttons["lab-regression-open-saved"]
        try scrollTo(openSaved, in: app); capture("regression-native-saved"); openSaved.tap()
        let saved = try await latestRegression(token), id = try XCTUnwrap(saved["id"] as? String)
        let snapshot = try XCTUnwrap(saved["snapshot"] as? [String: Any])
        _ = try XCTUnwrap(snapshot["source_job_id"] as? String == sourceID ? true : nil)
        XCTAssertEqual(snapshot["review_note"] as? String, "Synthetic UI note; not model input.")

        app.terminate(); app.launch(); try openLab(app); app.buttons["product-lab-regressions"].tap()
        let savedCase = app.buttons["lab-regression-\(id)"]
        _ = try XCTUnwrap(savedCase.waitForExistence(timeout: 5) ? true : nil); savedCase.tap()
        _ = try XCTUnwrap(app.staticTexts["lab-regression-release-status"].waitForExistence(timeout: 5) ? true : nil)
        capture("regression-native-recovered")
        let rerun = app.buttons["lab-regression-rerun"]
        try scrollTo(rerun, in: app); rerun.tap()
        try scrollTo(app.buttons["lab-job-start"], in: app); app.buttons["lab-job-start"].tap()
        _ = try XCTUnwrap(app.buttons["lab-job-confirm-start"].firstMatch.waitForExistence(timeout: 3) ? true : nil)
        app.buttons["lab-job-confirm-start"].firstMatch.tap()
        var rerunID: String?
        for _ in 0..<30 {
            let record = try await json("/v1/lab/regressions/\(id)", token: token)
            rerunID = ((record["regression"] as? [String: Any])?["reruns"] as? [[String: Any]])?.first?["id"] as? String
            if rerunID != nil { break }; try await Task.sleep(nanoseconds: 200_000_000)
        }
        let repeated = try await terminal(try XCTUnwrap(rerunID), token: token)
        let repeatedDefinition = try XCTUnwrap(repeated["definition"] as? [String: Any]), sourceDefinition = try XCTUnwrap(source["definition"] as? [String: Any])
        XCTAssertEqual(repeatedDefinition["reference_time"] as? String, sourceDefinition["reference_time"] as? String)
        let repeatedInput = (repeatedDefinition["cases"] as? [[String: Any]])?.first?["input_hash"] as? String
        XCTAssertEqual(repeatedInput, (snapshot["case"] as? [String: Any])?["input_hash"] as? String)
        let runStatus = app.staticTexts["lab-job-status"].firstMatch
        try scrollTo(runStatus, in: app)
        for _ in 0..<24 {
            if runStatus.label.contains("Completed") { break }
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        _ = try XCTUnwrap(runStatus.label.contains("Completed") ? true : nil)
        capture("regression-native-rerun")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        var ciEvidence: [String: Any] = [:]
        if proof["ci_verifier"] as? String == "fixture-only" {
            let ci = app.buttons["lab-regression-ci"]
            try scrollTo(ci, in: app, up: false); ci.tap()
            let input = app.textFields["lab-ci-run-input"]
            _ = try XCTUnwrap(input.waitForExistence(timeout: 5) ? true : nil)
            let selectedRun = app.descendants(matching: .any)["lab-ci-selected-run"].firstMatch
            try scrollTo(selectedRun, in: app); XCTAssertTrue(selectedRun.label.contains(try XCTUnwrap(rerunID)))
            input.tap(); input.typeText("123\n")
            let verify = app.buttons["lab-ci-verify"]
            try scrollTo(verify, in: app); verify.tap()
            let result = app.staticTexts["lab-ci-receipt-status"]
            _ = try XCTUnwrap(result.waitForExistence(timeout: 5) ? true : nil)
            try scrollTo(result, in: app); XCTAssertEqual(result.label, "CI record verified")
            let integrity = app.staticTexts["lab-ci-integrity"]
            try scrollTo(integrity, in: app); XCTAssertEqual(integrity.label, "Recorded integrity checks passed")
            capture("ci-native-verified")
            let readback = try await json("/v1/lab/regressions/\(id)", token: token)
            ciEvidence["verified"] = readback["regression"]
            try scrollTo(input, in: app, up: false); input.tap(); input.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 3) + "125\n")
            try scrollTo(verify, in: app); verify.tap()
            for _ in 0..<25 {
                if integrity.label == "Recorded integrity checks need attention" { break }
                try await Task.sleep(nanoseconds: 200_000_000)
            }
            try scrollTo(integrity, in: app); XCTAssertEqual(integrity.label, "Recorded integrity checks need attention")
            XCTAssertEqual(result.label, "CI record verified"); capture("ci-native-failed-integrity")
            let failed = try await json("/v1/lab/regressions/\(id)", token: token)
            ciEvidence["failed_integrity"] = failed["regression"]
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
        let export = app.buttons["lab-regression-export"]
        try scrollTo(export, in: app); export.tap()
        _ = try XCTUnwrap(app.staticTexts["lab-regression-export-json"].waitForExistence(timeout: 5) ? true : nil)
        let previewData = Data(app.staticTexts["lab-regression-export-json"].label.utf8)
        let exported = try XCTUnwrap(JSONSerialization.jsonObject(with: previewData) as? [String: Any])
        XCTAssertEqual(exported["content_hash"] as? String, saved["content_hash"] as? String)
        let exportedSnapshot = try XCTUnwrap(exported["snapshot"] as? [String: Any])
        XCTAssertTrue((exportedSnapshot["source_attempt"] as? [String: Any])?["error_code"] is NSNull)
        capture("regression-native-export")
        app.buttons["lab-regression-export-close"].firstMatch.tap()
        _ = try XCTUnwrap(app.buttons["lab-regression-delete"].waitForExistence(timeout: 5) ? true : nil)
        let remove = app.buttons["lab-regression-delete"]
        try scrollTo(remove, in: app); remove.tap(); app.buttons["lab-regression-confirm-delete"].firstMatch.tap()
        _ = try XCTUnwrap(app.staticTexts["lab-regression-deleted"].waitForExistence(timeout: 5) ? true : nil)
        capture("regression-native-deleted")
        let deletedCaseStatus = try await status("/v1/lab/regressions/\(id)", token: token)
        let deletedRunStatus = try await status("/v1/lab/experiment-jobs/\(try XCTUnwrap(rerunID))", token: token)
        XCTAssertEqual(deletedCaseStatus, 410)
        XCTAssertEqual(deletedRunStatus, 410)
        let evidence = try JSONSerialization.data(withJSONObject: ["source_batch": source, "saved_regression": saved, "export_bundle": exported, "rerun": repeated,
            "provider_proof": try await json("/proof-state"), "ci_fixture_evidence": ciEvidence,
            "review_actor": "UI automation on synthetic fixtures", "deleted_readback": 410], options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(data: evidence, uniformTypeIdentifier: "public.json"); attachment.name = "regression-native-proof"; attachment.lifetime = .keepAlways; add(attachment)
    }
    private func openLab(_ app: XCUIApplication) throws {
        _ = try XCTUnwrap(app.buttons["talent-signal-lab-capsule"].waitForExistence(timeout: 15) ? true : nil)
        app.buttons["talent-signal-lab-capsule"].tap()
    }
    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication, up: Bool = true) throws {
        for index in 0..<32 {
            if element.isHittable, element.frame.minY >= 145, element.frame.minY < app.frame.maxY - 100 { return }
            // A refresh can insert a whole result section above history. Lazy cells
            // outside the viewport have no frame; search both directions before failing.
            let searchUp = (index / 8).isMultiple(of: 2) ? up : !up
            let direction = element.exists && !element.frame.isEmpty ? element.frame.midY > app.frame.midY : searchUp
            let list = app.collectionViews.firstMatch
            list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: direction ? 0.72 : 0.42))
                .press(forDuration: 0.05, thenDragTo: list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: direction ? 0.42 : 0.72)))
        }
        let evidence = XCTAttachment(string: app.debugDescription); evidence.name = "unreachable-regression-control"; evidence.lifetime = .keepAlways; add(evidence)
        throw NSError(domain: "LabRegressionProof", code: 1, userInfo: [NSLocalizedDescriptionKey: "Expected element is unreachable: \(element.identifier)"])
    }
    private func terminal(_ id: String, token: String) async throws -> [String: Any] {
        for _ in 0..<40 {
            let envelope = try await json("/v1/lab/experiment-jobs/\(id)", token: token)
            let value = try XCTUnwrap(envelope["job"] as? [String: Any])
            if !["queued", "running", "cancelling"].contains(value["status"] as? String ?? "") {
                _ = try XCTUnwrap(value["status"] as? String == "completed" ? true : nil); return value
            }
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        throw NSError(domain: "LabRegressionProof", code: 2)
    }
    private func latestRegression(_ token: String) async throws -> [String: Any] {
        let list = try await json("/v1/lab/regressions", token: token)
        let id = try XCTUnwrap((list["regressions"] as? [[String: Any]])?.first?["id"] as? String)
        let envelope = try await json("/v1/lab/regressions/\(id)", token: token)
        return try XCTUnwrap(envelope["regression"] as? [String: Any])
    }
    private func json(_ path: String, token: String? = nil, body: [String: Any]? = nil) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: baseURL + path)!)
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body { request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard [200, 202].contains((response as? HTTPURLResponse)?.statusCode ?? 0) else { throw NSError(domain: "LabRegressionProof", code: 3) }
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
    private func status(_ path: String, token: String) async throws -> Int {
        var request = URLRequest(url: URL(string: baseURL + path)!); request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (_, response) = try await URLSession.shared.data(for: request); return (response as? HTTPURLResponse)?.statusCode ?? 0
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
