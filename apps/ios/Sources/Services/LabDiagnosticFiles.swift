import Foundation

protocol LabDiagnosticPersisting {
    func read() throws -> Data?
    func write(_ data: Data) throws
    func clear() throws
}
struct LabDiagnosticFiles: LabDiagnosticPersisting {
    let url: URL
    init(url: URL? = nil) {
        self.url = url ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LabDiagnostics/reports-v1.json")
    }
    func read() throws -> Data? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max
        guard size <= 6_000_000 else { throw CocoaError(.fileReadTooLarge) }
        return try Data(contentsOf: url)
    }
    func write(_ data: Data) throws {
        guard data.count <= 6_000_000 else { throw CocoaError(.fileWriteOutOfSpace) }
        var directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        guard try read() == data else { throw CocoaError(.fileWriteUnknown) }
    }
    func clear() throws {
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
        guard try read() == nil else { throw CocoaError(.fileWriteUnknown) }
    }
}
