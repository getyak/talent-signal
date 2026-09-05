import XCTest
@testable import TalentSignal

final class LabServerTraceTests: XCTestCase {
    func testTypedEnvelopeRequiresMatchingUUIDClosedKindsAndConsistentBounds() throws {
        let id = UUID()
        let valid = encoded(["version": 1, "request_id": id.uuidString.lowercased(), "origin": "backend", "duration_ms": 30.0,
            "dropped_spans": 0, "spans": [["kind": "model_adapter", "offset_ms": 3.0, "duration_ms": 20.0, "outcome": "completed"]]])
        let trace = try XCTUnwrap(LabServerTrace.parse(valid, requestID: id))
        XCTAssertEqual(trace.spans.first?.kind, .modelAdapter)
        XCTAssertNil(LabServerTrace.parse(valid, requestID: UUID()))
        let invalids: [[String: Any]] = [
            ["version": 1, "request_id": id.uuidString.lowercased(), "origin": "backend", "duration_ms": 10, "dropped_spans": 0,
             "spans": [["kind": "unknown", "offset_ms": 0, "duration_ms": 1, "outcome": "completed"]]],
            ["version": 1, "request_id": id.uuidString.lowercased(), "origin": "backend", "duration_ms": 10, "dropped_spans": 0,
             "spans": [["kind": "context", "offset_ms": 8, "duration_ms": 8, "outcome": "completed"]]],
            ["version": 1, "request_id": id.uuidString.lowercased(), "origin": "backend", "duration_ms": 10, "dropped_spans": 0,
             "spans": [["kind": "context", "offset_ms": 1, "outcome": "completed"]]],
        ]
        for body in invalids { XCTAssertNil(LabServerTrace.parse(encoded(body), requestID: id)) }
        XCTAssertNil(LabServerTrace.parse(String(repeating: "a", count: 4097), requestID: id))
    }

    func testRuntimeRequestCarriesOneUUIDAndStoresOnlyMatchingServerEnvelope() async throws {
        XCTAssertNotNil(LabDiagnosticsEngine.shared.start(task: .requestFailure, now: Date()))
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LabServerTraceURLProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        var request = URLRequest(url: URL(string: "https://trace.example.test/v1/pursuits")!)
        request.httpMethod = "GET"
        _ = try await TalentSignalNetworking.data(for: request, using: session)
        let report = try XCTUnwrap(LabDiagnosticsEngine.shared.stop(.stopped))
        let sample = try XCTUnwrap(report.requests.first)
        XCTAssertEqual(sample.serverTrace?.requestID, sample.id)
        XCTAssertEqual(sample.serverTrace?.origin, .syntheticFixture)
        XCTAssertEqual(sample.serverTrace?.spans.first?.kind, .context)
        XCTAssertNotNil(LabServerTraceURLProtocol.observedID)
        let json = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
        XCTAssertFalse(json.contains("trace.example.test")); XCTAssertFalse(json.contains("server-secret"))
    }

    private func encoded(_ object: [String: Any]) -> String {
        let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        return data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

private final class LabServerTraceURLProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock(); private static var value: UUID?
    static var observedID: UUID? { lock.lock(); defer { lock.unlock() }; return value }
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "trace.example.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let id = UUID(uuidString: request.value(forHTTPHeaderField: LabServerTrace.requestHeader) ?? "") else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse)); return
        }
        Self.lock.lock(); Self.value = id; Self.lock.unlock()
        let body: [String: Any] = ["version": 1, "request_id": id.uuidString.lowercased(), "origin": "synthetic_fixture", "duration_ms": 12,
            "dropped_spans": 0, "spans": [["kind": "context", "offset_ms": 1, "duration_ms": 5, "outcome": "completed"]]]
        let data = try! JSONSerialization.data(withJSONObject: body)
        let trace = data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [LabServerTrace.responseHeader: trace])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{}".utf8)); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
