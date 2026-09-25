import XCTest
@testable import TalentSignal

/// Real client round trip for timestamp precision: the backend enforces
/// Date.parse equality for immutable creation times, so the encoder must
/// preserve the fractional milliseconds the decoder accepted.
final class SessionTimestampRoundTripTests: XCTestCase {
    final class CaptureURLProtocol: URLProtocol, @unchecked Sendable {
        private static let lock = NSLock()
        private static var bodies: [String] = []
        static func captured() -> [String] {
            lock.lock(); defer { lock.unlock() }; return bodies
        }
        static func reset() {
            lock.lock(); bodies = []; lock.unlock()
        }
        override class func canInit(with request: URLRequest) -> Bool { true }
        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
        override func startLoading() {
            let url = request.url!
            var bodyText = ""
            if let data = request.httpBody {
                bodyText = String(data: data, encoding: .utf8) ?? ""
            } else if let stream = request.httpBodyStream {
                stream.open()
                var data = Data()
                var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let read = stream.read(&buffer, maxLength: buffer.count)
                    if read <= 0 { break }
                    data.append(buffer, count: read)
                }
                stream.close()
                bodyText = String(data: data, encoding: .utf8) ?? ""
            }
            Self.lock.lock()
            Self.bodies.append(bodyText)
            Self.lock.unlock()
            let sessionID = url.lastPathComponent
            let response: [String: Any] = [
                "contract_version": TalentSignalAPIContract.version,
                "session": [
                    "session_id": sessionID,
                    "revision": 2,
                    "updated_at": "2026-09-24T19:12:08.180281Z",
                    "expires_at": "2030-01-01T00:00:00.000Z",
                    "deleted_at": NSNull(),
                    "payload": NSNull(),
                ],
            ]
            let data = try! JSONSerialization.data(withJSONObject: response)
            let http = HTTPURLResponse(url: url, statusCode: 200,
                httpVersion: "HTTP/1.1", headerFields: ["content-type": "application/json"])!
            client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        }
        override func stopLoading() {}
    }

    func testRealClientPutPreservesFractionalMilliseconds() async throws {
        CaptureURLProtocol.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CaptureURLProtocol.self]
        let session = URLSession(configuration: configuration)

        // A Web-created Session with nonzero fractional creation time.
        let fractional = "2026-09-24T19:12:08.180281Z"
        let decoded = try JSONDecoder.agentSession.decode(
            Date.self,
            from: Data("\"\(fractional)\"".utf8)
        )
        let sessionID = UUID()
        let turn = AgentSessionTurn(
            id: UUID(),
            objective: "kept message",
            response: RelationshipAskResponse(
                contractVersion: TalentSignalAPIContract.version,
                taskID: "task-ts",
                contextManifestID: "none-unbound-conversation",
                knowledgeSnapshotID: "none-unbound-conversation",
                disposition: "answered",
                blocks: [],
                createdAt: ISO8601DateFormatter().string(from: decoded)
            ),
            createdAt: decoded,
            requiresRefresh: false
        )
        let value = AgentSession(
            id: sessionID,
            scope: .unresolvedIntent,
            title: "Timestamp round trip",
            turns: [turn],
            contactReceipts: [],
            updatedAt: decoded,
            isUnread: false
        )
        let client = AgentSessionSyncClient(
            baseURL: URL(string: "https://api.example.test")!,
            bearerToken: "token",
            session: session
        )
        _ = try await client.put(PersistedAgentSession(value), expectedRevision: 1, idempotencyKey: UUID())
        let captured = try XCTUnwrap(CaptureURLProtocol.captured().first)
        // The wire payload keeps fractional milliseconds for the immutable
        // session/turn creation times (the exact bytes the backend compares).
        let request = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(captured.utf8)) as? [String: Any])
        let payload = try XCTUnwrap(request["payload"] as? [String: Any])
        XCTAssertEqual(payload["createdAt"] as? String, "2026-09-24T19:12:08.180Z")
        let turns = try XCTUnwrap(payload["turns"] as? [[String: Any]])
        XCTAssertEqual(turns.first?["createdAt"] as? String, "2026-09-24T19:12:08.180Z")
        // Round trip: decoded and re-encoded instants parse identically.
        let reencoded = try JSONEncoder.agentSession.encode(PersistedAgentSession(value))
        let roundTripped = try JSONDecoder.agentSession.decode(
            PersistedAgentSession.self,
            from: reencoded
        )
        let roundTripCreatedAt = try XCTUnwrap(roundTripped.createdAt)
        XCTAssertEqual(
            roundTripCreatedAt.timeIntervalSince1970,
            decoded.timeIntervalSince1970,
            accuracy: 0.001,
            "decode -> encode -> decode keeps the same instant"
        )
        let rendered = String(data: reencoded, encoding: .utf8) ?? ""
        XCTAssertTrue(rendered.contains("180"))
    }

    func testLegacyWholeSecondTimestampsStillDecode() throws {
        let legacy = try JSONDecoder.agentSession.decode(
            Date.self,
            from: Data("\"2026-09-24T19:12:08Z\"".utf8)
        )
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        XCTAssertEqual(
            legacy.timeIntervalSince1970,
            formatter.date(from: "2026-09-24T19:12:08Z")!.timeIntervalSince1970,
            accuracy: 0.001
        )
    }

    final class LegacyCachePersistence: AgentSessionPersisting, @unchecked Sendable {
        var data: Data?
        init(_ data: Data) { self.data = data }
        func load() throws -> Data? { data }
        func save(_ data: Data) throws { self.data = data }
        func deletionPending() throws -> Bool { false }
        func beginDeletion() throws {}
        func completeDeletion() throws { data = nil }
    }

    final class CanonicalReadback: AgentSessionSyncServing, @unchecked Sendable {
        let canonical: PersistedAgentSession
        private let lock = NSLock()
        private var writes: [PersistedAgentSession] = []
        init(_ canonical: PersistedAgentSession) { self.canonical = canonical }
        func capturedWrites() -> [PersistedAgentSession] {
            lock.lock(); defer { lock.unlock() }; return writes
        }
        func record(_ payload: PersistedAgentSession, revision: Int) -> AgentSessionRemoteRecord {
            AgentSessionRemoteRecord(sessionID: payload.id, revision: revision,
                updatedAt: payload.updatedAt, expiresAt: payload.updatedAt.addingTimeInterval(86_400),
                deletedAt: nil, payload: payload)
        }
        func list(after: String?) async throws -> AgentSessionRemotePage {
            AgentSessionRemotePage(contractVersion: TalentSignalAPIContract.version,
                sessions: [record(canonical, revision: 7)], complete: true, nextCursor: nil)
        }
        func put(_ payload: PersistedAgentSession, expectedRevision: Int, idempotencyKey: UUID) async throws -> AgentSessionRemoteRecord {
            XCTAssertEqual(expectedRevision, 7)
            lock.lock(); writes.append(payload); lock.unlock()
            return record(payload, revision: 8)
        }
        func delete(id: UUID, expectedRevision: Int, idempotencyKey: UUID) async throws -> AgentSessionRemoteRecord {
            XCTFail("Legacy timestamp repair must not delete the Session")
            throw AgentSessionSyncError.invalidResponse
        }
    }

    @MainActor
    func testUnchangedServerRevisionRepairsLegacyCacheBeforeDraftUpload() async throws {
        let instant = try JSONDecoder.agentSession.decode(Date.self, from: Data("\"2026-09-24T19:12:08.180281Z\"".utf8))
        let turn = AgentSessionTurn(id: UUID(), objective: "same retained message",
            response: RelationshipAskResponse(contractVersion: TalentSignalAPIContract.version,
                taskID: "legacy-cache-task", contextManifestID: "none-unbound-conversation",
                knowledgeSnapshotID: "none-unbound-conversation", disposition: "answered", blocks: [],
                createdAt: "2026-09-24T19:12:08.180281Z"),
            createdAt: instant, requiresRefresh: false, feedback: .helpful, feedbackUpdatedAt: instant)
        var canonical = AgentSession(id: UUID(), scope: .unresolvedIntent, title: "Retained Web Session",
            turns: [turn], contactReceipts: [], updatedAt: instant, isUnread: false)
        canonical.createdAt = instant
        var cached = canonical
        cached.composerDraft = "local draft survives same-revision repair"
        cached.composerDraftUpdatedAt = instant.addingTimeInterval(10)
        cached.updatedAt = instant.addingTimeInterval(10)
        var envelope = PersistedAgentSessionEnvelope(version: 8, sessions: [PersistedAgentSession(cached)],
            drafts: [], globalDraft: nil, evidenceReviews: nil, contactProposal: nil)
        envelope.syncRevisions = [canonical.id.uuidString.lowercased(): 7]
        // Encode with the OLD production strategy, which drops fractional time.
        let oldEncoder = JSONEncoder()
        oldEncoder.dateEncodingStrategy = .iso8601
        let persistence = LegacyCachePersistence(try oldEncoder.encode(envelope))
        let store = AgentSessionStore(persistence: persistence, now: { instant.addingTimeInterval(20) })
        XCTAssertNotEqual(store.session(id: canonical.id)?.originalCreatedAt, instant)
        let service = CanonicalReadback(PersistedAgentSession(canonical))
        let success = await store.synchronize(using: service, requiredSessionID: canonical.id)
        XCTAssertTrue(success)
        let upload = try XCTUnwrap(service.capturedWrites().first)
        XCTAssertEqual(service.capturedWrites().count, 1)
        XCTAssertEqual(upload.id, canonical.id)
        XCTAssertEqual(upload.createdAt, instant)
        XCTAssertEqual(upload.turns.first?.createdAt, instant)
        XCTAssertEqual(upload.turns.first?.id, turn.id)
        XCTAssertEqual(upload.composerDraft, cached.composerDraft)
        XCTAssertEqual(store.session(id: canonical.id)?.turns.first?.feedback, .helpful)
        let restored = AgentSessionStore(persistence: persistence, now: { instant.addingTimeInterval(20) })
        XCTAssertEqual(restored.session(id: canonical.id)?.originalCreatedAt, instant)
        XCTAssertEqual(restored.draft(sessionID: canonical.id), cached.composerDraft)
    }

}
