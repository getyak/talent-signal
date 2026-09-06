import CryptoKit
import Foundation

@MainActor
final class LabJobStore: ObservableObject {
    struct Pending: Codable {
        let id: String
        let request: LabJobRequest?
        // A nil request is a durable cancellation intent.
    }
    @Published private(set) var catalog: LabJobCatalog?
    @Published private(set) var record: LabJobRecord?
    @Published private(set) var pending: Pending?
    @Published private(set) var isWorking = false
    @Published private(set) var error: String?
    @Published private(set) var canRetry = false
    @Published private(set) var checkedAt: Date?
    let service: (any LabJobServing)?
    private let defaults: UserDefaults
    private let recoveryKey: String
    private let selectionKey: String
    private var selectedID: String?

    init(service: (any LabJobServing)?, scope: String, defaults: UserDefaults = .standard) {
        self.service = service; self.defaults = defaults
        recoveryKey = "talent-signal.lab.batch." + SHA256.hex(scope)
        selectionKey = recoveryKey + ".selection"
        if let data = defaults.data(forKey: recoveryKey) { pending = try? JSONDecoder().decode(Pending.self, from: data) }
        selectedID = defaults.string(forKey: selectionKey)
    }
    func load() async {
        guard let service, !isWorking else { return }
        isWorking = true; error = nil
        defer { isWorking = false }
        do {
            let value = try await service.loadExperimentJobs()
            let tasks = Set(["relationship_text", "relationship_image", "unscoped_chat"])
            guard value.contract_version == TalentSignalAPIContract.version, value.catalog_revision.count == 64,
                  value.cases.allSatisfy({ tasks.contains($0.task ?? "relationship_text") }),
                  value.models.allSatisfy({ tasks.contains($0.task ?? "relationship_text") }) else { throw TalentSignalLabClientError.invalidResponse }
            catalog = value
            if let id = pending?.id ?? selectedID ?? value.jobs.first?.id { try accept(try await service.experimentJob(id: id)) }
            checkedAt = .now
        } catch { handle(error) }
    }
    func start(_ request: LabJobRequest) async {
        let task = request.task ?? "relationship_text"
        guard !isWorking, pending == nil, record?.isActive != true, let catalog, catalog.enabled,
              request.catalog_revision == catalog.catalog_revision, request.case_ids.count > 0, request.case_ids.count <= 20,
              Set(request.case_ids).count == request.case_ids.count, request.configurations.count == 2,
              ["relationship_text", "relationship_image", "unscoped_chat"].contains(task),
              (request.regression_source != nil || request.case_ids.allSatisfy({ id in catalog.cases.contains { $0.id == id && ($0.task ?? "relationship_text") == task } })),
              request.configurations.allSatisfy({ choice in catalog.models.contains { ($0.task ?? "relationship_text") == task && $0.id == choice.model && $0.prompt_presets.contains(choice.prompt_preset) } }),
              (1...3).contains(request.repetitions), (2...(request.case_ids.count * 2 * request.repetitions)).contains(request.call_limit) else { return }
        guard persist(.init(id: request.id, request: request)) else { return }
        await submit()
    }
    func cancel() async {
        guard !isWorking, pending == nil, let record, record.isActive else { return }
        guard persist(.init(id: record.id, request: nil)) else { return }
        await submit()
    }
    func retry() async { if canRetry { await submit() } }
    private func submit() async {
        guard let service, let pending, !isWorking else { return }
        isWorking = true; error = nil; canRetry = false
        defer { isWorking = false }
        do {
            if let request = pending.request { try accept(try await service.startExperimentJob(request)) }
            else { try accept(try await service.cancelExperimentJob(id: pending.id)) }
        } catch { handle(error, submitted: true) }
    }
    func refresh() async {
        guard let service, !isWorking, let id = pending?.id ?? record?.id ?? selectedID else { return }
        isWorking = true; error = nil
        defer { isWorking = false }
        do { try accept(try await service.experimentJob(id: id)); checkedAt = .now }
        catch { handle(error) }
    }
    func select(_ id: String) async {
        guard pending == nil, !isWorking else { return }
        selectedID = id; record = nil; defaults.set(id, forKey: selectionKey); await refresh()
    }
    func review(_ value: LabJobReview) async {
        guard let service, let record, !record.isActive, pending == nil, !isWorking else { return }
        isWorking = true; error = nil
        defer { isWorking = false }
        do { try accept(try await service.reviewExperimentJob(id: record.id, value: value)) }
        catch { handle(error) }
    }
    private func persist(_ value: Pending) -> Bool {
        guard let data = try? JSONEncoder().encode(value) else { return false }
        defaults.set(data, forKey: recoveryKey)
        guard defaults.data(forKey: recoveryKey) == data else {
            error = "The batch request could not be saved for recovery. No request was sent."; return false
        }
        pending = value; return true
    }
    private func clearPending() { pending = nil; canRetry = false; defaults.removeObject(forKey: recoveryKey) }
    private func handle(_ error: Error, submitted: Bool = false) {
        if let failure = error as? TalentSignalLabClientError, case let .backend(status, _, _) = failure {
            if status == 404, pending?.request != nil, !submitted { canRetry = true }
            if status == 410 || (submitted && [400, 409, 422].contains(status)) { clearPending() }
            if status == 410 || (status == 404 && pending == nil) {
                selectedID = nil; record = nil; defaults.removeObject(forKey: selectionKey)
            }
        }
        self.error = error.localizedDescription
    }
    private func accept(_ value: LabJobRecord) throws {
        let plan = value.definition
        let tasks = ["relationship_text", "relationship_image", "unscoped_chat"]
        let expectedTools = plan.task == "unscoped_chat" ? ["contact_workspace"] : []
        guard value.definition_hash.count == 64, tasks.contains(plan.task), plan.business_write_count == 0,
              plan.tool_access == expectedTools, plan.cases.allSatisfy({ ($0.task ?? "relationship_text") == plan.task }),
              plan.max_output_tokens_per_call == 1600, (1...3).contains(plan.repetitions),
              (2...120).contains(plan.call_limit),
              (1...20).contains(plan.cases.count), plan.configurations.count == 2,
              value.attempts.count == plan.cases.count * 2 * plan.repetitions,
              (0...plan.call_limit).contains(value.calls_reserved),
              value.calls_reserved == value.attempts.filter({ $0.started_at != nil }).count,
              Set(value.attempts.map(\.id)).count == value.attempts.count,
              Set(value.attempts.map { "\($0.case_id)|\($0.configuration_index)|\($0.repetition)" }).count == value.attempts.count,
              value.attempts.enumerated().allSatisfy({ index, attempt in
                  guard (0...1).contains(attempt.configuration_index), (1...plan.repetitions).contains(attempt.repetition) else { return false }
                  let configuration = plan.configurations[attempt.configuration_index]
                  let completedConfigurationIsValid: Bool
                  if attempt.status != "completed" { completedConfigurationIsValid = true }
                  else if attempt.execution == "local_only" {
                      completedConfigurationIsValid = attempt.actual_model == nil && attempt.actual_prompt_revision == nil
                          && attempt.remote_requests_started == 0
                  } else {
                      completedConfigurationIsValid = attempt.actual_model == attempt.requested_model
                          && (attempt.actual_prompt_revision == nil || attempt.actual_prompt_revision == attempt.prompt_revision)
                  }
                  return attempt.ordinal == index && plan.cases.contains(where: { $0.id == attempt.case_id })
                      && attempt.requested_model == configuration.model && attempt.prompt_revision == configuration.prompt_revision
                      && ["pending", "dispatching", "completed", "failed", "cancelled", "unknown"].contains(attempt.status)
                      && completedConfigurationIsValid
              }), ["queued", "running", "cancelling", "cancelled", "completed", "partial", "failed", "unknown"].contains(value.status),
              value.status != "completed" || value.attempts.allSatisfy({ $0.status == "completed" }),
              value.isActive || !value.attempts.contains(where: { ["pending", "dispatching"].contains($0.status) }),
              pending == nil || pending?.id == value.id,
              record?.id != value.id || record?.definition_hash == value.definition_hash else { throw TalentSignalLabClientError.invalidResponse }
        if let request = pending?.request {
            guard plan.task == (request.task ?? "relationship_text"), plan.cases.map(\.id) == request.case_ids, plan.repetitions == request.repetitions,
                  plan.call_limit == request.call_limit,
                  plan.regression_source == request.regression_source,
                  zip(plan.configurations, request.configurations).allSatisfy({ $0.model == $1.model && $0.prompt_preset == $1.prompt_preset }) else {
                throw TalentSignalLabClientError.invalidResponse
            }
        }
        record = value; selectedID = value.id; defaults.set(value.id, forKey: selectionKey); checkedAt = .now
        if pending?.request != nil || value.cancel_requested_at != nil || !value.isActive { clearPending() }
        else if pending != nil { canRetry = true }
    }
}
