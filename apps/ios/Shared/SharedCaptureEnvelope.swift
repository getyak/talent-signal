import Foundation

enum SharedCapturePayloadKind: String, Codable, CaseIterable, Sendable {
    case image
    case text
    case url
}

struct SharedCaptureEnvelope: Codable, Equatable, Identifiable, Sendable {
    static let schemaVersion = 1

    let id: UUID
    let schemaVersion: Int
    let kind: SharedCapturePayloadKind
    let createdAt: Date
    let sourceApplication: String?
    let text: String?
    let url: URL?
    let payloadFileName: String?
    let mediaType: String?

    init(
        id: UUID = UUID(),
        kind: SharedCapturePayloadKind,
        createdAt: Date = Date(),
        sourceApplication: String? = nil,
        text: String? = nil,
        url: URL? = nil,
        payloadFileName: String? = nil,
        mediaType: String? = nil
    ) {
        self.id = id
        schemaVersion = Self.schemaVersion
        self.kind = kind
        self.createdAt = createdAt
        self.sourceApplication = sourceApplication
        self.text = text
        self.url = url
        self.payloadFileName = payloadFileName
        self.mediaType = mediaType
    }
}

struct SharedCaptureInbox {
    static let appGroupIdentifier = "group.com.talentsignal.app"

    private let rootURL: URL
    private let fileManager: FileManager

    init(
        rootURL: URL? = nil,
        fileManager: FileManager = .default
    ) throws {
        self.fileManager = fileManager
        if let rootURL {
            self.rootURL = rootURL
        } else if let container = fileManager.containerURL(
            forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier
        ) {
            self.rootURL = container.appending(
                path: "StandaloneSharedCapture",
                directoryHint: .isDirectory
            )
        } else {
            throw SharedCaptureInboxError.appGroupUnavailable
        }
        try prepareDirectories()
    }

    @discardableResult
    func appendText(
        _ text: String,
        sourceApplication: String? = nil,
        now: Date = Date()
    ) throws -> SharedCaptureEnvelope {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw SharedCaptureInboxError.emptyPayload }
        let envelope = SharedCaptureEnvelope(
            kind: .text,
            createdAt: now,
            sourceApplication: sourceApplication,
            text: trimmed
        )
        try append(envelope)
        return envelope
    }

    @discardableResult
    func appendURL(
        _ url: URL,
        note: String? = nil,
        sourceApplication: String? = nil,
        now: Date = Date()
    ) throws -> SharedCaptureEnvelope {
        guard let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme) else {
            throw SharedCaptureInboxError.unsupportedURL
        }
        let envelope = SharedCaptureEnvelope(
            kind: .url,
            createdAt: now,
            sourceApplication: sourceApplication,
            text: note?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            url: url
        )
        try append(envelope)
        return envelope
    }

    @discardableResult
    func appendImage(
        data: Data,
        fileExtension: String,
        mediaType: String,
        note: String? = nil,
        sourceApplication: String? = nil,
        now: Date = Date()
    ) throws -> SharedCaptureEnvelope {
        guard !data.isEmpty else { throw SharedCaptureInboxError.emptyPayload }
        let id = UUID()
        let safeExtension = fileExtension
            .lowercased()
            .filter { $0.isLetter || $0.isNumber }
        let payloadFileName = "\(id.uuidString.lowercased()).\(safeExtension.isEmpty ? "image" : safeExtension)"
        let finalURL = payloadsDirectory.appending(path: payloadFileName)
        let temporaryURL = temporaryDirectory.appending(path: "\(payloadFileName).tmp")
        try data.write(to: temporaryURL, options: [.completeFileProtection])
        try fileManager.moveItem(at: temporaryURL, to: finalURL)
        let envelope = SharedCaptureEnvelope(
            id: id,
            kind: .image,
            createdAt: now,
            sourceApplication: sourceApplication,
            text: note?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            payloadFileName: payloadFileName,
            mediaType: mediaType
        )
        do {
            try append(envelope)
        } catch {
            try? fileManager.removeItem(at: finalURL)
            throw error
        }
        return envelope
    }

    func pending() throws -> [SharedCaptureEnvelope] {
        try fileManager.contentsOfDirectory(
            at: inboxDirectory,
            includingPropertiesForKeys: nil
        )
        .filter { $0.pathExtension == "json" }
        .compactMap { url in
            try? Self.decoder.decode(
                SharedCaptureEnvelope.self,
                from: Data(contentsOf: url)
            )
        }
        .filter { $0.schemaVersion == SharedCaptureEnvelope.schemaVersion }
        .sorted {
            if $0.createdAt == $1.createdAt { return $0.id.uuidString < $1.id.uuidString }
            return $0.createdAt < $1.createdAt
        }
    }

    func markImported(_ id: UUID) throws {
        let source = envelopeURL(for: id, in: inboxDirectory)
        guard fileManager.fileExists(atPath: source.path) else { return }
        let destination = envelopeURL(for: id, in: importedDirectory)
        if fileManager.fileExists(atPath: destination.path) {
            try fileManager.removeItem(at: source)
        } else {
            try fileManager.moveItem(at: source, to: destination)
        }
    }

    func payloadURL(for envelope: SharedCaptureEnvelope) -> URL? {
        guard let payloadFileName = envelope.payloadFileName else { return nil }
        return payloadURL(fileName: payloadFileName)
    }

    func payloadURL(fileName: String) -> URL? {
        let candidate = payloadsDirectory.appending(path: fileName)
        return fileManager.fileExists(atPath: candidate.path) ? candidate : nil
    }

    private func append(_ envelope: SharedCaptureEnvelope) throws {
        let finalURL = envelopeURL(for: envelope.id, in: inboxDirectory)
        guard !fileManager.fileExists(atPath: finalURL.path) else {
            throw SharedCaptureInboxError.duplicateEnvelope
        }
        let temporaryURL = temporaryDirectory.appending(
            path: "\(envelope.id.uuidString.lowercased()).json.tmp"
        )
        try Self.encoder.encode(envelope).write(
            to: temporaryURL,
            options: [.completeFileProtection]
        )
        try fileManager.moveItem(at: temporaryURL, to: finalURL)
    }

    private func prepareDirectories() throws {
        for directory in [rootURL, inboxDirectory, importedDirectory, payloadsDirectory, temporaryDirectory] {
            try fileManager.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
            )
        }
    }

    private var inboxDirectory: URL {
        rootURL.appending(path: "Inbox", directoryHint: .isDirectory)
    }

    private var importedDirectory: URL {
        rootURL.appending(path: "Imported", directoryHint: .isDirectory)
    }

    private var payloadsDirectory: URL {
        rootURL.appending(path: "Payloads", directoryHint: .isDirectory)
    }

    private var temporaryDirectory: URL {
        rootURL.appending(path: "Temporary", directoryHint: .isDirectory)
    }

    private func envelopeURL(for id: UUID, in directory: URL) -> URL {
        directory.appending(path: "\(id.uuidString.lowercased()).json")
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

enum SharedCaptureInboxError: LocalizedError {
    case appGroupUnavailable
    case duplicateEnvelope
    case emptyPayload
    case unsupportedURL

    var errorDescription: String? {
        switch self {
        case .appGroupUnavailable:
            return "The shared capture container is unavailable."
        case .duplicateEnvelope:
            return "This capture envelope already exists."
        case .emptyPayload:
            return "The shared item is empty."
        case .unsupportedURL:
            return "Only http and https links can be shared."
        }
    }
}
