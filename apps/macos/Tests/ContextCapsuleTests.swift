import XCTest
@testable import TalentSignalMac

final class ContextCapsuleTests: XCTestCase {
    func testFreezeIncludesOnlyReviewedSharedItemsAndPinsVersion() throws {
        let now = Date(timeIntervalSince1970: 1_788_134_400)
        var draft = ContextCapsuleDraft()
        draft.addSelectedText("Candidate explicitly moved the deadline to Wednesday.", now: now)
        confirmCandidateAttribution(in: &draft, now: now)
        draft.addFile(url: URL(fileURLWithPath: "/tmp/private-notes.txt"), size: 128, now: now)
        let frozenVersion = draft.version

        let manifest = try draft.freeze(
            accountID: "account-1",
            pursuitID: "pursuit-1",
            personID: "person-1",
            now: now
        )

        XCTAssertEqual(manifest.version, frozenVersion)
        XCTAssertEqual(manifest.selectedItems.count, 1)
        XCTAssertEqual(manifest.selectedItems.first?.kind, .selectedText)
        XCTAssertFalse(manifest.selectedItems.contains { $0.displayName == "private-notes.txt" })

        draft.addSelectedText("A later item belongs to a new task version.", now: now)
        XCTAssertEqual(manifest.selectedItems.count, 1, "A submitted manifest must be immutable after the draft changes.")
        XCTAssertNotEqual(draft.version, manifest.version)
    }

    func testLocalOnlyAndRetentionChangesCreateNewDraftVersions() {
        var draft = ContextCapsuleDraft()
        draft.addSelectedText("Explicit evidence")
        let itemID = try! XCTUnwrap(draft.items.first?.id)
        draft.setActorKind(id: itemID, value: .candidate)
        draft.confirmAttribution(id: itemID)
        let version = draft.version

        draft.setLocalOnly(id: itemID, value: true)
        XCTAssertGreaterThan(draft.version, version)
        XCTAssertFalse(draft.canSubmit)

        draft.setLocalOnly(id: itemID, value: false)
        draft.setRetention(id: itemID, value: .oneHour)
        XCTAssertEqual(draft.items.first?.retention, .oneHour)
        XCTAssertTrue(draft.canSubmit)
    }

    func testEmptyOrEntirelyLocalCapsuleCannotSubmit() {
        var draft = ContextCapsuleDraft()
        XCTAssertThrowsError(try draft.freeze(accountID: "a", pursuitID: nil, personID: nil))
        draft.addFile(url: URL(fileURLWithPath: "/tmp/local.pdf"), size: nil)
        XCTAssertThrowsError(try draft.freeze(accountID: "a", pursuitID: nil, personID: nil))
    }

    func testExactTermRedactionChangesReviewedDerivativeAndManifest() throws {
        var draft = ContextCapsuleDraft()
        draft.addSelectedText("Jordan confirmed the meeting. Send Jordan the brief at jordan@example.test.")
        let itemID = try XCTUnwrap(draft.items.first?.id)
        draft.setActorKind(id: itemID, value: .candidate)
        draft.confirmAttribution(id: itemID)
        let previousVersion = draft.version

        let count = draft.redact(id: itemID, exactTerms: ["Jordan", "jordan@example.test"])
        let manifest = try draft.freeze(accountID: "a", pursuitID: "p", personID: "person")

        XCTAssertEqual(count, 3)
        XCTAssertGreaterThan(draft.version, previousVersion)
        XCTAssertEqual(draft.items.first?.redactionCount, 3)
        XCTAssertFalse(manifest.selectedItems[0].reviewedContent.localizedCaseInsensitiveContains("Jordan"))
        XCTAssertFalse(manifest.selectedItems[0].reviewedContent.contains("jordan@example.test"))
        XCTAssertTrue(manifest.selectedItems[0].reviewedContent.contains("[REDACTED]"))
    }

