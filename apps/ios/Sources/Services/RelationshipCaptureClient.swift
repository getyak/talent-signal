import Foundation
import UIKit

protocol RelationshipCaptureServing {
    var runtimeScope: String? { get }
    func loadCapture(id: String) async throws -> ResourceCaptureResult
    func prepareChanges(captureID: String) async throws -> CaptureChangeReview
    func decideClaim(_ decision: CaptureClaimDecision) async throws -> String
    func confirmSpeaker(_ decision: CaptureSpeakerDecision) async throws -> String
    func createCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> ResourceCaptureResult

    func preprocessScreenshot(seed: PendingCaptureSeed) async throws -> RecognizedCaptureDraft
    func resumeScreenshotPreprocessing(seed: PendingCaptureSeed) async throws -> RecognizedCaptureDraft
    func deleteScreenshotPreprocessing(taskID: String, expectedRevision: Int) async throws
    func linkScreenshotPreprocessing(
        taskID: String,
        expectedRevision: Int,
        captureID: String,
        sourceResourceID: String
    ) async throws -> Int

    func createProposedCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> ResourceCaptureResult

    func loadIdentityCase(id: String) async throws -> IdentityResolutionCase

    func decideIdentity(
        identityCase: IdentityResolutionCase,
        decision: IdentityDecision,
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> IdentityDecisionResult

    func compileWiki(
        personID: String,
        relationshipContextID: String,
        seedID: UUID,
        reviewFingerprint: String
    ) async throws -> WikiCompilationReceipt
}

extension RelationshipCaptureServing {
    var runtimeScope: String? { nil }

    func createProposedCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> ResourceCaptureResult {
        try await createCapture(seed: seed, draft: draft)
    }

    func preprocessScreenshot(seed: PendingCaptureSeed) async throws -> RecognizedCaptureDraft {
        throw ConversationRecognitionError.sharedPreprocessingUnavailable
    }

    func resumeScreenshotPreprocessing(seed: PendingCaptureSeed) async throws -> RecognizedCaptureDraft {
        try await preprocessScreenshot(seed: seed)
    }

    func deleteScreenshotPreprocessing(taskID: String, expectedRevision: Int) async throws {
        throw ConversationRecognitionError.sharedPreprocessingUnavailable
    }

    func linkScreenshotPreprocessing(
        taskID: String,
        expectedRevision: Int,
        captureID: String,
        sourceResourceID: String
    ) async throws -> Int {
        throw ConversationRecognitionError.sharedPreprocessingUnavailable
    }
}

enum ScreenshotPreprocessingUploadNormalizer {
    static let maximumByteCount = 10_000_000
    private static let maximumPixelDimension: CGFloat = 4_096
    private static let supportedMediaTypes = Set(["image/png", "image/jpeg", "image/webp"])

    static func normalize(data: Data, mediaType: String) throws -> (data: Data, mediaType: String) {
        guard let image = UIImage(data: data) else {
            throw ConversationRecognitionError.unreadableImage
        }
        let sourceWidth = max(1, image.size.width * image.scale)
        let sourceHeight = max(1, image.size.height * image.scale)
        if supportedMediaTypes.contains(mediaType),
           data.count <= maximumByteCount,
           max(sourceWidth, sourceHeight) <= maximumPixelDimension {
            return (data, mediaType)
        }

        var rendered = render(image, maximumDimension: maximumPixelDimension)
        for quality in [CGFloat(0.92), 0.82, 0.70, 0.55] {
            guard let jpeg = rendered.jpegData(compressionQuality: quality) else { continue }
            if jpeg.count <= maximumByteCount { return (jpeg, "image/jpeg") }
        }

        for _ in 0..<4 {
            let prior = rendered.jpegData(compressionQuality: 0.70)?.count ?? (maximumByteCount * 2)
            let ratio = min(0.85, sqrt(CGFloat(maximumByteCount) / CGFloat(prior)) * 0.92)
            rendered = render(
                rendered,
                maximumDimension: max(640, max(rendered.size.width, rendered.size.height) * ratio)
            )
            if let jpeg = rendered.jpegData(compressionQuality: 0.70),
               jpeg.count <= maximumByteCount {
                return (jpeg, "image/jpeg")
            }
        }
        throw ConversationRecognitionError.sharedPreprocessingFailed
    }

