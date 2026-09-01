import CryptoKit
import Foundation
import Security

/// The minimum durable correlation needed to reconcile an outcome-unknown
/// canonical decision after this process exits. Candidate message text and
/// bearer credentials are deliberately excluded.
struct DurableUnknownResolution: Codable, Equatable, Sendable {
    static let currentSchemaVersion = 1

    let schemaVersion: Int
    let operationID: String
    let bundleID: String
    let taskID: String
    let taskRevision: Int
    let bundleRevision: Int
    let proposalID: String
    let baseRevision: Int
    let reason: String
    let decisions: [Decision]
    let workspaceID: String
    let accountID: String
    let pursuitID: String
    let personID: String
    let relationshipContextID: String
    let captureID: String
    let resourceID: String
    let evidenceIDs: [String]
    let savedAt: Date
    let transportError: String

    struct Decision: Codable, Equatable, Sendable {
        let itemID: String
        let choice: String
    }
}

protocol UnknownResolutionPersisting: Sendable {
    func load(scopeKey: String) throws -> DurableUnknownResolution?
    func save(_ resolution: DurableUnknownResolution, scopeKey: String) throws
    func clear(scopeKey: String) throws
}

struct NullUnknownResolutionStore: UnknownResolutionPersisting {
    func load(scopeKey: String) throws -> DurableUnknownResolution? { nil }
    func save(_ resolution: DurableUnknownResolution, scopeKey: String) throws { }
    func clear(scopeKey: String) throws { }
}

final class SecureUnknownResolutionStore: UnknownResolutionPersisting, @unchecked Sendable {
    static let shared = SecureUnknownResolutionStore()

    private let directory: URL
    private let keyProvider: any UnknownResolutionKeyProviding
    private let fileManager: FileManager

    init(
        directory: URL? = nil,
        keyProvider: any UnknownResolutionKeyProviding = KeychainUnknownResolutionKeyProvider(),
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager
        self.keyProvider = keyProvider
        self.directory = directory ?? fileManager
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "TalentSignal/UnknownOperations", directoryHint: .isDirectory)
    }

    func load(scopeKey: String) throws -> DurableUnknownResolution? {
        let file = fileURL(scopeKey: scopeKey)
        guard fileManager.fileExists(atPath: file.path) else { return nil }
        let encrypted = try Data(contentsOf: file)
        let box = try AES.GCM.SealedBox(combined: encrypted)
        let clear = try AES.GCM.open(
            box,
            using: SymmetricKey(data: try keyProvider.key(scopeKey: scopeKey))
        )
        let resolution = try JSONDecoder().decode(DurableUnknownResolution.self, from: clear)
        guard resolution.schemaVersion == DurableUnknownResolution.currentSchemaVersion else {
            throw UnknownResolutionStoreError.unsupportedSchema(resolution.schemaVersion)
        }
        return resolution
    }

    func save(_ resolution: DurableUnknownResolution, scopeKey: String) throws {
        guard resolution.schemaVersion == DurableUnknownResolution.currentSchemaVersion else {
            throw UnknownResolutionStoreError.unsupportedSchema(resolution.schemaVersion)
        }
        try prepareDirectory()
        let clear = try JSONEncoder().encode(resolution)
        let sealed = try AES.GCM.seal(
            clear,
            using: SymmetricKey(data: try keyProvider.key(scopeKey: scopeKey))
        )
        guard let combined = sealed.combined else {
            throw UnknownResolutionStoreError.encryptionFailed
        }
        let file = fileURL(scopeKey: scopeKey)
        try combined.write(to: file, options: .atomic)
        try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableFile = file
        try mutableFile.setResourceValues(values)
    }

    func clear(scopeKey: String) throws {
        let file = fileURL(scopeKey: scopeKey)
        if fileManager.fileExists(atPath: file.path) {
            try fileManager.removeItem(at: file)
        }
    }

    private func prepareDirectory() throws {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try fileManager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDirectory = directory
        try mutableDirectory.setResourceValues(values)
    }

    private func fileURL(scopeKey: String) -> URL {
        let digest = SHA256.hash(data: Data(scopeKey.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return directory.appending(path: "\(digest).operation")
    }
}

protocol UnknownResolutionKeyProviding: Sendable {
    func key(scopeKey: String) throws -> Data
}

struct KeychainUnknownResolutionKeyProvider: UnknownResolutionKeyProviding {
    private let service = "com.talentsignal.macos.unknown-operation"

    func key(scopeKey: String) throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: scopeKey,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecSuccess, let data = result as? Data { return data }
        guard status == errSecItemNotFound else {
            throw UnknownResolutionStoreError.keychain(status)
        }

        var bytes = Data(count: 32)
        let randomStatus = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, 32, buffer.baseAddress!)
        }
        guard randomStatus == errSecSuccess else {
            throw UnknownResolutionStoreError.keychain(randomStatus)
        }
        let add: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: scopeKey,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: bytes
        ]
        let addStatus = SecItemAdd(add as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw UnknownResolutionStoreError.keychain(addStatus)
        }
        return bytes
    }
}

enum UnknownResolutionStoreError: LocalizedError {
    case encryptionFailed
    case unsupportedSchema(Int)
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case .encryptionFailed:
            "The outcome-unknown operation could not be encrypted."
        case .unsupportedSchema(let version):
            "The outcome-unknown operation uses unsupported schema version \(version)."
        case .keychain(let status):
            "The outcome-unknown operation keychain request failed (\(status))."
        }
    }
}
