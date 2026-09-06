import CryptoKit
import Foundation

@MainActor
final class LabFeatureOverrideStore: ObservableObject {
    struct Pending: Codable {
        let sessionScope: String
        let id: String
        let start: LabFeatureOverrideRequest?
    }

    @Published private(set) var configuration: LabFeatureConfiguration?
    @Published private(set) var pending: Pending?
    @Published private(set) var receipt: LabFeatureOverride?
    @Published private(set) var isWorking = false
    @Published private(set) var canRetry = false
    @Published private(set) var error: String?
    @Published private(set) var checkedAt: Date?
    let service: (any LabFeatureOverrideServing)?
    private let defaults: UserDefaults
    private let recoveryKey: String

    init(service: (any LabFeatureOverrideServing)?, scope: String, defaults: UserDefaults = .standard) {
        self.service = service
        self.defaults = defaults
        recoveryKey = "talent-signal.lab.feature-override." + SHA256.hex(scope)
        if let data = defaults.data(forKey: recoveryKey) {
            pending = try? JSONDecoder().decode(Pending.self, from: data)
        }
    }

    func active(_ featureID: String) -> LabFeatureOverride? {
        configuration?.overrides.first { $0.feature_id == featureID && $0.status == "active" }
    }

    func load() async {
        guard let service, !isWorking else { return }
        isWorking = true; error = nil
        defer { isWorking = false }
        do {
            try accept(try await service.loadFeatureConfiguration())
            guard let pending else { return }
            guard pending.sessionScope == configuration?.session_scope_id else {
                clearPending()
                error = "A previous sign-in's pending feature change was not applied to this session."
                return
            }
            do {
                let value = try await service.featureOverride(id: pending.id)
                try validate(value)
                receipt = value
                if pending.start != nil || value.status != "active" { clearPending() }
                else { canRetry = true }
            } catch let failure as TalentSignalLabClientError {
                if case .backend(404, _, _) = failure {
                    if pending.start == nil { clearPending() } else { canRetry = true }
                }
                throw failure
            }
        } catch { self.error = error.localizedDescription }
    }

    func start(featureID: String, value: String, minutes: Int) async {
        guard pending == nil, !isWorking, let configuration, configuration.enabled,
              [5, 15, 30, 60].contains(minutes),
              let feature = configuration.features.first(where: { $0.id == featureID }),
              feature.allowed_values.contains(value), value != feature.server_value else { return }
        let request = LabFeatureOverrideRequest(id: UUID().uuidString.lowercased(), feature_id: featureID,
            value: value, duration_minutes: minutes, replaces_override_id: active(featureID)?.id)
        guard savePending(.init(sessionScope: configuration.session_scope_id, id: request.id, start: request)) else { return }
        await submit()
    }

    func stop(_ value: LabFeatureOverride) async {
        guard pending == nil, !isWorking, value.session_scope_id == configuration?.session_scope_id else { return }
        guard savePending(.init(sessionScope: value.session_scope_id, id: value.id, start: nil)) else { return }
        await submit()
    }

    func retry() async { if canRetry { await submit() } }

    private func submit() async {
        guard let service, let pending, !isWorking else { return }
        isWorking = true; canRetry = false; error = nil
        defer { isWorking = false }
        do {
            let value: LabFeatureOverride
            if let start = pending.start {
                value = try await service.startFeatureOverride(start)
            } else {
                value = try await service.stopFeatureOverride(id: pending.id)
            }
            try validate(value)
            if pending.start == nil, value.status == "active" { throw TalentSignalLabClientError.invalidResponse }
            receipt = value
            clearPending()
            try accept(try await service.loadFeatureConfiguration())
        } catch let failure as TalentSignalLabClientError {
            if case let .backend(status, _, _) = failure, [400, 409, 422].contains(status) { clearPending() }
            error = failure.localizedDescription
        } catch { self.error = error.localizedDescription }
    }

    private func savePending(_ value: Pending) -> Bool {
        guard let data = try? JSONEncoder().encode(value) else { return false }
        defaults.set(data, forKey: recoveryKey)
        guard defaults.data(forKey: recoveryKey) == data else {
            error = "The feature change could not be saved for recovery. No setting changed."
            return false
        }
        pending = value
        return true
    }

    private func clearPending() {
        pending = nil; canRetry = false; defaults.removeObject(forKey: recoveryKey)
    }

    private func validate(_ value: LabFeatureOverride) throws {
        guard value.session_scope_id == configuration?.session_scope_id,
              value.scope == "this_authenticated_session",
              value.feature_id == "relationship_evidence_preview",
              ["source_only", "inline_excerpt"].contains(value.server_value),
              ["source_only", "inline_excerpt"].contains(value.override_value),
              value.effective_value == value.override_value,
              ["active", "stopped", "expired"].contains(value.status),
              !value.catalog_revision.isEmpty, !value.definition_revision.isEmpty,
              pending == nil || pending?.id == value.id else { throw TalentSignalLabClientError.invalidResponse }
        if let request = pending?.start {
            guard value.feature_id == request.feature_id, value.override_value == request.value else {
                throw TalentSignalLabClientError.invalidResponse
            }
        }
    }

    private func accept(_ value: LabFeatureConfiguration) throws {
        let active = value.overrides.filter { $0.status == "active" }
        guard value.contract_version == TalentSignalAPIContract.version,
              !value.session_scope_id.isEmpty, !value.catalog_revision.isEmpty,
              value.features.count == 1,
              value.features.allSatisfy({ feature in
                  feature.id == "relationship_evidence_preview"
                    && feature.server_value == "source_only"
                    && Set(feature.allowed_values) == Set(["source_only", "inline_excerpt"])
                    && feature.dependency == "relationship_text_citations"
                    && !feature.definition_revision.isEmpty && !feature.safety_boundary.isEmpty
              }),
              active.count <= 1,
              value.overrides.allSatisfy({ item in
                  item.session_scope_id == value.session_scope_id
                    && item.scope == "this_authenticated_session"
                    && ["active", "stopped", "expired"].contains(item.status)
                    && (item.status != "active" || item.catalog_revision == value.catalog_revision)
                    && ((item.status == "active" && item.stop_reason == nil)
                        || (item.status == "expired" && item.stop_reason == "expired")
                        || (item.status == "stopped" && ["manual", "replaced", "configuration_changed"].contains(item.stop_reason ?? "")))
              }) else { throw TalentSignalLabClientError.invalidResponse }
        configuration = value; checkedAt = .now
    }
}
