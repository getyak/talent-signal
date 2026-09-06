import Foundation

struct LabServerTrace: Codable {
    static let requestHeader = "x-talent-signal-lab-request"
    static let responseHeader = "x-talent-signal-lab-trace"
    enum Origin: String, Codable { case backend, syntheticFixture = "synthetic_fixture" }
    struct Span: Codable {
        enum Kind: String, Codable {
            case context, modelAdapter = "model_adapter", databaseConnection = "database_connection"
            case databaseCommit = "database_commit", tool, validation
            var title: String {
                switch self {
                case .context: return "Context read"
                case .modelAdapter: return "Model adapter"
                case .databaseConnection: return "Database connection wait"
                case .databaseCommit: return "Database commit"
                case .tool: return "Agent tool"
                case .validation: return "Response schema validation"
                }
            }
        }
        enum Outcome: String, Codable { case completed, failed, unfinished; var title: String { rawValue.capitalized } }
        let kind: Kind
        let offsetMilliseconds: Double
        let durationMilliseconds: Double?
        let outcome: Outcome
        enum CodingKeys: String, CodingKey {
            case kind, outcome
            case offsetMilliseconds = "offset_ms", durationMilliseconds = "duration_ms"
        }
    }
    let version: Int
    let requestID: UUID
    let origin: Origin
    let durationMilliseconds: Double
    let spans: [Span]
    let droppedSpans: Int
    enum CodingKeys: String, CodingKey {
        case version, origin, spans
        case requestID = "request_id", durationMilliseconds = "duration_ms", droppedSpans = "dropped_spans"
    }
    var isValid: Bool {
        func validDuration(_ value: Double) -> Bool { value.isFinite && (0...600_000).contains(value) }
        return version == 1 && validDuration(durationMilliseconds) && spans.count <= 16 && (0...1_000_000).contains(droppedSpans)
            && spans.allSatisfy { span in
                guard validDuration(span.offsetMilliseconds), span.offsetMilliseconds <= durationMilliseconds + 1 else { return false }
                if let duration = span.durationMilliseconds {
                    return validDuration(duration) && duration + span.offsetMilliseconds <= durationMilliseconds + 1
                        && span.outcome != .unfinished
                }
                return span.outcome == .unfinished
            }
    }
    static func mayRequest(_ request: URLRequest) -> Bool {
        guard let url = request.url, url.user == nil, url.password == nil,
              url.scheme == "https" || (url.scheme == "http" && URLFixtureLoader.isLoopback(url)) else { return false }
        return LabDiagnosticRoute.classify(url) != .other
    }
    static func parse(_ raw: String?, requestID: UUID) -> Self? {
        guard let raw, !raw.isEmpty, raw.utf8.count <= 4096,
              raw.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_").contains($0) }) else { return nil }
        var base64 = raw.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
        guard let data = Data(base64Encoded: base64), let trace = try? JSONDecoder().decode(Self.self, from: data),
              trace.requestID == requestID, trace.isValid else { return nil }
        return trace
    }
}