    private static func render(_ image: UIImage, maximumDimension: CGFloat) -> UIImage {
        // UIImage.size is already orientation-aware; cgImage dimensions are not.
        let sourceWidth = max(1, image.size.width * image.scale)
        let sourceHeight = max(1, image.size.height * image.scale)
        let scale = min(1, maximumDimension / max(sourceWidth, sourceHeight))
        let size = CGSize(
            width: max(1, floor(sourceWidth * scale)),
            height: max(1, floor(sourceHeight * scale))
        )
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: size))
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}

actor URLRelationshipCaptureClient: RelationshipCaptureServing {
    nonisolated let runtimeScope: String?
    private let baseURL: URL
    private let session: URLSession
    private let usesAuthenticatedSession: Bool
    private var accessToken: String?

    init(
        baseURL: URL = URL(string: "http://127.0.0.1:4317")!,
        session: URLSession = TalentSignalNetworking.session,
        accessToken: String? = nil,
        runtimeScope: String? = nil
    ) {
        self.baseURL = baseURL
        self.session = session
        usesAuthenticatedSession = accessToken != nil
        self.accessToken = accessToken
        self.runtimeScope = runtimeScope
    }

    func createCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> ResourceCaptureResult {
        try await createCapture(
            seed: seed,
            draft: draft,
            reviewStatus: "reviewed",
            sourceScope: "reviewed_extracted_text",
            purpose: "Preserve recruiter-reviewed conversation evidence for a purpose-scoped relationship",
            identityReason: "A recruiter reviewed the extracted text and must explicitly resolve the person."
        )
    }

    func preprocessScreenshot(seed: PendingCaptureSeed) async throws -> RecognizedCaptureDraft {
        try await preprocessScreenshot(seed: seed, resumeFailedTask: false)
    }

    func resumeScreenshotPreprocessing(seed: PendingCaptureSeed) async throws -> RecognizedCaptureDraft {
        try await preprocessScreenshot(seed: seed, resumeFailedTask: true)
    }

    func deleteScreenshotPreprocessing(taskID: String, expectedRevision: Int) async throws {
        let deleted: ScreenshotContactTask = try await request(
            path: "v1/contact-agent/tasks/\(taskID)/preprocessing-source/delete",
            method: "POST",
            body: ScreenshotContactDeleteBody(expectedRevision: expectedRevision)
        )
        guard deleted.taskID == taskID,
              deleted.status == "deleted",
              deleted.revision >= expectedRevision else {
            throw RelationshipCaptureClientError.invalidResponse
        }
    }

    func linkScreenshotPreprocessing(
        taskID: String,
        expectedRevision: Int,
        captureID: String,
        sourceResourceID: String
    ) async throws -> Int {
        let linked: ScreenshotContactCaptureLink = try await request(
            path: "v1/contact-agent/tasks/\(taskID)/capture-link",
            method: "POST",
            body: ScreenshotContactCaptureLinkBody(
                expectedRevision: expectedRevision,
                captureID: captureID,
                sourceResourceID: sourceResourceID
            )
        )
        guard linked.taskID == taskID,
              linked.captureID == captureID,
              linked.sourceResourceID == sourceResourceID,
              linked.revision >= expectedRevision else {
            throw RelationshipCaptureClientError.invalidResponse
        }
        return linked.revision
    }

    private func preprocessScreenshot(
        seed: PendingCaptureSeed,
        resumeFailedTask: Bool
    ) async throws -> RecognizedCaptureDraft {
        let upload = try ScreenshotPreprocessingUploadNormalizer.normalize(
            data: seed.imageData,
            mediaType: seed.mediaType
        )
        let body = ScreenshotContactTaskBody(
            idempotencyKey: "ios:\(seed.id.uuidString.lowercased()):preprocess-v2",
            objective: "Preprocess this recruiter-selected screenshot into reviewable, unconfirmed source evidence.",
            data: upload.data,
            mediaType: upload.mediaType,
            personID: nil,
            contextID: nil,
            capturedAt: seed.createdAt,
            preprocessOnly: true,
            allowPublicResearch: false
        )
        var task: ScreenshotContactTask = try await request(
            path: "v1/contact-agent/tasks",
            method: "POST",
            body: body
        )
        // A repeated create is the durable lookup for this source. Only the
        // explicit resume entry point, called from the recruiter's Retry
        // action, may authorize another provider attempt at this revision.
        if resumeFailedTask && ["waiting_for_user", "failed", "cancelled"].contains(task.status) {
            task = try await request(
                path: "v1/contact-agent/tasks/\(task.taskID)/resume",
                method: "POST",
                body: ScreenshotContactResumeBody(expectedRevision: task.revision)
            )
        }
        for _ in 0..<240 where task.status == "running" {
            try await Task.sleep(nanoseconds: 500_000_000)
            task = try await request(
                path: "v1/contact-agent/tasks/\(task.taskID)",
                method: "GET",
                body: Optional<EmptyBody>.none
            )
        }
        guard task.status == "completed" || task.status == "waiting_for_user",
              let extraction = task.extraction else {
            throw ConversationRecognitionError.sharedPreprocessingFailed
        }
        let messages = extraction.messages.map {
            PreprocessedCaptureMessage(
                messageID: $0.messageID,
                sequence: $0.sequence,
                text: $0.text,
                speakerSide: $0.speakerSide,
                speakerLabel: $0.speakerLabel,
                timeText: $0.timeText,
                sourceImageIndex: $0.sourceImageIndex ?? 0
            )
        }
        let preprocessingIssues = Self.preprocessingIssues(task: task, extraction: extraction)
        guard !messages.isEmpty else {
            let isDisposableProfile = task.status == "completed"
                && ["profile", "not_chat"].contains(extraction.conversationKind ?? "")
                && preprocessingIssues.isEmpty
            if !isDisposableProfile {
                var draft = RecognizedCaptureDraft.empty
                draft.displayNameHint = extraction.contactName ?? ""
                draft.sourceParserName = "shared-screenshot-preprocess"
                draft.sourceParserVersion = "screenshot-preprocess.v2"
                draft.preprocessingUncertainties = preprocessingIssues.isEmpty
                    ? ["No conversation messages were readable. Inspect the original before entering evidence."]
                    : preprocessingIssues
                draft.preprocessingTaskID = task.taskID
                draft.preprocessingTaskRevision = task.revision
                draft.preprocessingRetryRequired = task.status == "waiting_for_user"
                return draft
            }
            // There is no reviewable conversation draft that could carry this
            // receipt into local recovery. Delete and verify the server source
            // before returning the fail-closed result so its original cannot
            // outlive the rejected import.
            try await deleteScreenshotPreprocessing(
                taskID: task.taskID,
                expectedRevision: task.revision
            )
            throw ConversationRecognitionError.noConversationEvidence
        }
        let text = messages.map(\.text).joined(separator: "\n")
        var draft = CaptureDraftBuilder.makeDraft(from: text)
        draft.displayNameHint = extraction.contactName ?? draft.displayNameHint
        let hasUntypedHandle = extraction.identityClues?.contains(where: { $0.kind == "handle" }) == true
        if hasUntypedHandle { draft.handleValue = "" }
        draft.sourceParserName = "shared-screenshot-preprocess"
        draft.sourceParserVersion = "screenshot-preprocess.v2"
        var draftPreprocessingIssues = preprocessingIssues
        if hasUntypedHandle {
            draftPreprocessingIssues.append(
                "A visible platform handle remains untyped and must be reviewed before identity matching."
            )
        }
        draft.preprocessingUncertainties = draftPreprocessingIssues.isEmpty
            ? nil
            : draftPreprocessingIssues
        draft.preprocessingTaskID = task.taskID
        draft.preprocessingTaskRevision = task.revision
        draft.preprocessingRetryRequired = false
        draft.preprocessedMessages = messages.isEmpty ? nil : messages
        return draft
    }

    func createProposedCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> ResourceCaptureResult {
        try await createCapture(
            seed: seed,
            draft: draft,
            reviewStatus: "proposed",
            sourceScope: "proposed_extracted_text",
            purpose: "Process one recruiter-selected screenshot into proposed relationship evidence",
            identityReason: "The Agent extracted an identity clue but cannot confirm who owns the screenshot."
        )
    }

    private func createCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft,
        reviewStatus: String,
        sourceScope: String,
        purpose: String,
        identityReason: String
    ) async throws -> ResourceCaptureResult {
        let clientResourceID = "ios-share:\(seed.id.uuidString.lowercased())"
        let reviewedSpeaker = draft.speaker ?? .unknown
        let sharedPreprocessing = draft.sourceParserName == "shared-screenshot-preprocess"
        let fragments: [ResourceCaptureBody.Fragment]
        if let messages = draft.preprocessedMessages, !messages.isEmpty {
            fragments = messages.enumerated().map { index, message in
                .init(
                    clientResourceID: clientResourceID,
                    kind: "message",
                    sequence: index,
                    text: message.text,
                    locator: .init(
                        kind: "message",
                        sourceMessageID: message.messageID,
                        sequence: message.sequence,
                        speakerSide: message.speakerSide,
                        speakerLabel: message.speakerLabel,
                        visibleTimeText: message.timeText,
                        sourceImageIndex: message.sourceImageIndex,
                        messageTimestamp: nil
                    ),
                    attribution: .init(actorKind: "unknown", status: "proposed"),
                    reviewStatus: reviewStatus,
                    parser: .init(
                        name: draft.sourceParserName ?? "shared-screenshot-preprocess",
                        version: draft.sourceParserVersion ?? "screenshot-preprocess.v2"
                    )
                )
            }
        } else {
            fragments = [
                .init(
                    clientResourceID: clientResourceID,
                    kind: "message",
                    sequence: 0,
                    text: draft.reviewedText,
                    locator: .init(
                        kind: "message",
                        sourceMessageID: sharedPreprocessing && reviewStatus == "proposed"
                            ? "shared-preprocess-proposed-1"
                            : sharedPreprocessing ? "shared-preprocess-reviewed-1" : "legacy-reviewed-draft-1",
                        sequence: 0,
                        speakerSide: "unknown",
                        speakerLabel: nil,
                        visibleTimeText: nil,
                        sourceImageIndex: nil,
                        messageTimestamp: draft.messageTimestamp.map(Self.timestamp)
                    ),
                    attribution: .init(
                        actorKind: reviewedSpeaker.rawValue,
                        status: reviewStatus == "proposed" || draft.speaker == nil
                            ? "proposed"
                            : reviewedSpeaker.attributionStatus
                    ),
                    reviewStatus: reviewStatus,
                    parser: .init(
                        name: draft.sourceParserName ?? "legacy-reviewed-screenshot-draft",
                        version: draft.sourceParserVersion ?? "1"
                    )
                )
            ]
        }
        let body = ResourceCaptureBody(
            contractVersion: TalentSignalAPIContract.version,
            idempotencyKey: "ios:\(seed.id.uuidString.lowercased()):capture",
            channel: "ios_share",
            purpose: purpose,
            capturedAt: Self.timestamp(seed.createdAt),
            sourceTimezone: draft.sourceTimezone ?? TimeZone.current.identifier,
            personScope: .init(
                status: "unresolved",
                displayNameHint: draft.displayNameHint.nonEmpty,
                handles: draft.handleValue.nonEmpty.map {
                    [
                        .init(
                            type: draft.handleType.rawValue,
                            value: $0,
                            sourceClientResourceID: clientResourceID
                        )
                    ]
                } ?? [],
                relationshipContext: draft.relationshipLabel.nonEmpty == nil ? nil : .proposed(draft: draft),
                reason: identityReason
            ),
            resource: .init(
                clientResourceID: clientResourceID,
                kind: "conversation_screenshot",
                displayName: seed.fileName,
                mediaType: seed.mediaType,
                observedAt: Self.timestamp(seed.createdAt),
                sourceTimezone: draft.sourceTimezone ?? TimeZone.current.identifier,
                byteSize: draft.sourceByteCount ?? seed.imageData.count,
                sourceLocator: "ios-share:\(seed.origin.rawValue)",
                retention: .init(
                    requestedMode: "ephemeral",
                    sourceScope: sourceScope
                )
            ),
            fragments: fragments
        )
        return try await request(
            path: "v1/resource-captures",
            method: "POST",
            body: body
        )
    }

    func loadIdentityCase(id: String) async throws -> IdentityResolutionCase {
        try await request(
            path: "v1/identity-resolution-cases/\(id)",
            method: "GET",
            body: Optional<EmptyBody>.none
        )
    }

    func loadCapture(id: String) async throws -> ResourceCaptureResult {
        try await request(path: "v1/resource-captures/\(id)", method: "GET", body: Optional<EmptyBody>.none)
    }

    func prepareChanges(captureID: String) async throws -> CaptureChangeReview {
        try await request(path: "v1/resource-captures/\(captureID)/review-preparations", method: "POST", body: Optional<EmptyBody>.none)
    }

    func decideClaim(_ decision: CaptureClaimDecision) async throws -> String {
        let receipt: ClaimDecisionReceipt = try await request(
            path: "v1/assertions/\(decision.assertionID)/decisions", method: "POST",
            body: ClaimDecisionBody(idempotency_key: decision.idempotencyKey,
                expected_assertion_version: decision.version,
                expected_review_token: decision.reviewToken, decision: decision.decision,
                corrected_value: decision.correctedValue)
        )
        return receipt.decision_id
    }

    func confirmSpeaker(_ decision: CaptureSpeakerDecision) async throws -> String {
        let receipt: SpeakerReviewReceipt = try await request(
            path: "v1/evidence-fragments/\(decision.fragmentID)/reviews", method: "POST",
            body: SpeakerReviewBody(idempotency_key: decision.idempotencyKey,
                expected_review_status: decision.expectedStatus, expected_last_review_id: decision.expectedReviewID,
                decision: "reviewed", confirmed_speaker: decision.speaker.rawValue,
                reason: "The recruiter inspected the source and explicitly confirmed the author of this excerpt.")
        )
        return receipt.review_id
    }

    func decideIdentity(
        identityCase: IdentityResolutionCase,
        decision: IdentityDecision,
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> IdentityDecisionResult {
        let body = IdentityDecisionBody(
            idempotencyKey: [
                "ios",
                seed.id.uuidString.lowercased(),
                String(identityCase.version),
                decision.idempotencySuffix
            ].joined(separator: ":"),
            expectedCaseVersion: identityCase.version,
            decision: decision,
            draft: draft
        )
        return try await request(
            path: "v1/identity-resolution-cases/\(identityCase.id)/decisions",
            method: "POST",
            body: body
        )
    }

    func compileWiki(
        personID: String,
        relationshipContextID: String,
        seedID: UUID,
        reviewFingerprint: String
    ) async throws -> WikiCompilationReceipt {
        try await request(
            path: "v1/people/\(personID)/contexts/\(relationshipContextID)/wiki-compilations",
            method: "POST",
            body: CompileWikiBody(
                idempotencyKey: "ios:\(seedID.uuidString.lowercased()):wiki:\(reviewFingerprint.prefix(24))",
                objective: "Prepare a source-linked pre-contact relationship brief for the recruiter."
            )
        )
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body?
    ) async throws -> Response {
        guard URLFixtureLoader.isLoopback(baseURL) || usesAuthenticatedSession else {
            throw RelationshipCaptureClientError.loopbackOnly
        }
        let token = try await authenticatedToken()
        var urlRequest = URLRequest(url: baseURL.appending(path: path))
        urlRequest.httpMethod = method
        urlRequest.setValue("application/json", forHTTPHeaderField: "accept")
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        if let body {
            urlRequest.setValue("application/json", forHTTPHeaderField: "content-type")
            urlRequest.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await TalentSignalNetworking.data(for: urlRequest, using: session)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw RelationshipCaptureClientError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            let envelope = try? JSONDecoder().decode(BackendErrorEnvelope.self, from: data)
            throw RelationshipCaptureClientError.backend(
                code: envelope?.error?.code ?? "HTTP_\(httpResponse.statusCode)",
                message: envelope?.error?.message ?? "The local backend rejected this request."
            )
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw RelationshipCaptureClientError.invalidResponse
        }
    }

    private func authenticatedToken() async throws -> String {
        if let accessToken {
            return accessToken
        }
        guard URLFixtureLoader.isLoopback(baseURL) else {
            throw RelationshipCaptureClientError.loopbackOnly
        }
        var request = URLRequest(
            url: baseURL.appending(path: "v1/auth/simulated-login")
        )
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(
            LoginBody(
                accountSlug: "fixture-alpha",
                userEmail: "recruiter@alpha.local",
                clientLabel: "ios-relationship-capture"
            )
        )
        let (data, response) = try await TalentSignalNetworking.data(for: request, using: session)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode),
              let login = try? JSONDecoder().decode(LoginResponse.self, from: data) else {
            throw RelationshipCaptureClientError.loginFailed
        }
        accessToken = login.accessToken
        return login.accessToken
    }

    private static func timestamp(_ date: Date) -> String {
        // Inbox dates use ISO-8601 seconds. Keep the first wire request identical
        // to a retry after decoding the protected recovery record.
        ISO8601DateFormatter.captureFormatter.string(from: Date(timeIntervalSince1970: floor(date.timeIntervalSince1970)))
    }

    private static func preprocessingIssues(
        task: ScreenshotContactTask,
        extraction: ScreenshotContactTask.Extraction
    ) -> [String] {
        var issues = extraction.uncertainties
        if task.status == "waiting_for_user", let question = task.question?.nonEmpty {
            issues.append(question)
        }
        if task.status == "waiting_for_user" {
            for source in task.preprocessing?.sources ?? [] {
                for followUp in source.followUpRegions {
                    issues.append(
                        "Source image \(source.sourceImageIndex + 1) needs a \(followUp.field) check for \(followUp.reason) at region (\(followUp.region.left), \(followUp.region.top), \(followUp.region.width), \(followUp.region.height))."
                    )
                }
                if source.followUpRequired && source.followUpRegions.isEmpty {
                    issues.append("Source image \(source.sourceImageIndex + 1) still requires an original-pixel check.")
                }
            }
        }
        if task.status == "waiting_for_user" && issues.isEmpty {
            issues.append("Shared preprocessing is waiting for an unresolved original-image check.")
        }
        return issues.reduce(into: []) { unique, issue in
            if !unique.contains(issue) { unique.append(issue) }
        }
    }
}

