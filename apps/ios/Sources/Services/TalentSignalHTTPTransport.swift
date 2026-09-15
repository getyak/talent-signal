import Foundation

struct TalentSignalHTTPResponse {
    let data: Data
    let http: HTTPURLResponse

    var statusCode: Int { http.statusCode }
    var isSuccessful: Bool { (200...299).contains(statusCode) }
}

enum TalentSignalHTTPTransportError: Error, Equatable {
    case invalidResponse
}

struct TalentSignalHTTPTransport {
    private let session: URLSession

    init(session: URLSession = TalentSignalNetworking.session) {
        self.session = session
    }

    func send<Body: Encodable>(
        baseURL: URL,
        path: String,
        queryItems: [URLQueryItem] = [],
        method: String,
        bearerToken: String?,
        body: Body?,
        timeoutInterval: TimeInterval? = nil,
        cachePolicy: URLRequest.CachePolicy? = nil,
        encoder: JSONEncoder = JSONEncoder()
    ) async throws -> TalentSignalHTTPResponse {
        let pathURL = baseURL.appending(path: path)
        let requestURL: URL
        if queryItems.isEmpty {
            requestURL = pathURL
        } else {
            guard var components = URLComponents(url: pathURL, resolvingAgainstBaseURL: false) else {
                throw TalentSignalHTTPTransportError.invalidResponse
            }
            components.queryItems = (components.queryItems ?? []) + queryItems
            guard let url = components.url else {
                throw TalentSignalHTTPTransportError.invalidResponse
            }
            requestURL = url
        }

        var request = URLRequest(url: requestURL)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "accept")
        if let bearerToken, !bearerToken.isEmpty {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "authorization")
        }
        if let timeoutInterval {
            request.timeoutInterval = timeoutInterval
        }
        if let cachePolicy {
            request.cachePolicy = cachePolicy
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await TalentSignalNetworking.data(for: request, using: session)
        guard let http = response as? HTTPURLResponse else {
            throw TalentSignalHTTPTransportError.invalidResponse
        }
        return TalentSignalHTTPResponse(data: data, http: http)
    }
}
