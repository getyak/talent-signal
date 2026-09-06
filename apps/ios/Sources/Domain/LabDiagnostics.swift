import Foundation

// Closed vocabularies are the data boundary: no free-form URL, identity, body or error field.
enum LabDiagnosticTask: String, Codable, CaseIterable, Identifiable {
    case openPerson, sendText, sendImage, recording, scrolling, requestFailure
    var id: String { rawValue }
    var title: String {
        switch self {
        case .openPerson: return "Open a person"
        case .sendText: return "Send text"
        case .sendImage: return "Send an image"
        case .recording: return "Start recording"
        case .scrolling: return "Scroll a list"
        case .requestFailure: return "Investigate a failed request"
        }
    }
}
enum LabDiagnosticEnd: String, Codable {
    case stopped, background, contextChanged, timeLimit, interrupted, storageFailure
    var title: String {
        switch self {
        case .stopped: return "Stopped by you"
        case .background: return "Stopped in background"
        case .contextChanged: return "Stopped after account or environment change"
        case .timeLimit: return "Recording time limit reached"
        case .interrupted: return "Interrupted before the last checkpoint"
        case .storageFailure: return "Stopped because the report could not be saved"
        }
    }
}
enum LabDiagnosticMarker: String, Codable, CaseIterable, Identifiable {
    case reproduce, firstContent, interactive, problem
    var id: String { rawValue }
    var title: String {
        switch self {
        case .reproduce: return "Started reproducing"
        case .firstContent: return "First content visible"
        case .interactive: return "Task became usable"
        case .problem: return "Problem observed"
        }
    }
}
enum LabDiagnosticRoute: String, Codable {
    case health, authentication, workspace, capture, chat, lab, other
    static func classify(_ url: URL?) -> Self {
        // Never retain dynamic path components, hostnames, query strings or fragments.
        let parts = url?.path.split(separator: "/").map(String.init) ?? []
        if parts.first == "health" { return .health }
        guard parts.first == "v1", parts.count > 1 else { return .other }
        switch parts[1] {
        case "auth": return .authentication
        case "lab": return .lab
        case "chat", "unscoped-chat", "agent-sessions": return .chat
        case "captures", "resource-captures", "signals", "text-signals", "audio-signals": return .capture
        case "workspace", "people", "pursuits": return .workspace
        default: break
        }
        return .other
    }
}
enum LabDiagnosticMethod: String, Codable { case GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, other }
enum LabDiagnosticFailure: String, Codable { case cancelled, timeout, offline, transport, unfinished }
enum LabDiagnosticOrigin: String, Codable {
    case runtime, syntheticFault
    var title: String { self == .runtime ? "Runtime transport" : "Isolated synthetic transport" }
}
struct LabDiagnosticPhase: Codable, Equatable {
    enum Kind: String, Codable {
        case dns, connect, tls, send, waitForResponse, receive
        var title: String {
            switch self {
            case .dns: return "DNS lookup"
            case .connect: return "Connection setup"
            case .tls: return "TLS handshake"
            case .send: return "Request upload"
            case .waitForResponse: return "Waiting for response"
            case .receive: return "Response download"
            }
        }
    }
    let kind: Kind
    let milliseconds: Double
}
struct LabDiagnosticRequest: Codable, Identifiable {
    let id: UUID
    let offsetMilliseconds: Double
    let route: LabDiagnosticRoute
    let method: LabDiagnosticMethod
    var origin: LabDiagnosticOrigin?
    var durationMilliseconds: Double?
    var status: Int?
    var failure: LabDiagnosticFailure?
    var receivedBytes: Int?
    var phases: [LabDiagnosticPhase] = []
    var serverTrace: LabServerTrace?
    var clientSpanID: UUID?
}
struct LabDiagnosticMark: Codable, Identifiable {
    let id: UUID
    let offsetMilliseconds: Double
    let marker: LabDiagnosticMarker
}
struct LabDiagnosticSample: Codable, Identifiable {
    enum Thermal: String, Codable { case nominal, fair, serious, critical, unknown }
    let id: UUID
    let offsetMilliseconds: Double
    let physicalFootprintBytes: UInt64?
    let thermal: Thermal
    let lowPower: Bool
    let callbackCount: Int
    let cadenceHz: Double?
    let longestCallbackGapMilliseconds: Double?
    let longCallbackGaps: Int
}
struct LabDiagnosticReport: Codable, Identifiable {
    let id: UUID
    let task: LabDiagnosticTask
    let startedAt: Date
    let simulator: Bool
    var durationMilliseconds: Double = 0
    var ended: LabDiagnosticEnd?
    var requests: [LabDiagnosticRequest] = []
    var markers: [LabDiagnosticMark] = []
    var samples: [LabDiagnosticSample] = []
    var droppedRequests = 0
    var droppedMarkers = 0
    var samplingOverheadMilliseconds: Double = 0
    var clientSpans: [LabClientSpan]?
    var droppedClientSpans: Int?
}
struct LabDiagnosticArchive: Codable {
    let version: Int
    var reports: [LabDiagnosticReport]
}
