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
