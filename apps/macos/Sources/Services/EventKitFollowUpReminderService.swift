import EventKit
import Foundation

@MainActor
final class PreviewOnlyFollowUpReminderService: FollowUpReminderServing {
    func previewDestination() async -> Result<FollowUpReminderDestination, FollowUpReminderFailure> {
        .failure(.previewOnly)
    }

    func execute(_ proposal: FollowUpReminderProposal) async -> Result<FollowUpReminderReceipt, FollowUpReminderFailure> {
        .failure(.previewOnly)
    }

    func reconcile(_ proposal: FollowUpReminderProposal) async -> Result<FollowUpReminderReceipt, FollowUpReminderFailure> {
        .failure(.previewOnly)
    }

    func remove(_ receipt: FollowUpReminderReceipt) async -> Result<FollowUpReminderRemovalReceipt, FollowUpReminderFailure> {
        .failure(.previewOnly)
    }

    func reconcileRemoval(_ receipt: FollowUpReminderReceipt) async -> Result<FollowUpReminderRemovalReceipt, FollowUpReminderFailure> {
        .failure(.previewOnly)
    }
}

private struct StoredReminderReceipt: Codable {
    enum State: String, Codable {
        case pending
        case verified
    }

    let idempotencyKey: String
    let state: State
    let reminderIdentifier: String?
    let destinationIdentifier: String
    let verifiedAt: Date
}

@MainActor
final class EventKitFollowUpReminderService: FollowUpReminderServing {
    private let eventStore: EKEventStore
    private let defaults: UserDefaults
    private let lifecycleLedger: ReminderLifecycleLedger
    private let receiptKeyPrefix = "talent-signal.macos.follow-up-reminder-receipts.v2"
    private let legacyReceiptKey = "talent-signal.macos.follow-up-reminder-receipts.v1"
    private var recoveryAccountScopeDigest: String

    init(eventStore: EKEventStore = EKEventStore(), defaults: UserDefaults = .standard) {
        self.eventStore = eventStore
        self.defaults = defaults
        self.lifecycleLedger = ReminderLifecycleLedger(defaults: defaults)
        self.recoveryAccountScopeDigest = lifecycleLedger.currentAccountScopeDigest
    }

    func setLocalRecoveryAccount(_ accountID: String) {
        lifecycleLedger.setAccountScope(accountID)
        recoveryAccountScopeDigest = lifecycleLedger.currentAccountScopeDigest
    }

    func clearLocalRecovery() {
        defaults.removeObject(forKey: receiptKey)
        defaults.removeObject(forKey: legacyReceiptKey)
        lifecycleLedger.clearCurrentAccount()
    }

    func previewDestination() async -> Result<FollowUpReminderDestination, FollowUpReminderFailure> {
        do {
            guard try await ensureReminderAccess() else { return .failure(.permissionDenied) }
            guard let calendar = eventStore.defaultCalendarForNewReminders() else {
                return .failure(.noDefaultList)
            }
            return .success(.init(identifier: calendar.calendarIdentifier, title: calendar.title))
        } catch {
            return .failure(.saveFailed(error.localizedDescription))
        }
    }

