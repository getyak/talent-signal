import SwiftUI

private struct LabRuntimeKey: EnvironmentKey {
    static let defaultValue: LabRuntimeStore? = nil
}
extension EnvironmentValues {
    var labRuntime: LabRuntimeStore? {
        get { self[LabRuntimeKey.self] }
        set { self[LabRuntimeKey.self] = newValue }
    }
}

@MainActor
final class LabRuntimeStore: ObservableObject {
    struct SwitchReceipt: Codable, Equatable {
        let id: UUID
        let from: String
        let to: String
        let deploymentID: String
        let revision: String?
        let verifiedAt: Date
        let requiresSignIn: Bool
    }
    let directory: RuntimeEnvironmentDirectory
    let sessionStore: AppSessionStore
    let workspaceStore: LabWorkspaceStore
    @Published private(set) var verified: VerifiedRuntimeTarget?
    @Published private(set) var isWorking = false
    @Published private(set) var error: String?
    @Published private(set) var receipt: SwitchReceipt?
    @Published private(set) var hasActivated = false
    private let defaults: UserDefaults
    private let receiptKey: String
    private let preflight: any RuntimePreflighting

    init(directory: RuntimeEnvironmentDirectory, sessionStore: AppSessionStore,
         preflight: any RuntimePreflighting = RuntimePreflightClient(), defaults: UserDefaults = .standard,
         workspaceStore: LabWorkspaceStore? = nil) {
        self.directory = directory
        self.sessionStore = sessionStore
        self.workspaceStore = workspaceStore ?? LabWorkspaceStore(sessionStore: sessionStore)
        self.preflight = preflight
        self.defaults = defaults
        receiptKey = "talent-signal.runtime.receipt." + (directory.buildEndpoint.map { RuntimeEndpoint.scope($0) } ?? "local")
        if let data = defaults.data(forKey: receiptKey) {
            receipt = try? JSONDecoder().decode(SwitchReceipt.self, from: data)
        }
        hasActivated = directory.selected.map { $0.id != "build-default" } ?? false
    }
    var current: RuntimeEnvironmentProfile? {
        directory.profiles.first { profile in sessionStore.baseURL.map { RuntimeEndpoint.same($0, profile.endpoint) } == true }
    }
    func clearReceipt() { receipt = nil; defaults.removeObject(forKey: receiptKey) }
    var blockingWork: Int { RuntimeWorkRegistry.shared.counts.values.reduce(0, +) }

    func restoreSelectedEnvironment() async {
        guard !isWorking, let selected = directory.selected else { return }
        isWorking = true; error = nil
        defer { isWorking = false }
        do {
            verified = try await preflight.verify(selected)
            try await sessionStore.activateEnvironment(selected.endpoint)
        } catch {
            self.error = error.localizedDescription
            sessionStore.requireEnvironmentVerification(error.localizedDescription)
        }
    }

    func inspect(_ profile: RuntimeEnvironmentProfile) async {
        guard !isWorking, directory.profiles.contains(profile) else { return }
        isWorking = true; error = nil; verified = nil
        defer { isWorking = false }
        do { verified = try await preflight.verify(profile) }
        catch { self.error = error.localizedDescription }
    }

    func activateVerifiedTarget() async {
        guard !isWorking, let verified, directory.profiles.contains(verified.profile) else { return }
        guard !workspaceStore.hasOpenJourney else {
            error = RuntimeEnvironmentError.protectedWorkspaceActive.localizedDescription; return
        }
        guard Date().timeIntervalSince(verified.checkedAt) < 60 else {
            error = RuntimeEnvironmentError.expiredPreflight.localizedDescription; return
        }
        guard blockingWork == 0, !sessionStore.isWorking else {
            error = RuntimeEnvironmentError.busy.localizedDescription; return
        }
        isWorking = true; error = nil
        defer { isWorking = false }
        let previous = current
        let wasActivated = hasActivated
        do {
            let latest = try await preflight.verify(verified.profile)
            guard latest.manifest == verified.manifest else {
                self.verified = latest
                throw RuntimeEnvironmentError.identityMismatch
            }
            await AgentWorkActivityController.shared.endAllActivities()
            await ResearchActivityController.shared.endAllActivities()
            guard blockingWork == 0, !sessionStore.isWorking else { throw RuntimeEnvironmentError.busy }
            let prior = current?.id ?? "unconfigured"
            // Persist the approved selection, then replace all session state in one main-actor transition.
            try directory.saveSelection(latest.profile)
            hasActivated = true
            try await sessionStore.activateEnvironment(latest.profile.endpoint)
            receipt = .init(id: UUID(), from: prior, to: latest.profile.id,
                deploymentID: latest.manifest.deployment_id ?? "", revision: latest.manifest.revision,
                verifiedAt: latest.checkedAt, requiresSignIn: sessionStore.phase == .signedOut)
            if let receipt { defaults.set(try JSONEncoder().encode(receipt), forKey: receiptKey) }
        } catch {
            if let previous, current == previous {
                try? directory.saveSelection(previous)
                hasActivated = wasActivated
            }
            self.error = error.localizedDescription
        }
    }
}