enum RelationshipCaptureClientError: LocalizedError, Equatable {
    case loopbackOnly
    case loginFailed
    case invalidResponse
    case backend(code: String, message: String)

    var errorDescription: String? {
        switch self {
        case .loopbackOnly:
            return "This development build sends reviewed evidence only to a localhost backend."
        case .loginFailed:
            return "The local development session could not be opened."
        case .invalidResponse:
            return "The local backend returned an unreadable response."
        case let .backend(code, message):
            if code == "IDENTITY_HANDLE_CONFIRMED_ELSEWHERE" {
                return "That historical person cannot receive this source because the clue has a different current owner. Compare the current person or leave it unresolved."
            }
            return "\(message) (\(code))"
        }
    }
}

private struct EmptyBody: Encodable {}

private struct ScreenshotContactDeleteBody: Encodable {
    let expectedRevision: Int
    enum CodingKeys: String, CodingKey { case expectedRevision = "expected_revision" }
}

private struct ScreenshotContactCaptureLinkBody: Encodable {
    let expectedRevision: Int
    let captureID: String
    let sourceResourceID: String
    enum CodingKeys: String, CodingKey {
        case expectedRevision = "expected_revision"
        case captureID = "capture_id"
        case sourceResourceID = "source_resource_id"
    }
}

