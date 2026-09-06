import CryptoKit
import Foundation

enum RuntimeLegacyBindings {
    static func authorizes(accountID: String, scope: String, defaults: UserDefaults = .standard) -> Bool {
        defaults.string(forKey: "talent-signal.runtime.legacy-binding." + SHA256.hex(accountID)) == scope
    }
    static func bindAlias(_ identifier: String, scope: String, defaults: UserDefaults = .standard) {
        let key = "talent-signal.runtime.legacy-binding." + SHA256.hex(identifier)
        guard defaults.string(forKey: key) == nil else { return }
        defaults.set(scope, forKey: key)
    }
    static func bind(_ session: TalentSignalSession, defaults: UserDefaults = .standard) {
        let key = "talent-signal.runtime.legacy-binding." + SHA256.hex(session.account.id)
        guard defaults.string(forKey: key) == nil else { return }
        defaults.set(RuntimeEndpoint.scope(session.baseURL, accountID: session.account.id, userID: session.user.id), forKey: key)
    }

    static func migrateDirectory(source: URL, destination: URL) throws {
        let manager = FileManager.default
        guard manager.fileExists(atPath: source.path) else { return }
        if !manager.fileExists(atPath: destination.path) {
            try manager.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            try manager.moveItem(at: source, to: destination)
            return
        }
        for file in try manager.contentsOfDirectory(at: source, includingPropertiesForKeys: [.isDirectoryKey]) {
            let target = destination.appending(path: file.lastPathComponent)
            if try file.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true {
                try migrateDirectory(source: file, destination: target)
            } else if manager.fileExists(atPath: target.path) {
                guard try Data(contentsOf: file) == Data(contentsOf: target) else {
                    throw RuntimePersistenceError.conflictingLegacyRecords
                }
                try manager.removeItem(at: file)
            } else { try manager.moveItem(at: file, to: target) }
        }
        try manager.removeItem(at: source)
    }

    static func migrateFile(legacyAccountID: String?, scope: String, directory: URL,
                            destination: URL, defaults: UserDefaults = .standard) throws {
        guard let legacyAccountID,
              defaults.string(forKey: "talent-signal.runtime.legacy-binding." + SHA256.hex(legacyAccountID)) == scope else { return }
        let source = directory.appending(path: SHA256.hex(legacyAccountID) + ".json")
        guard source != destination else { return }
        let manager = FileManager.default
        let sourceTombstone = source.appendingPathExtension("deletion-pending")
        let targetTombstone = destination.appendingPathExtension("deletion-pending")
        // Preserve deletion intent first. Moving within the same directory is atomic and avoids a
        // second retained copy that could resurrect after the scoped record is later deleted.
        if manager.fileExists(atPath: sourceTombstone.path), !manager.fileExists(atPath: targetTombstone.path) {
            try manager.moveItem(at: sourceTombstone, to: targetTombstone)
        }
        if manager.fileExists(atPath: source.path) {
            if manager.fileExists(atPath: destination.path) {
                guard try Data(contentsOf: source) == Data(contentsOf: destination) else {
                    throw RuntimePersistenceError.conflictingLegacyRecords
                }
                try manager.removeItem(at: source)
            } else { try manager.moveItem(at: source, to: destination) }
        }
    }
}

enum RuntimeScopedDirectories {
    static func directory(_ name: String, scope: String) -> URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "TalentSignal/Environments", directoryHint: .isDirectory)
            .appending(path: SHA256.hex(scope), directoryHint: .isDirectory)
            .appending(path: name, directoryHint: .isDirectory)
    }
}


enum RuntimePersistenceError: LocalizedError {
    case conflictingLegacyRecords
    var errorDescription: String? {
        "Separate legacy and scoped recovery records exist. Both are preserved; resolve their ownership before continuing."
    }
}
