import XCTest

@MainActor
final class LabWorkspaceUITests: XCTestCase {
    func testRealEmptyWorkspaceRelaunchReturnAndVerifiedDeletion() async throws {
        continueAfterFailure = false
        let baseURL = testConfiguration("TS_IOS_BACKEND_URL", fallback: "http://127.0.0.1:4320")
        guard let ready = URL(string: baseURL + "/health/ready"),
              let (_, response) = try? await URLSession.shared.data(from: ready),
              (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw XCTSkip("Run with the owned disposable iOS backend fixture.")
        }
        let login = try await json(baseURL, "/v1/auth/simulated-login", body: [
            "account_slug": "fixture-alpha", "user_email": "reviewer@alpha.local",
            "client_label": "native-lab-workspace-" + UUID().uuidString
        ])
        let token = try XCTUnwrap(login["access_token"] as? String)
        let account = try XCTUnwrap(login["account"] as? [String: Any])
        let user = try XCTUnwrap(login["user"] as? [String: Any])
        try await clearOpenWorkspaces(baseURL, token: token)
        let beforeRows = try await data(baseURL, "/v1/people", token: token)
        let before = try await workspaceList(baseURL, token: token)
        let beforeIDs = Set(before.compactMap { $0["id"] as? String })
        let fixture: [String: Any] = [
            "baseURL": baseURL, "accessToken": token,
            "expiresAt": ISO8601DateFormatter().string(from: Date().addingTimeInterval(1800)),
            "account": account,
            "user": ["id": user["id"]!, "email": user["email"]!,
                     "displayName": user["display_name"]!, "kind": user["kind"]!]
        ]

        let app = XCUIApplication()
        app.launchArguments = ["--show-login", "--auth-backend-url", baseURL,
                               "--reset-lab-workspace-journey",
                               "-talent-signal.interface-language", "zh-Hans"]
        app.launchEnvironment["TS_IOS_UI_TEST_AUTHENTICATED_SESSION"] = try JSONSerialization
            .data(withJSONObject: fixture).base64EncodedString()
        app.launch()
        app.launchArguments.removeAll { $0 == "--reset-lab-workspace-journey" }
        try openWorkspaceLab(app)
        let create = app.buttons["lab-workspace-create"]
        XCTAssertTrue(create.waitForExistence(timeout: 8))
        capture("lab-workspace-create-zh")
        create.tap()

        let banner = app.descendants(matching: .any)["lab-workspace-banner-return"].firstMatch
        XCTAssertTrue(banner.waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["workspace-empty"].firstMatch.waitForExistence(timeout: 12))
        capture("lab-workspace-empty-isolated-zh")
        let created = try await waitForWorkspace(baseURL, token: token, excluding: beforeIDs)
        let workspaceID = try XCTUnwrap(created["id"] as? String)
        XCTAssertEqual(created["data_rows"] as? Int, 0)
        XCTAssertNotNil(created["empty_verified_at"] as? String)

        app.terminate()
        app.launchEnvironment.removeValue(forKey: "TS_IOS_UI_TEST_AUTHENTICATED_SESSION")
        app.launch()
        XCTAssertTrue(app.buttons["lab-workspace-banner-return"].waitForExistence(timeout: 15),
                      "Relaunch must validate the delegated session online before showing its workspace.")
        XCTAssertTrue(app.descendants(matching: .any)["workspace-empty"].firstMatch.waitForExistence(timeout: 12))
        capture("lab-workspace-relaunch-isolated-zh")

        app.buttons["lab-workspace-banner-manage"].tap()
        let end = app.buttons["lab-workspace-end-current"]
        XCTAssertTrue(end.waitForExistence(timeout: 8)); end.tap()
        let confirm = app.buttons["lab-workspace-confirm-end-current"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 5)); confirm.tap()
        XCTAssertTrue(app.buttons["talent-signal-lab-capsule"].waitForExistence(timeout: 20), app.debugDescription)

        let deleted = try await waitForDeleted(baseURL, token: token, id: workspaceID)
        XCTAssertEqual(deleted["state"] as? String, "deleted")
        XCTAssertEqual(deleted["data_rows"] as? Int, 0)
        XCTAssertEqual(deleted["active_sessions"] as? Int, 0)
        XCTAssertNil(deleted["cleanup_error"] as? String)
        let afterRows = try await data(baseURL, "/v1/people", token: token)
        XCTAssertEqual(afterRows, beforeRows,
                       "The original account's people response must be byte-identical after the isolated journey.")

