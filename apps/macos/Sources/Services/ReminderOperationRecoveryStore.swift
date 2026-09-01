import CryptoKit
import Foundation

enum ReminderOperationRecoveryStage: String, Codable, Sendable {
    case proposalPrepared = "proposal_prepared"
    case executionPending = "execution_pending"
    case outcomeUnknown = "outcome_unknown"
    case verified
    case removalPending = "removal_pending"
    case removalUnknown = "removal_unknown"
}

struct ReminderOperationRecovery: Codable, Equatable, Sendable {
    static let retentionLifetime: TimeInterval = 30 * 24 * 60 * 60

    let sourceItemID: UUID
    let sourceDigest: String
    let title: String
    let dueAt: Date
    let timeZoneIdentifier: String
    let destinationIdentifier: String
    let destinationTitle: String
    let stage: ReminderOperationRecoveryStage
    let receipt: FollowUpReminderReceipt?
    let updatedAt: Date
    let expiresAt: Date

    init(
        proposal: FollowUpReminderProposal,
        stage: ReminderOperationRecoveryStage,
        receipt: FollowUpReminderReceipt? = nil,
        now: Date = Date()
    ) {
        sourceItemID = proposal.sourceItemID
        sourceDigest = proposal.sourceDigest
        title = proposal.title
        dueAt = proposal.dueAt
        timeZoneIdentifier = proposal.timeZoneIdentifier
        destinationIdentifier = proposal.destination.identifier
        destinationTitle = proposal.destination.title
        self.stage = stage
        self.receipt = receipt
        updatedAt = now
        expiresAt = now.addingTimeInterval(Self.retentionLifetime)
    }

    var proposal: FollowUpReminderProposal {
        FollowUpReminderProposal.make(
            sourceItemID: sourceItemID,
            sourceDigest: sourceDigest,
            title: title,
            dueAt: dueAt,
            timeZone: TimeZone(identifier: timeZoneIdentifier) ?? .current,
            evidenceQuote: "",
            destination: .init(identifier: destinationIdentifier, title: destinationTitle)
        )
    }

    var isStructurallyValid: Bool {
        guard !sourceDigest.isEmpty,
              !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !timeZoneIdentifier.isEmpty,
              !destinationIdentifier.isEmpty,
              !destinationTitle.isEmpty,
              expiresAt > updatedAt else {
            return false
        }
        switch stage {
        case .verified, .removalPending, .removalUnknown:
            guard let receipt else { return false }
            return receipt.idempotencyKey == proposal.idempotencyKey &&
                receipt.destinationIdentifier == destinationIdentifier &&
                receipt.title == title &&
                abs(receipt.dueAt.timeIntervalSince(dueAt)) < 60
        case .proposalPrepared, .executionPending, .outcomeUnknown:
            return receipt == nil
        }
    }
}

protocol ReminderOperationRecoveryPersisting: Sendable {
    func load(accountID: String, now: Date) throws -> ReminderOperationRecovery?
    func save(_ recovery: ReminderOperationRecovery, accountID: String) throws
    func clear(accountID: String) throws -> Bool
}

struct NullReminderOperationRecoveryStore: ReminderOperationRecoveryPersisting {
    func load(accountID: String, now: Date) throws -> ReminderOperationRecovery? { nil }
    func save(_ recovery: ReminderOperationRecovery, accountID: String) throws { }
    func clear(accountID: String) throws -> Bool { false }
}

final class SecureReminderOperationRecoveryStore: ReminderOperationRecoveryPersisting, @unchecked Sendable {
    static let shared = SecureReminderOperationRecoveryStore()

    private let directory: URL
    private let keyProvider: any CapsuleKeyProviding
    private let fileManager: FileManager

    init(
        directory: URL? = nil,
        keyProvider: any CapsuleKeyProviding = KeychainCapsuleKeyProvider(),
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager
        self.keyProvider = keyProvider
        self.directory = directory ?? fileManager
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "TalentSignal/ReminderRecovery", directoryHint: .isDirectory)
    }

    func load(accountID: String, now: Date = Date()) throws -> ReminderOperationRecovery? {
        let file = fileURL(accountID: accountID)
        guard fileManager.fileExists(atPath: file.path) else { return nil }
        let encrypted = try Data(contentsOf: file)
        let box = try AES.GCM.SealedBox(combined: encrypted)
        let clear = try AES.GCM.open(
            box,
            using: SymmetricKey(data: try keyProvider.key(accountID: accountID))
        )
        let recovery = try JSONDecoder().decode(ReminderOperationRecovery.self, from: clear)
        guard recovery.isStructurallyValid, recovery.expiresAt > now else {
            try fileManager.removeItem(at: file)
            return nil
        }
        return recovery
    }

    func save(_ recovery: ReminderOperationRecovery, accountID: String) throws {
        guard recovery.isStructurallyValid else {
            throw ReminderOperationRecoveryStoreError.invalidRecovery
        }
        try prepareDirectory()
        let clear = try JSONEncoder().encode(recovery)
        let sealed = try AES.GCM.seal(
            clear,
            using: SymmetricKey(data: try keyProvider.key(accountID: accountID))
        )
        guard let combined = sealed.combined else {
            throw ReminderOperationRecoveryStoreError.encryptionFailed
        }
        let file = fileURL(accountID: accountID)
        try combined.write(to: file, options: .atomic)
        try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableFile = file
        try mutableFile.setResourceValues(values)
    }

    func clear(accountID: String) throws -> Bool {
        let file = fileURL(accountID: accountID)
        guard fileManager.fileExists(atPath: file.path) else { return false }
        try fileManager.removeItem(at: file)
        return true
    }

    private func prepareDirectory() throws {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try fileManager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDirectory = directory
        try mutableDirectory.setResourceValues(values)
    }

    private func fileURL(accountID: String) -> URL {
        let digest = SHA256.hash(data: Data(accountID.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return directory.appending(path: "\(digest).reminder-recovery")
    }
}

enum ReminderOperationRecoveryStoreError: LocalizedError {
    case encryptionFailed
    case invalidRecovery

    var errorDescription: String? {
        switch self {
        case .encryptionFailed:
            "Reminder recovery could not be encrypted."
        case .invalidRecovery:
            "Reminder recovery was incomplete and was not saved."
        }
    }
}
