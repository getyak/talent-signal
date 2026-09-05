import Foundation
import UIKit
import XCTest
@testable import TalentSignal

final class RelationshipCaptureTests: XCTestCase {
    func testShortcutScreenshotValidatorDecodesContentAndBoundsPayload() throws {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 32, height: 32))
        let image = renderer.image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 32, height: 32))
        }
        let imageData = try XCTUnwrap(image.pngData())

        XCTAssertEqual(
            try ConversationScreenshotInputValidator.detectedImageType(
                for: imageData
            ),
            .png
        )
        XCTAssertThrowsError(
            try ConversationScreenshotInputValidator.detectedImageType(
                for: Data("not an image".utf8)
            )
        ) { error in
            XCTAssertEqual(error as? CaptureAppIntentError, .notAnImage)
        }
        XCTAssertThrowsError(
            try ConversationScreenshotInputValidator.detectedImageType(
                for: Data(
                    repeating: 0,
                    count: ConversationScreenshotInputValidator.maximumByteCount + 1
                )
            )
        ) { error in
            XCTAssertEqual(error as? CaptureAppIntentError, .imageTooLarge)
        }
        XCTAssertThrowsError(
            try ConversationScreenshotInputValidator.validatePixelDimensions(
                width: 10_000,
                height: 9_000
            )
        ) { error in
            XCTAssertEqual(error as? CaptureAppIntentError, .imageTooLarge)
        }
    }

    func testShortcutImporterRejectsBeforeQueueAndReceipt() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-importer-\(UUID().uuidString)")
        let suiteName = "talent-signal-importer-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer {
            try? FileManager.default.removeItem(at: directory)
            defaults.removePersistentDomain(forName: suiteName)
        }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let corruptInput = ScreenshotInput(
            data: Data("not an image".utf8),
            fileName: "forged.png"
        )
        let oversizedInput = ScreenshotInput(
            data: Data(
                repeating: 0,
                count: ConversationScreenshotInputValidator.maximumByteCount + 1
            ),
            fileName: "oversized.png"
        )

        for input in [corruptInput, oversizedInput] {
            do {
                _ = try await ConversationScreenshotImporter(
                    inbox: inbox,
                    defaults: defaults
                ).stage(input)
                XCTFail("Rejected input must not return a receipt")
            } catch {
                let captureError = error as? CaptureAppIntentError
                XCTAssertTrue(
                    captureError == .notAnImage || captureError == .imageTooLarge,
                    "Unexpected rejection: \(error)"
                )
            }
            let pendingCount = try await inbox.count()
            XCTAssertEqual(pendingCount, 0)
            XCTAssertEqual(
                defaults.double(
                    forKey: TalentSignalSetupPreference
                        .screenshotShortcutReceivedAtKey
                ),
                0
            )
        }

        let dimensionLimitedImporter = ConversationScreenshotImporter(
            inbox: inbox,
            defaults: defaults,
            validate: { _ in
                try ConversationScreenshotInputValidator.validatePixelDimensions(
                    width: 10_000,
                    height: 9_000
                )
                return .png
            }
        )
        do {
            _ = try await dimensionLimitedImporter.stage(
                ScreenshotInput(data: Data([0x89]), fileName: "huge.png")
            )
            XCTFail("Pixel-limited input must not return a receipt")
        } catch {
            XCTAssertEqual(error as? CaptureAppIntentError, .imageTooLarge)
        }
        let pendingCount = try await inbox.count()
        XCTAssertEqual(pendingCount, 0)
        XCTAssertEqual(
            defaults.double(
                forKey: TalentSignalSetupPreference
                    .screenshotShortcutReceivedAtKey
            ),
            0
        )
    }

    func testSelectedConversationImageAcceptsImageDataAndRejectsOtherPayloads() throws {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 32, height: 32))
        let image = renderer.image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 32, height: 32))
        }
        let imageData = try XCTUnwrap(image.pngData())

        XCTAssertEqual(
            try SelectedConversationImage(importedData: imageData).data,
            imageData
        )
        XCTAssertThrowsError(
            try SelectedConversationImage(importedData: Data("not an image".utf8))
        ) { error in
            XCTAssertEqual(
                error as? SelectedConversationImageError,
                .unreadableImage
            )
        }
    }

    @MainActor
    func testVisionRecognizerReadsSyntheticConversationImageOnDevice() async throws {
        let renderer = UIGraphicsImageRenderer(
            size: CGSize(width: 1_200, height: 520)
        )
        let image = renderer.image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 1_200, height: 520))
            let text = "WeChat: alex_test_2026\nNext Thursday works"
            text.draw(
                in: CGRect(x: 70, y: 80, width: 1_060, height: 360),
                withAttributes: [
                    .font: UIFont.systemFont(ofSize: 72, weight: .semibold),
                    .foregroundColor: UIColor.black,
                ]
            )
        }
        let imageData = try XCTUnwrap(image.pngData())

        let recognized = try await VisionConversationTextRecognizer()
            .recognizeText(in: imageData)
            .lowercased()

        XCTAssertTrue(recognized.contains("wechat"))
        XCTAssertTrue(recognized.contains("thursday"))
    }

    func testDraftBuilderExtractsEmailBeforePhone() {
        let draft = CaptureDraftBuilder.makeDraft(
            from: """
            Lin Wei
            Email lin.wei@example.com
            Phone +65 9123 4567
            """
        )

        XCTAssertEqual(draft.handleType, .email)
        XCTAssertEqual(draft.handleValue, "lin.wei@example.com")
        XCTAssertTrue(draft.reviewedText.contains("+65 9123 4567"))
        XCTAssertNil(draft.speaker)
    }

    func testDraftBuilderNormalizesPhoneWithoutInventingAttribution() {
        let draft = CaptureDraftBuilder.makeDraft(
            from: "Contact: +65 (9123) 4567"
        )

        XCTAssertEqual(draft.handleType, .phone)
        XCTAssertEqual(draft.handleValue, "+6591234567")
    }

    func testTemporalIdentityRoleUsesBackendReasons() {
        XCTAssertEqual(
            TemporalIdentityRole.classify(
                matchReasons: ["Current confirmed phone clue · reviewed source"]
            ),
            .current
        )
        XCTAssertEqual(
            TemporalIdentityRole.classify(
                matchReasons: ["Expired phone clue · explicit binding required"]
            ),
            .historical
        )
        XCTAssertEqual(
            TemporalIdentityRole.classify(matchReasons: ["Name resembles source hint"]),
            .uncertain
        )
    }

    func testPendingInboxRestoresReviewedDraft() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-inbox-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let seed = try await inbox.stage(
            imageData: Data([1, 2, 3]),
            fileName: "conversation.png",
            mediaType: "image/png",
            origin: .photosPicker
        )
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Reviewed evidence"
        draft.speaker = .candidate
        draft.displayNameHint = "Lin Wei"
        try await inbox.saveDraft(draft, for: seed.id)

        let restored = try await inbox.load()
        XCTAssertEqual(restored?.id, seed.id)
        XCTAssertEqual(restored?.imageData, seed.imageData)
        XCTAssertEqual(restored?.fileName, seed.fileName)
        let restoredDraft = try await inbox.loadDraft(for: seed.id)
        let protections = try await inbox.fileProtections(for: seed.id)
        let isExcludedFromBackup = try await inbox.isExcludedFromBackup()
        XCTAssertEqual(restoredDraft, draft)
        XCTAssertTrue(isExcludedFromBackup)
