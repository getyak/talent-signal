import CryptoKit
import Foundation

@MainActor
final class LabRegressionStore: ObservableObject {
    struct Pending: Codable {
        let id: String
        let contentHash: String?
        let save: LabRegressionRequest?
        let createdAt: Date
    }
    private struct Recovery: Codable {
        let scope: String
        let selectedID: String?
        let pending: Pending?
    }
    @Published private(set) var items: [LabRegressionSummary] = []
    @Published private(set) var record: LabRegressionRecord?
    @Published private(set) var pending: Pending?
    @Published private(set) var deletion: LabRegressionDeletion?
    @Published private(set) var exportData: Data?
    @Published private(set) var isWorking = false
    @Published private(set) var canRetry = false
    @Published private(set) var error: String?
    let service: (any LabRegressionServing)?
    let ci: LabCIStore
    private let directory: URL
    private let scopeHash: String
    private var selectedID: String?
    private var recoveryBlocked = false
    private var recoveryURL: URL { directory.appendingPathComponent("recovery.json") }

    init(service: (any LabRegressionServing)?, scope: String, directory: URL? = nil) {
        self.service = service; scopeHash = SHA256.hex(scope)
        ci = LabCIStore(service: service as? any LabCIVerificationServing, scope: scope,
                       directory: directory?.appendingPathComponent("CI"))
        self.directory = directory ?? RuntimeScopedDirectories.directory("LabRegressions", scope: scope)
        restore()
    }
    private func restore() {
        do {
            if FileManager.default.fileExists(atPath: recoveryURL.path) {
                let data = try Data(contentsOf: recoveryURL)
                guard data.count < 64_000 else { throw TalentSignalLabClientError.invalidResponse }
                let value = try JSONDecoder().decode(Recovery.self, from: data)
                guard value.scope == scopeHash else { throw TalentSignalLabClientError.invalidResponse }
                selectedID = value.selectedID; pending = value.pending
                if let pending, pending.createdAt < Date().addingTimeInterval(-7 * 86400) {
                    try persist(nil, selected: selectedID)
                }
            }
            recoveryBlocked = false
        } catch {
            recoveryBlocked = true
            self.error = "The saved regression request could not be read. Unlock the device and refresh before starting another request."
        }
    }
    private func persist(_ value: Pending?, selected: String?) throws {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(Recovery(scope: scopeHash, selectedID: selected, pending: value))
            try data.write(to: recoveryURL, options: [.atomic, .completeFileProtection])
            var excluded = URLResourceValues(); excluded.isExcludedFromBackup = true
            var folder = directory; try folder.setResourceValues(excluded)
            guard try Data(contentsOf: recoveryURL) == data else { throw TalentSignalLabClientError.invalidResponse }
            pending = value; selectedID = selected; canRetry = false
        } catch {
            // The atomic write may already have committed before backup exclusion/readback failed.
            // Re-read that durable intent before allowing a new ID to replace it.
            recoveryBlocked = true
            throw error
        }
    }
    func load() async {
        guard !isWorking, let service else { return }
        if recoveryBlocked { restore() }
        guard !recoveryBlocked else { return }
        isWorking = true; error = nil
        defer { isWorking = false }
        do {
            if let pending, pending.save == nil { try acceptDeletion(try await service.deleteRegression(id: pending.id)) }
            let list = try await service.loadRegressions()
            guard list.contract_version == TalentSignalAPIContract.version,
                  list.regressions.allSatisfy({ ["not_connected", "ci_verified", "ci_needs_refresh"].contains($0.release_check) }) else { throw TalentSignalLabClientError.invalidResponse }
            items = list.regressions
            if let id = pending?.id ?? selectedID { try accept(try await service.regression(id: id)) }
        } catch { handle(error) }
    }
    func select(_ id: String) async {
        guard !isWorking, pending == nil, !recoveryBlocked, UUID(uuidString: id) != nil else { return }
        if selectedID == id { await load(); return }
        do { try persist(nil, selected: id); record = nil; exportData = nil; await load() }
        catch { handle(error) }
    }
    func save(_ request: LabRegressionRequest) async {
        guard !isWorking, pending == nil, !recoveryBlocked, service != nil,
              !request.failure_categories.isEmpty, !request.expected_behavior.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        do { try persist(.init(id: request.id, contentHash: nil, save: request, createdAt: .now), selected: selectedID); await submit() }
        catch { handle(error) }
    }
    func remove() async {
        guard !isWorking, pending == nil, !recoveryBlocked, let record else { return }
        do { try persist(.init(id: record.id, contentHash: record.content_hash, save: nil, createdAt: .now), selected: record.id); await submit() }
        catch { handle(error) }
    }
    func retry() async { if canRetry { await submit() } }
    private func submit() async {
        guard !isWorking, let pending, let service else { return }
        isWorking = true; error = nil; canRetry = false
        defer { isWorking = false }
        do {
            if let request = pending.save { try accept(try await service.saveRegression(request)) }
            else { try acceptDeletion(try await service.deleteRegression(id: pending.id)) }
        } catch { handle(error, submitted: true) }
    }
    private func accept(_ value: LabRegressionRecord) throws {
        let source = value.snapshot
        guard UUID(uuidString: value.id) != nil, value.content_hash.count == 64, LabCIInput.releaseStatusIsValid(value),
              source.schema_version == "lab-regression.v1", source.data_class == "registered_synthetic",
              source.source_definition_hash.count == 64, source.sample.input_hash.count == 64,
              source.source_attempt.case_id == source.sample.id, source.configurations.count == 2,
              ["completed", "failed", "unknown"].contains(source.source_attempt.status),
              !source.failure_categories.isEmpty, source.failure_categories.allSatisfy({ LabJobCopy.failures.contains($0) }),
              value.id == (pending?.id ?? selectedID), record?.id != value.id || record?.content_hash == value.content_hash else {
            throw TalentSignalLabClientError.invalidResponse
        }
        if let request = pending?.save {
            guard source.source_job_id == request.source_job_id, source.source_attempt.id == request.source_attempt_id,
                  source.source_definition_hash == request.source_definition_hash,
                  source.failure_categories == request.failure_categories,
                  source.expected_behavior == request.expected_behavior.trimmingCharacters(in: .whitespacesAndNewlines),
                  source.review_note == request.review_note.trimmingCharacters(in: .whitespacesAndNewlines) else { throw TalentSignalLabClientError.invalidResponse }
        }
        try persist(nil, selected: value.id); record = value; deletion = nil
    }
    private func acceptDeletion(_ value: LabRegressionDeletion) throws {
        guard value.contract_version == TalentSignalAPIContract.version, value.status == "deleted",
              value.id == pending?.id, value.content_hash == pending?.contentHash,
              value.affected_job_ids.allSatisfy({ UUID(uuidString: $0) != nil }) else { throw TalentSignalLabClientError.invalidResponse }
        record = nil; exportData = nil; items.removeAll { $0.id == value.id }
        try persist(nil, selected: nil); deletion = value
    }
    private func handle(_ failure: Error, submitted: Bool = false) {
        if let failure = failure as? TalentSignalLabClientError, case let .backend(status, _, _) = failure {
            if status == 404, pending?.save != nil, !submitted { canRetry = true }
            if status == 404, pending?.save == nil {
                do { try persist(nil, selected: nil); record = nil; exportData = nil }
                catch { recoveryBlocked = true }
            }
            if status == 410 || (submitted && [400, 409, 422].contains(status)) {
                do { try persist(nil, selected: nil); record = nil; exportData = nil }
                catch { recoveryBlocked = true }
            }
        }
        error = failure.localizedDescription
    }
    func prepareExport() async {
        guard !isWorking, pending == nil, let service, let record else { return }
        isWorking = true; error = nil; exportData = nil
        defer { isWorking = false }
        do {
            let data = try await service.exportRegression(id: record.id)
            let value = try JSONDecoder().decode(LabRegressionExport.self, from: data)
            guard value.id == record.id, value.content_hash == record.content_hash,
                  value.execution_authority == "none", value.schema_version == "lab-regression-bundle.v1" else { throw TalentSignalLabClientError.invalidResponse }
            exportData = data
        } catch { handle(error) }
    }
    func clearExport() { exportData = nil }
}
