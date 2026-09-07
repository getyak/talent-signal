import XCTest

@MainActor
final class AnswerFeedbackUITests: XCTestCase {
    private let baseURL = "http://127.0.0.1:4341"
    private let correction = "Wednesday is tentative. Ask for the exact date before confirming a meeting."

    func testCorrectRelaunchAndRerunFrozenPrivateCase() async throws {
        continueAfterFailure = false
        guard let proof = try? await json("/proof-state"), proof["purpose"] as? String == "owned-native-answer-feedback-proof",
              proof["real_provider"] as? Bool == false else { throw XCTSkip("Start the owned disposable Answer Feedback proof server.") }
        let fixture = try await json("/proof-prepare", body: [:])
        let sessionID = try XCTUnwrap(fixture["session_id"] as? String), turnID = try XCTUnwrap(fixture["turn_id"] as? String)
        let login = try await json("/v1/auth/simulated-login", body: ["account_slug": fixture["account_slug"]!,
            "user_email": fixture["user_email"]!, "client_label": "native-answer-feedback-" + UUID().uuidString])
        let token = try XCTUnwrap(login["access_token"] as? String)
        let account = try XCTUnwrap(login["account"] as? [String: Any]), user = try XCTUnwrap(login["user"] as? [String: Any])
        let authenticated: [String: Any] = ["baseURL": baseURL, "accessToken": token,
            "expiresAt": ISO8601DateFormatter().string(from: Date().addingTimeInterval(1800)), "account": account,
            "user": ["id": user["id"]!, "email": user["email"]!, "displayName": user["display_name"]!, "kind": user["kind"]!]]
        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "--auth-backend-url", baseURL, "--reset-lab-workspace-journey",
            "-talent-signal.interface-language", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launchEnvironment["TS_IOS_UI_TEST_AUTHENTICATED_SESSION"] = try JSONSerialization.data(withJSONObject: authenticated).base64EncodedString()
        app.launch()
        app.launchArguments.removeAll { $0 == "--reset-lab-workspace-journey" }
        try openOriginalSession(app, id: sessionID)
        let originalAnswer = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", fixture["original_answer"] as! String)).firstMatch
        try reveal(originalAnswer, in: app)
        capture("feedback-native-original-answer")
        let correct = app.buttons["ask-feedback-correct"].firstMatch
        try reveal(correct, in: app); correct.tap()
        let proposal = element("answer-feedback-proposal", in: app)
        guard proposal.waitForExistence(timeout: 10) else { capture("feedback-native-editor-unavailable"); throw NSError(domain: "AnswerFeedbackProof", code: 13) }
        do { try waitUntil("Feedback editor must load its canonical source") { proposal.isEnabled } }
        catch {
            capture("feedback-native-source-load-failed")
            let state = try await json("/proof-state")
            let attachment = XCTAttachment(data: try JSONSerialization.data(withJSONObject: state["http_events"] ?? [], options: [.prettyPrinted]), uniformTypeIdentifier: "public.json")
            attachment.name = "feedback-native-http-diagnostic"; attachment.lifetime = .keepAlways; add(attachment)
            throw error
        }
        proposal.tap(); proposal.typeText(correction)
        let submit = app.buttons["answer-feedback-submit"]
        try reveal(submit, in: app); XCTAssertTrue(submit.isEnabled); submit.tap()
        XCTAssertTrue(element("answer-feedback-saved-state", in: app).waitForExistence(timeout: 15))
        capture("feedback-native-correction-saved")
        let firstList = try await json("/v1/agent-sessions/\(sessionID)/turns/\(turnID)/feedback", token: token)
        let first = try XCTUnwrap((firstList["feedback"] as? [[String: Any]])?.first)
        let feedbackID = try XCTUnwrap(first["id"] as? String), regressionID = try XCTUnwrap(first["regression_id"] as? String)
        XCTAssertEqual(first["status"] as? String, "active")
        XCTAssertEqual(first["adjudication"] as? String, "proposed")
        XCTAssertEqual(first["expected_behavior_proposal"] as? String, correction)
        XCTAssertEqual(first["revision"] as? Int, 1)
        XCTAssertEqual(first["task_id"] as? String, fixture["original_task_id"] as? String)

        // The new process reads the same canonical Session and feedback. Nothing
        // in this test launch carries a feedback record, case, or local UI draft.
        app.terminate(); app.launch()
        try openOriginalSession(app, id: sessionID)
        try reveal(originalAnswer, in: app)
        try reveal(correct, in: app); correct.tap()
        XCTAssertTrue(proposal.waitForExistence(timeout: 10))
        try waitUntil("Saved correction must be restored from the server") { (proposal.value as? String) == self.correction }
        XCTAssertTrue(element("answer-feedback-saved-state", in: app).exists)
        capture("feedback-native-correction-restored")
        let restoredEnvelope = try await json("/v1/feedback/\(feedbackID)", token: token)
        let restored = try XCTUnwrap(restoredEnvelope["feedback"] as? [String: Any])
        XCTAssertEqual(restored["revision"] as? Int, 1)
        XCTAssertEqual(restored["output_hash"] as? String, first["output_hash"] as? String)
        XCTAssertEqual(restored["expected_behavior_proposal"] as? String, correction)
        app.navigationBars["Correct answer"].buttons["Close"].tap()
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.buttons["talent-signal-lab-capsule"].waitForExistence(timeout: 10))
        app.buttons["talent-signal-lab-capsule"].tap()
        app.buttons["product-lab-regressions"].tap()
        let savedCase = app.buttons["lab-regression-\(regressionID)"]
        XCTAssertTrue(savedCase.waitForExistence(timeout: 10)); savedCase.tap()
        XCTAssertTrue(element("lab-regression-feedback-source", in: app).waitForExistence(timeout: 10))
        capture("feedback-native-private-development-case")
        let savedEnvelope = try await json("/v1/lab/regressions/\(regressionID)", token: token)
        let saved = try XCTUnwrap(savedEnvelope["regression"] as? [String: Any]), snapshot = try XCTUnwrap(saved["snapshot"] as? [String: Any])
        let source = try XCTUnwrap(snapshot["feedback_source"] as? [String: Any]), sample = try XCTUnwrap(snapshot["case"] as? [String: Any])
        XCTAssertEqual(snapshot["data_class"] as? String, "private_business")
        XCTAssertEqual(source["feedback_id"] as? String, feedbackID)
        XCTAssertEqual(source["feedback_revision"] as? Int, 1)
        XCTAssertEqual(source["expectation_authority"] as? String, "proposal")
        XCTAssertEqual((snapshot["configurations"] as? [[String: Any]])?.count, 1)
        XCTAssertEqual(sample["input_hash"] as? String, fixture["original_input_hash"] as? String)
        XCTAssertEqual((snapshot["source_attempt"] as? [String: Any])?["answer"] as? String, fixture["original_answer"] as? String)
        let rerun = app.buttons["lab-regression-rerun"]
        try reveal(rerun, in: app); rerun.tap()
        let start = app.buttons["lab-job-start"]
        try reveal(start, in: app)
        XCTAssertFalse(start.isEnabled, "The original single configuration cannot silently invent a candidate")
        let candidate = element("lab-job-prompt-b", in: app)
        try reveal(candidate, in: app, scrollUp: false); candidate.tap()
        app.buttons["Concise answer"].firstMatch.tap()
        try reveal(start, in: app); XCTAssertTrue(start.isEnabled)
        capture("feedback-native-rerun-explicit-candidate")
        start.tap()
        let confirm = app.buttons["lab-job-confirm-start"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 5)); confirm.tap()
        var jobID: String?
        for _ in 0..<40 {
            let read = try await json("/v1/lab/regressions/\(regressionID)", token: token)
            jobID = ((read["regression"] as? [String: Any])?["reruns"] as? [[String: Any]])?.first?["id"] as? String
            if jobID != nil { break }; try await Task.sleep(nanoseconds: 250_000_000)
        }
        let job = try await terminal(try XCTUnwrap(jobID), token: token)
        let definition = try XCTUnwrap(job["definition"] as? [String: Any])
        XCTAssertEqual(definition["reference_time"] as? String, snapshot["reference_time"] as? String)
        XCTAssertEqual((definition["cases"] as? [[String: Any]])?.first?["input_hash"] as? String, sample["input_hash"] as? String)
        XCTAssertEqual((definition["cases"] as? [[String: Any]])?.first?["input_json"] as? String, sample["input_json"] as? String)
        XCTAssertEqual((definition["regression_source"] as? [String: Any])?["content_hash"] as? String, saved["content_hash"] as? String)
        XCTAssertEqual(definition["business_write_count"] as? Int, 0)
        let runStatus = element("lab-job-status", in: app)
        try reveal(runStatus, in: app)
        try waitUntil("The native UI must show the completed canonical rerun") { runStatus.label.contains("Completed") }
        capture("feedback-native-frozen-rerun-completed")
        let providerProof = try await json("/proof-state")
        let calls = (providerProof["requests"] as? [[String: Any]] ?? []).filter { $0["workspace_id"] as? String == fixture["account_id"] as? String }
        XCTAssertEqual(calls.count, 3, "One original product answer and exactly two explicit rerun calls")
        XCTAssertTrue(calls.allSatisfy { $0["input_hash"] as? String == fixture["original_input_hash"] as? String })
        XCTAssertTrue(calls.allSatisfy { $0["image_count"] as? Int == 0 })
        XCTAssertEqual(providerProof["real_requests_started"] as? Int, 0)
        let encodedCalls = try JSONSerialization.data(withJSONObject: calls)
        XCTAssertFalse(String(decoding: encodedCalls, as: UTF8.self).contains(correction))
        let evidence: [String: Any] = ["purpose": "native-feedback-to-private-lab-proof", "review_actor": "UI automation on synthetic fixtures",
            "fixture": fixture, "feedback_after_ui_save": first, "feedback_after_process_restart": restored,
            "saved_regression": saved, "rerun": job, "provider_calls": calls, "real_requests_started": 0]
        let attachment = XCTAttachment(data: try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys]), uniformTypeIdentifier: "public.json")
        attachment.name = "answer-feedback-native-postgres-proof"; attachment.lifetime = .keepAlways; add(attachment)
    }

    private func openOriginalSession(_ app: XCUIApplication, id: String) throws {
        let sessions = app.buttons["archive-tab-sessions"]
        guard sessions.waitForExistence(timeout: 20) else { capture("feedback-native-workspace-unavailable"); throw NSError(domain: "AnswerFeedbackProof", code: 10) }
        sessions.tap()
        let original = app.buttons["agent-session-\(id.uppercased())"]
        guard original.waitForExistence(timeout: 15) else { capture("feedback-native-source-session-unavailable"); throw NSError(domain: "AnswerFeedbackProof", code: 11) }
        original.tap()
    }
    private func element(_ id: String, in app: XCUIApplication) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    private func reveal(_ target: XCUIElement, in app: XCUIApplication, scrollUp: Bool = true) throws {
        for index in 0..<24 {
            // Static Markdown text can have no activation point. Check its
            // visible bounds without asking XCTest to synthesize a hit target.
            if target.exists, !target.frame.isEmpty, target.frame.minY > 110,
               target.frame.maxY < app.frame.maxY - 90,
               target.elementType == .staticText || target.isHittable { return }
            let up = target.exists && !target.frame.isEmpty ? target.frame.midY > app.frame.midY : (index / 6).isMultiple(of: 2) ? scrollUp : !scrollUp
            let container = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.scrollViews.firstMatch
            container.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: up ? 0.73 : 0.35))
                .press(forDuration: 0.05, thenDragTo: container.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: up ? 0.35 : 0.73)))
        }
        let attachment = XCTAttachment(string: app.debugDescription); attachment.name = "feedback-unreachable-control"; attachment.lifetime = .keepAlways; add(attachment)
        XCTFail("The native control is unreachable: \(target.identifier)")
        throw NSError(domain: "AnswerFeedbackProof", code: 1)
    }
    private func waitUntil(_ message: String, condition: @escaping () -> Bool) throws {
        let satisfied = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in condition() }, object: nil)
        guard XCTWaiter.wait(for: [satisfied], timeout: 15) == .completed else {
            XCTFail(message)
            throw NSError(domain: "AnswerFeedbackProof", code: 12, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
    private func terminal(_ id: String, token: String) async throws -> [String: Any] {
        for _ in 0..<60 {
            let envelope = try await json("/v1/lab/experiment-jobs/\(id)", token: token)
            let job = try XCTUnwrap(envelope["job"] as? [String: Any])
            if !["queued", "running", "cancelling"].contains(job["status"] as? String ?? "") {
                XCTAssertEqual(job["status"] as? String, "completed"); return job
            }
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        throw NSError(domain: "AnswerFeedbackProof", code: 2)
    }
    private func json(_ path: String, token: String? = nil, body: [String: Any]? = nil) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: baseURL + path)!)
        request.timeoutInterval = 30
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body { request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertTrue([200, 201, 202].contains((response as? HTTPURLResponse)?.statusCode ?? 0), String(decoding: data, as: UTF8.self))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