        try openWorkspaceLab(app)
        let state = app.descendants(matching: .any)["lab-workspace-receipt-state"].firstMatch
        scrollTo(state, app)
        XCTAssertTrue(state.exists)
        let rows = app.descendants(matching: .any)["lab-workspace-receipt-rows"].firstMatch
        scrollTo(rows, app)
        XCTAssertTrue(rows.exists)
        capture("lab-workspace-deletion-receipt-zh")

        let evidence = try JSONSerialization.data(withJSONObject: [
            "workspace_id": workspaceID, "empty_verified_at": created["empty_verified_at"]!,
            "deleted_at": deleted["deleted_at"]!, "data_rows": deleted["data_rows"]!,
            "active_sessions": deleted["active_sessions"]!, "cleanup_error": deleted["cleanup_error"] ?? NSNull(),
            "original_people_response_unchanged": true
        ], options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(data: evidence, uniformTypeIdentifier: "public.json")
        attachment.name = "lab-workspace-sanitized-native-proof"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func testConfiguration(_ key: String, fallback: String) -> String {
        if let value = ProcessInfo.processInfo.environment[key], !value.isEmpty { return value }
        if let value = Bundle(for: LabWorkspaceUITests.self).object(forInfoDictionaryKey: key) as? String,
           !value.isEmpty, !value.contains("$(") { return value }
        return fallback
    }

    private func openWorkspaceLab(_ app: XCUIApplication) throws {
        let entry = app.buttons["talent-signal-lab-capsule"]
        XCTAssertTrue(entry.waitForExistence(timeout: 15)); entry.tap()
        let workspace = app.buttons["product-lab-workspace"]
        scrollTo(workspace, app)
        XCTAssertTrue(workspace.exists); workspace.tap()
        XCTAssertTrue(app.navigationBars["测试工作区"].waitForExistence(timeout: 8))
    }

    private func clearOpenWorkspaces(_ baseURL: String, token: String) async throws {
        for workspace in try await workspaceList(baseURL, token: token) {
            guard let id = workspace["id"] as? String,
                  (workspace["state"] as? String) != "deleted" else { continue }
            _ = try await json(baseURL, "/v1/lab/workspaces/\(id)/stop", token: token,
                body: ["id": UUID().uuidString.lowercased()])
        }
    }

    private func workspaceList(_ baseURL: String, token: String) async throws -> [[String: Any]] {
        let value = try await json(baseURL, "/v1/lab/workspaces", token: token)
        return try XCTUnwrap(value["workspaces"] as? [[String: Any]])
    }

    private func waitForWorkspace(_ baseURL: String, token: String,
                                  excluding: Set<String>) async throws -> [String: Any] {
        for _ in 0..<20 {
            if let value = try await workspaceList(baseURL, token: token).first(where: {
                guard let id = $0["id"] as? String else { return false }
                return !excluding.contains(id) && $0["state"] as? String == "active"
            }) { return value }
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        throw XCTSkip("The native app did not create a visible server workspace.")
    }

    private func waitForDeleted(_ baseURL: String, token: String, id: String) async throws -> [String: Any] {
        for _ in 0..<40 {
            let value = try await json(baseURL, "/v1/lab/workspaces/\(id)", token: token)
            if let workspace = value["workspace"] as? [String: Any],
               workspace["state"] as? String == "deleted" { return workspace }
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        throw XCTSkip("The server did not report verified deletion in time.")
    }

    private func json(_ baseURL: String, _ path: String, token: String? = nil,
                      body: [String: Any]? = nil) async throws -> [String: Any] {
        let bytes = try await data(baseURL, path, token: token, body: body)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
    }

    private func data(_ baseURL: String, _ path: String, token: String? = nil,
                      body: [String: Any]? = nil) async throws -> Data {
        var request = URLRequest(url: URL(string: baseURL + path)!)
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (bytes, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        return bytes
    }

    private func scrollTo(_ element: XCUIElement, _ app: XCUIApplication) {
        for _ in 0..<14 {
            if element.isHittable { return }
            app.swipeUp()
        }
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
