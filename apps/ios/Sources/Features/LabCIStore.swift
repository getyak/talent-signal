import CryptoKit
import Foundation

@MainActor
final class LabCIStore: ObservableObject {
    struct Pending: Codable {
        let regressionID: String
        let repository: String
        let request: LabCIRequest
        let createdAt: Date
    }
    private struct Recovery: Codable { let scope: String; let pending: Pending? }
    @Published private(set) var pending: Pending?
    @Published private(set) var receipt: LabCIReceipt?
    @Published private(set) var isWorking = false
    @Published private(set) var canRetry = false
    @Published private(set) var error: String?
    let service: (any LabCIVerificationServing)?
    private let directory: URL
    private let scopeHash: String
    private var blocked = false
    private var file: URL { directory.appendingPathComponent("verification.json") }

    init(service: (any LabCIVerificationServing)?, scope: String, directory: URL? = nil) {
        self.service = service; scopeHash = SHA256.hex(scope)
        self.directory = directory ?? RuntimeScopedDirectories.directory("LabCIVerifications", scope: scope)
        restore()
    }
    private func restore() {
        do {
            if FileManager.default.fileExists(atPath: file.path) {
                let data = try Data(contentsOf: file)
                guard data.count < 8000 else { throw TalentSignalLabClientError.invalidResponse }
                let value = try JSONDecoder().decode(Recovery.self, from: data)
                guard value.scope == scopeHash else { throw TalentSignalLabClientError.invalidResponse }
                pending = value.pending
                if let pending, pending.createdAt < Date().addingTimeInterval(-7 * 86400) { try persist(nil) }
            }
            blocked = false
        } catch { blocked = true; self.error = "Unlock the device and refresh to recover the saved CI request." }
    }
    private func persist(_ value: Pending?) throws {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(Recovery(scope: scopeHash, pending: value))
            try data.write(to: file, options: [.atomic, .completeFileProtection])
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            var folder = directory; try folder.setResourceValues(values)
            guard try Data(contentsOf: file) == data else { throw TalentSignalLabClientError.invalidResponse }
            pending = value; canRetry = false
        } catch { blocked = true; throw error }
    }
    func verify(record: LabRegressionRecord, jobID: String, runID: Int64) async {
        guard !isWorking, !blocked, pending == nil, service != nil,
              record.ci?.available == true, let repository = record.ci?.repository, LabCIInput.validRepository(repository),
              record.reruns.contains(where: { $0.id == jobID && ["completed", "failed", "cancelled", "partial", "unknown"].contains($0.status) }),
              runID > 0, runID <= 9_007_199_254_740_991 else { return }
        do {
            let request = LabCIRequest(id: UUID().uuidString.lowercased(), regression_content_hash: record.content_hash, job_id: jobID, github_run_id: runID)
            try persist(.init(regressionID: record.id, repository: repository, request: request, createdAt: .now))
            receipt = nil; await submit()
        } catch { handle(error) }
    }
    func recover() async {
        guard !isWorking, let service else { return }
        if blocked { restore() }
        guard !blocked, let pending else { return }
        isWorking = true; error = nil
        defer { isWorking = false }
        do { try accept(try await service.ciVerification(regressionID: pending.regressionID, id: pending.request.id)) }
        catch { handle(error, readback: true) }
    }
    func retry() async { if canRetry { await submit() } }
    private func submit() async {
        guard !isWorking, !blocked, let pending, let service else { return }
        isWorking = true; error = nil; canRetry = false
        defer { isWorking = false }
        do { try accept(try await service.verifyCI(regressionID: pending.regressionID, request: pending.request)) }
        catch { handle(error) }
    }
    private func accept(_ value: LabCIReceipt) throws {
        guard let pending, value.matches(regressionID: pending.regressionID, contentHash: pending.request.regression_content_hash),
              value.id == pending.request.id, value.job_id == pending.request.job_id,
              value.repository == pending.repository, value.github_run_id == pending.request.github_run_id else { throw TalentSignalLabClientError.invalidResponse }
        try persist(nil); receipt = value
    }
    private func handle(_ failure: Error, readback: Bool = false) {
        if let failure = failure as? TalentSignalLabClientError, case let .backend(status, _, _) = failure {
            if status == 404, readback { canRetry = true }
            if status == 410 || (!readback && [400, 409, 422, 503].contains(status)) {
                do { try persist(nil); receipt = nil } catch { blocked = true }
            }
        }
        error = failure.localizedDescription
    }
    func dismissPending() {
        guard !isWorking, !blocked else { return }
        do { try persist(nil); error = nil; receipt = nil } catch { handle(error) }
    }
}
