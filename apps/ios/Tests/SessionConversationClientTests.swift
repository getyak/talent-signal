import Foundation
import XCTest
@testable import TalentSignal

final class SessionConversationClientTests: XCTestCase {
    func testReplyPreferencePreservesIntentAndRequiresMatchingReadback() async throws {
        let (client, network) = makeClient()
        defer { network.invalidateAndCancel(); SessionConversationURLProtocol.handler = nil }
        let intent = UUID().uuidString
        var methods: [String] = []
        var readbackRevision = 2
        SessionConversationURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/v1/agent/preferences")
            methods.append(request.httpMethod ?? "")
            if request.httpMethod == "PUT" {
                let body = try self.body(request)
                XCTAssertEqual(body["idempotency_key"] as? String, intent)
                XCTAssertEqual(body["expected_revision"] as? Int, 1)
                XCTAssertEqual(body["response_style"] as? String, "conclusion_first")
            }
            return try JSONSerialization.data(withJSONObject: ["preference": ["response_style": "conclusion_first",
                "revision": request.httpMethod == "PUT" ? 2 : readbackRevision, "updated_at": "2026-09-09T00:00:00Z"]])
        }
        let mutation = AgentReplyPreferenceMutation(idempotencyKey: intent, expectedRevision: 1, responseStyle: .conclusionFirst)
        let saved = try await client.saveReplyPreference(mutation)
        XCTAssertEqual(saved.responseStyle, .conclusionFirst)
        XCTAssertEqual(methods, ["PUT", "GET"])
        readbackRevision = 3
        do { _ = try await client.saveReplyPreference(mutation); XCTFail("A changed readback cannot be reported as saved") }
        catch PursuitWorkspaceClientError.scopeReadbackMismatch { }
    }

    func testUnscopedFollowupAndRetryKeepSessionMessageAndIntentIDs() async throws {
        let sessionID = UUID(), messageID = UUID()
        let (client, network) = makeClient()
        defer { network.invalidateAndCancel(); SessionConversationURLProtocol.handler = nil }
        var count = 0
        SessionConversationURLProtocol.handler = { request in
            count += 1
            XCTAssertEqual(request.url?.path, "/v1/chat/unscoped-tasks")
            XCTAssertEqual(request.timeoutInterval, 120)
            let body = try self.body(request)
            XCTAssertEqual((body["session_id"] as? String).flatMap(UUID.init(uuidString:)), sessionID)
            XCTAssertEqual((body["message_id"] as? String).flatMap(UUID.init(uuidString:)), messageID)
            XCTAssertEqual(body["idempotency_key"] as? String, "same-intent")
            return try self.response(sourceMessageID: messageID, relationshipContext: "")
        }
        for _ in 0..<2 {
            let response = try await client.chatUnscoped(
                objective: "Save Mira Chen, mira@example.com", idempotencyKey: "same-intent",
                sessionID: sessionID, messageID: messageID
            )
            XCTAssertEqual(response.agentEvent?.relationshipContext, "")
            XCTAssertEqual(response.agentEvent?.sourceMessageID.flatMap(UUID.init(uuidString:)), messageID)
        }
        XCTAssertEqual(count, 2)
    }

    func testContactProposalFromAnotherMessageIsRejected() async throws {
        let (client, network) = makeClient()
        defer { network.invalidateAndCancel(); SessionConversationURLProtocol.handler = nil }
        SessionConversationURLProtocol.handler = { _ in try self.response(sourceMessageID: UUID(), relationshipContext: "Design search") }
        do {
            _ = try await client.chatUnscoped(objective: "Save Mira Chen, mira@example.com",
                idempotencyKey: "same-intent", sessionID: UUID(), messageID: UUID())
            XCTFail("A proposal cannot be assigned to a different source message")
        } catch PursuitWorkspaceClientError.invalidResponse { }
    }

    func testScopedAskCarriesSameConversationIdentityToTheBackend() async throws {
        let (client, network) = makeClient()
        let sessionID = UUID(), messageID = UUID(), personID = UUID().uuidString, contextID = UUID().uuidString
        defer { network.invalidateAndCancel(); SessionConversationURLProtocol.handler = nil }
        var requested = false
        SessionConversationURLProtocol.handler = { request in
            requested = true
            XCTAssertEqual(request.url?.path, "/v1/chat/tasks")
            XCTAssertEqual(request.timeoutInterval, 120)
            let body = try self.body(request)
            XCTAssertEqual((body["session_id"] as? String).flatMap(UUID.init(uuidString:)), sessionID)
            XCTAssertEqual((body["message_id"] as? String).flatMap(UUID.init(uuidString:)), messageID)
            XCTAssertEqual(body["person_id"] as? String, personID)
            XCTAssertEqual(body["relationship_context_id"] as? String, contextID)
            throw URLError(.notConnectedToInternet)
        }
        do {
            _ = try await client.ask(objective: "What did she mean by that?", personID: personID,
                relationshipContextID: contextID, idempotencyKey: "same-intent", mediaIDs: [],
                sessionID: sessionID, messageID: messageID)
            XCTFail("Expected offline response")
        } catch { XCTAssertTrue(requested) }
    }

    private func makeClient() -> (URLPursuitWorkspaceClient, URLSession) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SessionConversationURLProtocol.self]
        let network = URLSession(configuration: configuration)
        let client = URLPursuitWorkspaceClient(baseURL: URL(string: "https://example.invalid")!,
            accessToken: "synthetic-test-token", accountID: UUID().uuidString,
            userID: UUID().uuidString, userDisplayName: "Synthetic recruiter", session: network)
        return (client, network)
    }

    private func body(_ request: URLRequest) throws -> [String: Any] {
        let data: Data
        if let raw = request.httpBody { data = raw }
        else if let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096), result = Data()
            while stream.hasBytesAvailable {
                let read = stream.read(&buffer, maxLength: buffer.count)
                if read <= 0 { break }
                result.append(contentsOf: buffer.prefix(read))
            }
            data = result
        } else { throw URLError(.badServerResponse) }
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func response(sourceMessageID: UUID, relationshipContext: String) throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "contract_version": TalentSignalAPIContract.version,
            "task_id": "11111111-1111-4111-8111-111111111111",
            "disposition": "clarify", "external_effects": [], "created_at": "2026-09-07T01:00:00Z",
            "blocks": [["id": "contact-draft", "kind": "identity_review", "title": "Contact draft",
                        "body": "Add the relationship before saving.", "status": "needs_review",
                        "citation_dependency_ids": [], "requires_user_decision": true]],
            "agent_event": ["kind": "contact_change_proposal", "proposal_kind": "create",
                "candidate_fingerprint": String(repeating: "a", count: 64),
                "display_name": "Mira Chen", "relationship_context": relationshipContext,
                "identity_clue": ["type": "email", "value": "mira@example.com"],
                "source_excerpts": ["Mira Chen", "mira@example.com"],
                "source_message_id": sourceMessageID.uuidString.lowercased(),
                "reason": "Review the contact draft", "requires_user_confirmation": true]
        ])
    }
}

private final class SessionConversationURLProtocol: URLProtocol, @unchecked Sendable {
    static var handler: ((URLRequest) throws -> Data)?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            guard let handler = Self.handler else { throw URLError(.badServerResponse) }
            let data = try handler(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil,
                headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() { }
}