private struct ScreenshotContactCaptureLink: Decodable {
    let taskID: String
    let revision: Int
    let captureID: String
    let sourceResourceID: String
    enum CodingKeys: String, CodingKey {
        case taskID = "task_id"
        case revision
        case captureID = "capture_id"
        case sourceResourceID = "source_resource_id"
    }
}

private struct ClaimDecisionBody: Encodable {
    let idempotency_key: String
    let expected_assertion_version: Int
    let expected_review_token: String
    let decision: String
    let corrected_value: String?
}
private struct ClaimDecisionReceipt: Decodable { let decision_id: String }
private struct SpeakerReviewReceipt: Decodable { let review_id: String }
private struct SpeakerReviewBody: Encodable {
    let idempotency_key: String
    let expected_review_status: String
    let expected_last_review_id: String?
    let decision: String
    let confirmed_speaker: String
    let reason: String
    enum CodingKeys: String, CodingKey {
        case idempotency_key, expected_review_status, expected_last_review_id, decision, confirmed_speaker, reason
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(idempotency_key, forKey: .idempotency_key)
        try c.encode(expected_review_status, forKey: .expected_review_status)
        try c.encode(expected_last_review_id, forKey: .expected_last_review_id)
        try c.encode(decision, forKey: .decision)
        try c.encode(confirmed_speaker, forKey: .confirmed_speaker)
        try c.encode(reason, forKey: .reason)
    }
}