    func execute(_ proposal: FollowUpReminderProposal) async -> Result<FollowUpReminderReceipt, FollowUpReminderFailure> {
        do {
            guard try await ensureReminderAccess() else { return .failure(.permissionDenied) }
            guard let calendar = eventStore.calendar(withIdentifier: proposal.destination.identifier) else {
                return .failure(.destinationChanged)
            }

            if let stored = storedReceipt(for: proposal.idempotencyKey) {
                if let identifier = stored.reminderIdentifier,
                   let existing = eventStore.calendarItem(withIdentifier: identifier) as? EKReminder {
                    return verifyAndRecord(existing, proposal: proposal, lifecycleState: .reconciled)
                }
                // A prior attempt lost readback. Search only the reviewed
                // destination list for our opaque recovery URL; the normal
                // first-write path never enumerates unrelated reminders.
                if let existing = await findReminder(idempotencyKey: proposal.idempotencyKey, calendars: [calendar]) {
                    return verifyAndRecord(existing, proposal: proposal, lifecycleState: .reconciled)
                }
            }

            let reminder = EKReminder(eventStore: eventStore)
            reminder.calendar = calendar
            reminder.title = proposal.title
            reminder.dueDateComponents = dueComponents(for: proposal)
            reminder.url = recoveryURL(for: proposal.idempotencyKey)
            guard recordPending(proposal) else {
                return .failure(.recoveryUnavailable)
            }

            do {
                try eventStore.save(reminder, commit: true)
            } catch {
                // EventKit errors can arrive after a provider accepted a write.
                // Callers must reconcile instead of blindly creating a duplicate.
                lifecycleLedger.append(operationKey: proposal.idempotencyKey, state: .outcomeUnknown)
                return .failure(.saveFailed(error.localizedDescription))
            }

            var readback = eventStore.calendarItem(withIdentifier: reminder.calendarItemIdentifier) as? EKReminder
            if readback == nil {
                readback = await findReminder(idempotencyKey: proposal.idempotencyKey, calendars: [calendar])
            }
            guard let readback else {
                lifecycleLedger.append(operationKey: proposal.idempotencyKey, state: .outcomeUnknown)
                return .failure(.readbackMissing)
            }
            return verifyAndRecord(readback, proposal: proposal, lifecycleState: .verified)
        } catch {
            return .failure(.saveFailed(error.localizedDescription))
        }
    }

    func reconcile(_ proposal: FollowUpReminderProposal) async -> Result<FollowUpReminderReceipt, FollowUpReminderFailure> {
        do {
            guard try await ensureReminderAccess() else { return .failure(.permissionDenied) }
            guard let calendar = eventStore.calendar(withIdentifier: proposal.destination.identifier) else {
                return .failure(.destinationChanged)
            }
            if let stored = storedReceipt(for: proposal.idempotencyKey),
               let identifier = stored.reminderIdentifier,
               let reminder = eventStore.calendarItem(withIdentifier: identifier) as? EKReminder {
                return verifyAndRecord(reminder, proposal: proposal, lifecycleState: .reconciled)
            }
            guard let reminder = await findReminder(idempotencyKey: proposal.idempotencyKey, calendars: [calendar]) else {
                lifecycleLedger.append(operationKey: proposal.idempotencyKey, state: .reconcileNotFound)
                return .failure(.readbackMissing)
            }
            return verifyAndRecord(reminder, proposal: proposal, lifecycleState: .reconciled)
        } catch {
            return .failure(.saveFailed(error.localizedDescription))
        }
    }

    func remove(_ receipt: FollowUpReminderReceipt) async -> Result<FollowUpReminderRemovalReceipt, FollowUpReminderFailure> {
        do {
            lifecycleLedger.append(operationKey: receipt.idempotencyKey, state: .removalRequested)
            guard try await ensureReminderAccess() else { return .failure(.permissionDenied) }
            guard let calendar = eventStore.calendar(withIdentifier: receipt.destinationIdentifier) else {
                return .failure(.destinationChanged)
            }
            var reminder = eventStore.calendarItem(withIdentifier: receipt.reminderIdentifier) as? EKReminder
            if reminder == nil {
                reminder = await findReminder(idempotencyKey: receipt.idempotencyKey, calendars: [calendar])
            }
            guard let reminder else {
                clearStoredReceipt(idempotencyKey: receipt.idempotencyKey)
                lifecycleLedger.append(operationKey: receipt.idempotencyKey, state: .removed)
                return .success(removalReceipt(from: receipt, wasAlreadyAbsent: true))
            }
            guard reminder.calendar.calendarIdentifier == receipt.destinationIdentifier,
                  reminder.url == recoveryURL(for: receipt.idempotencyKey) else {
                return .failure(.readbackMismatch)
            }
            do {
                try eventStore.remove(reminder, commit: true)
            } catch {
                lifecycleLedger.append(operationKey: receipt.idempotencyKey, state: .removalUnknown)
                return .failure(.saveFailed(error.localizedDescription))
            }
            return await reconcileRemoval(receipt)
        } catch {
            return .failure(.saveFailed(error.localizedDescription))
        }
    }