#if targetEnvironment(simulator)
        XCTAssertTrue(
            protections.allSatisfy { $0 == nil || $0 == .complete },
            "Simulator filesystems may not expose the device Data Protection class."
        )
#else
        XCTAssertTrue(protections.allSatisfy { $0 == .complete })
#endif

        try await inbox.remove(id: seed.id)
        let removed = try await inbox.load()
        let removedDraft = try await inbox.loadDraft(for: seed.id)
        XCTAssertNil(removed)
        XCTAssertNil(removedDraft)
    }

    func testContactDraftMapsOnlyReviewedContactFields() {
        let phone = DeviceContactDraft(
            sourceID: "capture-1",
            displayName: " Alex Chen ",
            handleType: .phone,
            handleValue: " +65 9123 4567 "
        )
        let email = DeviceContactDraft(
            sourceID: "capture-2",
            displayName: "Lin Wei",
            handleType: .email,
            handleValue: "lin@example.com"
        )
        let wechat = DeviceContactDraft(
            sourceID: "capture-3",
            displayName: "周宁",
            handleType: .wechat,
            handleValue: "zhou_synthetic"
        )

        XCTAssertEqual(phone.displayName, "Alex Chen")
        XCTAssertEqual(phone.makeContact().phoneNumbers.first?.value.stringValue, "+65 9123 4567")
        XCTAssertEqual(email.makeContact().emailAddresses.first?.value as String?, "lin@example.com")
        XCTAssertEqual(wechat.makeContact().socialProfiles.first?.value.username, "zhou_synthetic")
    }

    func testCandidateMeetingEvidenceCreatesCalendarProposal() throws {
        var draft = RecognizedCaptureDraft.empty
        draft.speaker = .candidate
        draft.reviewedText = "Interview September 3, 2027 at 3:00 PM for 45 minutes."
        let reference = try XCTUnwrap(
            ISO8601DateFormatter().date(from: "2026-08-26T09:00:00+08:00")
        )
        let timeZone = try XCTUnwrap(TimeZone(identifier: "Asia/Singapore"))

        let proposal = try XCTUnwrap(
            DeviceCalendarProposalDetector.detect(
                draft: draft,
                personDisplayName: "Leila Hassan",
                sourceID: "capture-calendar-1",
                capturedAt: reference,
                now: reference,
                timeZone: timeZone
            )
        )
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let components = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: proposal.startDate
        )

        XCTAssertEqual(proposal.title, "Interview · Leila Hassan")
        XCTAssertEqual(components.year, 2027)
        XCTAssertEqual(components.month, 9)
        XCTAssertEqual(components.day, 3)
        XCTAssertEqual(components.hour, 15)
        XCTAssertEqual(components.minute, 0)
        XCTAssertEqual(
            proposal.endDate.timeIntervalSince(proposal.startDate),
            45 * 60,
            accuracy: 0.1
        )
        XCTAssertTrue(proposal.durationWasExplicit)
        XCTAssertEqual(proposal.detectedDateText, "September 3, 2027 at 3:00 PM")
        XCTAssertTrue(proposal.evidenceQuote.contains("Interview"))
    }

    func testChineseMeetingEvidenceCreatesEditableDefaultDuration() throws {
        var draft = RecognizedCaptureDraft.empty
        draft.speaker = .candidate
        draft.reviewedText = "2027年9月3日下午3点面试，我们视频聊。"
        let reference = try XCTUnwrap(
            ISO8601DateFormatter().date(from: "2026-08-26T09:00:00+08:00")
        )
        let timeZone = try XCTUnwrap(TimeZone(identifier: "Asia/Shanghai"))

        let proposal = try XCTUnwrap(
            DeviceCalendarProposalDetector.detect(
                draft: draft,
                personDisplayName: "李娜",
                sourceID: "capture-calendar-zh",
                capturedAt: reference,
                now: reference,
                timeZone: timeZone
            )
        )

        XCTAssertEqual(proposal.title, "面试 · 李娜")
        XCTAssertFalse(proposal.durationWasExplicit)
        XCTAssertEqual(
            proposal.endDate.timeIntervalSince(proposal.startDate),
            30 * 60,
            accuracy: 0.1
        )
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let components = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: proposal.startDate
        )
        XCTAssertEqual(components.year, 2027)
        XCTAssertEqual(components.month, 9)
        XCTAssertEqual(components.day, 3)
        XCTAssertEqual(components.hour, 15)
        XCTAssertEqual(components.minute, 0)
        XCTAssertEqual(proposal.detectedDateText, "2027年9月3日下午3点")
    }

    func testCalendarProposalAbstainsWithoutMeetingConsentOrCandidateAttribution() throws {
        let reference = try XCTUnwrap(
            ISO8601DateFormatter().date(from: "2026-08-26T09:00:00+08:00")
        )
        var draft = RecognizedCaptureDraft.empty
        draft.speaker = .candidate
        draft.reviewedText = "Tuesday September 7, 2027 at 3 PM is open on my side."

        XCTAssertNil(
            DeviceCalendarProposalDetector.detect(
                draft: draft,
                personDisplayName: "Leila Hassan",
                sourceID: "availability-only",
                capturedAt: reference,
                now: reference
            )
        )

        draft.reviewedText = "Interview September 7, 2027 at 3 PM works for me."
        draft.speaker = .recruiter
        XCTAssertNil(
            DeviceCalendarProposalDetector.detect(
                draft: draft,
                personDisplayName: "Leila Hassan",
                sourceID: "wrong-speaker",
                capturedAt: reference,
                now: reference
            )
        )

        draft.speaker = .candidate
        draft.reviewedText = "Let's schedule an interview after the portfolio review."
        XCTAssertNil(
            DeviceCalendarProposalDetector.detect(
                draft: draft,
                personDisplayName: "Leila Hassan",
                sourceID: "missing-date",
                capturedAt: reference,
                now: reference
            )
        )

        draft.reviewedText = "Interview September 7, 2025 at 3 PM works for me."
        XCTAssertNil(
            DeviceCalendarProposalDetector.detect(
                draft: draft,
                personDisplayName: "Leila Hassan",
                sourceID: "past-date",
                capturedAt: reference,
                now: reference
            )
        )
    }

    func testCalendarReceiptStoreKeepsOneSavedResultPerCapture() throws {
        let suiteName = "calendar-receipt-tests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let store = DeviceCalendarReceiptStore(defaults: defaults)
        let firstDate = Date(timeIntervalSince1970: 1_800_000_000)
        let secondDate = firstDate.addingTimeInterval(60)

        XCTAssertNil(store.receipt(for: "capture-1"))
        store.recordSaved(
            sourceID: "capture-1",
            eventIdentifier: "event-1",
            savedAt: firstDate
        )
        store.recordSaved(
            sourceID: "capture-1",
            eventIdentifier: "event-2",
            savedAt: secondDate
        )

        XCTAssertEqual(
            store.receipt(for: "capture-1"),
            DeviceCalendarWriteReceipt(
                sourceID: "capture-1",
                eventIdentifier: "event-2",
                savedAt: secondDate
            )
        )
        XCTAssertNil(store.receipt(for: "capture-2"))
    }

    func testPendingInboxQueuesDistinctCapturesAndDeduplicatesExactRetry() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-inbox-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)

        let first = try await inbox.stage(
            imageData: Data([1, 2, 3]),
            fileName: "first.png",
            mediaType: "image/png",
            origin: .appShortcut
        )
        try await Task.sleep(nanoseconds: 2_000_000)
        let second = try await inbox.stage(
            imageData: Data([4, 5, 6]),
            fileName: "second.png",
            mediaType: "image/png",
            origin: .appShortcut
        )
        let retriedFirst = try await inbox.stage(
            imageData: Data([1, 2, 3]),
            fileName: "retried-first.png",
            mediaType: "image/png",
            origin: .appShortcut
        )

        let initialCount = try await inbox.count()
        let initialHead = try await inbox.load()
        XCTAssertEqual(retriedFirst.id, first.id)
        XCTAssertEqual(retriedFirst.imageData, first.imageData)
        XCTAssertEqual(initialCount, 2)
        XCTAssertEqual(initialHead?.id, first.id)

        try await inbox.remove(id: first.id)
        let nextHead = try await inbox.load()
        let remainingCount = try await inbox.count()
        XCTAssertEqual(nextHead?.id, second.id)
        XCTAssertEqual(remainingCount, 1)

        let laterReview = try await inbox.stage(
            imageData: Data([1, 2, 3]),
            fileName: "later-review.png",
            mediaType: "image/png",
            origin: .appShortcut
        )
        let countAfterLaterReview = try await inbox.count()
        XCTAssertNotEqual(laterReview.id, first.id)
        XCTAssertEqual(countAfterLaterReview, 2)
    }

    func testScreenshotShortcutReceiptRecordsObservedCaptureSeparately() throws {
        let suiteName = "talent-signal-shortcut-receipt-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let receivedAt = Date(timeIntervalSince1970: 1_788_480_000)

        TalentSignalSetupPreference.recordScreenshotShortcutReceived(
            at: receivedAt,
            defaults: defaults
        )

        XCTAssertFalse(
            defaults.bool(
                forKey: TalentSignalSetupPreference.actionButtonCompleteKey
            )
        )
        XCTAssertEqual(
            defaults.double(
                forKey: TalentSignalSetupPreference
                    .screenshotShortcutReceivedAtKey
            ),
            receivedAt.timeIntervalSince1970
        )
        XCTAssertEqual(
            TalentSignalSetupPreference.shortcutEditorURL.absoluteString,
            "shortcuts://create-shortcut"
        )
    }

    func testPendingInboxKeepsDraftsIsolatedByCapture() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-inbox-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let first = try await inbox.stage(
            imageData: Data([10]),
            fileName: "first.png",
            mediaType: "image/png",
            origin: .photosPicker
        )
        let second = try await inbox.stage(
            imageData: Data([20]),
            fileName: "second.png",
            mediaType: "image/png",
            origin: .appShortcut
        )
        var firstDraft = RecognizedCaptureDraft.empty
        firstDraft.reviewedText = "First reviewed source"
        var secondDraft = RecognizedCaptureDraft.empty
        secondDraft.reviewedText = "Second reviewed source"

        try await inbox.saveDraft(firstDraft, for: first.id)
        try await inbox.saveDraft(secondDraft, for: second.id)

        let restoredFirstDraft = try await inbox.loadDraft(for: first.id)
        let restoredSecondDraft = try await inbox.loadDraft(for: second.id)
        XCTAssertEqual(restoredFirstDraft, firstDraft)
        XCTAssertEqual(restoredSecondDraft, secondDraft)

        try await inbox.remove(id: first.id)
        let removedFirstDraft = try await inbox.loadDraft(for: first.id)
        let retainedSecondDraft = try await inbox.loadDraft(for: second.id)
        XCTAssertNil(removedFirstDraft)
        XCTAssertEqual(retainedSecondDraft, secondDraft)
    }

    func testPendingInboxMigratesLegacySingleCapture() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-inbox-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let id = UUID()
        let createdAt = Date().addingTimeInterval(-60)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(
            LegacyPendingMetadata(
                id: id,
                fileName: "legacy.png",
                mediaType: "image/png",
                createdAt: createdAt,
                origin: .appShortcut
            )
        ).write(to: directory.appending(path: "pending.json"), options: .atomic)
        try Data([7, 8, 9]).write(
            to: directory.appending(path: "pending-image"),
            options: .atomic
        )

        let inbox = PendingCaptureInbox(directoryURL: directory)
        let restored = try await inbox.load()

        XCTAssertEqual(restored?.id, id)
        XCTAssertEqual(restored?.imageData, Data([7, 8, 9]))
        let migratedCount = try await inbox.count()
        XCTAssertEqual(migratedCount, 1)
        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: directory.appending(path: "pending.json").path
            )
        )
        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: directory.appending(path: "pending-image").path
            )
        )
    }

    @MainActor
    func testCurrentAndHistoricalCandidatesRequireExplicitCurrentSelection() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "capture-current-owner-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let identityCase = Self.twoOwnerCase()
        let service = RelationshipCaptureServiceStub(
            identityCase: identityCase,
            decisionResult: IdentityDecisionResult(
                decision: "bind_existing",
                identityStatus: "bound",
                personID: Self.currentPersonID,
                relationshipContextID: Self.currentContextID,
                resourceProcessingState: "needs_fact_review"
            ),
            wiki: Self.goldWiki()
        )
        let seed = PendingCaptureSeed(
            imageData: Data(),
            fileName: "recycled-phone.png",
            mediaType: "image/png",
            origin: .deterministicTest
        )
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Phone: +6580805531"
        draft.displayNameHint = "Current owner"
        draft.handleValue = "+6580805531"
        let store = RelationshipCaptureStore(
            seed: seed,
            service: service,
            initialDraft: draft,
            inbox: inbox
        )

        store.submitReviewedDraft()
        try await waitUntil { store.stage == .resolvingIdentity }

        XCTAssertNil(store.selectedCandidateID)
        XCTAssertTrue(store.isCandidateSelectable(identityCase.candidates[0]))
        XCTAssertFalse(store.isCandidateSelectable(identityCase.candidates[1]))

        store.selectCandidate(identityCase.candidates[1])
        XCTAssertNil(store.selectedCandidateID)

        store.selectCandidate(identityCase.candidates[0])
        XCTAssertEqual(store.selectedCandidateID, Self.currentPersonID)
        XCTAssertEqual(store.selectedContextID, Self.currentContextID)
        store.bindSelectedCandidate()

        try await waitUntil { store.stage == .reviewingChanges }
        let beforeConfirmation = await service.compileCount
        XCTAssertEqual(beforeConfirmation, 0, "Binding must not finish fact review.")
        store.finishReview()
        try await waitUntil {
            if case let .completed(completion) = store.stage {
                return completion.wiki?.quality.verdict == "gold"
            }
            return false
        }
        let decisions = await service.decisions
        XCTAssertEqual(decisions.count, 1)
        guard case let .bind(candidate, _) = try XCTUnwrap(decisions.first) else {
            return XCTFail("Expected an explicit bind decision.")
        }
        XCTAssertEqual(candidate.personID, Self.currentPersonID)
        guard case let .completed(completion) = store.stage else {
            return XCTFail("Expected a completed capture.")
        }
        XCTAssertEqual(completion.captureID, "99999999-9999-4999-8999-999999999999")
        XCTAssertEqual(completion.personDisplayLabel, "Current owner 080e5531")
        XCTAssertEqual(completion.relationshipDisplayLabel, "Current client relationship")
    }

    @MainActor
    func testLeaveUnresolvedCompletesWithoutWiki() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "capture-unresolved-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let identityCase = Self.twoOwnerCase()
        let service = RelationshipCaptureServiceStub(
            identityCase: identityCase,
            decisionResult: IdentityDecisionResult(
                decision: "leave_unresolved",
                identityStatus: "unresolved",
                personID: nil,
                relationshipContextID: nil,
                resourceProcessingState: "needs_identity_review"
            ),
            wiki: Self.goldWiki()
        )
        let seed = PendingCaptureSeed(
            imageData: Data(),
            fileName: "ambiguous.png",
            mediaType: "image/png",
            origin: .deterministicTest
        )
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Ambiguous conversation"
        let store = RelationshipCaptureStore(
            seed: seed,
            service: service,
            initialDraft: draft,
            inbox: inbox
        )

        store.submitReviewedDraft()
        try await waitUntil { store.stage == .resolvingIdentity }
        store.leaveUnresolved()
        try await waitUntil {
            if case let .completed(completion) = store.stage {
                return completion.isUnresolved && completion.wiki == nil
            }
            return false
        }
        let compileCount = await service.compileCount
        XCTAssertEqual(compileCount, 0)
    }

    @MainActor
    func testWikiRetryDoesNotRepeatIdentityDecision() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "capture-wiki-retry-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let identityCase = Self.twoOwnerCase()
        let service = RelationshipCaptureServiceStub(
            identityCase: identityCase,
            decisionResult: IdentityDecisionResult(
                decision: "bind_existing",
                identityStatus: "bound",
                personID: Self.currentPersonID,
                relationshipContextID: Self.currentContextID,
                resourceProcessingState: "needs_fact_review"
            ),
            wiki: Self.goldWiki(),
            compileFailuresBeforeSuccess: 1
        )
        let seed = PendingCaptureSeed(
            imageData: Data(),
            fileName: "retry.png",
            mediaType: "image/png",
            origin: .deterministicTest
        )
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Phone: +6580805531"
        draft.displayNameHint = "Current owner"
        draft.handleValue = "+6580805531"
        let store = RelationshipCaptureStore(
            seed: seed,
            service: service,
            initialDraft: draft,
            inbox: inbox
        )

        store.submitReviewedDraft()
        try await waitUntil { store.stage == .resolvingIdentity }
        store.selectCandidate(identityCase.candidates[0])
        store.bindSelectedCandidate()
        try await waitUntil { store.stage == .reviewingChanges }
        store.finishReview()
        try await waitUntil {
            guard case let .failed(failure) = store.stage else { return false }
            return failure.recoveryStage == .compilation
        }

        store.retry()
        try await waitUntil {
            guard case let .completed(completion) = store.stage else {
                return false
            }
            return completion.wiki?.quality.verdict == "gold"
        }

        let decisions = await service.decisions
        let compileCount = await service.compileCount
        XCTAssertEqual(decisions.count, 1)
        XCTAssertEqual(compileCount, 2)
    }

    @MainActor
    private func waitUntil(
        timeoutNanoseconds: UInt64 = 2_000_000_000,
        condition: @escaping @MainActor () -> Bool
    ) async throws {
        let started = DispatchTime.now().uptimeNanoseconds
        while !condition() {
            if DispatchTime.now().uptimeNanoseconds - started > timeoutNanoseconds {
                XCTFail("Timed out waiting for relationship capture state.")
                return
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    @MainActor
    func testPartialReviewSurvivesResponseLossRestartAndTerminalClose() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: "capture-recovery-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let seed = try await inbox.stage(imageData: Data([1, 2, 3]), fileName: "fixture.png", mediaType: "image/png", origin: .deterministicTest)
        let claims: [CaptureChangeReview.Claim] = [
            .init(id: "work", field: "work_mode_preference", proposedValue: "Hybrid", priorValue: nil,
                  quote: "Work mode: Hybrid", reviewStatus: "pending", proposalStatus: "proposed", version: 1,
                  reviewToken: String(repeating: "a", count: 64), blockers: []),
            .init(id: "date", field: "decision_deadline", proposedValue: "next Friday", priorValue: nil,
                  quote: "Deadline: next Friday", reviewStatus: "pending", proposalStatus: "ambiguous", version: 1,
                  reviewToken: String(repeating: "b", count: 64), blockers: ["calendar_date_required"]),
        ]
        let service = RelationshipCaptureServiceStub(identityCase: Self.twoOwnerCase(),
            decisionResult: .init(decision: "bind_existing", identityStatus: "bound", personID: Self.currentPersonID,
                relationshipContextID: Self.currentContextID, resourceProcessingState: "needs_fact_review"),
            wiki: Self.goldWiki(), claims: claims, loseFirstClaimResponse: true)
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Work mode: Hybrid\nDeadline: next Friday"
        draft.speaker = .candidate
        draft.keepOriginalForReview = false
        let first = RelationshipCaptureStore(seed: seed, service: service, initialDraft: draft, inbox: inbox)
        first.submitReviewedDraft()
        try await waitUntil { first.stage == .resolvingIdentity }
        first.selectCandidate(Self.twoOwnerCase().candidates[0])
        first.bindSelectedCandidate()
        try await waitUntil { first.stage == .reviewingChanges }
        first.decideClaim(claims[1], decision: "confirm", correctedValue: "2026-02-30")
        let invalidDateRequests = await service.claimDecisions.count
        XCTAssertEqual(invalidDateRequests, 0)
        first.claimEdits["date"] = "2026-09-11"
        first.decideClaim(claims[0], decision: "confirm", correctedValue: "Hybrid")
        try await waitUntil { if case .failed = first.stage { return true }; return false }
        let saved = try await inbox.loadRecovery(for: seed.id)
        XCTAssertNotNil(saved?.pendingClaim)
        let loadedSeed = try await inbox.load()
        let restoredSeed = try XCTUnwrap(loadedSeed)
        XCTAssertTrue(restoredSeed.imageData.isEmpty, "Text-only recovery must remain queued after original removal.")
        let resumed = RelationshipCaptureStore(seed: restoredSeed, service: service, inbox: inbox)
        resumed.start()
        try await waitUntil { if case .failed = resumed.stage { return true }; return false }
        let beforeRetry = await service.claimDecisions.count
        XCTAssertEqual(beforeRetry, 1, "Opening must not replay an unknown mutation automatically.")
        XCTAssertEqual(resumed.claimEdits["date"], "2026-09-11")
        XCTAssertEqual(resumed.selectedClaimID, "work")
        resumed.retry()
        try await waitUntil { resumed.stage == .reviewingChanges }
        let attempts = await service.claimDecisions
        XCTAssertEqual(attempts.count, 2)
        XCTAssertEqual(attempts[0], attempts[1], "Retry must reuse the exact persisted operation.")
        XCTAssertEqual(resumed.changes?.confirmedCount, 1)
        XCTAssertEqual(resumed.changes?.pendingCount, 1)
        resumed.finishReview()
        try await waitUntil { if case .completed = resumed.stage { return true }; return false }
        guard case let .completed(partial) = resumed.stage else { return XCTFail("Missing partial receipt") }
        XCTAssertTrue(partial.needsReview)
        XCTAssertEqual(partial.confirmedCount, 1)
        let pendingCount = try await inbox.count()
        XCTAssertEqual(pendingCount, 1)
        resumed.returnToReview()
        try await waitUntil { resumed.stage == .reviewingChanges }
        resumed.decideClaim(try XCTUnwrap(resumed.changes?.claims.first { $0.id == "date" }), decision: "confirm", correctedValue: "2026-09-11")
        try await waitUntil { resumed.stage == .reviewingChanges && resumed.changes?.confirmedCount == 2 }
        resumed.finishReview()
        try await waitUntil { if case .completed = resumed.stage { return true }; return false }
        let closed = await resumed.keepForLater()
        XCTAssertTrue(closed)
        let finalCount = try await inbox.count()
        XCTAssertEqual(finalCount, 0, "Closing a terminal receipt must not recreate the inbox entry.")
        let creates = await service.createCount
        XCTAssertEqual(creates, 1)
        let fingerprints = await service.reviewFingerprints
        XCTAssertEqual(fingerprints.count, 2)
        XCTAssertNotEqual(fingerprints[0], fingerprints[1], "A changed review must compile under new current-state authority.")
    }

    func testOriginalExpiresButReviewedTextRemainsUntilReviewExpiry() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: "capture-expiry-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let seed = PendingCaptureSeed(imageData: Data([4, 5]), fileName: "old.png", mediaType: "image/png",
            createdAt: Date().addingTimeInterval(-8 * 86_400), origin: .deterministicTest)
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Location: Shanghai"
        try await inbox.saveReview(seed: seed, draft: draft, recovery: .init(), scope: nil)
        let restored = try await inbox.load()
        XCTAssertEqual(restored?.id, seed.id)
        XCTAssertTrue(restored?.imageData.isEmpty == true)
        let restoredDraft = try await inbox.loadDraft(for: seed.id)
        XCTAssertEqual(restoredDraft?.reviewedText, draft.reviewedText)
        let reimported = try await inbox.stage(imageData: Data([4, 5]), fileName: "old.png", mediaType: "image/png", origin: .deterministicTest)
        XCTAssertNotEqual(reimported.id, seed.id)
        XCTAssertEqual(reimported.imageData, Data([4, 5]), "A deliberate reimport starts a new retention clock without mutating the old review.")
        try await inbox.remove(id: reimported.id)
        let metadataURL = directory.appending(path: "captures/\(seed.id.uuidString).metadata.json")
        var metadata = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: metadataURL)) as? [String: Any])
        metadata["createdAt"] = ISO8601DateFormatter().string(from: Date().addingTimeInterval(-31 * 86_400))
        try JSONSerialization.data(withJSONObject: metadata).write(to: metadataURL)
        let fresh = try await inbox.stage(imageData: Data([7, 8]), fileName: "new.png", mediaType: "image/png", origin: .deterministicTest)
        let next = try await inbox.load()
        XCTAssertEqual(next?.id, fresh.id, "An expired head must not hide subsequent work.")
        let removedDraft = try await inbox.loadDraft(for: seed.id)
        XCTAssertNil(removedDraft)
    }

    private static let currentPersonID = "11111111-1111-4111-8111-111111111111"
    private static let historicalPersonID = "22222222-2222-4222-8222-222222222222"
    private static let currentContextID = "33333333-3333-4333-8333-333333333333"
    private static let historicalContextID = "44444444-4444-4444-8444-444444444444"

    private static func twoOwnerCase() -> IdentityResolutionCase {
        IdentityResolutionCase(
            id: "55555555-5555-4555-8555-555555555555",
            status: "pending",
            version: 1,
            reason: "Compare current and historical identity evidence.",
            displayNameHint: "Current owner",
            source: .init(
                resourceID: "66666666-6666-4666-8666-666666666666",
                kind: "conversation_screenshot",
                displayName: "recycled-phone.png",
                observedAt: "2026-08-07T00:00:00.000Z",
                excerpt: "Phone: +6580805531",
                fragmentCount: 1
            ),
            candidates: [
                IdentityResolutionCandidate(
                    personID: currentPersonID,
                    displayLabel: "Current owner 080e5531",
                    contextCount: 1,
                    captureCount: 2,
                    relationshipContexts: [
                        .init(
                            id: currentContextID,
                            displayLabel: "Current client relationship"
                        )
                    ],
                    matchReasons: ["Current confirmed phone clue"]
                ),
                IdentityResolutionCandidate(
                    personID: historicalPersonID,
                    displayLabel: "Historical owner 080e5531",
                    contextCount: 1,
                    captureCount: 1,
                    relationshipContexts: [
                        .init(
                            id: historicalContextID,
                            displayLabel: "Prior candidate relationship"
                        )
                    ],
                    matchReasons: [
                        "Expired phone clue · explicit binding required"
                    ]
                )
            ],
            resolvedPersonID: nil,
            resolvedRelationshipContextID: nil
        )
    }

    private static func goldWiki() -> WikiCompilationReceipt {
        WikiCompilationReceipt(
            id: "77777777-7777-4777-8777-777777777777",
            personID: currentPersonID,
            relationshipContextID: currentContextID,
            status: "published",
            blocks: [
                .init(
                    id: "88888888-8888-4888-8888-888888888888",
                    type: "identity_context",
                    content: .init(
                        headline: "Current client relationship",
                        summary: nil,
                        items: ["One governed source"]
                    )
                )
            ],
            quality: .init(verdict: "gold", reasons: ["All gates pass."])
        )
    }
}

