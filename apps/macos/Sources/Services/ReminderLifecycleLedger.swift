import CryptoKit
import Foundation

struct ReminderLifecycleEvent: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable {
        case pending
        case verified
        case outcomeUnknown = "outcome_unknown"
        case reconciled
        case reconcileNotFound = "reconcile_not_found"
        case removalRequested = "removal_requested"
        case removalUnknown = "removal_unknown"
        case removalStillPresent = "removal_still_present"
        case removed
    }

    let operationDigest: String
    let state: State
    let recordedAt: Date
}

/// A bounded, content-free local audit trail. The keyspace is partitioned by a
/// one-way account digest; events contain no title, date, destination, person,
/// relationship, evidence, or external object identifier.
@MainActor
final class ReminderLifecycleLedger {
    static let maximumEvents = 100
    static let retentionLifetime: TimeInterval = 30 * 24 * 60 * 60

    private let defaults: UserDefaults
    private let keyPrefix = "talent-signal.macos.follow-up-reminder-lifecycle.v1"
    private var accountScopeDigest = ReminderLifecycleLedger.digest("unbound")

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func setAccountScope(_ accountID: String) {
        accountScopeDigest = Self.digest(accountID.isEmpty ? "unbound" : accountID)
    }

    func append(operationKey: String, state: ReminderLifecycleEvent.State, now: Date = Date()) {
        var retained = events(now: now)
        retained.append(.init(
            operationDigest: Self.digest(operationKey),
            state: state,
            recordedAt: now
        ))
        if retained.count > Self.maximumEvents {
            retained = Array(retained.suffix(Self.maximumEvents))
        }
        if let data = try? JSONEncoder().encode(retained) {
            defaults.set(data, forKey: storageKey)
        }
    }

    func events(now: Date = Date()) -> [ReminderLifecycleEvent] {
        guard let data = defaults.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([ReminderLifecycleEvent].self, from: data) else {
            return []
        }
        let cutoff = now.addingTimeInterval(-Self.retentionLifetime)
        let retained = decoded.filter { $0.recordedAt >= cutoff }
        if retained != decoded, let pruned = try? JSONEncoder().encode(retained) {
            defaults.set(pruned, forKey: storageKey)
        }
        return retained
    }

    func clearCurrentAccount() {
        defaults.removeObject(forKey: storageKey)
    }

    var currentAccountScopeDigest: String { accountScopeDigest }

    private var storageKey: String { "\(keyPrefix).\(accountScopeDigest)" }

    private static func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
