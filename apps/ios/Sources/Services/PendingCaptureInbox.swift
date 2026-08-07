import Foundation

actor PendingCaptureInbox {
    static let shared = PendingCaptureInbox()

    private let directoryURL: URL
    private let metadataURL: URL
    private let imageURL: URL
    private let draftURL: URL

    init(directoryURL: URL? = nil) {
        let resolvedDirectory = directoryURL
            ?? FileManager.default.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            )[0].appending(path: "RelationshipCaptureInbox", directoryHint: .isDirectory)
        self.directoryURL = resolvedDirectory
        metadataURL = resolvedDirectory.appending(path: "pending.json")
        imageURL = resolvedDirectory.appending(path: "pending-image")
        draftURL = resolvedDirectory.appending(path: "pending-draft.json")
    }

    func stage(
        imageData: Data,
        fileName: String,
        mediaType: String,
        origin: CaptureOrigin
    ) throws -> PendingCaptureSeed {
        try FileManager.default.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: true
        )
        let seed = PendingCaptureSeed(
            imageData: imageData,
            fileName: fileName,
            mediaType: mediaType,
            origin: origin
        )
        if FileManager.default.fileExists(atPath: draftURL.path) {
            try FileManager.default.removeItem(at: draftURL)
        }
        try imageData.write(to: imageURL, options: .atomic)
        let metadata = PendingMetadata(seed: seed)
        try JSONEncoder.captureEncoder.encode(metadata).write(
            to: metadataURL,
            options: .atomic
        )
        return seed
    }

    func load() throws -> PendingCaptureSeed? {
        guard FileManager.default.fileExists(atPath: metadataURL.path),
              FileManager.default.fileExists(atPath: imageURL.path) else {
            return nil
        }
        let metadata = try JSONDecoder.captureDecoder.decode(
            PendingMetadata.self,
            from: Data(contentsOf: metadataURL)
        )
        return PendingCaptureSeed(
            id: metadata.id,
            imageData: try Data(contentsOf: imageURL),
            fileName: metadata.fileName,
            mediaType: metadata.mediaType,
            createdAt: metadata.createdAt,
            origin: metadata.origin
        )
    }

    func remove(id: UUID) throws {
        guard let pending = try load(), pending.id == id else { return }
        if FileManager.default.fileExists(atPath: metadataURL.path) {
            try FileManager.default.removeItem(at: metadataURL)
        }
        if FileManager.default.fileExists(atPath: imageURL.path) {
            try FileManager.default.removeItem(at: imageURL)
        }
        if FileManager.default.fileExists(atPath: draftURL.path) {
            try FileManager.default.removeItem(at: draftURL)
        }
    }

    func saveDraft(_ draft: RecognizedCaptureDraft, for id: UUID) throws {
        guard let pending = try load(), pending.id == id else { return }
        try JSONEncoder.captureEncoder.encode(
            SavedDraft(seedID: id, draft: draft)
        ).write(to: draftURL, options: .atomic)
    }

    func loadDraft(for id: UUID) throws -> RecognizedCaptureDraft? {
        guard FileManager.default.fileExists(atPath: draftURL.path) else {
            return nil
        }
        let saved = try JSONDecoder.captureDecoder.decode(
            SavedDraft.self,
            from: Data(contentsOf: draftURL)
        )
        return saved.seedID == id ? saved.draft : nil
    }

    private struct PendingMetadata: Codable {
        let id: UUID
        let fileName: String
        let mediaType: String
        let createdAt: Date
        let origin: CaptureOrigin

        init(seed: PendingCaptureSeed) {
            id = seed.id
            fileName = seed.fileName
            mediaType = seed.mediaType
            createdAt = seed.createdAt
            origin = seed.origin
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

    @discardableResult
    func configureDeterministicLaunch(arguments: [String]) -> Bool {
        guard Self.value(after: "--scenario", in: arguments)
                == "relationship-capture" else {
            return false
        }
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = Self.value(
            after: "--capture-text",
            in: arguments
        ) ?? "Phone: +6580805531\nPlease keep this conversation with the current relationship."
        draft.displayNameHint = Self.value(
            after: "--capture-name",
            in: arguments
        ) ?? "Current owner 080e5531"
        draft.handleType = .phone
        draft.handleValue = Self.value(
            after: "--capture-handle",
            in: arguments
        ) ?? "+6580805531"
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
                imageData: Data(),
                fileName: "recycled-phone-conversation.png",
                mediaType: "image/png",
                origin: .deterministicTest
            ),
            initialDraft: draft
        )
        return true
    }

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
