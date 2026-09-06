import CryptoKit
import Foundation
#if DEBUG
import UIKit
#endif

actor PendingCaptureInbox {
    static let shared = PendingCaptureInbox()

    private let capturesDirectoryURL: URL
    private let legacyMetadataURL: URL
    private let legacyImageURL: URL
    private let legacyDraftURL: URL

    init(directoryURL: URL? = nil) {
        let resolvedDirectory = directoryURL
            ?? FileManager.default.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            )[0].appending(path: "RelationshipCaptureInbox", directoryHint: .isDirectory)
        capturesDirectoryURL = resolvedDirectory.appending(
            path: "captures",
            directoryHint: .isDirectory
        )
        legacyMetadataURL = resolvedDirectory.appending(path: "pending.json")
        legacyImageURL = resolvedDirectory.appending(path: "pending-image")
        legacyDraftURL = resolvedDirectory.appending(path: "pending-draft.json")
    }

    func stage(
        imageData: Data,
        fileName: String,
        mediaType: String,
        origin: CaptureOrigin
    ) throws -> PendingCaptureSeed {
        try LabClientDiagnostics.measureSync(.imagePreparation) {
            try prepareQueue()
            let contentFingerprint = Self.contentFingerprint(for: imageData)
            if let metadata = try queuedMetadata().first(
                where: { $0.contentFingerprint == contentFingerprint && $0.runtimeScope == nil }
            ), let existing = try load(metadata: metadata) {
                if !existing.imageData.isEmpty { return existing }
            }

            let seed = PendingCaptureSeed(
                imageData: imageData,
                fileName: fileName,
                mediaType: mediaType,
                origin: origin
            )
            try persist(seed, contentFingerprint: contentFingerprint)
            return seed
        }
    }

    func load(scope: String? = nil) throws -> PendingCaptureSeed? {
        try prepareQueue()
        for metadata in try queuedMetadata() where metadata.runtimeScope == nil || metadata.runtimeScope == scope {
            if let seed = try load(metadata: metadata) { return seed }
        }
        return nil
    }

    func load(id: UUID, scope: String?) throws -> PendingCaptureSeed? {
        try prepareQueue()
        guard let metadata = try queuedMetadata().first(where: {
            $0.id == id && ($0.runtimeScope == nil || $0.runtimeScope == scope)
        }) else {
            return nil
        }
        return try load(metadata: metadata)
    }

    func summaries(scope: String? = nil) throws -> [PendingCaptureSummary] {
        try prepareQueue()
        return try queuedMetadata()
            .filter { $0.runtimeScope == nil || $0.runtimeScope == scope }
            .map { metadata in
                PendingCaptureSummary(
                    id: metadata.id,
                    fileName: metadata.fileName,
                    mediaType: metadata.mediaType,
                    createdAt: metadata.createdAt,
                    origin: metadata.origin,
                    originalAvailable: FileManager.default.fileExists(
                        atPath: imageURL(for: metadata.id).path
                    ),
                    hasSavedProgress: FileManager.default.fileExists(
                        atPath: draftURL(for: metadata.id).path
                    ),
                    sessionID: metadata.sessionID,
                    processingState: metadata.processingState ?? .queued,
                    processingDetail: metadata.processingDetail
                )
            }
    }

    func updateSessionProcessing(
        id: UUID,
        sessionID: UUID,
        state: CaptureSessionProcessingState,
        detail: String?,
        scope: String?
    ) throws {
        try prepareQueue()
        guard var metadata = try queuedMetadata().first(where: {
            $0.id == id && ($0.runtimeScope == nil || $0.runtimeScope == scope)
        }) else {
            throw CocoaError(.fileNoSuchFile)
        }
        metadata.sessionID = sessionID
        metadata.processingState = state
        metadata.processingDetail = detail
        try writeProtected(
            JSONEncoder.captureEncoder.encode(metadata),
            to: metadataURL(for: id)
        )
    }

    func claim(id: UUID, scope: String) throws {
        try prepareQueue()
        guard !scope.isEmpty, var metadata = try queuedMetadata().first(where: { $0.id == id }),
              metadata.runtimeScope == nil || metadata.runtimeScope == scope else {
            throw AppSessionError.scopeMismatch
        }
        metadata.runtimeScope = scope
        try writeProtected(JSONEncoder.captureEncoder.encode(metadata), to: metadataURL(for: id))
    }

    func permits(id: UUID, scope: String?) throws -> Bool {
        try prepareQueue()
        guard let metadata = try queuedMetadata().first(where: { $0.id == id }) else { return false }
        return metadata.runtimeScope == nil || metadata.runtimeScope == scope
    }

    func count() throws -> Int {
        try prepareQueue()
        return try queuedMetadata().count
    }

    func remove(id: UUID) throws {
        try prepareQueue()
        try removeFiles(id: id)
    }

    private func removeFiles(id: UUID) throws {
        guard FileManager.default.fileExists(
            atPath: metadataURL(for: id).path
        ) else {
            return
        }
        for url in [metadataURL(for: id), imageURL(for: id), draftURL(for: id)] {
            if FileManager.default.fileExists(atPath: url.path) {
                try FileManager.default.removeItem(at: url)
            }
        }
    }

