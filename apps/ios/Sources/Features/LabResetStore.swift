import SwiftUI

@MainActor
final class LabResetStore: ObservableObject {
    static let shared = LabResetStore()
    static let demo = LabResetStore(enabled: true, directoryName: "DemoReset")
    @Published private(set) var operations: [LabResetOperation] = []
    @Published private(set) var isWorking = false
    @Published private(set) var error: String?
    private let files: any LabDiagnosticPersisting
    private let enabled: Bool
    private var readable = true
    var unfinished: LabResetOperation? { operations.first { !$0.closed } }

    init(files: (any LabDiagnosticPersisting)? = nil, enabled: Bool = DeviceLabAvailability.enabled, directoryName: String = "LabReset") {
        var directory = directoryName
#if DEBUG
        if let namespace = ProcessInfo.processInfo.environment["TS_IOS_UI_TEST_RESET_NAMESPACE"], let id = UUID(uuidString: namespace) {
            // Native verification uses the real protected file implementation
            // in its own namespace, preserving any user's unfinished reset.
            directory += "/UITest-" + id.uuidString
        }
#endif
        self.files = files ?? LabDiagnosticFiles(url: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(directory + "/operations-v1.json"))
        self.enabled = enabled; reload()
    }
    func reload() {
        guard enabled, !isWorking else { return }
        do {
            guard let bytes = try files.read() else { operations = []; readable = true; error = nil; return }
            guard bytes.count <= 64_000 else { throw LabResetError.storage }
            let archive = try JSONDecoder().decode(LabResetArchive.self, from: bytes)
            guard archive.version == 1, archive.operations.count <= 20,
                  Set(archive.operations.map(\.id)).count == archive.operations.count,
                  archive.operations.filter({ !$0.closed }).count <= 1,
                  archive.operations.allSatisfy({ operation in
                      operation.startedAt.timeIntervalSince1970.isFinite && (operation.stoppedAt?.timeIntervalSince1970.isFinite ?? true) && !operation.steps.isEmpty
                        && operation.steps.map(\.action) == LabResetAction.allCases.filter { selected in operation.steps.contains { $0.action == selected } }
                        && [operation.context.endpointScope, operation.context.ownerScope].allSatisfy { !$0.isEmpty && $0.count <= 128 }
                        && (operation.context.credentialFingerprint.map { $0.count == 64 } ?? true)
                        && (operation.context.demoTarget.map { $0.revision.count == 64 && $0.revision.allSatisfy { "0123456789abcdef".contains($0) } } ?? true)
                        && (!operation.steps.contains { $0.action == .demo } || operation.context.demoTarget != nil)
                        && operation.steps.allSatisfy { ($0.remainingCacheBytes.map { $0 >= 0 } ?? true) }
                  }) else { throw LabResetError.storage }
            operations = archive.operations; readable = true; error = nil
        } catch { readable = false; self.error = "Reset records could not be read. Existing records were preserved; no cleanup will run." }
    }
    func start(actions: Set<LabResetAction>, reviewedContext: LabResetContext, executor: any LabResetExecuting) async {
        guard enabled, readable, !isWorking, !actions.isEmpty else { return }
        guard !actions.contains(.demo) || reviewedContext.demoTarget != nil else {
            error = "No unchanged synthetic Demo is saved. Personal captures and edited examples cannot be cleared by this control."; return
        }
        guard unfinished == nil else { error = "Review the unfinished reset before starting another."; return }
        guard executor.context == reviewedContext else { error = "The account or environment changed. Review a new reset plan."; return }
        let operation = LabResetOperation(id: UUID(), startedAt: Date(), context: reviewedContext,
            steps: LabResetAction.allCases.filter(actions.contains).map { .init(action: $0) })
        do {
            try persist([operation] + Array(operations.prefix(19)))
            await resume(operation.id, executor: executor)
        } catch { self.error = "Reset intent could not be saved. No cleanup was started." }
    }
    func resume(_ id: UUID, executor: any LabResetExecuting) async {
        guard enabled, readable, !isWorking, var operation = operations.first(where: { $0.id == id }), !operation.closed else { return }
        isWorking = true; error = nil
        defer { isWorking = false }
        for index in operation.steps.indices where operation.steps[index].state != .verified {
            let action = operation.steps[index].action
            guard executor.permits(operation, action: action) else {
                error = "Return to the reset's original account and environment before resuming this step."; return
            }
            do {
                try Task.checkCancellation()
                operation.steps[index].state = .running
                try replace(operation)
                let result = try await executor.perform(action, operation: operation)
                operation.steps[index].state = result.verified ? .verified : .needsRetry
                operation.steps[index].receiptID = result.receiptID
                operation.steps[index].remainingCacheBytes = result.remainingCacheBytes
                try replace(operation)
                if !result.verified { error = "Reset is incomplete. Review the step result before retrying."; return }
            } catch {
                operation.steps[index].state = .needsRetry
                do { try replace(operation) }
                catch { self.error = "A reset step may have finished, but its receipt could not be saved. Refresh records and resume the same reset."; readable = false; return }
                self.error = "Reset paused. Finish active work or restore the required connection and storage, then resume the same reset."; return
            }
        }
    }
    func stopRemaining(_ id: UUID) {
        guard enabled, readable, !isWorking, var operation = operations.first(where: { $0.id == id }), !operation.closed else { return }
        operation.stoppedAt = Date()
        do { try replace(operation); error = nil }
        catch { self.error = "The stop decision could not be saved. Existing reset recovery was preserved." }
    }
    private func replace(_ operation: LabResetOperation) throws {
        try persist(operations.map { $0.id == operation.id ? operation : $0 })
    }
    private func persist(_ values: [LabResetOperation]) throws {
        let data = try JSONEncoder().encode(LabResetArchive(version: 1, operations: values))
        guard data.count <= 64_000 else { throw LabResetError.storage }
        try files.write(data)
        guard try files.read() == data else { throw LabResetError.storage }
        operations = values
    }
}
