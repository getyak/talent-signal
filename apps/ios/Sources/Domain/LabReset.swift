import Foundation

enum LabResetAction: String, Codable, CaseIterable, Identifiable {
    case networkCache, display, diagnostics, demo, onboarding, workspace, signOut
    var id: String { rawValue }
    var title: String {
        switch self {
        case .networkCache: "Clear rebuildable network cache"
        case .display: "Restore display defaults"
        case .diagnostics: "Clear local diagnostic history"
        case .onboarding: "Restart saved onboarding progress"
        case .demo: "Reset the saved synthetic Demo"
        case .workspace: "Refresh the canonical workspace"
        case .signOut: "Sign out of the selected account"
        }
    }
    var detail: String {
        switch self {
        case .networkCache: "Clears this app's shared URL cache. Authenticated API requests use an uncached session. Original captures and drafts stay."
        case .display: "Restores theme, language, text size and density defaults, and ends the display trial. Saved Lab presets and system accessibility settings stay."
        case .diagnostics: "Stops recording and clears local diagnostic reports and MetricKit summaries. Previously exported copies and reset receipts stay."
        case .onboarding: "Returns the saved local introduction to Welcome. Its account, sources, recordings, drafts and decisions stay. System permission prompts do not reset."
        case .demo: "Removes the unchanged synthetic example's local Demo account, goal, proposal and progress. Recordings, imported sources, queued captures, calendar choices and server accounts stay. Edited examples and personal drafts are preserved."
        case .workspace: "Reads current server state again. It does not delete contacts, sources or pending operation recovery."
        case .signOut: "Closes only the selected session. Local removal and server revocation are checked separately; drafts remain protected in the original account."
        }
    }
}

struct LabResetContext: Codable, Equatable {
    let endpointScope: String
    let ownerScope: String
    let credentialFingerprint: String?
    var demoTarget: LabDemoResetTarget? = nil
}
struct LabResetStep: Codable, Identifiable {
    enum State: String, Codable { case pending, running, verified, needsRetry }
    let action: LabResetAction
    var state: State = .pending
    var receiptID: UUID?
    var remainingCacheBytes: Int?
    var id: String { action.rawValue }
}
struct LabResetOperation: Codable, Identifiable {
    let id: UUID
    let startedAt: Date
    let context: LabResetContext
    var steps: [LabResetStep]
    var stoppedAt: Date?
    var complete: Bool { !steps.isEmpty && steps.allSatisfy { $0.state == .verified } }
    var closed: Bool { complete || stoppedAt != nil }
}
struct LabResetArchive: Codable { let version: Int; var operations: [LabResetOperation] }
struct LabResetStepResult {
    let verified: Bool
    var receiptID: UUID? = nil
    var remainingCacheBytes: Int? = nil
}
enum LabResetError: Error { case storage, contextChanged, unavailable, verification, unfinished }

@MainActor
protocol LabResetExecuting {
    var context: LabResetContext { get }
    func permits(_ operation: LabResetOperation, action: LabResetAction) -> Bool
    func perform(_ action: LabResetAction, operation: LabResetOperation) async throws -> LabResetStepResult
}
