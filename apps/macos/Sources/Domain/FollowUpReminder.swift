import CryptoKit
import Foundation

struct FollowUpReminderDestination: Equatable, Sendable {
    let identifier: String
    let title: String
}

struct FollowUpReminderProposal: Equatable, Sendable {
    let idempotencyKey: String
    let sourceItemID: UUID
    let sourceDigest: String
    let title: String
    let dueAt: Date
    let timeZoneIdentifier: String
    let evidenceQuote: String
    let destination: FollowUpReminderDestination

    static func make(
        sourceItemID: UUID,
        sourceDigest: String,
        title: String,
        dueAt: Date,
        timeZone: TimeZone,
        evidenceQuote: String,
        destination: FollowUpReminderDestination
    ) -> FollowUpReminderProposal {
        let normalizedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let material = [
            sourceItemID.uuidString.lowercased(),
            sourceDigest,
            normalizedTitle,
            String(Int(dueAt.timeIntervalSince1970)),
            timeZone.identifier,
            destination.identifier,
        ].joined(separator: "|")
        let operationDigest = SHA256.hash(data: Data(material.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return FollowUpReminderProposal(
            idempotencyKey: "mac-reminder-\(operationDigest)",
            sourceItemID: sourceItemID,
            sourceDigest: sourceDigest,
            title: normalizedTitle,
            dueAt: dueAt,
            timeZoneIdentifier: timeZone.identifier,
            evidenceQuote: evidenceQuote,
            destination: destination
        )
    }
}

struct FollowUpReminderReceipt: Codable, Equatable, Sendable {
    let idempotencyKey: String
    let reminderIdentifier: String
    let title: String
    let dueAt: Date
    let destinationIdentifier: String
    let destinationTitle: String
    let verifiedAt: Date
}

struct FollowUpReminderRemovalReceipt: Equatable, Sendable {
    let idempotencyKey: String
    let reminderIdentifier: String
    let destinationTitle: String
    let removedAt: Date
    let wasAlreadyAbsent: Bool
}

enum FollowUpReminderFailure: Error, Equatable, Sendable {
    case previewOnly
    case permissionDenied
    case noDefaultList
    case destinationChanged
    case recoveryUnavailable
    case saveFailed(String)
    case readbackMissing
    case readbackMismatch
}

enum ReminderDuplicateActionDecision: Equatable, Sendable {
    case unavailable
    case notRequired
    case unreviewed
    case separateReminderConfirmed
    case useExistingAction
}

@MainActor
protocol FollowUpReminderServing: AnyObject {
    func setLocalRecoveryAccount(_ accountID: String)
    func clearLocalRecovery()
    func previewDestination() async -> Result<FollowUpReminderDestination, FollowUpReminderFailure>
    func execute(_ proposal: FollowUpReminderProposal) async -> Result<FollowUpReminderReceipt, FollowUpReminderFailure>
    func reconcile(_ proposal: FollowUpReminderProposal) async -> Result<FollowUpReminderReceipt, FollowUpReminderFailure>
    func remove(_ receipt: FollowUpReminderReceipt) async -> Result<FollowUpReminderRemovalReceipt, FollowUpReminderFailure>
    func reconcileRemoval(_ receipt: FollowUpReminderReceipt) async -> Result<FollowUpReminderRemovalReceipt, FollowUpReminderFailure>
}

extension FollowUpReminderServing {
    func setLocalRecoveryAccount(_ accountID: String) { }
    func clearLocalRecovery() { }
}

enum FollowUpReminderOperationState: Equatable {
    case notPrepared
    case loadingDestination
    case readyForApproval
    case executing
    case saved(FollowUpReminderReceipt)
    case failed(String)
    case unknown(String)
    case removing(FollowUpReminderReceipt)
    case removed(FollowUpReminderRemovalReceipt)
    case removalFailed(FollowUpReminderReceipt, String)
    case removalUnknown(FollowUpReminderReceipt, String)
}