private struct LoginBody: Encodable {
    let accountSlug: String
    let userEmail: String
    let clientLabel: String

    enum CodingKeys: String, CodingKey {
        case accountSlug = "account_slug"
        case userEmail = "user_email"
        case clientLabel = "client_label"
    }
}

private struct LoginResponse: Decodable {
    let accessToken: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
    }
}

private struct BackendErrorEnvelope: Decodable {
    let error: BackendError?

    struct BackendError: Decodable {
        let code: String?
        let message: String?
    }
}

private struct ResourceCaptureBody: Encodable {
    let contractVersion: String
    let idempotencyKey: String
    let channel: String
    let purpose: String
    let capturedAt: String
    let sourceTimezone: String
    let personScope: PersonScope
    let resource: Resource
    let fragments: [Fragment]

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case idempotencyKey = "idempotency_key"
        case channel
        case purpose
        case capturedAt = "captured_at"
        case sourceTimezone = "source_timezone"
        case personScope = "person_scope"
        case resource
        case fragments
    }

    struct PersonScope: Encodable {
        let status: String
        let displayNameHint: String?
        let handles: [Handle]
        let relationshipContext: RelationshipContext?
        let reason: String

        enum CodingKeys: String, CodingKey {
            case status
            case displayNameHint = "display_name_hint"
            case handles
            case relationshipContext = "relationship_context"
            case reason
        }
    }

    struct Handle: Encodable {
        let type: String
        let value: String
        let sourceClientResourceID: String

        enum CodingKeys: String, CodingKey {
            case type
            case value
            case sourceClientResourceID = "source_client_resource_id"
        }
    }

    struct RelationshipContext: Encodable {
        let status: String
        let label: String
        let purpose: String
        let role: String?

        static func proposed(draft: RecognizedCaptureDraft) -> RelationshipContext {
            RelationshipContext(
                status: "proposed",
                label: draft.relationshipLabel.nonEmpty ?? "Candidate relationship",
                purpose: draft.relationshipPurpose.nonEmpty ?? "Preserve reviewed conversation evidence",
                role: draft.relationshipRole.nonEmpty
            )
        }
    }

    struct Resource: Encodable {
        let clientResourceID: String
        let kind: String
        let displayName: String
        let mediaType: String
        let observedAt: String
        let sourceTimezone: String
        let byteSize: Int
        let sourceLocator: String
        let retention: Retention

        enum CodingKeys: String, CodingKey {
            case clientResourceID = "client_resource_id"
            case kind
            case displayName = "display_name"
            case mediaType = "media_type"
            case observedAt = "observed_at"
            case sourceTimezone = "source_timezone"
            case byteSize = "byte_size"
            case sourceLocator = "source_locator"
            case retention
        }
    }

    struct Retention: Encodable {
        let requestedMode: String
        let sourceScope: String

        enum CodingKeys: String, CodingKey {
            case requestedMode = "requested_mode"
            case sourceScope = "source_scope"
        }
    }

    struct Fragment: Encodable {
        let clientResourceID: String
        let kind: String
        let sequence: Int
        let text: String
        let locator: Locator
        let attribution: Attribution
        let reviewStatus: String
        let parser: Parser

        enum CodingKeys: String, CodingKey {
            case clientResourceID = "client_resource_id"
            case kind
            case sequence
            case text
            case locator
            case attribution
            case reviewStatus = "review_status"
            case parser
        }
    }

    struct Locator: Encodable {
        let kind: String
        let sourceMessageID: String
        let sequence: Int
        let speakerSide: String
        let speakerLabel: String?
        let visibleTimeText: String?
        let sourceImageIndex: Int?
        let messageTimestamp: String?

        enum CodingKeys: String, CodingKey {
            case kind
            case sourceMessageID = "source_message_id"
            case sequence
            case speakerSide = "speaker_side"
            case speakerLabel = "speaker_label"
            case visibleTimeText = "visible_time_text"
            case sourceImageIndex = "source_image_index"
            case messageTimestamp = "message_timestamp"
        }
    }

    struct Attribution: Encodable {
        let actorKind: String
        let status: String

        enum CodingKeys: String, CodingKey {
            case actorKind = "actor_kind"
            case status
        }
    }

    struct Parser: Encodable {
        let name: String
        let version: String
    }
}