#if DEBUG
    func removeAllForTesting() throws {
        try prepareQueue()
        for metadata in try queuedMetadata() {
            try remove(id: metadata.id)
        }
    }
#endif

    func saveDraft(_ draft: RecognizedCaptureDraft, for id: UUID, scope: String? = nil) throws {
        try prepareQueue()
        guard try load(id: id) != nil else { return }
        guard try permits(id: id, scope: scope) else { throw AppSessionError.scopeMismatch }
        try writeProtected(
            JSONEncoder.captureEncoder.encode(
                SavedDraft(seedID: id, draft: draft, recovery: try loadRecovery(for: id, scope: scope))
            ),
            to: draftURL(for: id)
        )
    }

    func loadDraft(for id: UUID, scope: String? = nil) throws -> RecognizedCaptureDraft? {
        try prepareQueue()
        guard try permits(id: id, scope: scope) else { return nil }
        let url = draftURL(for: id)
        guard FileManager.default.fileExists(atPath: url.path) else {
            return nil
        }
        let saved = try JSONDecoder.captureDecoder.decode(
            SavedDraft.self,
            from: Data(contentsOf: url)
        )
        return saved.seedID == id ? saved.draft : nil
    }

    func saveReview(seed: PendingCaptureSeed, draft: RecognizedCaptureDraft,
                    recovery: CaptureReviewRecovery, scope: String?) throws {
        try prepareQueue()
        guard Date().timeIntervalSince(seed.createdAt) < 30 * 86_400 else {
            throw CocoaError(.fileNoSuchFile)
        }
        if !FileManager.default.fileExists(atPath: metadataURL(for: seed.id).path) {
            try persist(seed, contentFingerprint: Self.contentFingerprint(for: seed.imageData))
        }
        if let scope { try claim(id: seed.id, scope: scope) }
        guard try permits(id: seed.id, scope: scope) else { throw AppSessionError.scopeMismatch }
        try writeProtected(JSONEncoder.captureEncoder.encode(
            SavedDraft(seedID: seed.id, draft: draft, recovery: recovery)
        ), to: draftURL(for: seed.id))
        if draft.keepOriginalForReview == false || Date().timeIntervalSince(seed.createdAt) >= 7 * 86_400 {
            try removeOriginal(id: seed.id)
        }
    }

    func loadRecovery(for id: UUID, scope: String? = nil) throws -> CaptureReviewRecovery? {
        guard try permits(id: id, scope: scope) else { return nil }
        let url = draftURL(for: id)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let saved = try JSONDecoder.captureDecoder.decode(SavedDraft.self, from: Data(contentsOf: url))
        return saved.seedID == id ? saved.recovery : nil
    }

    func removeOriginal(id: UUID) throws {
        let url = imageURL(for: id)
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }

    private func prepareQueue() throws {
        try FileManager.default.createDirectory(
            at: capturesDirectoryURL,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: capturesDirectoryURL.path
        )
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        var protectedDirectoryURL = capturesDirectoryURL
        try protectedDirectoryURL.setResourceValues(resourceValues)
        try migrateLegacyCaptureIfNeeded()
        for metadata in try queuedMetadata() {
            let age = Date().timeIntervalSince(metadata.createdAt)
            if age >= 30 * 86_400 { try removeFiles(id: metadata.id) }
            else if age >= 7 * 86_400 { try removeOriginal(id: metadata.id) }
        }
        for url in try FileManager.default.contentsOfDirectory(
            at: capturesDirectoryURL,
            includingPropertiesForKeys: nil
        ) {
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: url.path
            )
        }
    }

    private func persist(
        _ seed: PendingCaptureSeed,
        contentFingerprint: String
    ) throws {
        let pendingImageURL = imageURL(for: seed.id)
        let pendingMetadataURL = metadataURL(for: seed.id)
        do {
            try writeProtected(seed.imageData, to: pendingImageURL)
            try writeProtected(
                JSONEncoder.captureEncoder.encode(
                    PendingMetadata(
                        seed: seed,
                        contentFingerprint: contentFingerprint
                    )
                ),
                to: pendingMetadataURL
            )
        } catch {
            for url in [pendingImageURL, pendingMetadataURL] {
                if FileManager.default.fileExists(atPath: url.path) {
                    try? FileManager.default.removeItem(at: url)
                }
            }
            throw error
        }
    }

    func fileProtections(for id: UUID) throws -> [FileProtectionType?] {
        try prepareQueue()
        return try [metadataURL(for: id), imageURL(for: id), draftURL(for: id)]
            .map { url in
                guard FileManager.default.fileExists(atPath: url.path) else {
                    return nil
                }
                let attributes = try FileManager.default.attributesOfItem(
                    atPath: url.path
                )
                return attributes[.protectionKey] as? FileProtectionType
            }
    }

    func isExcludedFromBackup() throws -> Bool {
        try prepareQueue()
        return try capturesDirectoryURL.resourceValues(
            forKeys: [.isExcludedFromBackupKey]
        ).isExcludedFromBackup == true
    }

    private func writeProtected(_ data: Data, to url: URL) throws {
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: url.path
        )
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        var protectedURL = url
        try protectedURL.setResourceValues(resourceValues)
    }

    private func load(id: UUID) throws -> PendingCaptureSeed? {
        let url = metadataURL(for: id)
        guard FileManager.default.fileExists(atPath: url.path) else {
            return nil
        }
        let metadata = try JSONDecoder.captureDecoder.decode(
            PendingMetadata.self,
            from: Data(contentsOf: url)
        )
        return try load(metadata: metadata)
    }

    private func load(metadata: PendingMetadata) throws -> PendingCaptureSeed? {
        let url = imageURL(for: metadata.id)
        let age = Date().timeIntervalSince(metadata.createdAt)
        if age >= 7 * 24 * 60 * 60 { try removeOriginal(id: metadata.id) }
        if age >= 30 * 24 * 60 * 60 {
            try removeFiles(id: metadata.id)
            return nil
        }
        let imageData = FileManager.default.fileExists(atPath: url.path) ? try Data(contentsOf: url) : Data()
        return PendingCaptureSeed(
            id: metadata.id,
            imageData: imageData,
            fileName: metadata.fileName,
            mediaType: metadata.mediaType,
            createdAt: metadata.createdAt,
            origin: metadata.origin
        )
    }

    private func queuedMetadata() throws -> [PendingMetadata] {
        try FileManager.default.contentsOfDirectory(
            at: capturesDirectoryURL,
            includingPropertiesForKeys: nil
        )
        .filter { $0.lastPathComponent.hasSuffix(".metadata.json") }
        .compactMap { url in
            try? JSONDecoder.captureDecoder.decode(
                PendingMetadata.self,
                from: Data(contentsOf: url)
            )
        }
        .sorted {
            if $0.queueOrder == $1.queueOrder {
                return $0.id.uuidString < $1.id.uuidString
            }
            return $0.queueOrder < $1.queueOrder
        }
    }

    private func migrateLegacyCaptureIfNeeded() throws {
        guard FileManager.default.fileExists(atPath: legacyMetadataURL.path),
              FileManager.default.fileExists(atPath: legacyImageURL.path) else {
            return
        }
        let metadata = try JSONDecoder.captureDecoder.decode(
            PendingMetadata.self,
            from: Data(contentsOf: legacyMetadataURL)
        )
        if try load(id: metadata.id) == nil {
            let seed = PendingCaptureSeed(
                id: metadata.id,
                imageData: try Data(contentsOf: legacyImageURL),
                fileName: metadata.fileName,
                mediaType: metadata.mediaType,
                createdAt: metadata.createdAt,
                origin: metadata.origin
            )
            try persist(
                seed,
                contentFingerprint: Self.contentFingerprint(
                    for: seed.imageData
                )
            )
            if FileManager.default.fileExists(atPath: legacyDraftURL.path) {
                try Data(contentsOf: legacyDraftURL).write(
                    to: draftURL(for: metadata.id),
                    options: .atomic
                )
            }
        }
        for url in [legacyMetadataURL, legacyImageURL, legacyDraftURL] {
            if FileManager.default.fileExists(atPath: url.path) {
                try FileManager.default.removeItem(at: url)
            }
        }
    }

    private func metadataURL(for id: UUID) -> URL {
        capturesDirectoryURL.appending(path: "\(id.uuidString).metadata.json")
    }

    private func imageURL(for id: UUID) -> URL {
        capturesDirectoryURL.appending(path: "\(id.uuidString).image")
    }

    private func draftURL(for id: UUID) -> URL {
        capturesDirectoryURL.appending(path: "\(id.uuidString).draft.json")
    }

    private static func contentFingerprint(for data: Data) -> String {
        SHA256.hash(data: data)
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private struct PendingMetadata: Codable {
        let id: UUID
        let fileName: String
        let mediaType: String
        let createdAt: Date
        let origin: CaptureOrigin
        let contentFingerprint: String?
        let enqueueOrder: Int64?
        var runtimeScope: String? = nil
        var sessionID: UUID? = nil
        var processingState: CaptureSessionProcessingState? = nil
        var processingDetail: String? = nil

        var queueOrder: Int64 {
            enqueueOrder
                ?? Int64(createdAt.timeIntervalSince1970 * 1_000_000)
        }

        init(
            seed: PendingCaptureSeed,
            contentFingerprint: String
        ) {
            id = seed.id
            fileName = seed.fileName
            mediaType = seed.mediaType
            createdAt = seed.createdAt
            origin = seed.origin
            self.contentFingerprint = contentFingerprint
            enqueueOrder = Int64(
                seed.createdAt.timeIntervalSince1970 * 1_000_000
            )
            sessionID = UUID()
            processingState = .queued
            processingDetail = "Agent Session created. Waiting for on-device processing."
        }
    }

    private struct SavedDraft: Codable {
        let seedID: UUID
        let draft: RecognizedCaptureDraft
        var recovery: CaptureReviewRecovery? = nil
    }
}

