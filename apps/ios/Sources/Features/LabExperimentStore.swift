import CryptoKit
import Foundation

@MainActor
final class LabExperimentStore: ObservableObject {
    @Published private(set) var catalog: LabExperimentCatalog?
    @Published private(set) var record: LabExperimentRecord?
    @Published private(set) var pendingRequest: LabExperimentRequest?
    @Published private(set) var isWorking = false
    @Published private(set) var error: String?
    @Published private(set) var canResubmit = false
    @Published private(set) var checkedAt: Date?
    @Published private(set) var connectionMilliseconds: Int?
    let service: (any LabExperimentServing)?
    private let defaults: UserDefaults
    private let recoveryKey: String

    init(service: (any LabExperimentServing)?, scope: String, legacyScope: String? = nil, defaults: UserDefaults = .standard) {
        self.service = service
        self.defaults = defaults
        let digest = SHA256.hash(data: Data(scope.utf8)).map { String(format: "%02x", $0) }.joined()
        recoveryKey = "talent-signal.lab.experiment.\(digest)"
        if defaults.data(forKey: recoveryKey) == nil, let legacyScope {
            let legacyKey = "talent-signal.lab.experiment." + SHA256.hex(legacyScope)
            if let data = defaults.data(forKey: legacyKey),
               (try? JSONDecoder().decode(LabExperimentRequest.self, from: data)) != nil {
                defaults.set(data, forKey: recoveryKey)
                if defaults.data(forKey: recoveryKey) == data { defaults.removeObject(forKey: legacyKey) }
            }
        }
        if let data = defaults.data(forKey: recoveryKey) {
            pendingRequest = try? JSONDecoder().decode(LabExperimentRequest.self, from: data)
        }
    }

    func load() async {
        guard let service, !isWorking else { return }
        isWorking = true
        error = nil
        let start = ProcessInfo.processInfo.systemUptime
        defer { isWorking = false }
        do {
            catalog = try await service.loadExperiments()
            checkedAt = Date()
            connectionMilliseconds = Int((ProcessInfo.processInfo.systemUptime - start) * 1000)
            if let pendingRequest {
                do { try accept(try await service.experiment(id: pendingRequest.id)) }
                catch let error as TalentSignalLabClientError {
                    handleRecoveryError(error)
                    throw error
                }
            } else if let latest = catalog?.experiments.first {
                try accept(latest)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func start(caseID: String, models: [String]) async {
        guard pendingRequest == nil, !isWorking, models.count == 2,
              models.allSatisfy({ catalog?.models.contains($0) == true }),
              catalog?.cases.contains(where: { $0.id == caseID }) == true else { return }
        let body = LabExperimentRequest(id: UUID().uuidString.lowercased(), case_id: caseID, models: models)
        guard let data = try? JSONEncoder().encode(body) else { return }
        defaults.set(data, forKey: recoveryKey)
        guard defaults.data(forKey: recoveryKey) == data else {
            error = "The experiment could not be saved for recovery. No request was sent."
            return
        }
        pendingRequest = body
        record = nil
        await submitSavedRequest()
    }

    func retryUnacceptedRequest() async {
        guard canResubmit else { return }
        await submitSavedRequest()
    }

    private func submitSavedRequest() async {
        guard let service, let pendingRequest, !isWorking else { return }
        isWorking = true
        canResubmit = false
        error = nil
        defer { isWorking = false }
        do { try accept(try await service.startExperiment(pendingRequest)) }
        catch { self.error = error.localizedDescription }
    }

    func refreshRun() async {
        guard let service, !isWorking, let id = pendingRequest?.id ?? record?.id else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try accept(try await service.experiment(id: id))
            error = nil
        } catch let error as TalentSignalLabClientError {
            handleRecoveryError(error)
            self.error = error.localizedDescription
        } catch { self.error = error.localizedDescription }
    }

    func select(_ record: LabExperimentRecord) {
        guard pendingRequest == nil else { return }
        do { try accept(record) } catch { self.error = error.localizedDescription }
    }

    func review(_ decision: String) async {
        guard let service, let record, record.status != "running", !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do { try accept(try await service.reviewExperiment(id: record.id, review: decision)) }
        catch { self.error = error.localizedDescription }
    }

    private func handleRecoveryError(_ error: TalentSignalLabClientError) {
        if case .backend(404, _, _) = error, pendingRequest != nil { canResubmit = true }
        if case .backend(410, _, _) = error {
            pendingRequest = nil
            record = nil
            canResubmit = false
            defaults.removeObject(forKey: recoveryKey)
        }
    }

    private func accept(_ result: LabExperimentRecord) throws {
        guard result.business_write_count == 0, result.provider_call_limit == 2,
              result.models.count == 2, result.results.count <= 2,
              ["running", "completed", "partial", "failed", "unknown"].contains(result.status),
              !["completed", "partial", "failed"].contains(result.status) || result.results.count == 2,
              result.results.enumerated().allSatisfy({ $0.element.model == result.models[$0.offset] }),
              pendingRequest == nil || (pendingRequest?.id == result.id && pendingRequest?.models == result.models
                && pendingRequest?.case_id == result.case_id) else {
            throw TalentSignalLabClientError.invalidResponse
        }
        record = result
        if result.status != "running" {
            pendingRequest = nil
            defaults.removeObject(forKey: recoveryKey)
            canResubmit = false
        }
    }
}
