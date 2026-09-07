import XCTest

@MainActor
final class Get5CanonicalSessionUITests: XCTestCase {
    private var app: XCUIApplication!

    func testSavingContactKeepsOriginalSessionMessageAndRestoresCanonicalReceipt() async throws {
        continueAfterFailure = false
        let fixture = try await prepareFixture()
        XCTAssertEqual(URL(string: fixture.backendURL)?.host, "127.0.0.1")
        print("GET5 canonical fixture endpoint=\(fixture.backendURL) account=\(fixture.accountID)")
        app = XCUIApplication()
        app.launchEnvironment["TS_IOS_UI_TEST_PREVIEW_WORKSPACE"] = "true"
        app.launchEnvironment["TS_IOS_UI_TEST_AUTHENTICATED_SESSION"] = try await
            Get5CanonicalAuthentication.sessionEnvironment(backendURL: fixture.backendURL, accountID: fixture.accountID)
        app.launchArguments = ["--auth-backend-url", fixture.backendURL, "--reset-agent-sessions",
            "-talent-signal.interface-language", "en", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        app.launchArguments.removeAll { $0 == "--reset-agent-sessions" }
        guard element("canonical-pursuit-today").waitForExistence(timeout: 15) else {
            capture("GET-5 canonical fixture root unavailable")
            XCTFail("The launch did not open the configured canonical fixture."); return
        }
        app.buttons["relationship-guide"].tap()
        let message = "Noor Vega, \(fixture.contactNoMatchEmail), Design"
        let composer = app.textFields["ask-composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        composer.tap()
        composer.typeText(message)
        app.buttons["ask-send"].tap()
        guard element("contact-proposal-card").waitForExistence(timeout: 40) else {
            capture("GET-5 canonical proposal was not prepared")
            XCTFail("The configured provider did not prepare a grounded draft."); return
        }
        guard element("contact-identity-no-match").waitForExistence(timeout: 12) else {
            XCTFail("Identity lookup did not confirm no match."); return
        }
        let save = app.buttons["contact-confirm-save"]
        reveal(save)
        XCTAssertTrue(save.isEnabled)
        save.tap()
        guard savedReceipt.waitForExistence(timeout: 20) else {
            capture("GET-5 canonical save had no success receipt")
            XCTFail("A canonical save receipt was not shown."); return
        }
        XCTAssertTrue(app.textFields["ask-composer"].isEnabled)
        capture("GET-5 canonical contact saved in original Session")
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["archive-tab-sessions"].waitForExistence(timeout: 15))
        app.buttons["archive-tab-sessions"].tap()
        let sessions = app.buttons.matching(NSPredicate(format: "identifier MATCHES %@", "agent-session-[0-9A-Fa-f-]{36}"))
        XCTAssertTrue(sessions.firstMatch.waitForExistence(timeout: 8))
        XCTAssertEqual(sessions.count, 1, "Saving a contact keeps its originating Session.")
        sessions.firstMatch.tap()
        let receipt = savedReceipt
        guard receipt.waitForExistence(timeout: 8) else {
            capture("GET-5 restored receipt missing")
            XCTFail("Saved contact receipt did not survive restart."); return
        }
        let original = app.staticTexts.matching(NSPredicate(format: "label == %@", message)).firstMatch
        for _ in 0..<12 where !original.isHittable {
            element("ask-conversation").swipeDown()
        }
        XCTAssertTrue(original.exists)
        XCTAssertTrue(app.buttons["ask-session-menu"].exists)
        capture("GET-5 source and canonical receipt survive process restart")

        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(sessions.firstMatch.waitForExistence(timeout: 5))
        let sessionIdentifier = sessions.firstMatch.identifier
        let sessionID = String(sessionIdentifier.dropFirst("agent-session-".count))
        app.buttons["session-actions-\(sessionID)"].tap()
        app.buttons["delete-session-history"].tap()
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        let scope = alert.staticTexts.matching(NSPredicate(
            format: "label CONTAINS %@", "across your devices"
        ))
        XCTAssertGreaterThanOrEqual(scope.count, 1)
        XCTAssertTrue(alert.staticTexts.matching(NSPredicate(
            format: "label CONTAINS %@ AND label CONTAINS %@",
            "unsaved drafts", "Saved contacts and other Sessions stay unchanged"
        )).firstMatch.exists)
        XCTAssertTrue(alert.buttons["confirm-delete-session"].firstMatch.exists)
        capture("GET-5 canonical deletion explains shared scope before a decision")
        alert.buttons["cancel-delete-session"].firstMatch.tap()
        XCTAssertTrue(app.buttons[sessionIdentifier].exists)
        XCTAssertEqual(sessions.count, 1)
        app.buttons[sessionIdentifier].tap()
        XCTAssertTrue(savedReceipt.waitForExistence(timeout: 5))
    }

    private struct Fixture: Decodable {
        let backendURL: String
        let accountID: String
        let contactNoMatchEmail: String
        enum CodingKeys: String, CodingKey {
            case backendURL = "backend_url", accountID = "account_id", contactNoMatchEmail = "contact_no_match_email"
        }
    }

    private func prepareFixture() async throws -> Fixture {
        let info = Bundle(for: Self.self).object(forInfoDictionaryKey: "TS_IOS_PURSUIT_FIXTURE_URL") as? String
        let configured = info.flatMap { $0.isEmpty || $0.contains("$(") ? nil : $0 }
        let base = URL(string: configured ?? "http://127.0.0.1:4323")!
        var request = URLRequest(url: base.appending(path: "__ios_pursuit_proposal_fixture/prepare"))
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 201)
        return try JSONDecoder().decode(Fixture.self, from: data)
    }

    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    private var savedReceipt: XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "agent-contact-receipt-")).firstMatch
    }

    private func reveal(_ target: XCUIElement) {
        for _ in 0..<12 where !target.isHittable {
            element("ask-conversation").swipeUp()
        }
        XCTAssertTrue(target.isHittable)
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

/// Uses the existing loopback-only simulated-session bridge so native journeys
/// exercise the same authenticated Session synchronization as the signed-in app.
@MainActor
enum Get5CanonicalAuthentication {
    static func sessionEnvironment(backendURL: String, accountID: String) async throws -> String {
        let baseURL = try XCTUnwrap(URL(string: backendURL))
        XCTAssertEqual(baseURL.host, "127.0.0.1")
        print("GET5 authenticated fixture endpoint=\(backendURL)")
        var request = URLRequest(url: baseURL.appending(path: "v1/auth/simulated-login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "account_slug": "fixture-alpha", "user_email": "recruiter@alpha.local",
            "client_label": "get5-canonical-native-proof"
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        let login = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let account = try XCTUnwrap(login["account"] as? [String: Any])
        let user = try XCTUnwrap(login["user"] as? [String: Any])
        XCTAssertEqual(account["id"] as? String, accountID)
        XCTAssertEqual(user["kind"] as? String, "simulated_human")
        let token = try XCTUnwrap(login["access_token"] as? String)
        guard baseURL.host == "127.0.0.1", account["slug"] as? String == "fixture-alpha",
              user["kind"] as? String == "simulated_human" else {
            throw NSError(domain: "GET5Fixture", code: 1)
        }
        // This serial suite owns the isolated synthetic recruiter. Reset its
        // canonical conversation projection as well as the local test cache.
        var cursor: String?
        var records: [[String: Any]] = []
        repeat {
            var components = URLComponents(url: baseURL.appending(path: "v1/agent-sessions"), resolvingAgainstBaseURL: false)!
            components.queryItems = [URLQueryItem(name: "limit", value: "50")]
            if let cursor { components.queryItems?.append(URLQueryItem(name: "after", value: cursor)) }
            var read = URLRequest(url: components.url!)
            read.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let (pageData, pageResponse) = try await URLSession.shared.data(for: read)
            XCTAssertEqual((pageResponse as? HTTPURLResponse)?.statusCode, 200)
            let page = try XCTUnwrap(JSONSerialization.jsonObject(with: pageData) as? [String: Any])
            records += try XCTUnwrap(page["sessions"] as? [[String: Any]])
            cursor = page["complete"] as? Bool == true ? nil : try XCTUnwrap(page["next_cursor"] as? String)
        } while cursor != nil
        for record in records where record["payload"] is [String: Any] {
            let id = try XCTUnwrap(record["session_id"] as? String)
            var deletion = URLRequest(url: baseURL.appending(path: "v1/agent-sessions/\(id)"))
            deletion.httpMethod = "DELETE"
            deletion.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            deletion.setValue("application/json", forHTTPHeaderField: "Content-Type")
            deletion.httpBody = try JSONSerialization.data(withJSONObject: [
                "expected_revision": try XCTUnwrap(record["revision"] as? Int),
                "idempotency_key": UUID().uuidString
            ])
            let (_, result) = try await URLSession.shared.data(for: deletion)
            XCTAssertEqual((result as? HTTPURLResponse)?.statusCode, 200)
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let encodedExpiry = try XCTUnwrap(login["expires_at"] as? String)
        let expiry = formatter.date(from: encodedExpiry) ?? ISO8601DateFormatter().date(from: encodedExpiry)
        let session: [String: Any] = [
            "baseURL": backendURL,
            "accessToken": token,
            "expiresAt": ISO8601DateFormatter().string(from: try XCTUnwrap(expiry)),
            "account": account,
            "user": ["id": try XCTUnwrap(user["id"] as? String),
                     "email": try XCTUnwrap(user["email"] as? String),
                     "displayName": try XCTUnwrap(user["display_name"] as? String),
                     "kind": "simulated_human"]
        ]
        return try JSONSerialization.data(withJSONObject: session).base64EncodedString()
    }
}