@MainActor
final class CaptureHandoffStore: ObservableObject {
    static let shared = CaptureHandoffStore()

    @Published var pendingSeed: PendingCaptureSeed?
    @Published private(set) var savedSeed: PendingCaptureSeed?
    @Published private(set) var initialDraft: RecognizedCaptureDraft?
    @Published private(set) var inboxItems: [PendingCaptureSummary] = []
    @Published private(set) var inboxLoadError: String?
    private let inbox: PendingCaptureInbox
    private var runtimeScope: String?
    private var generation = UUID()
    private var processingIDs: Set<UUID> = []
    private weak var processingSessionStore: AgentSessionStore?

    init(inbox: PendingCaptureInbox = .shared) {
        self.inbox = inbox
    }

    var inboxCount: Int { inboxItems.count }
    var attentionCount: Int { inboxItems.filter(\.needsAttention).count }
    var processingCount: Int {
        inboxItems.filter {
            $0.processingState == .queued || $0.processingState == .processing
        }.count
    }

    func changeRuntimeScope(_ scope: String?) async {
        guard scope != runtimeScope else { return }
        runtimeScope = scope
        generation = UUID()
        pendingSeed = nil
        savedSeed = nil
        initialDraft = nil
        inboxItems = []
        inboxLoadError = nil
        processingSessionStore = nil
        await restorePendingCapture()
    }

