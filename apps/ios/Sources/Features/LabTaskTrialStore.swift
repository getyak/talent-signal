import CryptoKit
import Foundation

@MainActor
final class LabTaskTrialStore: ObservableObject {
    struct Pending: Codable {
        let sessionScope: String
        let id: String
        let start: LabTaskTrialRequest?
    }
    @Published private(set) var configuration: LabTaskConfiguration?
    @Published private(set) var pending: Pending?
    @Published private(set) var receipt: LabTaskTrial?
    @Published private(set) var isWorking = false
    @Published private(set) var canRetry = false
    @Published private(set) var error: String?
    @Published private(set) var checkedAt: Date?
    let service: (any LabTaskTrialServing)?
    private let defaults: UserDefaults
    private let recoveryKey: String

    init(service: (any LabTaskTrialServing)?, scope: String, defaults: UserDefaults = .standard) {
        self.service = service; self.defaults = defaults
        recoveryKey = "talent-signal.lab.task-trial." + SHA256.hex(scope)
        if let data = defaults.data(forKey: recoveryKey) { pending = try? JSONDecoder().decode(Pending.self, from: data) }
    }
    func active(_ task: String) -> LabTaskTrial? { configuration?.trials.first { $0.task == task && $0.status == "active" } }
    func load() async {
        guard let service, !isWorking else { return }
        isWorking = true; error = nil
        defer { isWorking = false }
        do {
            try acceptConfiguration(try await service.loadTaskConfiguration())
            if let pending {
                if pending.sessionScope != configuration?.session_scope_id {
                    clearPending()
                    error = "A previous sign-in's pending trial was not applied to this session."
                } else {
                    do {
                        let record = try await service.taskTrial(id: pending.id)
                        try validate(record)
                        receipt = record
                        if pending.start != nil || record.status != "active" { clearPending() }
                        else { canRetry = true }
                    } catch let failure as TalentSignalLabClientError {
                        if case .backend(404, _, _) = failure {
                            if pending.start == nil { clearPending() }
                            else { canRetry = true }
                        }
                        throw failure
                    }
                }
            }
        } catch { self.error = error.localizedDescription }
    }
    func start(task: String, model: String, preset: String, minutes: Int,
               question: String, minimumSamples: Int, stopAfterAdverse: Int) async {
        let trimmedQuestion = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard pending == nil, !isWorking, let configuration, configuration.enabled,
              [5, 15, 30, 60].contains(minutes),
              (1...240).contains(trimmedQuestion.count), [3, 5, 10, 20].contains(minimumSamples),
              [1, 2, 3].contains(stopAfterAdverse),
              configuration.tasks.first(where: { $0.id == task })?.models.first(where: { $0.id == model })?.prompt_presets.contains(preset) == true else { return }
        let plan = LabTrialObservationPlan(question: trimmedQuestion,
            success_metric: "product_adoption", guardrail_metric: "fallback_or_product_failure",
            minimum_samples: minimumSamples, stop_after_adverse_outcomes: stopAfterAdverse,
            sample_unit: "unique_product_request", assignment_mode: "current_authenticated_session_opt_in",
            rollback: "task_default", window_minutes: minutes)
        let request = LabTaskTrialRequest(id: UUID().uuidString.lowercased(), task: task, model: model,
            prompt_preset: preset, duration_minutes: minutes, replaces_trial_id: active(task)?.id,
            observation_plan: plan)
        guard savePending(.init(sessionScope: configuration.session_scope_id, id: request.id, start: request)) else { return }
        await submit()
    }
    func stop(_ trial: LabTaskTrial) async {
        guard pending == nil, !isWorking, trial.session_scope_id == configuration?.session_scope_id else { return }
        guard savePending(.init(sessionScope: trial.session_scope_id, id: trial.id, start: nil)) else { return }
        await submit()
    }
    func retry() async { if canRetry { await submit() } }