private struct IdentityDecisionBody: Encodable {
    let idempotencyKey: String
    let expectedCaseVersion: Int
    let decision: IdentityDecision
    let draft: RecognizedCaptureDraft

    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key"
        case expectedCaseVersion = "expected_case_version"
        case decision
        case selectedPersonID = "selected_person_id"
        case relationshipContext = "relationship_context"
        case reason
        case displayLabel = "display_label"
        case bindingBasis = "binding_basis"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(idempotencyKey, forKey: .idempotencyKey)
        try container.encode(expectedCaseVersion, forKey: .expectedCaseVersion)

        switch decision {
        case let .bind(candidate, context):
            try container.encode("bind_existing", forKey: .decision)
            try container.encode(candidate.personID, forKey: .selectedPersonID)
            if let context {
                try container.encode(
                    ExistingRelationshipContext(
                        status: "existing",
                        relationshipContextID: context.id
                    ),
                    forKey: .relationshipContext
                )
            } else {
                try container.encode(
                    ResourceCaptureBody.RelationshipContext.proposed(draft: draft),
                    forKey: .relationshipContext
                )
            }
            try container.encode(
                "The recruiter compared the source with the visible identity evidence and explicitly selected this person.",
                forKey: .reason
            )
        case let .bindFromAgent(candidate, context):
            try container.encode("bind_existing", forKey: .decision)
            try container.encode(candidate.personID, forKey: .selectedPersonID)
            try container.encode(
                ExistingRelationshipContext(
                    status: "existing",
                    relationshipContextID: context.id
                ),
                forKey: .relationshipContext
            )
            try container.encode(
                "The recruiter instructed this Agent Session to process the screenshot. The Agent attached it because one current confirmed identity clue matched one person with one existing relationship context.",
                forKey: .reason
            )
        case .createNew:
            try container.encode("create_new", forKey: .decision)
            try container.encode(
                draft.displayNameHint.nonEmpty ?? "New relationship",
                forKey: .displayLabel
            )
            try container.encode(
                ResourceCaptureBody.RelationshipContext.proposed(draft: draft),
                forKey: .relationshipContext
            )
            try container.encode(
                "No existing person was a safe match, so the recruiter explicitly created a separate person.",
                forKey: .bindingBasis
            )
            try container.encode(
                "The recruiter reviewed the source and chose to create a distinct person.",
                forKey: .reason
            )
        case .leaveUnresolved:
            try container.encode("leave_unresolved", forKey: .decision)
            try container.encode(
                "The available identity evidence is not sufficient for a safe binding.",
                forKey: .reason
            )
        }
    }
}

private struct ExistingRelationshipContext: Encodable {
    let status: String
    let relationshipContextID: String

    enum CodingKeys: String, CodingKey {
        case status
        case relationshipContextID = "relationship_context_id"
    }
}

private struct CompileWikiBody: Encodable {
    let idempotencyKey: String
    let objective: String

    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key"
        case objective
    }
}

private extension String {
    var nonEmpty: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}

private extension IdentityDecision {
    var idempotencySuffix: String {
        switch self {
        case let .bind(candidate, context):
            return "bind:\(candidate.personID):\(context?.id ?? "new")"
        case let .bindFromAgent(candidate, context):
            return "agent-bind:\(candidate.personID):\(context.id)"
        case .createNew:
            return "create"
        case .leaveUnresolved:
            return "unresolved"
        }
    }
}

private extension ISO8601DateFormatter {
    static let captureFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
