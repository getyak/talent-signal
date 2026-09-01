import XCTest
@testable import TalentSignalMac

@MainActor
final class ReminderLifecycleLedgerTests: XCTestCase {
    private var suiteName: String!
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "ReminderLifecycleLedgerTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    func testLedgerIsAccountPartitionedOrderedAndContainsNoOperationOrContentText() {
        let ledger = ReminderLifecycleLedger(defaults: defaults)
        let now = Date(timeIntervalSince1970: 1_788_192_000)
        ledger.setAccountScope("PRIVATE_ACCOUNT_A")
        ledger.append(operationKey: "PRIVATE_OPERATION_SENTINEL", state: .pending, now: now)
        ledger.append(operationKey: "PRIVATE_OPERATION_SENTINEL", state: .outcomeUnknown, now: now.addingTimeInterval(1))
        ledger.append(operationKey: "PRIVATE_OPERATION_SENTINEL", state: .reconciled, now: now.addingTimeInterval(2))

        XCTAssertEqual(ledger.events(now: now.addingTimeInterval(3)).map(\.state), [
            .pending, .outcomeUnknown, .reconciled,
        ])
        XCTAssertTrue(ledger.events(now: now.addingTimeInterval(3)).allSatisfy {
            $0.operationDigest.count == 64 && !$0.operationDigest.contains("PRIVATE")
        })

        ledger.setAccountScope("PRIVATE_ACCOUNT_B")
        XCTAssertTrue(ledger.events(now: now.addingTimeInterval(3)).isEmpty)
        ledger.append(operationKey: "other-operation", state: .removed, now: now.addingTimeInterval(3))
        XCTAssertEqual(ledger.events(now: now.addingTimeInterval(4)).map(\.state), [.removed])

        ledger.setAccountScope("PRIVATE_ACCOUNT_A")
        XCTAssertEqual(ledger.events(now: now.addingTimeInterval(4)).map(\.state), [
            .pending, .outcomeUnknown, .reconciled,
        ])

        let storedText = defaults.dictionaryRepresentation().values.compactMap { value in
            (value as? Data).flatMap { String(data: $0, encoding: .utf8) }
        }.joined()
        XCTAssertFalse(storedText.contains("PRIVATE_ACCOUNT_A"))
        XCTAssertFalse(storedText.contains("PRIVATE_OPERATION_SENTINEL"))
    }

    func testLedgerPrunesByRetentionAndMaximumCountAndClearAffectsOnlyCurrentAccount() {
        let ledger = ReminderLifecycleLedger(defaults: defaults)
        let now = Date(timeIntervalSince1970: 1_788_192_000)
        ledger.setAccountScope("account-a")
        ledger.append(
            operationKey: "expired-operation",
            state: .pending,
            now: now.addingTimeInterval(-ReminderLifecycleLedger.retentionLifetime - 1)
        )
        for index in 0..<105 {
            ledger.append(
                operationKey: "operation-\(index)",
                state: index.isMultiple(of: 2) ? .verified : .removed,
                now: now.addingTimeInterval(Double(index))
            )
        }

        let retained = ledger.events(now: now.addingTimeInterval(105))
        XCTAssertEqual(retained.count, ReminderLifecycleLedger.maximumEvents)
        XCTAssertFalse(retained.contains { $0.recordedAt < now })

        ledger.setAccountScope("account-b")
        ledger.append(operationKey: "account-b-operation", state: .pending, now: now)
        ledger.clearCurrentAccount()
        XCTAssertTrue(ledger.events(now: now).isEmpty)

        ledger.setAccountScope("account-a")
        XCTAssertEqual(ledger.events(now: now.addingTimeInterval(105)).count, ReminderLifecycleLedger.maximumEvents)
    }
}
