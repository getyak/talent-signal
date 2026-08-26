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
        try prepareQueue()
        let contentFingerprint = Self.contentFingerprint(for: imageData)
        if let metadata = try queuedMetadata().first(
            where: { $0.contentFingerprint == contentFingerprint }
        ), let existing = try load(metadata: metadata) {
            return existing
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

    func load() throws -> PendingCaptureSeed? {
        try prepareQueue()
        guard let metadata = try queuedMetadata().first else { return nil }
        return try load(metadata: metadata)
    }

    func count() throws -> Int {
        try prepareQueue()
        return try queuedMetadata().count
    }

    func remove(id: UUID) throws {
        try prepareQueue()
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

    func saveDraft(_ draft: RecognizedCaptureDraft, for id: UUID) throws {
        try prepareQueue()
        guard try load(id: id) != nil else { return }
        try writeProtected(
            JSONEncoder.captureEncoder.encode(
                SavedDraft(seedID: id, draft: draft)
            ),
            to: draftURL(for: id)
        )
    }

    func loadDraft(for id: UUID) throws -> RecognizedCaptureDraft? {
        try prepareQueue()
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
        try migrateLegacyCaptureIfNeeded()
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
        try writeProtected(seed.imageData, to: imageURL(for: seed.id))
        try writeProtected(
            JSONEncoder.captureEncoder.encode(
                PendingMetadata(
                    seed: seed,
                    contentFingerprint: contentFingerprint
                )
            ),
            to: metadataURL(for: seed.id)
        )
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

    private func writeProtected(_ data: Data, to url: URL) throws {
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: url.path
        )
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
        guard FileManager.default.fileExists(atPath: url.path) else {
            return nil
        }
        return PendingCaptureSeed(
            id: metadata.id,
            imageData: try Data(contentsOf: url),
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
        .filter {
            FileManager.default.fileExists(atPath: imageURL(for: $0.id).path)
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
        }
    }

    private struct SavedDraft: Codable {
        let seedID: UUID
        let draft: RecognizedCaptureDraft
    }
}

@MainActor
final class CaptureHandoffStore: ObservableObject {
    static let shared = CaptureHandoffStore()

    @Published var pendingSeed: PendingCaptureSeed?
    @Published private(set) var savedSeed: PendingCaptureSeed?
    @Published private(set) var initialDraft: RecognizedCaptureDraft?

    func present(
        _ seed: PendingCaptureSeed,
        initialDraft: RecognizedCaptureDraft? = nil
    ) {
        savedSeed = seed
        self.initialDraft = initialDraft
        pendingSeed = seed
    }

    func restorePendingCapture() async {
        guard savedSeed == nil else { return }
        if let seed = try? await PendingCaptureInbox.shared.load() {
            savedSeed = seed
            pendingSeed = seed
        }
    }

    func advanceToNextCapture() async {
        pendingSeed = nil
        savedSeed = nil
        initialDraft = nil
        if let seed = try? await PendingCaptureInbox.shared.load() {
            savedSeed = seed
        }
    }

    @discardableResult
    func configureDeterministicLaunch(arguments: [String]) -> Bool {
#if DEBUG
        guard let scenario = Self.value(after: "--scenario", in: arguments),
              ["relationship-capture", "relationship-capture-archive"]
                .contains(scenario) else {
            return false
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
        draft.reviewedText = Self.value(
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