    func present(
        _ seed: PendingCaptureSeed,
        initialDraft: RecognizedCaptureDraft? = nil,
        expectedScope: String? = nil
    ) {
        guard expectedScope == runtimeScope else { return }
        savedSeed = seed
        self.initialDraft = initialDraft
        pendingSeed = seed
        Task { await refreshInbox() }
    }

    func enqueueForAgentProcessing(
        _ seed: PendingCaptureSeed,
        expectedScope: String? = nil
    ) {
        guard expectedScope == runtimeScope else { return }
        savedSeed = seed
        initialDraft = nil
        pendingSeed = nil
        Task { await refreshInbox() }
    }

    func restorePendingCapture() async {
        await refreshInbox()
#if DEBUG
        if Self.value(after: "--scenario", in: ProcessInfo.processInfo.arguments)
            == "capture-inbox" {
            return
        }
#endif
        guard savedSeed == nil else { return }
        let generation = generation
        if let item = inboxItems.first,
           let seed = try? await inbox.load(id: item.id, scope: runtimeScope) {
            guard generation == self.generation else { return }
            savedSeed = seed
            initialDraft = try? await inbox.loadDraft(
                for: seed.id,
                scope: runtimeScope
            )
        }
    }

    func processPendingCaptures(
        sessionStore: AgentSessionStore,
        service: RelationshipCaptureServing? = nil,
        recognizer: ConversationTextRecognizing = VisionConversationTextRecognizer()
    ) async {
        processingSessionStore = sessionStore
        await refreshInbox()
        let generation = generation

        for item in inboxItems where item.processingState != .completed {
            guard generation == self.generation else { return }
            if item.sessionID.flatMap({ sessionStore.session(id: $0) }) == nil {
                let objective = "Process conversation screenshot: \(item.fileName)"
                let durableSessionID = item.sessionID ?? UUID()
                guard let sessionID = sessionStore.beginUnscopedSession(
                    objective: objective,
                    id: durableSessionID,
                    createdAt: item.createdAt
                ) else {
                    inboxLoadError = "The capture Session could not be protected on this device."
                    continue
                }
                do {
                    try await inbox.updateSessionProcessing(
                        id: item.id,
                        sessionID: sessionID,
                        state: .queued,
                        detail: "Agent Session created. Waiting for on-device processing.",
                        scope: runtimeScope
                    )
                } catch {
                    _ = sessionStore.delete(sessionID)
                    inboxLoadError = error.localizedDescription
                }
            }
        }

        await refreshInbox()
        for item in inboxItems where
            item.processingState == .queued || item.processingState == .processing {
            guard generation == self.generation else { return }
            await process(
                item,
                sessionStore: sessionStore,
                service: service,
                recognizer: recognizer
            )
        }
        await refreshInbox()
    }