    func testSystemSelectedWindowKeepsRawImageLocalAndSubmitsOnlyReviewedOCRDerivative() throws {
        var draft = ContextCapsuleDraft()
        let rawImage = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A])
        draft.addWindowCapture(
            recognizedText: "The candidate needs the exact remote-work policy before Wednesday.",
            imagePNG: rawImage,
            pixelWidth: 1200,
            pixelHeight: 800,
            sourceFingerprint: "synthetic-fingerprint"
        )
        let itemID = try XCTUnwrap(draft.items.first?.id)
        draft.setActorKind(id: itemID, value: .candidate)
        draft.confirmAttribution(id: itemID)

        XCTAssertTrue(draft.items[0].localOnly)
        XCTAssertEqual(draft.items[0].localAssetData, rawImage)
        XCTAssertFalse(draft.canSubmit)

        draft.setLocalOnly(id: itemID, value: false)
        let manifest = try draft.freeze(accountID: "a", pursuitID: "p", personID: "person")

        XCTAssertTrue(draft.canSubmit)
        XCTAssertEqual(manifest.selectedItems.count, 1)
        XCTAssertEqual(manifest.selectedItems[0].kind, .window)
        XCTAssertEqual(manifest.selectedItems[0].sourceFingerprint, "synthetic-fingerprint")
        XCTAssertEqual(manifest.selectedItems[0].reviewedContent, "The candidate needs the exact remote-work policy before Wednesday.")
        XCTAssertEqual(manifest.selectedItems[0].actorKind, .candidate)
    }

    func testRelationshipScopeDoesNotSilentlyConfirmSourceActor() {
        var draft = ContextCapsuleDraft()
        draft.addSelectedText("I need the written remote policy before Wednesday.")
        let itemID = try! XCTUnwrap(draft.items.first?.id)

        XCTAssertNil(draft.items[0].actorKind)
        XCTAssertNil(draft.items[0].attributionConfirmedAt)
        XCTAssertFalse(draft.canSubmit)

        draft.setActorKind(id: itemID, value: .candidate)
        XCTAssertFalse(draft.canSubmit, "Choosing an actor is not the separate human confirmation.")

        draft.confirmAttribution(id: itemID)
        XCTAssertTrue(draft.canSubmit)

        draft.setActorKind(id: itemID, value: .recruiter)
        XCTAssertNil(draft.items[0].attributionConfirmedAt, "Changing the actor invalidates prior confirmation.")
        XCTAssertFalse(draft.canSubmit)
    }

    func testWindowWithoutOCRAndFileCannotCrossUploadBoundary() {
        var draft = ContextCapsuleDraft()
        draft.addWindowCapture(
            recognizedText: "",
            imagePNG: Data([1, 2, 3]),
            pixelWidth: 100,
            pixelHeight: 100,
            sourceFingerprint: "blank"
        )
        draft.addFile(url: URL(fileURLWithPath: "/tmp/local.pdf"), size: 10)

        for id in draft.items.map(\.id) {
            draft.setLocalOnly(id: id, value: false)
        }

        XCTAssertTrue(draft.items.allSatisfy(\.localOnly))
        XCTAssertFalse(draft.canSubmit)
    }

    func testProcessedFileDerivativeStaysLocalUntilAttributionAndBoundaryReview() throws {
        var draft = ContextCapsuleDraft()
        draft.addProcessedFile(
            displayName: "authorized-screenshot.png",
            reviewedText: "Candidate needs the remote work policy before September 3, 2026.",
            rawData: Data([1, 2, 3]),
            mediaType: "image/png",
            acquisition: "Explicit file picker or drop · local Vision OCR",
            sourceFingerprint: "synthetic-file-fingerprint"
        )
        let itemID = try XCTUnwrap(draft.items.first?.id)

        XCTAssertTrue(draft.items[0].hasReviewedTextDerivative)
        XCTAssertTrue(draft.items[0].localOnly)
        XCTAssertFalse(draft.canSubmit)

        draft.setActorKind(id: itemID, value: .candidate)
        draft.confirmAttribution(id: itemID)
        draft.setLocalOnly(id: itemID, value: false)

        let manifest = try draft.freeze(
            accountID: "account-1",
            pursuitID: "pursuit-1",
            personID: "person-1"
        )
        XCTAssertEqual(manifest.selectedItems.map(\.reviewedContent), [draft.items[0].preview])
        XCTAssertEqual(manifest.selectedItems.map(\.sourceFingerprint), ["synthetic-file-fingerprint"])
        XCTAssertEqual(draft.items[0].localAssetData, Data([1, 2, 3]))
    }

    func testEveryExplicitIntakePathCreatesAVisibleAcquisitionReceipt() {
        var draft = ContextCapsuleDraft()
        draft.addSelectedText("Explicit selected text")
        draft.addFile(url: URL(fileURLWithPath: "/tmp/explicit-file.txt"), size: 42)
        draft.addWindowCapture(
            recognizedText: "Explicit system-selected window text",
            imagePNG: Data([1, 2]),
            pixelWidth: 320,
            pixelHeight: 200,
            sourceFingerprint: "explicit-window"
        )

        XCTAssertEqual(draft.items.map(\.kind), [.selectedText, .file, .window])
        XCTAssertTrue(draft.items.allSatisfy { !$0.acquisition.isEmpty })
        XCTAssertEqual(draft.items[0].acquisition, "Explicit text entry")
        XCTAssertTrue(draft.items[1].acquisition.contains("Explicit file picker"))
        XCTAssertTrue(draft.items[2].acquisition.contains("System picker"))
    }

    private func confirmCandidateAttribution(in draft: inout ContextCapsuleDraft, now: Date = Date()) {
        guard let id = draft.items.last?.id else { return }
        draft.setActorKind(id: id, value: .candidate)
        draft.confirmAttribution(id: id, now: now)
    }
}
