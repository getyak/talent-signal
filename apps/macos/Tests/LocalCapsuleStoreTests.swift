import Foundation
import XCTest
@testable import TalentSignalMac

final class LocalCapsuleStoreTests: XCTestCase {
    private var directory: URL!
    private var keys: TestCapsuleKeyProvider!
    private var store: SecureLocalCapsuleStore!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-capsule-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
        keys = TestCapsuleKeyProvider()
        store = SecureLocalCapsuleStore(directory: directory, keyProvider: keys)
    }

    override func tearDownWithError() throws {
        if FileManager.default.fileExists(atPath: directory.path) {
            try FileManager.default.removeItem(at: directory)
        }
    }

    func testEncryptedRecoveryIsAccountPartitionedAndDoesNotSubmitOnLoad() throws {
        let now = Date(timeIntervalSince1970: 1_788_134_400)
        var draft = ContextCapsuleDraft()
        draft.addSelectedText("Reviewed local recovery text", now: now)
        let itemID = try XCTUnwrap(draft.items.first?.id)
        draft.setRetention(id: itemID, value: .twentyFourHours)

        try store.save(draft, accountID: "account-a", now: now)

        let recovered = try store.load(accountID: "account-a", now: now.addingTimeInterval(120))
        let otherAccount = try store.load(accountID: "account-b", now: now.addingTimeInterval(120))
        XCTAssertEqual(recovered.draft.items.map(\.preview), ["Reviewed local recovery text"])
        XCTAssertEqual(recovered.expiredItemCount, 0)
        XCTAssertTrue(otherAccount.draft.items.isEmpty)
        XCTAssertNotEqual(keys.keys["account-a"], keys.keys["account-b"])

        let files = try FileManager.default.contentsOfDirectory(atPath: directory.path)
        XCTAssertEqual(files.count, 1)
        let encrypted = try Data(contentsOf: directory.appending(path: files[0]))
        XCTAssertFalse(String(data: encrypted, encoding: .utf8)?.contains("Reviewed local recovery text") == true)
    }

    func testTTLExpiryDeletesExpiredDerivativeBeforeRecovery() throws {
        let now = Date(timeIntervalSince1970: 1_788_134_400)
        var draft = ContextCapsuleDraft()
        draft.addSelectedText("Expires locally", now: now)
        let itemID = try XCTUnwrap(draft.items.first?.id)
        draft.setRetention(id: itemID, value: .oneHour)
        try store.save(draft, accountID: "account-a", now: now)

        let recovered = try store.load(accountID: "account-a", now: now.addingTimeInterval(3_601))

        XCTAssertTrue(recovered.draft.items.isEmpty)
        XCTAssertEqual(recovered.expiredItemCount, 1)
        XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: directory.path).isEmpty)
    }

    func testSignOutDeletionRemovesEncryptedFileAndAccountKey() throws {
        let now = Date(timeIntervalSince1970: 1_788_134_400)
        var draft = ContextCapsuleDraft()
        draft.addSelectedText("Delete on sign-out", now: now)
        try store.save(draft, accountID: "account-a", now: now)

        let receipt = try store.clear(accountID: "account-a", deleteKey: true)

        XCTAssertTrue(receipt.deletedFile)
        XCTAssertTrue(receipt.deletedKey)
        XCTAssertNil(keys.keys["account-a"])
        XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: directory.path).isEmpty)
    }

    func testPreparedDraftIsEncryptedAccountScopedAndExpiresWithoutDeletingSource() throws {
        let now = Date(timeIntervalSince1970: 1_788_134_400)
        var draft = ContextCapsuleDraft()
        draft.addSelectedText("PRIVATE_SOURCE_SENTINEL", now: now)
        let itemID = try XCTUnwrap(draft.items.first?.id)
        draft.setRetention(id: itemID, value: .twentyFourHours)
        draft.localPreparedDraft = LocalPreparedDraftRecovery(
            sourceItemID: itemID,
            sourceDigest: "opaque-source-digest",
            derivationVersion: ProvisionalFollowUpInsight.compilerVersion,
            subject: "PRIVATE_SUBJECT_SENTINEL",
            body: "PRIVATE_DRAFT_SENTINEL",
            savedAt: now,
            expiresAt: now.addingTimeInterval(3_600)
        )

        try store.save(draft, accountID: "account-a", now: now)

        let recovered = try store.load(accountID: "account-a", now: now.addingTimeInterval(120))
        let otherAccount = try store.load(accountID: "account-b", now: now.addingTimeInterval(120))
        XCTAssertEqual(recovered.draft.localPreparedDraft?.body, "PRIVATE_DRAFT_SENTINEL")
        XCTAssertEqual(
            recovered.draft.localPreparedDraft?.derivationVersion,
            ProvisionalFollowUpInsight.compilerVersion
        )
        XCTAssertNil(otherAccount.draft.localPreparedDraft)

        let files = try FileManager.default.contentsOfDirectory(atPath: directory.path)
        let encrypted = try Data(contentsOf: directory.appending(path: try XCTUnwrap(files.first)))
        let raw = String(data: encrypted, encoding: .utf8) ?? ""
        XCTAssertFalse(raw.contains("PRIVATE_SOURCE_SENTINEL"))
        XCTAssertFalse(raw.contains("PRIVATE_SUBJECT_SENTINEL"))
        XCTAssertFalse(raw.contains("PRIVATE_DRAFT_SENTINEL"))

        let afterDraftExpiry = try store.load(accountID: "account-a", now: now.addingTimeInterval(3_601))
        XCTAssertNil(afterDraftExpiry.draft.localPreparedDraft)
        XCTAssertEqual(afterDraftExpiry.draft.items.map(\.preview), ["PRIVATE_SOURCE_SENTINEL"])
    }

    func testProcessedFileBytesAndDerivativeAreEncryptedAndExpireTogether() throws {
        let now = Date(timeIntervalSince1970: 1_788_134_400)
        let rawFile = Data("PRIVATE_RAW_FILE_SENTINEL".utf8)
        var draft = ContextCapsuleDraft()
        draft.addProcessedFile(
            displayName: "authorized-screenshot.png",
            reviewedText: "PRIVATE_FILE_DERIVATIVE_SENTINEL",
            rawData: rawFile,
            mediaType: "image/png",
            acquisition: "Explicit file picker or drop · local Vision OCR",
            sourceFingerprint: "opaque-file-fingerprint",
            now: now
        )
        let itemID = try XCTUnwrap(draft.items.first?.id)
        draft.setRetention(id: itemID, value: .oneHour)

        try store.save(draft, accountID: "account-a", now: now)

        let recovered = try store.load(accountID: "account-a", now: now.addingTimeInterval(120))
        XCTAssertEqual(recovered.draft.items.first?.localAssetData, rawFile)
        XCTAssertEqual(recovered.draft.items.first?.preview, "PRIVATE_FILE_DERIVATIVE_SENTINEL")

        let files = try FileManager.default.contentsOfDirectory(atPath: directory.path)
        let encrypted = try Data(contentsOf: directory.appending(path: try XCTUnwrap(files.first)))
        let rawEnvelope = String(data: encrypted, encoding: .utf8) ?? ""
        XCTAssertFalse(rawEnvelope.contains("PRIVATE_RAW_FILE_SENTINEL"))
        XCTAssertFalse(rawEnvelope.contains("PRIVATE_FILE_DERIVATIVE_SENTINEL"))

        let expired = try store.load(accountID: "account-a", now: now.addingTimeInterval(3_601))
        XCTAssertTrue(expired.draft.items.isEmpty)
        XCTAssertEqual(expired.expiredItemCount, 1)
        XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: directory.path).isEmpty)
    }
}

private final class TestCapsuleKeyProvider: CapsuleKeyProviding, @unchecked Sendable {
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