    private func process(
        _ item: PendingCaptureSummary,
        sessionStore: AgentSessionStore,
        service: RelationshipCaptureServing?,
        recognizer: ConversationTextRecognizing
    ) async {
        guard !processingIDs.contains(item.id),
              let sessionID = item.sessionID,
              sessionStore.session(id: sessionID) != nil else { return }
        processingIDs.insert(item.id)
        defer { processingIDs.remove(item.id) }

        let objective = sessionStore.session(id: sessionID)?.pendingObjective
            ?? "Process conversation screenshot: \(item.fileName)"
        do {
            if let existingTurn = processingTurn(
                captureID: item.id,
                sessionID: sessionID,
                sessionStore: sessionStore
            ) {
                let needsDecision = existingTurn.response.blocks.contains(where: \.requiresUserDecision)
                try await inbox.updateSessionProcessing(
                    id: item.id,
                    sessionID: sessionID,
                    state: needsDecision ? .needsDecision : .completed,
                    detail: existingTurn.response.blocks.first?.body,
                    scope: runtimeScope
                )
                if needsDecision {
                    sessionStore.markUnread(sessionID)
                } else {
                    try await removeCompletedCapture(id: item.id)
                }
                return
            }
            try await inbox.updateSessionProcessing(
                id: item.id,
                sessionID: sessionID,
                state: .processing,
                detail: "Reading the screenshot on this device.",
                scope: runtimeScope
            )
            await refreshInbox()
            guard let seed = try await inbox.load(id: item.id, scope: runtimeScope),
                  !seed.imageData.isEmpty else {
                throw ConversationRecognitionError.unreadableImage
            }
            let draft: RecognizedCaptureDraft
            if let saved = try await inbox.loadDraft(for: item.id, scope: runtimeScope) {
                draft = saved
            } else {
                let text = try await recognizer.recognizeText(in: seed.imageData)
                draft = CaptureDraftBuilder.makeDraft(from: text)
                try await inbox.saveDraft(draft, for: item.id, scope: runtimeScope)
            }
            let blockers: [String]
            if let service {
                var recovery = try await inbox.loadRecovery(
                    for: item.id,
                    scope: runtimeScope
                ) ?? CaptureReviewRecovery()
                var capture: ResourceCaptureResult
                if let savedCapture = recovery.capture {
                    capture = savedCapture
                } else {
                    var submittedDraft = recovery.submittedDraft ?? draft
                    submittedDraft.sourceByteCount = seed.imageData.count
                    submittedDraft.sourceTimezone = TimeZone.current.identifier
                    recovery.submittedDraft = submittedDraft
                    recovery.submittedByAgent = true
                    try await inbox.saveReview(
                        seed: seed,
                        draft: submittedDraft,
                        recovery: recovery,
                        scope: runtimeScope
                    )
                    capture = try await service.createProposedCapture(
                        seed: seed,
                        draft: submittedDraft
                    )
                    recovery.capture = capture
                    try await inbox.saveReview(
                        seed: seed,
                        draft: submittedDraft,
                        recovery: recovery,
                        scope: runtimeScope
                    )
                }
                var identityCase: IdentityResolutionCase?
                if capture.identity.status != "bound",
                   let caseID = capture.identity.resolutionCaseID {
                    let loadedCase = try await service.loadIdentityCase(id: caseID)
                    identityCase = loadedCase
                    if loadedCase.status != "pending" {
                        capture = try await service.loadCapture(id: capture.captureID)
                        recovery.capture = capture
                        try await inbox.saveReview(
                            seed: seed,
                            draft: recovery.submittedDraft ?? draft,
                            recovery: recovery,
                            scope: runtimeScope
                        )
                    } else if let binding = CaptureSessionDecisionPolicy.automaticBinding(
                        for: loadedCase
                    ) {
                        let result = try await service.decideIdentity(
                            identityCase: loadedCase,
                            decision: .bindFromAgent(
                                candidate: binding.candidate,
                                context: binding.context
                            ),
                            seed: seed,
                            draft: recovery.submittedDraft ?? draft
                        )
                        if result.identityStatus == "bound" {
                            capture = ResourceCaptureResult(
                                captureID: capture.captureID,
                                identity: .init(
                                    status: "bound",
                                    personID: result.personID,
                                    relationshipContextID: result.relationshipContextID,
                                    resolutionCaseID: nil,
                                    candidatePersonIDs: [],
                                    personDisplayLabel: binding.candidate.displayLabel,
                                    relationshipDisplayLabel: binding.context.displayLabel
                                ),
                                resource: .init(
                                    id: capture.resource.id,
                                    processingState: result.resourceProcessingState,
                                    duplicateOfResourceID: capture.resource.duplicateOfResourceID,
                                    fragmentCount: capture.resource.fragmentCount
                                )
                            )
                            recovery.capture = capture
                            try await inbox.saveReview(
                                seed: seed,
                                draft: recovery.submittedDraft ?? draft,
                                recovery: recovery,
                                scope: runtimeScope
                            )
                        }
                    }
                }
                blockers = CaptureSessionDecisionPolicy.blockers(
                    for: capture,
                    identityCase: identityCase
                )
            } else {
                blockers = CaptureSessionDecisionPolicy.blockers(for: draft)
            }
            let response = Self.processingResponse(
                captureID: item.id,
                blockers: blockers
            )
            guard sessionStore.recordUnscopedChat(
                sessionID: sessionID,
                objective: objective,
                response: response
            ) else {
                throw CaptureSessionProcessingError.sessionPersistenceUnavailable
            }
            let needsDecision = !blockers.isEmpty
            try await inbox.updateSessionProcessing(
                id: item.id,
                sessionID: sessionID,
                state: needsDecision ? .needsDecision : .completed,
                detail: needsDecision
                    ? blockers.joined(separator: " ")
                    : "The screenshot was attached as proposed evidence without a blocking decision.",
                scope: runtimeScope
            )
            if needsDecision {
                sessionStore.markUnread(sessionID)
            } else {
                try await removeCompletedCapture(id: item.id)
            }
        } catch is CancellationError {
            return
        } catch {
            if let existingTurn = processingTurn(
                captureID: item.id,
                sessionID: sessionID,
                sessionStore: sessionStore
            ) {
                let needsDecision = existingTurn.response.blocks.contains(
                    where: \.requiresUserDecision
                )
                do {
                    try await inbox.updateSessionProcessing(
                        id: item.id,
                        sessionID: sessionID,
                        state: needsDecision ? .needsDecision : .completed,
                        detail: existingTurn.response.blocks.first?.body,
                        scope: runtimeScope
                    )
                    if needsDecision {
                        sessionStore.markUnread(sessionID)
                    } else {
                        try await removeCompletedCapture(id: item.id)
                    }
                } catch {
                    inboxLoadError = error.localizedDescription
                }
                return
            }
            let response = Self.failureResponse(captureID: item.id)
            _ = sessionStore.recordUnscopedChat(
                sessionID: sessionID,
                objective: objective,
                response: response
            )
            sessionStore.markUnread(sessionID)
            try? await inbox.updateSessionProcessing(
                id: item.id,
                sessionID: sessionID,
                state: .failed,
                detail: "Agent processing stopped. Open this decision to retry from the protected screenshot.",
                scope: runtimeScope
            )
        }
    }

