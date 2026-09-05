import Foundation

enum LabFaultPreset: String, CaseIterable, Identifiable {
    case offline, latency, unauthorizedOnce, rateLimitedOnce, serverErrorOnce, interruptedOnce, staleEvidence
    var id: String { rawValue }
    var title: String {
        switch self {
        case .offline: return "Offline until stopped"
        case .latency: return "Add two seconds of latency"
        case .unauthorizedOnce: return "One 401 response"
        case .rateLimitedOnce: return "One 429 response"
        case .serverErrorOnce: return "One 500 response"
        case .interruptedOnce: return "Interrupt one response"
        case .staleEvidence: return "Expired evidence references"
        }
    }
    var explanation: String {
        switch self {
        case .offline: return "All fixture reads fail while this preset is active. Stop the fault, then retry."
        case .latency: return "Fixture reads wait two seconds. Observe loading, then cancel or wait for the real client to finish."
        case .unauthorizedOnce: return "The People read receives one synthetic 401. A manual retry succeeds; your real sign-in is unchanged."
        case .rateLimitedOnce: return "The People read receives one synthetic 429. Inspect the error and retry manually."
        case .serverErrorOnce: return "The People read receives one synthetic 500. A manual retry uses the healthy fixture."
        case .interruptedOnce: return "The People response starts, then disconnects before its JSON is complete. Partial data must not become a successful read."
        case .staleEvidence: return "Today receives an unavailable evidence reference. Stop the fault and reload to compare the same reviewed-source fixture."
        }
    }
}
enum LabFaultEnd: String { case stopped, expired, background, closed }
enum LabFaultRoute: String { case people, pursuits, proposals, rejected }
struct LabFaultTrace: Identifiable {
    enum Result: String { case pending, delivered, failed, interrupted, cancelled, rejected }
    let id: UUID
    let route: LabFaultRoute
    let offsetMilliseconds: Double
    let injected: Bool
    let status: Int?
    var result: Result
}
struct LabFaultState {
    let preset: LabFaultPreset
    let expiresAt: Date
    let ended: LabFaultEnd?
    let events: [LabFaultTrace]
    let droppedEvents: Int
}
