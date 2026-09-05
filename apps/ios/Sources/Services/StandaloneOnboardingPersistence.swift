import Foundation

protocol StandaloneOnboardingPersisting: AnyObject {
    func load() throws -> StandaloneOnboardingState?
    func save(_ state: StandaloneOnboardingState) throws
    func reset() throws
}

final class FileStandaloneOnboardingStore: StandaloneOnboardingPersisting {
    private let fileURL: URL

    init(fileURL: URL? = nil) {
        var directory = "StandaloneOnboarding"
#if DEBUG
        if let value = ProcessInfo.processInfo.environment["TS_IOS_UI_TEST_ONBOARDING_NAMESPACE"],
           let namespace = UUID(uuidString: value) { directory += "/UITest-" + namespace.uuidString }
#endif
        self.fileURL = fileURL ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        .appending(path: directory, directoryHint: .isDirectory)
        .appending(path: "session-v1.json")
    }

    func load() throws -> StandaloneOnboardingState? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        return try Self.decoder.decode(
            StandaloneOnboardingState.self,
            from: Data(contentsOf: fileURL)
        )
    }

    func save(_ state: StandaloneOnboardingState) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
        let data = try Self.encoder.encode(state)
        try data.write(
            to: fileURL,
            options: [.atomic, .completeFileProtection]
        )
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: fileURL.path
        )
    }

    func reset() throws {
        if FileManager.default.fileExists(atPath: fileURL.path) {
            try FileManager.default.removeItem(at: fileURL)
        }
        // Recording ownership cannot be inferred from this session file.
        // Resetting onboarding must never delete the shared media directory.
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
