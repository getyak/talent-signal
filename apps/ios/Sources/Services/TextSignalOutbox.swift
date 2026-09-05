import CryptoKit
import Foundation

protocol TextSignalOutboxPersisting: AnyObject {
    func save(_ record: TextSignalOutboxRecord) async throws
    func record(id: UUID, workspaceID: String) async throws -> TextSignalOutboxRecord?
    func oldest(workspaceID: String) async throws -> TextSignalOutboxRecord?
    func records(workspaceID: String) async throws -> [TextSignalOutboxRecord]
    func remove(id: UUID, workspaceID: String) async throws
}

actor TextSignalOutbox: TextSignalOutboxPersisting {
    static let shared = TextSignalOutbox()

    static func scoped(_ scope: String?, backendURL: URL, workspaceID: String?) -> TextSignalOutbox {
        let key = scope ?? RuntimeEndpoint.scope(backendURL, accountID: workspaceID)
        let directory = RuntimeScopedDirectories.directory("TextSignalOutbox", scope: key)
        var failure: Error?
        if let workspaceID, RuntimeLegacyBindings.authorizes(accountID: workspaceID, scope: key) {
            let original = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appending(path: "TextSignalOutbox/workspaces", directoryHint: .isDirectory)
                .appending(path: SHA256.hex(workspaceID), directoryHint: .isDirectory)
            let destination = directory.appending(path: "workspaces", directoryHint: .isDirectory)
                .appending(path: SHA256.hex(workspaceID), directoryHint: .isDirectory)
            do { try RuntimeLegacyBindings.migrateDirectory(source: original, destination: destination) }
            catch { failure = error }
        }
        return TextSignalOutbox(directoryURL: directory, startupError: failure)
    }

    private let rootDirectoryURL: URL
    private let startupError: Error?

    init(directoryURL: URL? = nil, startupError: Error? = nil) {
        let root = directoryURL
            ?? FileManager.default.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            )[0].appending(path: "TextSignalOutbox", directoryHint: .isDirectory)
        rootDirectoryURL = root
        self.startupError = startupError
    }

    func save(_ record: TextSignalOutboxRecord) throws {
        _ = try prepareDirectory(workspaceID: record.workspaceID)
        let data = try JSONEncoder.textSignalEncoder.encode(record)
        try data.write(
            to: recordURL(id: record.id, workspaceID: record.workspaceID),
            options: [.atomic, .completeFileProtection]
        )
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: recordURL(id: record.id, workspaceID: record.workspaceID).path
        )
    }

    func record(id: UUID, workspaceID: String) throws -> TextSignalOutboxRecord? {
        _ = try prepareDirectory(workspaceID: workspaceID)
        let url = recordURL(id: id, workspaceID: workspaceID)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let restored = try decode(url)
        guard restored.workspaceID == workspaceID else {
            throw TextSignalOutboxError.workspaceMismatch
        }
        return restored
    }

    func oldest(workspaceID: String) throws -> TextSignalOutboxRecord? {
        try records(workspaceID: workspaceID).first
    }

    func records(workspaceID: String) throws -> [TextSignalOutboxRecord] {
        let recordsDirectoryURL = try prepareDirectory(workspaceID: workspaceID)
        return try FileManager.default.contentsOfDirectory(
            at: recordsDirectoryURL,
            includingPropertiesForKeys: nil
        )
        .filter { $0.pathExtension == "json" }
        .map(decode)
        .filter { $0.workspaceID == workspaceID }
        .sorted {
            if $0.createdAt == $1.createdAt {
                return $0.id.uuidString < $1.id.uuidString
            }
            return $0.createdAt < $1.createdAt
        }
    }

    func remove(id: UUID, workspaceID: String) throws {
        _ = try prepareDirectory(workspaceID: workspaceID)
        let url = recordURL(id: id, workspaceID: workspaceID)
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        try FileManager.default.removeItem(at: url)
    }

    func contentFingerprint(for record: TextSignalOutboxRecord) -> String {
        let value = [
            record.text,
            record.purpose,
            record.speaker?.rawValue ?? "",
            record.scope?.id ?? "",
            record.workspaceID,
            record.proposedMilestone,
            record.proposalReason,
        ].joined(separator: "\u{001F}")
        return SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    func fileProtection(id: UUID, workspaceID: String) throws -> FileProtectionType? {
        _ = try prepareDirectory(workspaceID: workspaceID)
        let attributes = try FileManager.default.attributesOfItem(
            atPath: recordURL(id: id, workspaceID: workspaceID).path
        )
        return attributes[.protectionKey] as? FileProtectionType
    }

    private func prepareDirectory(workspaceID: String) throws -> URL {
        if let startupError { throw startupError }
        let recordsDirectoryURL = rootDirectoryURL
            .appending(path: "workspaces", directoryHint: .isDirectory)
            .appending(path: safeWorkspaceComponent(workspaceID), directoryHint: .isDirectory)
            .appending(path: "records", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(
            at: recordsDirectoryURL,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
        return recordsDirectoryURL
    }

    private func recordURL(id: UUID, workspaceID: String) -> URL {
        rootDirectoryURL
            .appending(path: "workspaces", directoryHint: .isDirectory)
            .appending(path: safeWorkspaceComponent(workspaceID), directoryHint: .isDirectory)
            .appending(path: "records", directoryHint: .isDirectory)
            .appending(path: "\(id.uuidString.lowercased()).json")
    }

    private func safeWorkspaceComponent(_ workspaceID: String) -> String {
        SHA256.hash(data: Data(workspaceID.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private func decode(_ url: URL) throws -> TextSignalOutboxRecord {
        try JSONDecoder.textSignalDecoder.decode(
            TextSignalOutboxRecord.self,
            from: Data(contentsOf: url)
        )
    }
}

enum TextSignalOutboxError: Error {
    case workspaceMismatch
}

private extension JSONEncoder {
    static let textSignalEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()
}

private extension JSONDecoder {
    static let textSignalDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}
