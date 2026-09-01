import XCTest
@testable import TalentSignalMac

final class FollowUpReminderTests: XCTestCase {
    @MainActor
    func testPreviewOnlyServiceCannotReachAnyExternalReminderOperation() async {
        let service = PreviewOnlyFollowUpReminderService()
        let proposal = FollowUpReminderProposal.make(
            sourceItemID: UUID(uuidString: "10000000-0000-4000-8000-000000000001")!,
            sourceDigest: "source-digest",
            title: "Follow up on decision timing",
            dueAt: Date(timeIntervalSince1970: 1_788_000_000),
            timeZone: TimeZone(identifier: "Asia/Shanghai")!,
            evidenceQuote: "I need to decide by Friday.",
            destination: FollowUpReminderDestination(identifier: "list-a", title: "Reminders")
        )
        let receipt = FollowUpReminderReceipt(
            idempotencyKey: proposal.idempotencyKey,
            reminderIdentifier: "reminder-a",
            title: proposal.title,
            dueAt: proposal.dueAt,
            destinationIdentifier: proposal.destination.identifier,
            destinationTitle: proposal.destination.title,
            verifiedAt: Date(timeIntervalSince1970: 1_788_000_100)
        )

        let preview = await service.previewDestination()
        let execute = await service.execute(proposal)
        let reconcile = await service.reconcile(proposal)
        let remove = await service.remove(receipt)
        let reconcileRemoval = await service.reconcileRemoval(receipt)

        guard case .failure(.previewOnly) = preview else {
            return XCTFail("Preview-only fixture unexpectedly reached destination preview")
        }
        guard case .failure(.previewOnly) = execute else {
            return XCTFail("Preview-only fixture unexpectedly reached reminder creation")
        }
        guard case .failure(.previewOnly) = reconcile else {
            return XCTFail("Preview-only fixture unexpectedly reached reminder reconciliation")
        }
        guard case .failure(.previewOnly) = remove else {
            return XCTFail("Preview-only fixture unexpectedly reached reminder removal")
        }
        guard case .failure(.previewOnly) = reconcileRemoval else {
            return XCTFail("Preview-only fixture unexpectedly reached removal reconciliation")
        }
    }

    func testIdenticalProposalHasStableIdempotencyKey() {
        let sourceID = UUID(uuidString: "10000000-0000-4000-8000-000000000001")!
        let destination = FollowUpReminderDestination(identifier: "list-a", title: "Reminders")
        let dueAt = Date(timeIntervalSince1970: 1_788_000_000)

        let first = FollowUpReminderProposal.make(
            sourceItemID: sourceID,
            sourceDigest: "source-digest",
            title: "Follow up on decision timing",
            dueAt: dueAt,
            timeZone: TimeZone(identifier: "Asia/Shanghai")!,
            evidenceQuote: "I need to decide by Friday.",
            destination: destination
        )
        let retry = FollowUpReminderProposal.make(
            sourceItemID: sourceID,
            sourceDigest: "source-digest",
            title: "Follow up on decision timing",
            dueAt: dueAt,
            timeZone: TimeZone(identifier: "Asia/Shanghai")!,
            evidenceQuote: "I need to decide by Friday.",
            destination: destination
        )

        XCTAssertEqual(first.idempotencyKey, retry.idempotencyKey)
    }

    func testMaterialEditCreatesNewOperationAuthority() {
        let sourceID = UUID(uuidString: "10000000-0000-4000-8000-000000000001")!
        let destination = FollowUpReminderDestination(identifier: "list-a", title: "Reminders")
        let first = FollowUpReminderProposal.make(
            sourceItemID: sourceID,
            sourceDigest: "source-digest",
            title: "Follow up on Friday",
            dueAt: Date(timeIntervalSince1970: 1_788_000_000),
            timeZone: TimeZone(identifier: "Asia/Shanghai")!,
            evidenceQuote: "I need to decide by Friday.",
            destination: destination
        )
        let edited = FollowUpReminderProposal.make(
            sourceItemID: sourceID,
            sourceDigest: "source-digest",
            title: "Follow up before Friday",
            dueAt: Date(timeIntervalSince1970: 1_788_003_600),
            timeZone: TimeZone(identifier: "Asia/Shanghai")!,
            evidenceQuote: "I need to decide by Friday.",
            destination: destination
        )

        XCTAssertNotEqual(first.idempotencyKey, edited.idempotencyKey)
    }
}
