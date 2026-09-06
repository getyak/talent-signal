import Foundation
import SwiftUI

@MainActor
final class LabMetricKitStore: ObservableObject {
    static let shared = LabMetricKitStore()
#if targetEnvironment(simulator)
    static let supportsSystemDelivery = false
#else
    static let supportsSystemDelivery = true
#endif
    typealias Factory = (@escaping ([LabMetricKitSummary]) -> Void) -> any LabMetricKitReceiving
    @Published private(set) var records: [LabMetricKitRecord] = []
    @Published private(set) var receiveUntil: Date?
    @Published private(set) var error: String?
    @Published private(set) var notice: String?
    @Published private(set) var exportData: Data?
    let enabled: Bool
    let supportsDelivery: Bool
    private let files: any LabDiagnosticPersisting
    private let now: () -> Date
    private let clock: () -> Double
    private let factory: Factory
    private var source: (any LabMetricKitReceiving)?
    private var generation = UUID()
    private var deadline: Double?
    private var expiryTask: Task<Void, Never>?
    private var readable = true
    private var ignoreThrough: Date?
    var canReceive: Bool { enabled && supportsDelivery && readable && error == nil && receiveUntil == nil }
    init(enabled: Bool = DeviceLabAvailability.enabled, supportsDelivery: Bool? = nil,
         files: (any LabDiagnosticPersisting)? = nil, now: @escaping () -> Date = Date.init,
         clock: @escaping () -> Double = LabDiagnosticsEngine.clock,
         factory: @escaping Factory = { LabMetricKitSource(receive: $0) }) {
        self.enabled = enabled
        self.supportsDelivery = supportsDelivery ?? Self.supportsSystemDelivery
        self.now = now; self.clock = clock; self.factory = factory
        self.files = files ?? LabDiagnosticFiles(url: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LabMetricKit/summaries-v1.json"))
        reload()
    }
    deinit {
        expiryTask?.cancel()
        let receiver = source
        Task { @MainActor in receiver?.stop() }
    }
    func reload() {
        guard enabled, receiveUntil == nil else { return }
        do {
            guard let data = try files.read() else { records = []; ignoreThrough = nil; readable = true; error = nil; return }
            guard data.count <= 1_000_000 else { throw CocoaError(.fileReadTooLarge) }
            let archive = try JSONDecoder().decode(LabMetricKitArchive.self, from: data)
            guard archive.version == 1, archive.records.count <= 20,
                  archive.ignoreThrough.map({ $0.timeIntervalSince1970.isFinite }) ?? true,
                  Set(archive.records.map(\.id)).count == archive.records.count,
                  archive.records.allSatisfy({ $0.summary.isValid && $0.summary.origin == .metricKit && $0.receivedAt.timeIntervalSince1970.isFinite }) else {
                throw CocoaError(.fileReadCorruptFile)
            }
            records = archive.records; ignoreThrough = archive.ignoreThrough; readable = true; prune(); try persist(); error = nil
        } catch { readable = false; self.error = "MetricKit summaries could not be read. Existing files were preserved." }
    }
    func start() {
        guard canReceive else { return }
        exportData = nil; notice = nil; generation = UUID(); let token = generation
        receiveUntil = now().addingTimeInterval(86_400); deadline = clock() + 86_400
        source = factory { [weak self] values in
            Task { @MainActor in self?.accept(values, token: token) }
        }
        source?.start()
        expiryTask = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(86_400)) } catch { return }
            guard let self, self.generation == token else { return }
            self.pause()
        }
    }
    func pause() {
        guard enabled else { return }
        generation = UUID(); source?.stop(); source = nil
        expiryTask?.cancel(); expiryTask = nil; deadline = nil; receiveUntil = nil
        notice = "MetricKit reception paused. Saved summaries remain on this device."
    }
    func refresh() {
        guard enabled else { return }
        if let deadline, clock() >= deadline { pause() }
        if receiveUntil == nil { reload() }
        else if readable { prune(); do { try persist() } catch { storageFailed() } }
    }
    private func accept(_ values: [LabMetricKitSummary], token: UUID) {
        guard enabled, supportsDelivery, token == generation, readable,
              let deadline, clock() < deadline else {
            if token == generation, receiveUntil != nil { pause() }
            return
        }
        let date = now(); prune()
        var ids = Set(records.map(\.id))
        for summary in values.prefix(20) where summary.isValid && summary.origin == .metricKit {
            guard ignoreThrough.map({ summary.end > $0 }) ?? true,
                  summary.end <= date.addingTimeInterval(300), date.timeIntervalSince(summary.end) < 7 * 86_400,
                  ids.insert(summary.id).inserted else { continue }
            records.append(.init(summary: summary, receivedAt: date))
        }
        records.sort { $0.summary.end > $1.summary.end }; records = Array(records.prefix(20))
        do { try persist(); error = nil }
        catch { storageFailed() }
    }
    private func storageFailed() { pause(); self.error = "MetricKit summaries could not be saved. Retry storage or clear them." }
    func retryStorage() {
        guard enabled, receiveUntil == nil else { return }
        if !readable { reload(); return }
        do { prune(); try persist(); error = nil }
        catch { self.error = "MetricKit summaries could not be saved. Retry storage or clear them." }
    }
    func prepareExport(_ id: String) {
        exportData = nil
        guard enabled, readable else { return }
        prune()
        do {
            try persist()
            guard let record = records.first(where: { $0.id == id }) else { return }
            exportData = try Self.encoder().encode(LabMetricKitArchive(version: 1, records: [record]))
        } catch { self.error = "MetricKit export could not be prepared. Retry storage first." }
    }
    func closeExport() { exportData = nil }
    func clear() {
        guard enabled else { return }
        pause(); exportData = nil
        do {
            let cutoff = max(now(), records.map { $0.summary.end }.max() ?? now())
            // Keep only a deletion watermark so retained system payloads cannot
            // silently recreate the summaries after an explicit new subscription.
            let empty = try Self.encoder().encode(LabMetricKitArchive(version: 1, ignoreThrough: cutoff, records: []))
            try files.write(empty)
            records = []; ignoreThrough = cutoff; readable = true; error = nil
            notice = "Local MetricKit summaries cleared. System reports and exported copies are separate."
        }
        catch { self.error = "MetricKit summaries could not be cleared. Existing files were preserved." }
    }
    private func prune() {
        let date = now()
        if let cutoff = ignoreThrough, date.timeIntervalSince(cutoff) >= 7 * 86_400 { ignoreThrough = nil }
        records.removeAll { record in (ignoreThrough.map { record.summary.end <= $0 } ?? false)
            || date.timeIntervalSince(record.summary.end) >= 7 * 86_400 || record.summary.end > date.addingTimeInterval(300)
            || record.receivedAt > date.addingTimeInterval(300) }
    }
    private func persist() throws {
        let data = try Self.encoder().encode(LabMetricKitArchive(version: 1, ignoreThrough: ignoreThrough, records: records))
        guard data.count <= 1_000_000 else { throw CocoaError(.fileWriteOutOfSpace) }
        try files.write(data)
    }
    private static func encoder() -> JSONEncoder { let value = JSONEncoder(); value.outputFormatting = [.prettyPrinted, .sortedKeys]; return value }
}