    func reconcileRemoval(_ receipt: FollowUpReminderReceipt) async -> Result<FollowUpReminderRemovalReceipt, FollowUpReminderFailure> {
        do {
            guard try await ensureReminderAccess() else { return .failure(.permissionDenied) }
            guard let calendar = eventStore.calendar(withIdentifier: receipt.destinationIdentifier) else {
                return .failure(.destinationChanged)
            }
            if eventStore.calendarItem(withIdentifier: receipt.reminderIdentifier) is EKReminder {
                lifecycleLedger.append(operationKey: receipt.idempotencyKey, state: .removalStillPresent)
                return .failure(.readbackMismatch)
            }
            if await findReminder(idempotencyKey: receipt.idempotencyKey, calendars: [calendar]) != nil {
                lifecycleLedger.append(operationKey: receipt.idempotencyKey, state: .removalStillPresent)
                return .failure(.readbackMismatch)
            }
            clearStoredReceipt(idempotencyKey: receipt.idempotencyKey)
            lifecycleLedger.append(operationKey: receipt.idempotencyKey, state: .removed)
            return .success(removalReceipt(from: receipt, wasAlreadyAbsent: false))
        } catch {
            return .failure(.saveFailed(error.localizedDescription))
        }
    }

    private func ensureReminderAccess() async throws -> Bool {
        switch EKEventStore.authorizationStatus(for: .reminder) {
        case .fullAccess, .authorized:
            return true
        case .notDetermined:
            return try await eventStore.requestFullAccessToReminders()
        case .denied, .restricted, .writeOnly:
            return false
        @unknown default:
            return false
        }
    }

    private func findReminder(idempotencyKey: String, calendars: [EKCalendar]) async -> EKReminder? {
        let expectedURL = recoveryURL(for: idempotencyKey)
        let predicate = eventStore.predicateForReminders(in: calendars)
        return await withCheckedContinuation { continuation in
            eventStore.fetchReminders(matching: predicate) { reminders in
                continuation.resume(returning: reminders?.first(where: { $0.url == expectedURL }))
            }
        }
    }

    private func verifyAndRecord(
        _ reminder: EKReminder,
        proposal: FollowUpReminderProposal,
        lifecycleState: ReminderLifecycleEvent.State
    ) -> Result<FollowUpReminderReceipt, FollowUpReminderFailure> {
        guard reminder.title == proposal.title,
              reminder.calendar.calendarIdentifier == proposal.destination.identifier,
              reminder.url == recoveryURL(for: proposal.idempotencyKey),
              let dueAt = date(from: reminder.dueDateComponents, timeZoneIdentifier: proposal.timeZoneIdentifier),
              abs(dueAt.timeIntervalSince(proposal.dueAt)) < 60,
              !reminder.calendarItemIdentifier.isEmpty else {
            lifecycleLedger.append(operationKey: proposal.idempotencyKey, state: .outcomeUnknown)
            return .failure(.readbackMismatch)
        }
        let receipt = FollowUpReminderReceipt(
            idempotencyKey: proposal.idempotencyKey,
            reminderIdentifier: reminder.calendarItemIdentifier,
            title: reminder.title,
            dueAt: dueAt,
            destinationIdentifier: reminder.calendar.calendarIdentifier,
            destinationTitle: reminder.calendar.title,
            verifiedAt: Date()
        )
        record(receipt)
        lifecycleLedger.append(operationKey: proposal.idempotencyKey, state: lifecycleState)
        return .success(receipt)
    }

