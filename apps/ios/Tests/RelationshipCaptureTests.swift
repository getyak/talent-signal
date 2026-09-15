import Foundation
import ImageIO
import UIKit
import UniformTypeIdentifiers
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

    func testScreenshotPreprocessingUploadNormalizerHonorsServerImageContract() throws {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 64, height: 64))
        let image = renderer.image { context in
            UIColor.systemBlue.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 64, height: 64))
        }
        let png = try XCTUnwrap(image.pngData())
        let unchanged = try ScreenshotPreprocessingUploadNormalizer.normalize(
            data: png,
            mediaType: "image/png"
        )
        XCTAssertEqual(unchanged.data, png)
        XCTAssertEqual(unchanged.mediaType, "image/png")

        let generic = try ScreenshotPreprocessingUploadNormalizer.normalize(
            data: png,
            mediaType: "application/octet-stream"
        )
        XCTAssertEqual(generic.mediaType, "image/jpeg")
        XCTAssertLessThanOrEqual(generic.data.count, ScreenshotPreprocessingUploadNormalizer.maximumByteCount)
        XCTAssertEqual(Array(generic.data.prefix(3)), [0xff, 0xd8, 0xff])
        XCTAssertNotNil(UIImage(data: generic.data))

        let longPNG = try XCTUnwrap(UIGraphicsImageRenderer(
            size: CGSize(width: 64, height: 5_000)
        ).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 64, height: 5_000))
        }.pngData())
        XCTAssertLessThan(longPNG.count, ScreenshotPreprocessingUploadNormalizer.maximumByteCount)
        let resizedLongPNG = try ScreenshotPreprocessingUploadNormalizer.normalize(
            data: longPNG,
            mediaType: "image/png"
        )
        let resizedLongImage = try XCTUnwrap(UIImage(data: resizedLongPNG.data))
        XCTAssertEqual(resizedLongPNG.mediaType, "image/jpeg")
        XCTAssertLessThanOrEqual(
            max(resizedLongImage.size.width, resizedLongImage.size.height),
            4_096
        )

        let portrait = UIGraphicsImageRenderer(size: CGSize(width: 40, height: 80)).image { context in
            UIColor.systemBlue.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 40, height: 80))
        }
        let heicBytes = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(
            heicBytes,
            UTType.heic.identifier as CFString,
            1,
            nil
        ))
        CGImageDestinationAddImage(
            destination,
            try XCTUnwrap(portrait.cgImage),
            [kCGImagePropertyOrientation: 6] as CFDictionary
        )
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        let heic = heicBytes as Data
        let normalizedHEIC = try ScreenshotPreprocessingUploadNormalizer.normalize(
            data: heic,
            mediaType: "image/heic"
        )
        let decodedHEIC = try XCTUnwrap(UIImage(data: normalizedHEIC.data))
        XCTAssertEqual(normalizedHEIC.mediaType, "image/jpeg")
        XCTAssertGreaterThan(decodedHEIC.size.width, decodedHEIC.size.height)

        let width = 2_048, height = 2_048
        var pixels = Data(count: width * height * 4)
        pixels.withUnsafeMutableBytes { bytes in
            if let baseAddress = bytes.baseAddress {
                arc4random_buf(baseAddress, bytes.count)
            }
        }
        let provider = try XCTUnwrap(CGDataProvider(data: pixels as CFData))
        let noisyImage = try XCTUnwrap(CGImage(
            width: width,
            height: height,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: false,
            intent: .defaultIntent
        ))
        let oversized = try XCTUnwrap(UIImage(cgImage: noisyImage).pngData())
        XCTAssertGreaterThan(oversized.count, ScreenshotPreprocessingUploadNormalizer.maximumByteCount)
        let compressed = try ScreenshotPreprocessingUploadNormalizer.normalize(
            data: oversized,
            mediaType: "image/png"
        )
        XCTAssertEqual(compressed.mediaType, "image/jpeg")
        XCTAssertLessThanOrEqual(compressed.data.count, ScreenshotPreprocessingUploadNormalizer.maximumByteCount)
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

    func testCaptureSessionAutoBindingRequiresOneCurrentPersonAndContext() throws {
        let current = Self.oneCurrentOwnerCase()
        let automatic = try XCTUnwrap(
            CaptureSessionDecisionPolicy.automaticBinding(for: current)
        )
        XCTAssertEqual(automatic.candidate.personID, Self.currentPersonID)
        XCTAssertEqual(automatic.context.id, Self.currentContextID)

        XCTAssertNil(
            CaptureSessionDecisionPolicy.automaticBinding(
                for: Self.twoOwnerCase()
            )
        )

        let twoOwners = Self.twoOwnerCase()
        let historical = IdentityResolutionCase(
            id: twoOwners.id,
            status: twoOwners.status,
            version: twoOwners.version,
            reason: twoOwners.reason,
            displayNameHint: twoOwners.displayNameHint,
            source: twoOwners.source,
            candidates: [twoOwners.candidates[1]],
            resolvedPersonID: nil,
            resolvedRelationshipContextID: nil
        )
        XCTAssertNil(
            CaptureSessionDecisionPolicy.automaticBinding(for: historical)
        )

        let candidate = current.candidates[0]
        let multipleContexts = IdentityResolutionCase(
            id: current.id,
            status: current.status,
            version: current.version,
            reason: current.reason,
            displayNameHint: current.displayNameHint,
            source: current.source,
            candidates: [
                IdentityResolutionCandidate(
                    personID: candidate.personID,
                    displayLabel: candidate.displayLabel,
                    contextCount: 2,
                    captureCount: candidate.captureCount,
                    relationshipContexts: candidate.relationshipContexts + [
                        .init(
                            id: Self.historicalContextID,
                            displayLabel: "Second relationship"
                        ),
                    ],
                    matchReasons: candidate.matchReasons
                ),
            ],
            resolvedPersonID: nil,
            resolvedRelationshipContextID: nil
        )
        XCTAssertNil(
            CaptureSessionDecisionPolicy.automaticBinding(
                for: multipleContexts
            )
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

    func testScreenshotPreprocessRequestIsStableAcrossInboxRoundTrip() async throws {
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
        let restoredInbox = PendingCaptureInbox(directoryURL: directory)
        let loadedSeed = try await restoredInbox.load(id: seed.id, scope: nil)
        let restoredSeed = try XCTUnwrap(loadedSeed)

        func encodedRequest(for value: PendingCaptureSeed) throws -> Data {
            let body = ScreenshotContactTaskBody(
                idempotencyKey: "ios:\(value.id.uuidString.lowercased()):preprocess-v1",
                objective: "Preprocess this recruiter-selected screenshot into reviewable, unconfirmed source evidence.",
                data: value.imageData,
                mediaType: value.mediaType,
                personID: nil,
                contextID: nil,
                capturedAt: value.createdAt,
                preprocessOnly: true,
                allowPublicResearch: false
            )
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            return try encoder.encode(body)
        }

        let initialRequest = try encodedRequest(for: seed)
        let restoredRequest = try encodedRequest(for: restoredSeed)
        XCTAssertEqual(initialRequest, restoredRequest)

        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: initialRequest) as? [String: Any]
        )
        let expectedCapturedAt = ISO8601DateFormatter().string(
            from: Date(
                timeIntervalSince1970: floor(seed.createdAt.timeIntervalSince1970)
            )
        )
        XCTAssertEqual(json["captured_at"] as? String, expectedCapturedAt.replacingOccurrences(of: "Z", with: ".000Z"))
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

    func testCalendarPendingWriteSurvivesStoreRecreationAndCannotBeClaimedTwice() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let suite = "calendar-pending-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { try? FileManager.default.removeItem(at: directory); defaults.removePersistentDomain(forName: suite) }
        let proposal = DeviceCalendarProposal(sourceID: UUID().uuidString, personDisplayName: "Synthetic",
            title: "Synthetic event", startDate: Date(timeIntervalSince1970: 1000), endDate: Date(timeIntervalSince1970: 2800),
            timeZoneIdentifier: "Asia/Shanghai", evidenceQuote: "Private source", detectedDateText: "", durationWasExplicit: true)
        let first = DeviceCalendarReceiptStore(defaults: defaults, attemptDirectory: directory)
        XCTAssertTrue(try first.claimWrite(for: proposal))
        // EventKit may have committed; no receipt reaches the UI before recreation.
        let restored = DeviceCalendarReceiptStore(defaults: defaults, attemptDirectory: directory)
        XCTAssertTrue(restored.hasPendingWrite(for: proposal.sourceID))
        XCTAssertFalse(try restored.claimWrite(for: proposal))
        XCTAssertNil(restored.receipt(for: proposal.sourceID))
        let edited = DeviceCalendarSavedEvent(identifier: "verified-event", title: "Reviewed title",
            startDate: proposal.startDate.addingTimeInterval(3600), endDate: proposal.endDate.addingTimeInterval(3600), timeZoneIdentifier: "Asia/Shanghai")
        XCTAssertTrue(restored.recordSaved(sourceID: proposal.sourceID, eventIdentifier: "verified-event", savedEvent: edited))
        defaults.removePersistentDomain(forName: suite)
        let durable = DeviceCalendarReceiptStore(defaults: defaults, attemptDirectory: directory)
        XCTAssertEqual(durable.receipt(for: proposal.sourceID)?.eventIdentifier, "verified-event")
        XCTAssertEqual(durable.receipt(for: proposal.sourceID)?.savedEvent, edited)
        XCTAssertFalse(try durable.claimWrite(for: proposal))
    }

    func testCalendarReceiptsAreScopedProtectedAndRedactedWithoutLosingDuplicateGuard() throws {
        let scopeA = "calendar-owner-a-" + UUID().uuidString, scopeB = "calendar-owner-b-" + UUID().uuidString
        let directory = RuntimeScopedDirectories.directory("CalendarWriteAttempts", scope: scopeA)
        defer { try? FileManager.default.removeItem(at: directory) }
        let first = DeviceCalendarReceiptStore(scope: scopeA), other = DeviceCalendarReceiptStore(scope: scopeB)
        let source = UUID().uuidString
        let event = DeviceCalendarSavedEvent(identifier: "synthetic-event", title: "Sensitive synthetic title", startDate: .now, endDate: .now, timeZoneIdentifier: "UTC")
        XCTAssertTrue(first.recordSaved(sourceID: source, eventIdentifier: event.identifier, savedEvent: event))
        XCTAssertEqual(first.receipt(for: source)?.savedEvent, event)
        XCTAssertNil(other.receipt(for: source)); XCTAssertFalse(other.hasPendingWrite(for: source))
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        XCTAssertEqual(files.count, 1)
        XCTAssertEqual(try directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        let protection = try FileManager.default.attributesOfItem(atPath: files[0].path)[.protectionKey] as? FileProtectionType
#if targetEnvironment(simulator)
        XCTAssertTrue(protection == nil || protection == .complete, "Simulator may not expose device Data Protection; device validation remains separate.")
#else
        XCTAssertEqual(protection, .complete)
#endif
        try first.clearPrivateDetails()
        let restored = DeviceCalendarReceiptStore(scope: scopeA)
        XCTAssertNil(restored.receipt(for: source)); XCTAssertTrue(restored.hasPendingWrite(for: source))
        XCTAssertFalse(try String(contentsOf: files[0], encoding: .utf8).contains(event.title))
    }

    func testExpiredCalendarDetailsBecomeContentFreeDuplicateGuard() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = DeviceCalendarReceiptStore(attemptDirectory: directory), source = UUID().uuidString
        let saved = Date(timeIntervalSince1970: 1000)
        XCTAssertTrue(store.recordSaved(sourceID: source, eventIdentifier: "synthetic", savedAt: saved))
        XCTAssertNil(store.receipt(for: source, now: saved.addingTimeInterval(31 * 86_400)))
        XCTAssertTrue(store.hasPendingWrite(for: source))
        let file = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)[0]
        XCTAssertFalse(try String(contentsOf: file, encoding: .utf8).contains("eventIdentifier"))
    }

    func testCalendarStoreStartupSweepsOldDetailsWithoutReadingTheirSource() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = DeviceCalendarReceiptStore(attemptDirectory: directory), old = UUID().uuidString, fresh = UUID().uuidString
        XCTAssertTrue(store.recordSaved(sourceID: old, eventIdentifier: "old-private-event", savedAt: Date().addingTimeInterval(-31 * 86_400)))
        XCTAssertTrue(store.recordSaved(sourceID: fresh, eventIdentifier: "new-event"))
        let restored = DeviceCalendarReceiptStore(attemptDirectory: directory)
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        for file in files { XCTAssertFalse(try String(contentsOf: file, encoding: .utf8).contains("old-private-event")) }
        XCTAssertTrue(restored.hasPendingWrite(for: old)); XCTAssertNotNil(restored.receipt(for: fresh))
    }

    func testOldSignOutCleanupPreservesNewerSessionCalendarDetails() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = DeviceCalendarReceiptStore(attemptDirectory: directory), old = UUID().uuidString, fresh = UUID().uuidString
        let cutoff = Date()
        XCTAssertTrue(store.recordSaved(sourceID: old, eventIdentifier: "old-event", savedAt: cutoff.addingTimeInterval(-1)))
        XCTAssertTrue(store.recordSaved(sourceID: fresh, eventIdentifier: "new-event", savedAt: cutoff.addingTimeInterval(1)))
        try store.clearPrivateDetails(savedBefore: cutoff)
        XCTAssertNil(store.receipt(for: old)); XCTAssertTrue(store.hasPendingWrite(for: old))
        XCTAssertEqual(store.receipt(for: fresh)?.eventIdentifier, "new-event")
    }

    func testCalendarReceiptStoreKeepsOneSavedResultPerCapture() throws {
        let suiteName = "calendar-receipt-tests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = DeviceCalendarReceiptStore(defaults: defaults, attemptDirectory: directory)
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
        XCTAssertNil(store.receipt(for: "capture-1")?.savedEvent)
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

    func testPendingInboxSummariesPreserveOrderAndRuntimeScope() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-inbox-summaries-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)

        let first = try await inbox.stage(
            imageData: Data([1]),
            fileName: "first.png",
            mediaType: "image/png",
            origin: .appShortcut
        )
        try await inbox.claim(id: first.id, scope: "scope-a")
        let second = try await inbox.stage(
            imageData: Data([2]),
            fileName: "second.png",
            mediaType: "image/png",
            origin: .photosPicker
        )
        try await inbox.claim(id: second.id, scope: "scope-b")
        let unclaimed = try await inbox.stage(
            imageData: Data([3]),
            fileName: "unclaimed.png",
            mediaType: "image/png",
            origin: .photosPicker
        )

        let scopeA = try await inbox.summaries(scope: "scope-a")
        let scopeB = try await inbox.summaries(scope: "scope-b")
        let unscoped = try await inbox.summaries()

        XCTAssertEqual(scopeA.map(\.id), [first.id, unclaimed.id])
        XCTAssertEqual(scopeB.map(\.id), [second.id, unclaimed.id])
        XCTAssertEqual(unscoped.map(\.id), [unclaimed.id])
        XCTAssertTrue(scopeA.allSatisfy(\.originalAvailable))
        XCTAssertTrue(scopeA.allSatisfy { !$0.hasSavedProgress })
        let outOfScope = try await inbox.load(id: first.id, scope: "scope-b")
        let inScope = try await inbox.load(id: second.id, scope: "scope-b")
        XCTAssertNil(outOfScope)
        XCTAssertEqual(inScope?.fileName, "second.png")
    }

    @MainActor
    func testCaptureHandoffResumesAndDeletesChosenInboxItem() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-handoff-inbox-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let first = try await inbox.stage(
            imageData: Data([1]),
            fileName: "first.png",
            mediaType: "image/png",
            origin: .appShortcut
        )
        let second = try await inbox.stage(
            imageData: Data([2]),
            fileName: "second.png",
            mediaType: "image/png",
            origin: .photosPicker
        )
        let store = CaptureHandoffStore(inbox: inbox)

        await store.restorePendingCapture()
        XCTAssertEqual(store.inboxItems.map(\.id), [first.id, second.id])
        XCTAssertNil(store.pendingSeed)
        XCTAssertEqual(store.savedSeed?.id, first.id)

        store.keepForLater()
        await store.resume(id: second.id)
        XCTAssertEqual(store.pendingSeed?.id, second.id)

        store.keepForLater()
        try await store.removeFromInbox(id: second.id)
        XCTAssertEqual(store.inboxItems.map(\.id), [first.id])
        XCTAssertEqual(store.savedSeed?.id, first.id)
        XCTAssertNil(store.pendingSeed)
    }

    @MainActor
    func testCaptureProcessingCreatesOneStableSessionAndKeepsResolvedProposalQuiet() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-capture-session-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let seed = try await inbox.stage(
            imageData: Data([1, 2, 3]),
            fileName: "one-match.png",
            mediaType: "image/png",
            origin: .photosPicker
        )
        let stagedSummaries = try await inbox.summaries()
        let summary = try XCTUnwrap(stagedSummaries.first)
        let sessionID = try XCTUnwrap(summary.sessionID)
        let service = RelationshipCaptureServiceStub(
            identityCase: Self.oneCurrentOwnerCase(),
            decisionResult: IdentityDecisionResult(
                decision: "bind_existing",
                identityStatus: "bound",
                personID: Self.currentPersonID,
                relationshipContextID: Self.currentContextID,
                resourceProcessingState: "needs_fact_review"
            ),
            wiki: Self.goldWiki(),
            captureCandidatePersonIDs: [Self.currentPersonID],
            preprocessingTaskID: "99999999-9999-4999-8999-999999999998",
            preprocessingTaskRevision: 4
        )
        let handoff = CaptureHandoffStore(inbox: inbox)
        let sessions = AgentSessionStore()

        await handoff.restorePendingCapture()
        await handoff.processPendingCaptures(
            sessionStore: sessions,
            service: service
        )

        XCTAssertTrue(handoff.inboxItems.isEmpty)
        let removedSeed = try await inbox.load(id: seed.id, scope: nil)
        XCTAssertNil(removedSeed)
        let session = try XCTUnwrap(sessions.session(id: sessionID))
        XCTAssertEqual(session.turns.count, 1)
        XCTAssertEqual(
            session.turns.first?.response.taskID,
            "capture-\(seed.id.uuidString.lowercased())"
        )
        XCTAssertFalse(session.isUnread)
        let firstCreateCount = await service.createCount
        XCTAssertEqual(firstCreateCount, 1)
        let decisions = await service.decisions
        guard case let .bindFromAgent(candidate, context) = try XCTUnwrap(
            decisions.first
        ) else {
            return XCTFail("Expected the Agent Session to bind the unique current match.")
        }
        XCTAssertEqual(candidate.personID, Self.currentPersonID)
        XCTAssertEqual(context.id, Self.currentContextID)
        let links = await service.preprocessingLinks
        XCTAssertEqual(links.count, 1)
        XCTAssertEqual(links.first?.taskID, "99999999-9999-4999-8999-999999999998")
        XCTAssertEqual(links.first?.expectedRevision, 4)
        XCTAssertEqual(links.first?.captureID, "99999999-9999-4999-8999-999999999999")
        XCTAssertEqual(links.first?.sourceResourceID, Self.oneCurrentOwnerCase().source.resourceID)

        await handoff.processPendingCaptures(
            sessionStore: sessions,
            service: service
        )
        XCTAssertEqual(sessions.session(id: sessionID)?.turns.count, 1)
        let finalCreateCount = await service.createCount
        XCTAssertEqual(finalCreateCount, 1)
    }

    @MainActor
    func testCaptureProcessingReconcilesACommittedPreprocessingLinkAfterResponseLoss() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-capture-link-recovery-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let seed = try await inbox.stage(
            imageData: Data([1, 2, 3]),
            fileName: "link-response-loss.png",
            mediaType: "image/png",
            origin: .appShortcut
        )
        let summaries = try await inbox.summaries()
        let sessionID = try XCTUnwrap(summaries.first?.sessionID)
        let service = RelationshipCaptureServiceStub(
            identityCase: Self.oneCurrentOwnerCase(),
            decisionResult: IdentityDecisionResult(
                decision: "bind_existing",
                identityStatus: "bound",
                personID: Self.currentPersonID,
                relationshipContextID: Self.currentContextID,
                resourceProcessingState: "needs_fact_review"
            ),
            wiki: Self.goldWiki(),
            captureCandidatePersonIDs: [Self.currentPersonID],
            preprocessingTaskID: "99999999-9999-4999-8999-999999999993",
            preprocessingTaskRevision: 4,
            loseFirstPreprocessingLinkResponse: true
        )
        let handoff = CaptureHandoffStore(inbox: inbox)
        let sessions = AgentSessionStore()

        await handoff.processPendingCaptures(sessionStore: sessions, service: service)
        XCTAssertEqual(handoff.inboxItems.first?.processingState, .failed)
        let firstLinks = await service.preprocessingLinks
        XCTAssertEqual(firstLinks.count, 1)
        XCTAssertEqual(
            sessions.session(id: sessionID)?.turns.first?.response.taskID,
            "capture-\(seed.id.uuidString.lowercased())-failed"
        )

        await handoff.processPendingCaptures(sessionStore: sessions, service: service)
        XCTAssertTrue(handoff.inboxItems.isEmpty)
        let links = await service.preprocessingLinks
        XCTAssertEqual(links.count, 2)
        XCTAssertEqual(links.map(\.expectedRevision), [4, 4])
        XCTAssertEqual(links.map(\.captureID), Array(repeating: "99999999-9999-4999-8999-999999999999", count: 2))
        XCTAssertTrue(sessions.session(id: sessionID)?.turns.contains(where: {
            $0.response.taskID == "capture-\(seed.id.uuidString.lowercased())"
        }) == true)
        XCTAssertFalse(sessions.session(id: sessionID)?.isUnread ?? true)
    }

    @MainActor
    func testCaptureProcessingPreservesWaitingZeroMessageReceiptForRetryAndDiscard() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-waiting-zero-message-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let seed = try await inbox.stage(
            imageData: Data([1, 2, 3]), fileName: "waiting-zero.png",
            mediaType: "image/png", origin: .appShortcut
        )
        var waitingDraft = RecognizedCaptureDraft.empty
        waitingDraft.preprocessingTaskID = "99999999-9999-4999-8999-999999999989"
        waitingDraft.preprocessingTaskRevision = 2
        waitingDraft.preprocessingRetryRequired = true
        waitingDraft.preprocessingUncertainties = ["Inspect the unreadable bubble in source image 1."]
        var resumedDraft = CaptureDraftBuilder.makeDraft(from: "Visible after bounded retry")
        resumedDraft.preprocessingTaskID = waitingDraft.preprocessingTaskID
        resumedDraft.preprocessingTaskRevision = 3
        resumedDraft.preprocessingRetryRequired = false
        let service = RelationshipCaptureServiceStub(
            identityCase: Self.twoOwnerCase(),
            decisionResult: .init(
                decision: "leave_unresolved", identityStatus: "unresolved",
                personID: nil, relationshipContextID: nil,
                resourceProcessingState: "needs_identity_review"
            ),
            wiki: Self.goldWiki(),
            preprocessedDraftOverride: waitingDraft,
            resumedPreprocessedDraft: resumedDraft
        )
        let handoff = CaptureHandoffStore(inbox: inbox)
        let sessions = AgentSessionStore()

        await handoff.processPendingCaptures(sessionStore: sessions, service: service)
        XCTAssertEqual(handoff.inboxItems.first?.processingState, .needsDecision)
        let createCount = await service.createCount
        let deletesBeforeReview = await service.preprocessingDeletes
        XCTAssertEqual(createCount, 0)
        XCTAssertTrue(deletesBeforeReview.isEmpty)
        let savedDraft = try await inbox.loadDraft(for: seed.id)
        XCTAssertEqual(savedDraft?.preprocessingTaskID, waitingDraft.preprocessingTaskID)
        XCTAssertEqual(savedDraft?.preprocessingTaskRevision, 2)
        XCTAssertEqual(savedDraft?.preprocessingRetryRequired, true)

        let review = RelationshipCaptureStore(seed: seed, service: service, inbox: inbox)
        review.start()
        try await waitUntil {
            guard case let .failed(failure) = review.stage else { return false }
            return failure.recoveryStage == .recognition
        }
        review.retry()
        try await waitUntil { review.stage == .reviewing }
        XCTAssertEqual(review.draft.reviewedText, "Visible after bounded retry")
        XCTAssertEqual(review.draft.preprocessingTaskRevision, 3)

        let didDiscard = await review.discard()
        XCTAssertTrue(didDiscard)
        let deletes = await service.preprocessingDeletes
        XCTAssertEqual(deletes.map(\.revision), [3])
        let remaining = try await inbox.count()
        XCTAssertEqual(remaining, 0)
    }

    @MainActor
    func testCaptureProcessingSurfacesOnlyAConcreteIdentityDecision() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-capture-decision-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let seed = try await inbox.stage(
            imageData: Data([4, 5, 6]),
            fileName: "ambiguous.png",
            mediaType: "image/png",
            origin: .appShortcut
        )
        let service = RelationshipCaptureServiceStub(
            identityCase: Self.twoOwnerCase(),
            decisionResult: IdentityDecisionResult(
                decision: "leave_unresolved",
                identityStatus: "unresolved",
                personID: nil,
                relationshipContextID: nil,
                resourceProcessingState: "needs_identity_review"
            ),
            wiki: Self.goldWiki(),
            preprocessedText: "Shared phone number"
        )
        let handoff = CaptureHandoffStore(inbox: inbox)
        let sessions = AgentSessionStore()

        await handoff.restorePendingCapture()
        await handoff.processPendingCaptures(
            sessionStore: sessions,
            service: service
        )

        let item = try XCTUnwrap(handoff.inboxItems.first)
        XCTAssertEqual(item.id, seed.id)
        XCTAssertEqual(item.processingState, .needsDecision)
        XCTAssertEqual(handoff.attentionCount, 1)
        let session = try XCTUnwrap(sessions.session(id: item.sessionID))
        XCTAssertTrue(session.isUnread)
        XCTAssertEqual(session.turns.count, 1)
        XCTAssertTrue(
            session.turns[0].response.blocks.contains(where: \.requiresUserDecision)
        )

        try await handoff.removeFromInbox(id: seed.id)

        let resolvedSession = try XCTUnwrap(sessions.session(id: item.sessionID))
        XCTAssertFalse(resolvedSession.isUnread)
        XCTAssertEqual(resolvedSession.turns.count, 2)
        XCTAssertEqual(
            resolvedSession.turns.last?.response.taskID,
            "capture-\(seed.id.uuidString.lowercased())-resolved"
        )
        XCTAssertTrue(handoff.inboxItems.isEmpty)
    }

    func testURLCaptureClientUsesSharedPreprocessingWithoutFiling() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RelationshipCaptureURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel(); RelationshipCaptureURLProtocol.handler = nil }
        RelationshipCaptureURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/v1/contact-agent/tasks")
            let body = try XCTUnwrap(RelationshipCaptureURLProtocol.bodyData(request))
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(json["preprocess_only"] as? Bool, true)
            XCTAssertEqual(json["allow_public_research"] as? Bool, false)
            let timestamp = "2026-09-15T09:00:00.000Z"
            let response: [String: Any] = [
                "task_id": "99999999-9999-4999-8999-999999999991", "revision": 2, "status": "completed",
                "contact": NSNull(), "capture_id": NSNull(), "source_resource_id": NSNull(), "message_count": 0,
                "extraction": ["platform": "WeChat", "conversation_kind": "direct", "contact_name": "Alex Chen",
                    "identity_clues": [["kind": "handle", "value": "alexchen", "source_excerpt": "WeChat: alexchen", "source_image_index": 0]],
                    "messages": [["message_id": "m1", "sequence": 0, "text": "Available next Tuesday", "speaker_side": "left",
                        "speaker_label": "Alex Chen", "time_text": NSNull(), "source_image_index": 0]], "uncertainties": []],
                "summary": "Preprocessed only", "findings": [], "profile_fields": [], "public_sources": [], "question": NSNull(),
                "candidates": [], "limitations": [], "events": [], "external_effects": [], "created_at": timestamp, "updated_at": timestamp,
            ]
            return (201, try JSONSerialization.data(withJSONObject: response))
        }
        let client = URLRelationshipCaptureClient(baseURL: URL(string: "https://capture.test")!, session: network, accessToken: "access-token")
        let draft = try await client.preprocessScreenshot(seed: PendingCaptureSeed(
            imageData: try Self.screenshotPNG(), fileName: "conversation.png",
            mediaType: "image/png", origin: .photosPicker
        ))
        XCTAssertEqual(draft.reviewedText, "Available next Tuesday")
        XCTAssertEqual(draft.displayNameHint, "Alex Chen")
        XCTAssertTrue(draft.handleValue.isEmpty)
        XCTAssertEqual(draft.sourceParserName, "shared-screenshot-preprocess")
        XCTAssertEqual(draft.preprocessingUncertainties, [
            "A visible platform handle remains untyped and must be reviewed before identity matching."
        ])
        XCTAssertEqual(draft.preprocessingTaskID, "99999999-9999-4999-8999-999999999991")
        XCTAssertEqual(draft.preprocessingTaskRevision, 2)
        XCTAssertEqual(draft.preprocessedMessages, [
            .init(messageID: "m1", sequence: 0, text: "Available next Tuesday",
                  speakerSide: "left", speakerLabel: "Alex Chen", timeText: nil, sourceImageIndex: 0),
        ])
    }

    func testURLCaptureClientRejectsProfileCluesWithoutConversationMessages() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RelationshipCaptureURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel(); RelationshipCaptureURLProtocol.handler = nil }
        var requestCount = 0
        RelationshipCaptureURLProtocol.handler = { request in
            requestCount += 1
            let timestamp = "2026-09-15T09:00:00.000Z"
            if requestCount == 2 {
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(
                    request.url?.path,
                    "/v1/contact-agent/tasks/99999999-9999-4999-8999-999999999990/delete"
                )
                let body = try XCTUnwrap(RelationshipCaptureURLProtocol.bodyData(request))
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(json["expected_revision"] as? Int, 2)
                return (200, try JSONSerialization.data(withJSONObject: [
                    "task_id": "99999999-9999-4999-8999-999999999990", "revision": 3, "status": "deleted",
                    "contact": NSNull(), "capture_id": NSNull(), "source_resource_id": NSNull(), "message_count": 0,
                    "extraction": NSNull(), "summary": "", "findings": [], "profile_fields": [], "public_sources": [],
                    "question": NSNull(), "candidates": [], "limitations": [], "events": [], "external_effects": [],
                    "created_at": timestamp, "updated_at": timestamp,
                ]))
            }
            XCTAssertEqual(requestCount, 1)
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/v1/contact-agent/tasks")
            let response: [String: Any] = [
                "task_id": "99999999-9999-4999-8999-999999999990", "revision": 2, "status": "completed",
                "contact": NSNull(), "capture_id": NSNull(), "source_resource_id": NSNull(), "message_count": 0,
                "extraction": ["platform": "LinkedIn", "conversation_kind": "profile", "contact_name": "Alex Chen",
                    "identity_clues": [
                        ["kind": "company", "value": "Acme", "source_excerpt": "Acme", "source_image_index": 0],
                        ["kind": "handle", "value": "alexchen", "source_excerpt": "linkedin.com/in/alexchen", "source_image_index": 0],
                    ],
                    "messages": [], "uncertainties": []],
                "summary": "Profile evidence only", "findings": [], "profile_fields": [], "public_sources": [],
                "question": NSNull(), "candidates": [], "limitations": [], "events": [], "external_effects": [],
                "created_at": timestamp, "updated_at": timestamp,
            ]
            return (201, try JSONSerialization.data(withJSONObject: response))
        }
        let client = URLRelationshipCaptureClient(
            baseURL: URL(string: "https://capture.test")!, session: network, accessToken: "access-token"
        )

        do {
            _ = try await client.preprocessScreenshot(seed: PendingCaptureSeed(
                imageData: try Self.screenshotPNG(), fileName: "profile.png",
                mediaType: "image/png", origin: .photosPicker
            ))
            XCTFail("Profile clues must not be promoted into synthetic conversation messages.")
        } catch ConversationRecognitionError.noConversationEvidence { }
        XCTAssertEqual(requestCount, 2)
    }

    func testURLCaptureClientPreservesWaitingZeroMessageReceiptForExplicitRetry() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RelationshipCaptureURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel(); RelationshipCaptureURLProtocol.handler = nil }
        let taskID = "99999999-9999-4999-8999-999999999989"
        let timestamp = "2026-09-15T09:00:00.000Z"
        func response(waiting: Bool) throws -> Data {
            let extraction: [String: Any] = [
                "platform": "WeChat", "conversation_kind": "direct", "contact_name": "Alex Chen",
                "identity_clues": [],
                "messages": waiting ? [] : [[
                    "message_id": "m1", "sequence": 0, "text": "Visible after bounded retry",
                    "speaker_side": "left", "speaker_label": "Alex Chen", "time_text": NSNull(),
                    "source_image_index": 0,
                ]],
                "uncertainties": [],
            ]
            return try JSONSerialization.data(withJSONObject: [
                "task_id": taskID, "revision": waiting ? 2 : 3,
                "status": waiting ? "waiting_for_user" : "completed",
                "contact": NSNull(), "capture_id": NSNull(), "source_resource_id": NSNull(), "message_count": 0,
                "extraction": extraction,
                "preprocessing": ["sources": [["source_image_index": 0, "follow_up_required": waiting,
                    "follow_up_regions": waiting ? [["reason": "illegible_text", "field": "text",
                        "region": ["left": 4, "top": 8, "width": 20, "height": 12]]] : []]]],
                "summary": "Bounded preprocessing", "findings": [], "profile_fields": [], "public_sources": [],
                "question": waiting ? "Inspect the unreadable bubble." : NSNull(), "candidates": [],
                "limitations": [], "events": [], "external_effects": [],
                "created_at": timestamp, "updated_at": timestamp,
            ])
        }
        var requestCount = 0
        RelationshipCaptureURLProtocol.handler = { request in
            requestCount += 1
            switch requestCount {
            case 1, 2:
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.url?.path, "/v1/contact-agent/tasks")
                return (requestCount == 1 ? 201 : 200, try response(waiting: true))
            case 3:
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.url?.path, "/v1/contact-agent/tasks/\(taskID)/resume")
                let body = try XCTUnwrap(RelationshipCaptureURLProtocol.bodyData(request))
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(json["expected_revision"] as? Int, 2)
                return (200, try response(waiting: false))
            default:
                XCTFail("Waiting preprocessing must not issue an implicit delete.")
                return (500, Data())
            }
        }
        let client = URLRelationshipCaptureClient(
            baseURL: URL(string: "https://capture.test")!, session: network, accessToken: "access-token"
        )
        let seed = PendingCaptureSeed(
            imageData: try Self.screenshotPNG(), fileName: "waiting-zero.png",
            mediaType: "image/png", origin: .photosPicker
        )

        let waiting = try await client.preprocessScreenshot(seed: seed)
        XCTAssertFalse(waiting.canSubmit)
        XCTAssertEqual(waiting.preprocessingTaskID, taskID)
        XCTAssertEqual(waiting.preprocessingTaskRevision, 2)
        XCTAssertEqual(waiting.preprocessingRetryRequired, true)
        XCTAssertEqual(waiting.preprocessingUncertainties, [
            "Inspect the unreadable bubble.",
            "Source image 1 needs a text check for illegible_text at region (4, 8, 20, 12).",
        ])
        XCTAssertEqual(requestCount, 1)

        let recovered = try await client.resumeScreenshotPreprocessing(seed: seed)
        XCTAssertEqual(recovered.reviewedText, "Visible after bounded retry")
        XCTAssertEqual(recovered.preprocessingTaskRevision, 3)
        XCTAssertEqual(recovered.preprocessingRetryRequired, false)
        XCTAssertEqual(requestCount, 3)
    }

    func testURLCaptureClientSurfacesFollowUpRegionOnlyWhileWaiting() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RelationshipCaptureURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel(); RelationshipCaptureURLProtocol.handler = nil }
        var requestCount = 0
        RelationshipCaptureURLProtocol.handler = { request in
            requestCount += 1
            XCTAssertEqual(request.url?.path, "/v1/contact-agent/tasks")
            let timestamp = "2026-09-15T09:00:00.000Z"
            let waiting = requestCount == 1
            let response: [String: Any] = [
                "task_id": "99999999-9999-4999-8999-999999999993", "revision": 3,
                "status": waiting ? "waiting_for_user" : "completed", "contact": NSNull(), "capture_id": NSNull(),
                "source_resource_id": NSNull(), "message_count": 0,
                "extraction": ["platform": "WeChat", "conversation_kind": "direct",
                    "contact_name": NSNull(), "identity_clues": [],
                    "messages": [["message_id": "m1", "sequence": 0, "text": "Maybe Tuesday",
                        "speaker_side": "unknown", "speaker_label": NSNull(), "time_text": NSNull(),
                        "source_image_index": 0]], "uncertainties": []],
                "preprocessing": ["sources": [["source_image_index": 0, "follow_up_required": true,
                    "follow_up_regions": [["reason": "ambiguous_time", "field": "time",
                        "region": ["left": 10, "top": 20, "width": 30, "height": 40]]]]]],
                "summary": "Waiting for review", "findings": [], "profile_fields": [],
                "public_sources": [], "question": waiting ? "Check the visible date in the original." : NSNull(),
                "candidates": [], "limitations": [], "events": [], "external_effects": [],
                "created_at": timestamp, "updated_at": timestamp,
            ]
            return (201, try JSONSerialization.data(withJSONObject: response))
        }
        let client = URLRelationshipCaptureClient(
            baseURL: URL(string: "https://capture.test")!, session: network, accessToken: "access-token"
        )
        let draft = try await client.preprocessScreenshot(seed: PendingCaptureSeed(
            imageData: try Self.screenshotPNG(), fileName: "waiting.png", mediaType: "image/png", origin: .photosPicker
        ))
        XCTAssertEqual(draft.preprocessingUncertainties, [
            "Check the visible date in the original.",
            "Source image 1 needs a time check for ambiguous_time at region (10, 20, 30, 40).",
        ])
        let completedDraft = try await client.preprocessScreenshot(seed: PendingCaptureSeed(
            imageData: try Self.screenshotPNG(background: .systemBlue), fileName: "resolved.png",
            mediaType: "image/png", origin: .photosPicker
        ))
        XCTAssertNil(completedDraft.preprocessingUncertainties)
    }

    func testURLCaptureClientDeletesPreprocessingTaskWithExactRevision() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RelationshipCaptureURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel(); RelationshipCaptureURLProtocol.handler = nil }
        let taskID = "99999999-9999-4999-8999-999999999994"
        RelationshipCaptureURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/v1/contact-agent/tasks/\(taskID)/delete")
            let body = try XCTUnwrap(RelationshipCaptureURLProtocol.bodyData(request))
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(json["expected_revision"] as? Int, 4)
            let timestamp = "2026-09-15T09:00:00.000Z"
            let response: [String: Any] = [
                "task_id": taskID, "revision": 5, "status": "deleted", "contact": NSNull(),
                "capture_id": NSNull(), "source_resource_id": NSNull(), "message_count": 0,
                "extraction": NSNull(), "summary": "", "findings": [], "profile_fields": [],
                "public_sources": [], "question": NSNull(), "candidates": [], "limitations": [],
                "events": [], "external_effects": [], "created_at": timestamp, "updated_at": timestamp,
            ]
            return (200, try JSONSerialization.data(withJSONObject: response))
        }
        let client = URLRelationshipCaptureClient(
            baseURL: URL(string: "https://capture.test")!, session: network, accessToken: "access-token"
        )
        try await client.deleteScreenshotPreprocessing(taskID: taskID, expectedRevision: 4)
    }

    func testURLCaptureClientLinksPreprocessingTaskToCanonicalCapture() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RelationshipCaptureURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel(); RelationshipCaptureURLProtocol.handler = nil }
        let taskID = "99999999-9999-4999-8999-999999999994"
        let captureID = "88888888-8888-4888-8888-888888888888"
        let resourceID = "77777777-7777-4777-8777-777777777777"
        RelationshipCaptureURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/v1/contact-agent/tasks/\(taskID)/capture-link")
            let body = try XCTUnwrap(RelationshipCaptureURLProtocol.bodyData(request))
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(json["expected_revision"] as? Int, 4)
            XCTAssertEqual(json["capture_id"] as? String, captureID)
            XCTAssertEqual(json["source_resource_id"] as? String, resourceID)
            return (200, try JSONSerialization.data(withJSONObject: [
                "task_id": taskID,
                "revision": 5,
                "capture_id": captureID,
                "source_resource_id": resourceID,
            ]))
        }
        let client = URLRelationshipCaptureClient(
            baseURL: URL(string: "https://capture.test")!, session: network, accessToken: "access-token"
        )
        let revision = try await client.linkScreenshotPreprocessing(
            taskID: taskID,
            expectedRevision: 4,
            captureID: captureID,
            sourceResourceID: resourceID
        )
        XCTAssertEqual(revision, 5)
    }

    func testURLCaptureClientResumesFailedPreprocessingOnlyAfterUserRetry() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RelationshipCaptureURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel(); RelationshipCaptureURLProtocol.handler = nil }
        let taskID = "99999999-9999-4999-8999-999999999992"
        let timestamp = "2026-09-15T09:00:00.000Z"
        func response(status: String, revision: Int, extraction: [String: Any]? = nil) throws -> Data {
            let value: [String: Any] = [
                "task_id": taskID, "revision": revision, "status": status,
                "contact": NSNull(), "capture_id": NSNull(), "source_resource_id": NSNull(), "message_count": 0,
                "extraction": extraction ?? NSNull(), "summary": "Synthetic preprocessing state", "findings": [],
                "profile_fields": [], "public_sources": [], "question": status == "waiting_for_user"
                    ? "Check the unresolved field." : NSNull(), "candidates": [], "limitations": [], "events": [],
                "external_effects": [], "created_at": timestamp, "updated_at": timestamp,
            ]
            return try JSONSerialization.data(withJSONObject: value)
        }
        var call = 0
        RelationshipCaptureURLProtocol.handler = { request in
            call += 1
            switch call {
            case 1:
                XCTAssertEqual(request.url?.path, "/v1/contact-agent/tasks")
                return (201, try response(status: "running", revision: 1))
            case 2:
                XCTAssertEqual(request.httpMethod, "GET")
                XCTAssertEqual(request.url?.path, "/v1/contact-agent/tasks/\(taskID)")
                return (200, try response(status: "failed", revision: 2))
            case 3:
                XCTAssertEqual(request.url?.path, "/v1/contact-agent/tasks")
                return (200, try response(status: "failed", revision: 2))
            case 4:
                XCTAssertEqual(request.url?.path, "/v1/contact-agent/tasks")
                return (200, try response(status: "failed", revision: 2))
            case 5:
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.url?.path, "/v1/contact-agent/tasks/\(taskID)/resume")
                let body = try XCTUnwrap(RelationshipCaptureURLProtocol.bodyData(request))
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(json["expected_revision"] as? Int, 2)
                let extraction: [String: Any] = [
                    "platform": "WeChat", "conversation_kind": "direct", "contact_name": "Alex Chen",
                    "identity_clues": [], "messages": [["message_id": "m1", "sequence": 0,
                        "text": "Retry succeeded", "speaker_side": "unknown", "speaker_label": NSNull(),
                        "time_text": NSNull(), "source_image_index": 0]],
                    "uncertainties": ["Speaker remains unreadable in original image 1."],
                ]
                return (200, try response(status: "waiting_for_user", revision: 3, extraction: extraction))
            default:
                XCTFail("Unexpected preprocessing request \(call): \(request.url?.path ?? "nil")")
                return (500, Data())
            }
        }
        let client = URLRelationshipCaptureClient(
            baseURL: URL(string: "https://capture.test")!,
            session: network,
            accessToken: "access-token"
        )
        let seed = PendingCaptureSeed(
            imageData: try Self.screenshotPNG(),
            fileName: "retry.png",
            mediaType: "image/png",
            origin: .photosPicker
        )
        do {
            _ = try await client.preprocessScreenshot(seed: seed)
            XCTFail("The initial failed run must stop before resume.")
        } catch ConversationRecognitionError.sharedPreprocessingFailed { }
        do {
            _ = try await client.preprocessScreenshot(seed: seed)
            XCTFail("An automatic repeated lookup must not resume a failed task.")
        } catch ConversationRecognitionError.sharedPreprocessingFailed { }
        let draft = try await client.resumeScreenshotPreprocessing(seed: seed)
        XCTAssertEqual(draft.reviewedText, "Retry succeeded")
        XCTAssertEqual(draft.preprocessingUncertainties, [
            "Speaker remains unreadable in original image 1.",
            "Check the unresolved field.",
        ])
        XCTAssertEqual(call, 5)
    }

    func testURLCaptureClientKeepsSharedPreprocessingAttributionProposed() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RelationshipCaptureURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer {
            network.invalidateAndCancel()
            RelationshipCaptureURLProtocol.handler = nil
        }
        RelationshipCaptureURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/v1/resource-captures")
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "authorization"),
                "Bearer access-token"
            )
            let body = try XCTUnwrap(RelationshipCaptureURLProtocol.bodyData(request))
            let json = try XCTUnwrap(
                JSONSerialization.jsonObject(with: body) as? [String: Any]
            )
            let resource = try XCTUnwrap(json["resource"] as? [String: Any])
            let retention = try XCTUnwrap(
                resource["retention"] as? [String: Any]
            )
            XCTAssertEqual(
                retention["source_scope"] as? String,
                "proposed_extracted_text"
            )
            let fragments = try XCTUnwrap(json["fragments"] as? [[String: Any]])
            XCTAssertEqual(fragments.count, 2)
            let fragment = try XCTUnwrap(fragments.first)
            XCTAssertEqual(fragment["review_status"] as? String, "proposed")
            let attribution = try XCTUnwrap(
                fragment["attribution"] as? [String: Any]
            )
            XCTAssertEqual(attribution["status"] as? String, "proposed")
            let locator = try XCTUnwrap(fragment["locator"] as? [String: Any])
            XCTAssertEqual(
                locator["source_message_id"] as? String,
                "m1"
            )
            XCTAssertEqual(locator["source_image_index"] as? Int, 0)
            XCTAssertEqual(locator["speaker_side"] as? String, "left")
            XCTAssertEqual(locator["speaker_label"] as? String, "Alex Chen")
            XCTAssertEqual(locator["visible_time_text"] as? String, "09:30")
            let secondLocator = try XCTUnwrap(fragments[1]["locator"] as? [String: Any])
            XCTAssertEqual(secondLocator["source_message_id"] as? String, "m2")
            XCTAssertEqual(secondLocator["source_image_index"] as? Int, 1)
            XCTAssertEqual(secondLocator["speaker_side"] as? String, "right")
            let parser = try XCTUnwrap(fragment["parser"] as? [String: Any])
            XCTAssertEqual(parser["name"] as? String, "shared-screenshot-preprocess")
            let response: [String: Any] = [
                "capture_id": "99999999-9999-4999-8999-999999999999",
                "identity": [
                    "status": "needs_review",
                    "person_id": NSNull(),
                    "relationship_context_id": NSNull(),
                    "resolution_case_id": "11111111-1111-4111-8111-111111111111",
                    "candidate_person_ids": [Self.currentPersonID],
                ],
                "resource": [
                    "id": "22222222-2222-4222-8222-222222222222",
                    "processing_state": "needs_identity_review",
                    "duplicate_of_resource_id": NSNull(),
                    "fragment_count": 2,
                ],
            ]
            return (201, try JSONSerialization.data(withJSONObject: response))
        }
        let client = URLRelationshipCaptureClient(
            baseURL: URL(string: "https://capture.test")!,
            session: network,
            accessToken: "access-token"
        )
        let seed = PendingCaptureSeed(
            imageData: Data([1, 2, 3]),
            fileName: "conversation.png",
            mediaType: "image/png",
            origin: .photosPicker
        )
        var draft = CaptureDraftBuilder.makeDraft(
            from: "Alex Chen\nWeChat: alexchen\nAvailable next Tuesday"
        )
        draft.speaker = .candidate
        draft.sourceParserName = "shared-screenshot-preprocess"
        draft.sourceParserVersion = "screenshot-preprocess.v1"
        draft.preprocessedMessages = [
            .init(messageID: "m1", sequence: 0, text: "Available next Tuesday",
                  speakerSide: "left", speakerLabel: "Alex Chen", timeText: "09:30", sourceImageIndex: 0),
            .init(messageID: "m2", sequence: 1, text: "I will confirm",
                  speakerSide: "right", speakerLabel: "Me", timeText: nil, sourceImageIndex: 1),
        ]
        draft.reviewedText = draft.preprocessedMessages!.map(\.text).joined(separator: "\n")

        let result = try await client.createProposedCapture(
            seed: seed,
            draft: draft
        )

        XCTAssertEqual(result.captureID, "99999999-9999-4999-8999-999999999999")
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
    func testDiscardDeletesServerPreprocessingSourceBeforeLocalInboxEntry() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "capture-preprocess-delete-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let seed = try await inbox.stage(
            imageData: Data([1, 2, 3]), fileName: "discard.png",
            mediaType: "image/png", origin: .deterministicTest
        )
        let service = RelationshipCaptureServiceStub(
            identityCase: Self.twoOwnerCase(),
            decisionResult: .init(
                decision: "leave_unresolved", identityStatus: "unresolved",
                personID: nil, relationshipContextID: nil,
                resourceProcessingState: "needs_identity_review"
            ),
            wiki: Self.goldWiki()
        )
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Synthetic review"
        draft.preprocessingTaskID = "99999999-9999-4999-8999-999999999995"
        draft.preprocessingTaskRevision = 7
        let store = RelationshipCaptureStore(
            seed: seed, service: service, initialDraft: draft, inbox: inbox
        )

        let didDiscard = await store.discard()
        XCTAssertTrue(didDiscard)
        let deletes = await service.preprocessingDeletes
        XCTAssertEqual(deletes.count, 1)
        XCTAssertEqual(deletes.first?.taskID, draft.preprocessingTaskID)
        XCTAssertEqual(deletes.first?.revision, 7)
        let remainingInboxEntries = try await inbox.count()
        XCTAssertEqual(remainingInboxEntries, 0)
    }

    @MainActor
    func testDiscardKeepsLocalInboxEntryWhenServerPreprocessingDeleteFails() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "capture-preprocess-delete-retry-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let seed = try await inbox.stage(
            imageData: Data([1, 2, 3]), fileName: "discard-retry.png",
            mediaType: "image/png", origin: .deterministicTest
        )
        let service = RelationshipCaptureServiceStub(
            identityCase: Self.twoOwnerCase(),
            decisionResult: .init(
                decision: "leave_unresolved", identityStatus: "unresolved",
                personID: nil, relationshipContextID: nil,
                resourceProcessingState: "needs_identity_review"
            ),
            wiki: Self.goldWiki(),
            preprocessingDeleteFailuresBeforeSuccess: 1
        )
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Synthetic review"
        draft.preprocessingTaskID = "99999999-9999-4999-8999-999999999997"
        draft.preprocessingTaskRevision = 9
        let store = RelationshipCaptureStore(
            seed: seed, service: service, initialDraft: draft, inbox: inbox
        )

        let firstDiscard = await store.discard()
        XCTAssertFalse(firstDiscard)
        let entriesAfterFailure = try await inbox.count()
        XCTAssertEqual(entriesAfterFailure, 1)

        let retriedDiscard = await store.discard()
        XCTAssertTrue(retriedDiscard)
        let entriesAfterRetry = try await inbox.count()
        XCTAssertEqual(entriesAfterRetry, 0)
        let deletes = await service.preprocessingDeletes
        XCTAssertEqual(deletes.map(\.revision), [9, 9])
    }

    @MainActor
    func testForegroundCaptureLinksPreprocessingBeforeIdentityReviewAndRecoversLostResponse() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "capture-preprocess-link-retry-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let seed = try await inbox.stage(
            imageData: Data([1, 2, 3]), fileName: "foreground-link.png",
            mediaType: "image/png", origin: .deterministicTest
        )
        let service = RelationshipCaptureServiceStub(
            identityCase: Self.twoOwnerCase(),
            decisionResult: .init(
                decision: "leave_unresolved", identityStatus: "unresolved",
                personID: nil, relationshipContextID: nil,
                resourceProcessingState: "needs_identity_review"
            ),
            wiki: Self.goldWiki(),
            loseFirstPreprocessingLinkResponse: true
        )
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Synthetic review"
        draft.preprocessingTaskID = "99999999-9999-4999-8999-999999999992"
        draft.preprocessingTaskRevision = 4
        let store = RelationshipCaptureStore(
            seed: seed, service: service, initialDraft: draft, inbox: inbox
        )

        store.submitReviewedDraft()
        try await waitUntil {
            guard case let .failed(failure) = store.stage else { return false }
            return failure.recoveryStage == .submission
        }
        let persistedCapture = try await inbox.loadRecovery(for: seed.id)?.capture
        XCTAssertEqual(persistedCapture?.captureID, "99999999-9999-4999-8999-999999999999")
        let firstLinks = await service.preprocessingLinks
        XCTAssertEqual(firstLinks.map(\.expectedRevision), [4])

        store.retry()
        try await waitUntil { store.stage == .resolvingIdentity }
        let links = await service.preprocessingLinks
        XCTAssertEqual(links.map(\.expectedRevision), [4, 4])
        XCTAssertEqual(links.map(\.captureID), Array(
            repeating: "99999999-9999-4999-8999-999999999999", count: 2
        ))
        let recovered = try await inbox.loadRecovery(for: seed.id)
        XCTAssertEqual(recovered?.submittedDraft?.preprocessingTaskRevision, 5)
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
        draft.preprocessingTaskID = "99999999-9999-4999-8999-999999999996"
        draft.preprocessingTaskRevision = 8
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
        let preprocessingDeletes = await service.preprocessingDeletes
        XCTAssertEqual(preprocessingDeletes.count, 1)
        XCTAssertEqual(preprocessingDeletes.first?.taskID, draft.preprocessingTaskID)
        XCTAssertEqual(preprocessingDeletes.first?.revision, 9)
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

    private static func screenshotPNG(background: UIColor = .white) throws -> Data {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 32, height: 64))
        return try XCTUnwrap(renderer.image { context in
            background.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 32, height: 64))
        }.pngData())
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

    func testLateReviewSaveCannotRestoreRemovedCaptureButExplicitReimportCan() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: "capture-terminal-write-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let image = Data([1, 2, 3])
        let seed = try await inbox.stage(imageData: image, fileName: "fixture.png", mediaType: "image/png", origin: .deterministicTest)
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Work mode: Hybrid"
        draft.keepOriginalForReview = false
        try await inbox.saveReview(seed: seed, draft: draft, recovery: .init(), scope: nil)
        try await inbox.remove(id: seed.id)

        // Replay the write a previous view already prepared, after the terminal
        // removal has committed. Cancellation timing cannot protect this boundary.
        do {
            try await inbox.saveReview(seed: seed, draft: draft, recovery: .init(), scope: nil)
            XCTFail("A stale review must not recreate an explicitly removed capture.")
        } catch let error as CocoaError {
            XCTAssertEqual(error.code, .fileNoSuchFile)
        }
        let remaining = try await inbox.count()
        XCTAssertEqual(remaining, 0)
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.appending(path: "captures/\(seed.id.uuidString).metadata.json").path))
        let restoredDraft = try await inbox.loadDraft(for: seed.id)
        XCTAssertNil(restoredDraft)

        let reimported = try await inbox.stage(imageData: image, fileName: "fixture.png", mediaType: "image/png", origin: .deterministicTest)
        XCTAssertNotEqual(reimported.id, seed.id)
        try await inbox.saveReview(seed: reimported, draft: draft, recovery: .init(), scope: nil)
        let reimportedDraft = try await inbox.loadDraft(for: reimported.id)
        XCTAssertEqual(reimportedDraft?.reviewedText, draft.reviewedText)
        let reimportCount = try await inbox.count()
        XCTAssertEqual(reimportCount, 1)
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

    private static func oneCurrentOwnerCase() -> IdentityResolutionCase {
        let identityCase = twoOwnerCase()
        return IdentityResolutionCase(
            id: identityCase.id,
            status: identityCase.status,
            version: identityCase.version,
            reason: identityCase.reason,
            displayNameHint: identityCase.displayNameHint,
            source: identityCase.source,
            candidates: [identityCase.candidates[0]],
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

private final class RelationshipCaptureURLProtocol: URLProtocol, @unchecked Sendable {
    static var handler: ((URLRequest) throws -> (Int, Data))?

    static func bodyData(_ request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count < 0 { return nil }
            if count == 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        do {
            let result = try XCTUnwrap(Self.handler)(request)
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: result.0,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            client?.urlProtocol(
                self,
                didReceive: response,
                cacheStoragePolicy: .notAllowed
            )
            client?.urlProtocol(self, didLoad: result.1)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
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
    private let captureCandidatePersonIDs: [String]?
    private let preprocessedDraft: RecognizedCaptureDraft
    private let resumedPreprocessedDraft: RecognizedCaptureDraft?
    private let preprocessingDeleteFailuresBeforeSuccess: Int
    private var preprocessingDeleteAttemptCount = 0
    private(set) var createCount = 0
    private(set) var claimDecisions: [CaptureClaimDecision] = []
    private(set) var reviewFingerprints: [String] = []
    private(set) var preprocessingDeletes: [(taskID: String, revision: Int)] = []
    private(set) var preprocessingLinks: [(taskID: String, expectedRevision: Int, captureID: String, sourceResourceID: String)] = []
    private var preprocessingLinkRevisions: [String: Int] = [:]
    private let loseFirstPreprocessingLinkResponse: Bool
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
        claims: [CaptureChangeReview.Claim] = [],
        loseFirstClaimResponse: Bool = false,
        captureCandidatePersonIDs: [String]? = nil,
        preprocessedText: String = "Alex Chen\nWeChat: alexchen\nAvailable next Tuesday",
        preprocessingDeleteFailuresBeforeSuccess: Int = 0,
        preprocessingTaskID: String? = nil,
        preprocessingTaskRevision: Int? = nil,
        loseFirstPreprocessingLinkResponse: Bool = false,
        preprocessedDraftOverride: RecognizedCaptureDraft? = nil,
        resumedPreprocessedDraft: RecognizedCaptureDraft? = nil
    ) {
        self.identityCase = identityCase
        self.decisionResult = decisionResult
        self.wiki = wiki
        self.compileFailuresBeforeSuccess = compileFailuresBeforeSuccess
        self.claims = claims
        self.loseFirstClaimResponse = loseFirstClaimResponse
        self.captureCandidatePersonIDs = captureCandidatePersonIDs
        var draft = CaptureDraftBuilder.makeDraft(from: preprocessedText)
        draft.preprocessingTaskID = preprocessingTaskID
        draft.preprocessingTaskRevision = preprocessingTaskRevision
        self.preprocessedDraft = preprocessedDraftOverride ?? draft
        self.resumedPreprocessedDraft = resumedPreprocessedDraft
        self.preprocessingDeleteFailuresBeforeSuccess = preprocessingDeleteFailuresBeforeSuccess
        self.loseFirstPreprocessingLinkResponse = loseFirstPreprocessingLinkResponse
    }

    func preprocessScreenshot(seed: PendingCaptureSeed) async throws -> RecognizedCaptureDraft {
        preprocessedDraft
    }

    func resumeScreenshotPreprocessing(seed: PendingCaptureSeed) async throws -> RecognizedCaptureDraft {
        resumedPreprocessedDraft ?? preprocessedDraft
    }

    func deleteScreenshotPreprocessing(taskID: String, expectedRevision: Int) async throws {
        preprocessingDeletes.append((taskID, expectedRevision))
        preprocessingDeleteAttemptCount += 1
        if preprocessingDeleteAttemptCount <= preprocessingDeleteFailuresBeforeSuccess {
            throw URLError(.networkConnectionLost)
        }
    }

    func linkScreenshotPreprocessing(
        taskID: String,
        expectedRevision: Int,
        captureID: String,
        sourceResourceID: String
    ) async throws -> Int {
        preprocessingLinks.append((taskID, expectedRevision, captureID, sourceResourceID))
        let receiptKey = "\(taskID):\(captureID):\(sourceResourceID)"
        let revision = preprocessingLinkRevisions[receiptKey] ?? (expectedRevision + 1)
        preprocessingLinkRevisions[receiptKey] = revision
        if loseFirstPreprocessingLinkResponse, preprocessingLinks.count == 1 {
            throw URLError(.networkConnectionLost)
        }
        return revision
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
                candidatePersonIDs: captureCandidatePersonIDs
                    ?? identityCase.candidates.map(\.personID)
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