private struct LegacyPendingMetadata: Encodable {
    let id: UUID
    let fileName: String
    let mediaType: String
    let createdAt: Date
    let origin: CaptureOrigin
}

private actor RelationshipCaptureServiceStub: RelationshipCaptureServing {
    private let identityCase: IdentityResolutionCase
    private let decisionResult: IdentityDecisionResult
    private let wiki: WikiCompilationReceipt
    private let compileFailuresBeforeSuccess: Int
    private(set) var decisions: [IdentityDecision] = []
    private(set) var compileCount = 0
    private var bound = false
    private var claims: [CaptureChangeReview.Claim]
    private let loseFirstClaimResponse: Bool
    private(set) var createCount = 0
    private(set) var claimDecisions: [CaptureClaimDecision] = []
    private(set) var reviewFingerprints: [String] = []
    private var claimReceipts: [String: String] = [:]

    func loadCapture(id: String) async throws -> ResourceCaptureResult {
        ResourceCaptureResult(captureID: id, identity: .init(status: bound ? "bound" : "needs_review",
            personID: bound ? decisionResult.personID : nil,
            relationshipContextID: bound ? decisionResult.relationshipContextID : nil,
            resolutionCaseID: bound ? nil : identityCase.id, candidatePersonIDs: []),
            resource: .init(id: identityCase.source.resourceID, processingState: "ready", duplicateOfResourceID: nil, fragmentCount: 1))
    }
    func prepareChanges(captureID: String) async throws -> CaptureChangeReview {
        .init(resource: .init(id: identityCase.source.resourceID, captureID: captureID, authorization: "authorized", processingState: "ready"),
              fragments: [], claims: claims)
    }
    func decideClaim(_ decision: CaptureClaimDecision) async throws -> String {
        claimDecisions.append(decision)
        if let receipt = claimReceipts[decision.idempotencyKey] { return receipt }
        let receipt = UUID().uuidString
        claimReceipts[decision.idempotencyKey] = receipt
        if let index = claims.firstIndex(where: { $0.id == decision.assertionID }) {
            let old = claims[index]
            claims[index] = .init(id: old.id, field: old.field, proposedValue: old.proposedValue, priorValue: old.priorValue,
                quote: old.quote, reviewStatus: decision.decision == "confirm" ? "confirmed" : decision.decision == "dismiss" ? "dismissed" : "unresolved",
                proposalStatus: old.proposalStatus, version: old.version + 1, reviewToken: old.reviewToken,
                blockers: old.blockers, reviewedValue: decision.correctedValue ?? old.proposedValue, lastDecisionID: receipt)
        }
        if loseFirstClaimResponse && claimDecisions.count == 1 { throw URLError(.networkConnectionLost) }
        return receipt
    }
    func confirmSpeaker(_ decision: CaptureSpeakerDecision) async throws -> String { "speaker-receipt" }

    init(
        identityCase: IdentityResolutionCase,
        decisionResult: IdentityDecisionResult,
        wiki: WikiCompilationReceipt,
        compileFailuresBeforeSuccess: Int = 0,
        claims: [CaptureChangeReview.Claim] = [], loseFirstClaimResponse: Bool = false
    ) {
        self.identityCase = identityCase
        self.decisionResult = decisionResult
        self.wiki = wiki
        self.compileFailuresBeforeSuccess = compileFailuresBeforeSuccess
        self.claims = claims
        self.loseFirstClaimResponse = loseFirstClaimResponse
    }

    func createCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> ResourceCaptureResult {
        createCount += 1
        return ResourceCaptureResult(
            captureID: "99999999-9999-4999-8999-999999999999",
            identity: .init(
                status: "needs_review",
                personID: nil,
                relationshipContextID: nil,
                resolutionCaseID: identityCase.id,
                candidatePersonIDs: identityCase.candidates.map(\.personID)
            ),
            resource: .init(
                id: identityCase.source.resourceID,
                processingState: "needs_identity_review",
                duplicateOfResourceID: nil,
                fragmentCount: 1
            )
        )
    }

    func loadIdentityCase(id: String) async throws -> IdentityResolutionCase {
        identityCase
    }

    func decideIdentity(
        identityCase: IdentityResolutionCase,
        decision: IdentityDecision,
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> IdentityDecisionResult {
        decisions.append(decision)
        bound = decisionResult.identityStatus == "bound"
        return decisionResult
    }

    func compileWiki(
        personID: String,
        relationshipContextID: String,
        seedID: UUID,
        reviewFingerprint: String
    ) async throws -> WikiCompilationReceipt {
        compileCount += 1
        reviewFingerprints.append(reviewFingerprint)
        if compileCount <= compileFailuresBeforeSuccess {
            throw RelationshipCaptureServiceStubError.transientCompilation
        }
        return wiki
    }
}

private enum RelationshipCaptureServiceStubError: Error {
    case transientCompilation
}
