import Foundation
import XCTest
@testable import TalentSignalMac

final class ReminderOperationRecoveryStoreTests: XCTestCase {
    private var directory: URL!
    private var keys: ReminderRecoveryTestKeyProvider!
    private var store: SecureReminderOperationRecoveryStore!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-reminder-recovery-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
        keys = ReminderRecoveryTestKeyProvider()
        store = SecureReminderOperationRecoveryStore(directory: directory, keyProvider: keys)
    }

    override func tearDownWithError() throws {
        if FileManager.default.fileExists(atPath: directory.path) {
            try FileManager.default.removeItem(at: directory)
        }
    }

    func testRecoveryIsEncryptedAccountScopedAndExpires() throws {
        let now = Date(timeIntervalSince1970: 1_788_134_400)
        let proposal = makeProposal(now: now)
        let recovery = ReminderOperationRecovery(
            proposal: proposal,
            stage: .outcomeUnknown,
            now: now
        )

        try store.save(recovery, accountID: "account-a")

        XCTAssertEqual(try store.load(accountID: "account-a", now: now.addingTimeInterval(60)), recovery)
        XCTAssertNil(try store.load(accountID: "account-b", now: now.addingTimeInterval(60)))
        XCTAssertNotEqual(keys.keys["account-a"], keys.keys["account-b"])

        let files = try FileManager.default.contentsOfDirectory(atPath: directory.path)
        XCTAssertEqual(files.count, 1)
        let encrypted = try Data(contentsOf: directory.appending(path: try XCTUnwrap(files.first)))
        let raw = String(data: encrypted, encoding: .utf8) ?? ""
        XCTAssertFalse(raw.contains("PRIVATE_REMINDER_TITLE"))
        XCTAssertFalse(raw.contains("PRIVATE_DESTINATION_TITLE"))
        XCTAssertFalse(raw.contains("PRIVATE_SOURCE_DIGEST"))

        XCTAssertNil(try store.load(
            accountID: "account-a",
            now: now.addingTimeInterval(ReminderOperationRecovery.retentionLifetime + 1)
        ))
        XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: directory.path).isEmpty)
    }

    func testVerifiedRecoveryRequiresMatchingReceipt() throws {
        let now = Date(timeIntervalSince1970: 1_788_134_400)
        let proposal = makeProposal(now: now)
        let receipt = FollowUpReminderReceipt(
            idempotencyKey: proposal.idempotencyKey,
            reminderIdentifier: "verified-reminder",
            title: proposal.title,
            dueAt: proposal.dueAt,
            destinationIdentifier: proposal.destination.identifier,
            destinationTitle: proposal.destination.title,
            verifiedAt: now
        )
        let recovery = ReminderOperationRecovery(
            proposal: proposal,
            stage: .verified,
            receipt: receipt,
            now: now
        )

        try store.save(recovery, accountID: "account-a")

        XCTAssertEqual(try store.load(accountID: "account-a", now: now.addingTimeInterval(60)), recovery)
        XCTAssertTrue(try store.clear(accountID: "account-a"))
        XCTAssertNil(try store.load(accountID: "account-a", now: now.addingTimeInterval(60)))
    }

    private func makeProposal(now: Date) -> FollowUpReminderProposal {
        FollowUpReminderProposal.make(
            sourceItemID: UUID(uuidString: "10000000-0000-4000-8000-000000000001")!,
            sourceDigest: "PRIVATE_SOURCE_DIGEST",
            title: "PRIVATE_REMINDER_TITLE",
            dueAt: now.addingTimeInterval(86_400),
            timeZone: TimeZone(identifier: "Asia/Shanghai")!,
            evidenceQuote: "not persisted in recovery",
            destination: .init(identifier: "private-list-id", title: "PRIVATE_DESTINATION_TITLE")
        )
    }
}

private final class ReminderRecoveryTestKeyProvider: CapsuleKeyProviding, @unchecked Sendable {
    var keys: [String: Data] = [:]

    func key(accountID: String) throws -> Data {
        if let existing = keys[accountID] { return existing }
        let generated = Data(repeating: UInt8(keys.count + 1), count: 32)
        keys[accountID] = generated
        return generated
    }

    func deleteKey(accountID: String) throws -> Bool {
        keys.removeValue(forKey: accountID) != nil
    }
}