    private func processingTurn(
        captureID: UUID,
        sessionID: UUID,
        sessionStore: AgentSessionStore
    ) -> AgentSessionTurn? {
        let taskID = "capture-\(captureID.uuidString.lowercased())"
        return sessionStore.session(id: sessionID)?.turns.first(where: {
            $0.response.taskID == taskID || $0.response.taskID == "\(taskID)-failed"
        })
    }

    private func removeCompletedCapture(id: UUID) async throws {
        try await inbox.remove(id: id)
        if savedSeed?.id == id {
            savedSeed = nil
            initialDraft = nil
        }
        if pendingSeed?.id == id {
            pendingSeed = nil
        }
    }

    private static func processingResponse(
        captureID: UUID,
        blockers: [String]
    ) -> RelationshipAskResponse {
        let needsDecision = !blockers.isEmpty
        return RelationshipAskResponse(
            contractVersion: TalentSignalAPIContract.version,
            taskID: "capture-\(captureID.uuidString.lowercased())",
            contextManifestID: "none-unbound-conversation",
            knowledgeSnapshotID: "local-capture-processing",
            disposition: needsDecision ? "clarify" : "answer",
            blocks: [
                .init(
                    id: "capture-status-\(captureID.uuidString.lowercased())",
                    kind: needsDecision ? "clarification" : "answer",
                    title: needsDecision
                        ? "Capture needs one decision"
                        : "Capture processed",
                    body: needsDecision
                        ? blockers.joined(separator: " ")
                        : "The screenshot was attached to the matched relationship as proposed evidence. No extracted fact was confirmed and no external action was performed.",
                    status: needsDecision ? "needs_review" : "informational",
                    citationDependencyIDs: [],
                    requiresUserDecision: needsDecision
                ),
            ],
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
    }

    private static func failureResponse(captureID: UUID) -> RelationshipAskResponse {
        RelationshipAskResponse(
            contractVersion: TalentSignalAPIContract.version,
            taskID: "capture-\(captureID.uuidString.lowercased())-failed",
            contextManifestID: "none-unbound-conversation",
            knowledgeSnapshotID: "local-capture-processing",
            disposition: "block",
            blocks: [
                .init(
                    id: "capture-failure-\(captureID.uuidString.lowercased())",
                    kind: "clarification",
                    title: "Capture processing stopped",
                    body: "The Agent could not read enough from the protected screenshot. Open this decision to inspect the source or try again.",
                    status: "needs_review",
                    citationDependencyIDs: [],
                    requiresUserDecision: true
                ),
            ],
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
    }

    func refreshInbox() async {
        let generation = generation
        do {
            let items = try await inbox.summaries(scope: runtimeScope)
            guard generation == self.generation else { return }
            inboxItems = items
            inboxLoadError = nil
        } catch {
            guard generation == self.generation else { return }
            inboxLoadError = error.localizedDescription
        }
    }

    func resume(id: UUID) async {
        let generation = generation
        do {
            guard let seed = try await inbox.load(id: id, scope: runtimeScope) else {
                await refreshInbox()
                return
            }
            let draft = try? await inbox.loadDraft(for: id, scope: runtimeScope)
            guard generation == self.generation else { return }
            savedSeed = seed
            initialDraft = draft
            pendingSeed = seed
            inboxLoadError = nil
        } catch {
            guard generation == self.generation else { return }
            inboxLoadError = error.localizedDescription
        }
    }

    func removeFromInbox(id: UUID) async throws {
        try resolveProcessingSession(captureID: id, resolution: .dismissed)
        try await inbox.remove(id: id)
        if savedSeed?.id == id || pendingSeed?.id == id {
            pendingSeed = nil
            savedSeed = nil
            initialDraft = nil
        }
        await refreshInbox()
        if savedSeed == nil, let next = inboxItems.first,
           let seed = try? await inbox.load(id: next.id, scope: runtimeScope) {
            savedSeed = seed
            initialDraft = try? await inbox.loadDraft(
                for: seed.id,
                scope: runtimeScope
            )
        }
    }

    func advanceToNextCapture(
        resolution: CaptureSessionResolution? = nil
    ) async {
        if let resolution, let completedID = pendingSeed?.id {
            do {
                try resolveProcessingSession(
                    captureID: completedID,
                    resolution: resolution
                )
            } catch {
                inboxLoadError = error.localizedDescription
            }
        }
        pendingSeed = nil
        savedSeed = nil
        initialDraft = nil
        await refreshInbox()
        let generation = generation
        if let item = inboxItems.first,
           let seed = try? await inbox.load(id: item.id, scope: runtimeScope) {
            guard generation == self.generation else { return }
            savedSeed = seed
            initialDraft = try? await inbox.loadDraft(
                for: seed.id,
                scope: runtimeScope
            )
        }
    }

    private func resolveProcessingSession(
        captureID: UUID,
        resolution: CaptureSessionResolution
    ) throws {
        guard let sessionID = inboxItems.first(where: { $0.id == captureID })?.sessionID,
              let sessionStore = processingSessionStore,
              sessionStore.session(id: sessionID) != nil else {
            return
        }
        let taskID = "capture-\(captureID.uuidString.lowercased())-resolved"
        if sessionStore.session(id: sessionID)?.turns.contains(where: {
            $0.response.taskID == taskID
        }) == true {
            sessionStore.markRead(sessionID)
            return
        }
        let dismissed = resolution == .dismissed
        let response = RelationshipAskResponse(
            contractVersion: TalentSignalAPIContract.version,
            taskID: taskID,
            contextManifestID: "none-unbound-conversation",
            knowledgeSnapshotID: "local-capture-processing",
            disposition: "answer",
            blocks: [
                .init(
                    id: "capture-resolution-\(captureID.uuidString.lowercased())",
                    kind: "answer",
                    title: dismissed ? "Capture dismissed" : "Capture decision completed",
                    body: dismissed
                        ? "The recruiter removed the local capture. No identity, fact, or external action was confirmed by that dismissal."
                        : "The recruiter completed the required capture decision in the governed review flow.",
                    status: "informational",
                    citationDependencyIDs: [],
                    requiresUserDecision: false
                ),
            ],
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        guard sessionStore.recordUnscopedChat(
            sessionID: sessionID,
            objective: "Resolve conversation screenshot",
            response: response
        ) else {
            throw CaptureSessionProcessingError.sessionPersistenceUnavailable
        }
        sessionStore.markRead(sessionID)
    }

    @discardableResult
    func configureDeterministicLaunch(arguments: [String]) async -> Bool {
#if DEBUG
        guard let scenario = Self.value(after: "--scenario", in: arguments),
              ["relationship-capture", "relationship-capture-archive", "capture-inbox"]
                .contains(scenario) else {
            return false
        }
        if scenario == "capture-inbox" {
            try? await inbox.removeAllForTesting()
            for index in 1...3 {
                let displayName = ["Alex Chen", "Priya Nair", "Jordan Lee"][index - 1]
                let seed = PendingCaptureSeed(
                    imageData: Self.deterministicCaptureImageData(
                        displayName: displayName,
                        handle: "+65800000\(index)",
                        message: "Conversation \(index) is waiting for review."
                    ),
                    fileName: index == 2
                        ? "conversation-with-priya-about-the-singapore-search.png"
                        : "conversation-\(index).png",
                    mediaType: "image/png",
                    origin: index == 1 ? .appShortcut : .photosPicker
                )
                _ = try? await inbox.stage(
                    imageData: seed.imageData,
                    fileName: seed.fileName,
                    mediaType: seed.mediaType,
                    origin: seed.origin
                )
            }
            pendingSeed = nil
            initialDraft = nil
            await refreshInbox()
            if let first = inboxItems.first {
                savedSeed = try? await inbox.load(id: first.id, scope: runtimeScope)
            } else {
                savedSeed = nil
            }
            return true
        }
        let captureName = Self.value(
            after: "--capture-name",
            in: arguments
        ) ?? "Current owner 080e5531"
        let captureHandle = Self.value(
            after: "--capture-handle",
            in: arguments
        ) ?? "+6580805531"
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = Self.value(after: "--capture-text-base64", in: arguments)
            .flatMap { Data(base64Encoded: $0) }.flatMap { String(data: $0, encoding: .utf8) }
            ?? Self.value(
            after: "--capture-text",
            in: arguments
        ) ?? "Phone: +6580805531\nPlease keep this conversation with the current relationship."
        draft.displayNameHint = captureName
        draft.handleType = .phone
        draft.handleValue = captureHandle
        draft.relationshipLabel = Self.value(
            after: "--capture-relationship",
            in: arguments
        ) ?? "Current client relationship"
        draft.relationshipPurpose =
            "Prepare a source-linked relationship brief before the next conversation"
        draft.relationshipRole = "Client"

        present(
            PendingCaptureSeed(
                id: UUID(
                    uuidString: Self.value(
                        after: "--capture-seed",
                        in: arguments
                    ) ?? "A1A1A1A1-A1A1-41A1-81A1-A1A1A1A1A1A1"
                ) ?? UUID(uuidString: "A1A1A1A1-A1A1-41A1-81A1-A1A1A1A1A1A1")!,
                imageData: Self.deterministicCaptureImageData(
                    displayName: captureName,
                    handle: captureHandle,
                    message: draft.reviewedText
                ),
                fileName: "recycled-phone-conversation.png",
                mediaType: "image/png",
                origin: .deterministicTest
            ),
            initialDraft: draft
        )
        return true
#else
        return false
#endif
    }

#if DEBUG
    private static func deterministicCaptureImageData(
        displayName: String,
        handle: String,
        message: String
    ) -> Data {
        let size = CGSize(width: 1_080, height: 1_920)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { context in
            UIColor(red: 0.94, green: 0.95, blue: 0.93, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))

            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: size.width, height: 180))
            displayName.draw(
                in: CGRect(x: 70, y: 74, width: 940, height: 72),
                withAttributes: [
                    .font: UIFont.systemFont(ofSize: 44, weight: .semibold),
                    .foregroundColor: UIColor.black,
                ]
            )

            let bubble = UIBezierPath(
                roundedRect: CGRect(x: 70, y: 300, width: 860, height: 410),
                cornerRadius: 34
            )
            UIColor.white.setFill()
            bubble.fill()
            "Synthetic conversation fixture\n\n\(handle)\n\n\(message)".draw(
                in: CGRect(x: 110, y: 345, width: 780, height: 330),
                withAttributes: [
                    .font: UIFont.systemFont(ofSize: 35),
                    .foregroundColor: UIColor.black,
                ]
            )

            let boundary = UIBezierPath(
                roundedRect: CGRect(x: 250, y: 870, width: 760, height: 220),
                cornerRadius: 34
            )
            UIColor(red: 0.72, green: 0.91, blue: 0.62, alpha: 1).setFill()
            boundary.fill()
            "Review the original before saving OCR as evidence.".draw(
                in: CGRect(x: 295, y: 930, width: 670, height: 120),
                withAttributes: [
                    .font: UIFont.systemFont(ofSize: 34, weight: .medium),
                    .foregroundColor: UIColor.black,
                ]
            )
        }
        return image.pngData() ?? Data()
    }
#endif

    func keepForLater() {
        pendingSeed = nil
    }

    func resume() {
        pendingSeed = savedSeed
    }

    func clear() {
        pendingSeed = nil
        savedSeed = nil
        initialDraft = nil
        inboxItems = []
        inboxLoadError = nil
    }

    private static func value(
        after flag: String,
        in arguments: [String]
    ) -> String? {
        guard let index = arguments.firstIndex(of: flag),
              arguments.indices.contains(index + 1) else {
            return nil
        }
        return arguments[index + 1]
    }
}

private enum CaptureSessionProcessingError: LocalizedError {
    case sessionPersistenceUnavailable

    var errorDescription: String? {
        "The capture Session could not be protected on this device."
    }
}

private extension JSONEncoder {
    static var captureEncoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

private extension JSONDecoder {
    static var captureDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
