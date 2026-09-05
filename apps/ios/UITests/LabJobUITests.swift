import XCTest

@MainActor
final class LabJobUITests: XCTestCase {
    private let baseURL = "http://127.0.0.1:4329"
    override func tearDown() async throws {
        if let proof = try? await json("/proof-state"), proof["real_provider"] as? Bool == false {
            _ = try? await json("/proof/release", body: [:])
        }
        try await super.tearDown()
    }
    func testTaskPickerExposesVisionAndWorkspaceAgentSuites() async throws {
        continueAfterFailure = false
        guard let proof = try? await json("/proof-state"), proof["purpose"] as? String == "owned-native-lab-job-proof",
              proof["real_provider"] as? Bool == false else {
            throw XCTSkip("Start the owned synthetic Lab batch proof service.")
        }
        let login = try await json("/v1/auth/simulated-login", body: ["account_slug": "fixture-alpha", "user_email": "reviewer@alpha.local", "client_label": "native-lab-task-picker-" + UUID().uuidString])
        let token = try XCTUnwrap(login["access_token"] as? String)
        let account = try XCTUnwrap(login["account"] as? [String: Any]), user = try XCTUnwrap(login["user"] as? [String: Any])
        let fixture: [String: Any] = ["baseURL": baseURL, "accessToken": token,
            "expiresAt": ISO8601DateFormatter().string(from: Date().addingTimeInterval(1800)), "account": account,
            "user": ["id": user["id"]!, "email": user["email"]!, "displayName": user["display_name"]!, "kind": user["kind"]!]]
        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "--auth-backend-url", baseURL, "-talent-signal.interface-language", "en"]
        app.launchEnvironment["TS_IOS_UI_TEST_AUTHENTICATED_SESSION"] = try JSONSerialization.data(withJSONObject: fixture).base64EncodedString()
        app.launch(); try openBatches(app)