    private func dueComponents(for proposal: FollowUpReminderProposal) -> DateComponents {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: proposal.timeZoneIdentifier) ?? .current
        var components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: proposal.dueAt)
        components.timeZone = calendar.timeZone
        return components
    }

    private func date(from components: DateComponents?, timeZoneIdentifier: String) -> Date? {
        guard var components else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZoneIdentifier) ?? .current
        components.timeZone = calendar.timeZone
        return calendar.date(from: components)
    }

    private func recoveryURL(for idempotencyKey: String) -> URL? {
        URL(string: "talentsignal://follow-up-reminder/\(idempotencyKey)")
    }

    private func storedReceipt(for idempotencyKey: String) -> StoredReminderReceipt? {
        guard let data = defaults.data(forKey: receiptKey),
              let receipts = try? JSONDecoder().decode([String: StoredReminderReceipt].self, from: data) else {
            return nil
        }
        return receipts[idempotencyKey]
    }

    private func record(_ receipt: FollowUpReminderReceipt) {
        var receipts: [String: StoredReminderReceipt] = [:]
        if let data = defaults.data(forKey: receiptKey),
           let decoded = try? JSONDecoder().decode([String: StoredReminderReceipt].self, from: data) {
            receipts = decoded
        }
        // Persist only an opaque recovery reference. The reminder title, due
        // date, evidence, person, and list title remain in EventKit readback
        // and are never copied into UserDefaults.
        receipts[receipt.idempotencyKey] = StoredReminderReceipt(
            idempotencyKey: receipt.idempotencyKey,
            state: .verified,
            reminderIdentifier: receipt.reminderIdentifier,
            destinationIdentifier: receipt.destinationIdentifier,
            verifiedAt: receipt.verifiedAt
        )
        if let encoded = try? JSONEncoder().encode(receipts) {
            defaults.set(encoded, forKey: receiptKey)
        }
    }

    private func recordPending(_ proposal: FollowUpReminderProposal) -> Bool {
        var receipts: [String: StoredReminderReceipt] = [:]
        if let data = defaults.data(forKey: receiptKey),
           let decoded = try? JSONDecoder().decode([String: StoredReminderReceipt].self, from: data) {
            receipts = decoded
        }
        receipts[proposal.idempotencyKey] = StoredReminderReceipt(
            idempotencyKey: proposal.idempotencyKey,
            state: .pending,
            reminderIdentifier: nil,
            destinationIdentifier: proposal.destination.identifier,
            verifiedAt: Date()
        )
        if let encoded = try? JSONEncoder().encode(receipts) {
            defaults.set(encoded, forKey: receiptKey)
            let verified = storedReceipt(for: proposal.idempotencyKey)?.state == .pending
            if verified {
                lifecycleLedger.append(operationKey: proposal.idempotencyKey, state: .pending)
            }
            return verified
        }
        return false
    }

    private func removalReceipt(
        from receipt: FollowUpReminderReceipt,
        wasAlreadyAbsent: Bool
    ) -> FollowUpReminderRemovalReceipt {
        FollowUpReminderRemovalReceipt(
            idempotencyKey: receipt.idempotencyKey,
            reminderIdentifier: receipt.reminderIdentifier,
            destinationTitle: receipt.destinationTitle,
            removedAt: Date(),
            wasAlreadyAbsent: wasAlreadyAbsent
        )
    }

    private func clearStoredReceipt(idempotencyKey: String) {
        guard let data = defaults.data(forKey: receiptKey),
              var receipts = try? JSONDecoder().decode([String: StoredReminderReceipt].self, from: data) else {
            return
        }
        receipts.removeValue(forKey: idempotencyKey)
        if let encoded = try? JSONEncoder().encode(receipts) {
            defaults.set(encoded, forKey: receiptKey)
        }
    }

    private var receiptKey: String {
        "\(receiptKeyPrefix).\(recoveryAccountScopeDigest)"
    }
}
