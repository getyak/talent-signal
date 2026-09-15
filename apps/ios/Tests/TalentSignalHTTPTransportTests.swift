import XCTest
@testable import TalentSignal

final class TalentSignalHTTPTransportTests: XCTestCase {
    func testAuthenticatedJSONRequestPreservesDomainVisibleHTTPFailure() async throws {
        let session = makeSession()
        defer {
            session.invalidateAndCancel()
            HTTPTransportURLProtocol.handler = nil
        }
        HTTPTransportURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/v1/example")
            XCTAssertEqual(request.value(forHTTPHeaderField: "accept"), "application/json")
            XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer secret-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "content-type"), "application/json")
            XCTAssertEqual(request.timeoutInterval, 7)
            XCTAssertEqual(request.cachePolicy, .reloadIgnoringLocalCacheData)
            let body = try XCTUnwrap(Self.bodyData(request))
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
            XCTAssertEqual(json, ["name": "example"])
            return (
                HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 409,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )!,
                Data()
            )
        }

        let response = try await TalentSignalHTTPTransport(session: session).send(
            baseURL: URL(string: "https://example.test")!,
            path: "v1/example",
            method: "POST",
            bearerToken: "secret-token",
            body: RequestBody(name: "example"),
            timeoutInterval: 7,
            cachePolicy: .reloadIgnoringLocalCacheData
        )

        XCTAssertEqual(response.statusCode, 409)
        XCTAssertFalse(response.isSuccessful)
    }

    func testUnauthenticatedRequestOmitsCredentialAndRejectsNonHTTPResponse() async throws {
        let session = makeSession()
        defer {
            session.invalidateAndCancel()
            HTTPTransportURLProtocol.handler = nil
        }
        HTTPTransportURLProtocol.handler = { request in
            XCTAssertNil(request.value(forHTTPHeaderField: "authorization"))
            XCTAssertNil(request.value(forHTTPHeaderField: "content-type"))
            return (
                URLResponse(
                    url: try XCTUnwrap(request.url),
                    mimeType: "application/json",
                    expectedContentLength: 0,
                    textEncodingName: nil
                ),
                Data()
            )
        }

        do {
            _ = try await TalentSignalHTTPTransport(session: session).send(
                baseURL: URL(string: "https://example.test")!,
                path: "v1/session",
                method: "GET",
                bearerToken: nil,
                body: Optional<RequestBody>.none
            )
            XCTFail("Expected a non-HTTP response to fail closed")
        } catch let error as TalentSignalHTTPTransportError {
            XCTAssertEqual(error, .invalidResponse)
        }
    }

    func testAgentTaskClientKeepsBackendErrorMappingAfterTransportMigration() async throws {
        let network = makeSession()
        defer {
            network.invalidateAndCancel()
            HTTPTransportURLProtocol.handler = nil
        }
        HTTPTransportURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/v1/pursuits/pursuit-1/agent-tasks")
            XCTAssertEqual(request.url?.query, "state=active")
            XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer owner-token")
            return (
                HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 403,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )!,
                Data(#"{"error":{"code":"SCOPE_DENIED","message":"Wrong workspace."}}"#.utf8)
            )
        }
        let client = URLAgentTaskClient(session: talentSignalSession(), urlSession: network)

        do {
            _ = try await client.list(pursuitID: "pursuit-1", includeHistory: false)
            XCTFail("Expected the backend error to remain domain-specific")
        } catch let error as AgentTaskClientError {
            XCTAssertEqual(error, .backend(code: "SCOPE_DENIED", message: "Wrong workspace."))
        }
    }

    func testPursuitReviewClientKeepsConflictMappingAfterTransportMigration() async throws {
        let network = makeSession()
        defer {
            network.invalidateAndCancel()
            HTTPTransportURLProtocol.handler = nil
        }
        HTTPTransportURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/v1/pursuit-proposals/proposal-1")
            XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer review-token")
            return (
                HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 409,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )!,
                Data(#"{"error":{"code":"REVISION_CONFLICT","message":"Read the latest proposal."}}"#.utf8)
            )
        }
        let client = URLPursuitProposalReviewClient(
            baseURL: URL(string: "https://example.test")!,
            accessToken: "review-token",
            session: network
        )

        do {
            _ = try await client.loadProposal(id: "proposal-1")
            XCTFail("Expected the review conflict to remain domain-specific")
        } catch let error as PursuitProposalReviewClientError {
            XCTAssertEqual(error, .conflict(message: "Read the latest proposal."))
        }
    }

    private func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HTTPTransportURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    private func talentSignalSession() -> TalentSignalSession {
        TalentSignalSession(
            baseURL: URL(string: "https://example.test")!,
            accessToken: "owner-token",
            expiresAt: Date(timeIntervalSince1970: 2_000_000_000),
            account: .init(id: "owner-account", slug: "owner", name: "Owner"),
            user: .init(
                id: "owner-user",
                email: "owner@example.test",
                displayName: "Owner",
                kind: "human"
            )
        )
    }

    private static func bodyData(_ request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var result = Data()
        var buffer = [UInt8](repeating: 0, count: 1_024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            result.append(buffer, count: count)
        }
        return result
    }
}

private struct RequestBody: Encodable {
    let name: String
}

private final class HTTPTransportURLProtocol: URLProtocol, @unchecked Sendable {
    static var handler: ((URLRequest) throws -> (URLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        do {
            let (response, data) = try XCTUnwrap(Self.handler)(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            if !data.isEmpty {
                client?.urlProtocol(self, didLoad: data)
            }
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