        let picker = app.buttons["lab-job-task"]
        try scrollTo(picker, in: app, up: false); picker.tap()
        app.buttons["Image understanding"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["The frozen synthetic screenshot is sent only to the admitted vision model."].waitForExistence(timeout: 3))
        try await Task.sleep(for: .milliseconds(600))
        capture("batch-image-configuration")
        app.buttons["lab-job-cases"].tap()
        XCTAssertTrue(app.staticTexts["Image: later schedule wins"].waitForExistence(timeout: 3))
        try await Task.sleep(for: .milliseconds(600))
        capture("batch-image-suite")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        try scrollTo(picker, in: app, up: false); picker.tap()
        app.buttons["Workspace Agent"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["The product Workspace Agent runs against a read-only synthetic contact directory."].waitForExistence(timeout: 3))
        try await Task.sleep(for: .milliseconds(600))
        capture("batch-agent-configuration")
        app.buttons["lab-job-cases"].tap()
        XCTAssertTrue(app.staticTexts["Agent: resolve one synthetic contact"].waitForExistence(timeout: 3))
        try await Task.sleep(for: .milliseconds(600))
        capture("batch-agent-suite")
    }
    func testBatchRelaunchReviewAndBoundedCancellation() async throws {
        continueAfterFailure = false
        guard let proof = try? await json("/proof-state"), proof["purpose"] as? String == "owned-native-lab-job-proof" else {
            throw XCTSkip("Start the owned, explicitly configured Lab batch proof service.")
        }
        let live = proof["real_provider"] as? Bool == true
        let readOnly = live && (proof["requests_started"] as? Int ?? 0) > 0
        let login = try await json("/v1/auth/simulated-login", body: ["account_slug": "fixture-alpha", "user_email": "reviewer@alpha.local", "client_label": "native-lab-batch-" + UUID().uuidString])
        let token = try XCTUnwrap(login["access_token"] as? String)
        let account = try XCTUnwrap(login["account"] as? [String: Any]), user = try XCTUnwrap(login["user"] as? [String: Any])
        let fixture: [String: Any] = ["baseURL": baseURL, "accessToken": token,
            "expiresAt": ISO8601DateFormatter().string(from: Date().addingTimeInterval(1800)), "account": account,
            "user": ["id": user["id"]!, "email": user["email"]!, "displayName": user["display_name"]!, "kind": user["kind"]!]]
        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "--auth-backend-url", baseURL, "-talent-signal.interface-language", "en"]
        app.launchEnvironment["TS_IOS_UI_TEST_AUTHENTICATED_SESSION"] = try JSONSerialization.data(withJSONObject: fixture).base64EncodedString()
        app.launch(); try openBatches(app)
        if !live {
            app.buttons["lab-job-cases"].tap()
            let second = app.switches["lab-job-select-ambiguous-identity"].firstMatch
            try scrollTo(second, in: app)
            if second.value as? String != "1" { second.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap() }
            _ = try XCTUnwrap(second.value as? String == "1" ? true : nil)
            app.navigationBars.buttons.element(boundBy: 0).tap()
            _ = try XCTUnwrap(app.staticTexts["2 selected"].exists ? true : nil)
            app.buttons["lab-job-repetitions-Increment"].tap()
        }
        capture(live ? "batch-live-configuration" : "batch-fixture-configuration")
        let previousID = try await currentID(token)
        let jobID: String
        if readOnly { jobID = try XCTUnwrap(previousID) }
        else { try start(app); jobID = try await nextID(token, after: previousID) }
        app.terminate(); app.launch(); try openBatches(app)
        let record = try await terminal(jobID, token: token)
        XCTAssertEqual(record["status"] as? String, "completed")
        XCTAssertEqual(record["calls_reserved"] as? Int, live ? 2 : 8)
        let attempts = try XCTUnwrap(record["attempts"] as? [[String: Any]])
        XCTAssertTrue(attempts.allSatisfy { $0["actual_model"] as? String == "glm-5.3" })
        try scrollTo(app.buttons["lab-job-case-conflicting-evidence"], in: app)
        capture(live ? "batch-live-recovered" : "batch-fixture-recovered")
        app.buttons["lab-job-case-conflicting-evidence"].tap()
        let answer = app.staticTexts["lab-job-answer-0"]
        try scrollTo(answer, in: app); XCTAssertTrue(answer.exists)
        capture(live ? "batch-live-answer" : "batch-fixture-answer")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        try scrollTo(app.buttons["lab-job-review"], in: app); app.buttons["lab-job-review"].tap()
        let save = app.buttons["lab-job-save-review"]
        _ = try XCTUnwrap(save.waitForExistence(timeout: 3) ? true : nil); save.tap()
        try scrollTo(app.descendants(matching: .any)["lab-job-saved-review"].firstMatch, in: app)
        let reviewed = try await json("/v1/lab/experiment-jobs/\(jobID)", token: token)
        XCTAssertEqual((reviewed["job"] as? [String: Any])?["review"] as? String, "inconclusive")
        capture(live ? "batch-live-review" : "batch-fixture-review")
        var cancelled: [String: Any] = [:]
        if !live {
            app.navigationBars.buttons.element(boundBy: 0).tap()
            try scrollTo(app.buttons["lab-job-start"], in: app, up: false)
            _ = try await json("/proof/pause-next", body: [:])
            try start(app)
            let cancellationID = try await nextID(token, after: jobID)
            XCTAssertNotEqual(cancellationID, jobID)
            for _ in 0..<20 {
                if (try await json("/proof-state"))["held_call"] as? Bool == true { break }
                try await Task.sleep(nanoseconds: 300_000_000)
            }
            try scrollTo(app.buttons["lab-job-cancel"], in: app); app.buttons["lab-job-cancel"].tap()
            app.buttons["lab-job-confirm-cancel"].firstMatch.tap()
            _ = try await json("/proof/release", body: [:])
            cancelled = try await terminal(cancellationID, token: token)
            XCTAssertEqual(cancelled["status"] as? String, "cancelled")
            XCTAssertEqual(cancelled["calls_reserved"] as? Int, 1)
            try scrollTo(app.buttons["lab-job-refresh"], in: app); app.buttons["lab-job-refresh"].tap()
            let status = app.staticTexts["lab-job-status"]
            try scrollTo(status, in: app, up: false)
            _ = try XCTUnwrap(status.label.contains("Cancelled") ? true : nil)
            capture("batch-fixture-cancelled")
        }
        let proofAfter = try await json("/proof-state")
        let data = try JSONSerialization.data(withJSONObject: ["job": record, "reviewed": reviewed, "cancelled": cancelled,
            "provider_proof": proofAfter, "read_only_recovery": readOnly, "review_actor": "UI automation on synthetic fixture"], options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = live ? "batch-live-proof" : "batch-fixture-proof"; attachment.lifetime = .keepAlways; add(attachment)
    }
    private func currentID(_ token: String) async throws -> String? {
        let catalog = try await json("/v1/lab/experiment-jobs", token: token)
        return (catalog["jobs"] as? [[String: Any]])?.first?["id"] as? String
    }
    private func nextID(_ token: String, after previous: String?) async throws -> String {
        for _ in 0..<30 {
            if let id = try await currentID(token), id != previous { return id }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        throw NSError(domain: "LabJobProof", code: 3, userInfo: [NSLocalizedDescriptionKey: "The submitted batch was not observed; do not submit another paid request."])
    }
    private func terminal(_ id: String, token: String) async throws -> [String: Any] {
        for _ in 0..<50 {
            let result = try await json("/v1/lab/experiment-jobs/\(id)", token: token)
            let record = try XCTUnwrap(result["job"] as? [String: Any])
            if !["queued", "running", "cancelling"].contains(record["status"] as? String ?? "") { return record }
            try await Task.sleep(nanoseconds: 1_000_000_000)
        }
        throw NSError(domain: "LabJobProof", code: 1, userInfo: [NSLocalizedDescriptionKey: "The observed job did not reach a terminal state."])
    }
    private func json(_ path: String, token: String? = nil, body: [String: Any]? = nil) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: baseURL + path)!)
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body { request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertTrue([200, 202].contains((response as? HTTPURLResponse)?.statusCode ?? 0))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
    private func openBatches(_ app: XCUIApplication) throws {
        _ = try XCTUnwrap(app.buttons["talent-signal-lab-capsule"].waitForExistence(timeout: 15) ? true : nil)
        app.buttons["talent-signal-lab-capsule"].tap(); app.buttons["product-lab-experiments"].tap()
        _ = try XCTUnwrap(app.buttons["lab-job-cases"].waitForExistence(timeout: 10) ? true : nil)
    }
    private func start(_ app: XCUIApplication) throws {
        try scrollTo(app.buttons["lab-job-start"], in: app)
        _ = try XCTUnwrap(app.buttons["lab-job-start"].isEnabled ? true : nil)
        app.buttons["lab-job-start"].tap()
        _ = try XCTUnwrap(app.buttons["lab-job-confirm-start"].firstMatch.waitForExistence(timeout: 3) ? true : nil)
        app.buttons["lab-job-confirm-start"].firstMatch.tap()
    }
    private func scrollTo(_ value: XCUIElement, in app: XCUIApplication, up: Bool = true) throws {
        for _ in 0..<15 {
            if value.isHittable, value.frame.minY >= 145, value.frame.minY < app.frame.maxY - 100 { return }
            let list = app.collectionViews.firstMatch
            if up { list.swipeUp() } else { list.swipeDown() }
        }
        throw NSError(domain: "LabJobProof", code: 2, userInfo: [NSLocalizedDescriptionKey: "Expected batch element is unreachable: \(value.identifier)"])
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