    private func submit() async {
        guard let service, let pending, !isWorking else { return }
        isWorking = true; canRetry = false; error = nil
        defer { isWorking = false }
        do {
            let value: LabTaskTrial
            if let start = pending.start { value = try await service.startTaskTrial(start) }
            else { value = try await service.stopTaskTrial(id: pending.id) }
            try validate(value)
            if pending.start == nil, value.status == "active" { throw TalentSignalLabClientError.invalidResponse }
            receipt = value
            clearPending()
            try acceptConfiguration(try await service.loadTaskConfiguration())
        } catch let failure as TalentSignalLabClientError {
            if case let .backend(status, _, _) = failure, [400, 409, 422].contains(status) { clearPending() }
            error = failure.localizedDescription
        } catch { self.error = error.localizedDescription }
    }
    private func savePending(_ value: Pending) -> Bool {
        guard let data = try? JSONEncoder().encode(value) else { return false }
        defaults.set(data, forKey: recoveryKey)
        guard defaults.data(forKey: recoveryKey) == data else {
            error = "The trial could not be saved for recovery. No configuration changed."
            return false
        }
        pending = value; return true
    }
    private func clearPending() {
        pending = nil; canRetry = false; defaults.removeObject(forKey: recoveryKey)
    }
    private func validate(_ trial: LabTaskTrial) throws {
        guard trial.scope == "this_authenticated_session", !trial.online_assignment,
              trial.session_scope_id == configuration?.session_scope_id,
              ["active", "stopped", "expired"].contains(trial.status), !trial.prompt_revision.isEmpty,
              trial.observation_plan.assignment_mode == "current_authenticated_session_opt_in",
              trial.observation_plan.sample_unit == "unique_product_request",
              trial.observation_plan.success_metric == "product_adoption",
              trial.observation_plan.guardrail_metric == "fallback_or_product_failure",
              trial.observation_plan.rollback == "task_default",
              [5, 15, 30, 60].contains(trial.observation_plan.window_minutes),
              [3, 5, 10, 20].contains(trial.observation_plan.minimum_samples),
              [1, 2, 3].contains(trial.observation_plan.stop_after_adverse_outcomes),
              !trial.observation_plan.question.isEmpty, trial.observation_plan.question.count <= 240,
              pending == nil || trial.id == pending?.id else { throw TalentSignalLabClientError.invalidResponse }
        if let request = pending?.start {
            guard trial.task == request.task, trial.model == request.model, trial.prompt_preset == request.prompt_preset,
                  trial.observation_plan == request.observation_plan else {
                throw TalentSignalLabClientError.invalidResponse
            }
        }
    }
    private func acceptConfiguration(_ value: LabTaskConfiguration) throws {
        guard value.contract_version == TalentSignalAPIContract.version, !value.session_scope_id.isEmpty,
              value.trials.allSatisfy({ trial in
                  trial.session_scope_id == value.session_scope_id && trial.scope == "this_authenticated_session"
                    && !trial.online_assignment && ["active", "stopped", "expired"].contains(trial.status)
                    && !trial.prompt_revision.isEmpty
                    && trial.observation_plan.assignment_mode == "current_authenticated_session_opt_in"
                    && trial.observation_plan.sample_unit == "unique_product_request"
                    && trial.observation_plan.success_metric == "product_adoption"
                    && trial.observation_plan.guardrail_metric == "fallback_or_product_failure"
                    && trial.observation_plan.rollback == "task_default"
                    && [5, 15, 30, 60].contains(trial.observation_plan.window_minutes)
                    && [3, 5, 10, 20].contains(trial.observation_plan.minimum_samples)
                    && [1, 2, 3].contains(trial.observation_plan.stop_after_adverse_outcomes)
                    && !trial.observation_plan.question.isEmpty && trial.observation_plan.question.count <= 240
                    && ((trial.status == "active" && trial.stop_reason == nil)
                        || (trial.status == "expired" && trial.stop_reason == "expired")
                        || (trial.status == "stopped" && ["manual", "replaced", "guardrail", "unknown"].contains(trial.stop_reason ?? "")))
              }),
              Set(value.trials.filter({ $0.status == "active" }).map(\.task)).count == value.trials.filter({ $0.status == "active" }).count,
              Set(value.summaries.map(\.trial_id)).isSubset(of: Set(value.trials.map(\.id))),
              value.summaries.allSatisfy({ !$0.causal_claim_allowed && $0.samples == $0.accepted + $0.fallback + $0.product_failed + $0.unverified }) else {
            throw TalentSignalLabClientError.invalidResponse
        }
        configuration = value; checkedAt = .now
    }
}
