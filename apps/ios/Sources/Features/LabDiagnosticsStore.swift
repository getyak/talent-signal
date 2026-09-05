import SwiftUI
import QuartzCore
import Darwin

@MainActor
final class LabDiagnosticsStore: ObservableObject {
    static let shared = LabDiagnosticsStore()
    @Published private(set) var reports: [LabDiagnosticReport] = []
    @Published private(set) var activeID: UUID?
    @Published private(set) var error: String?
    @Published private(set) var notice: String?
    @Published private(set) var exportData: Data?
    private let engine: LabDiagnosticsEngine
    private let files: any LabDiagnosticPersisting
    private let enabled: Bool
    private let now: () -> Date
    private let capturesDeviceSamples: Bool
    private var readable = true
    private var sampling: Task<Void, Never>?
    private var cadence: LabDiagnosticCadence?
    private var ticks = 0
    var canStart: Bool { enabled && activeID == nil && readable && error == nil }
    var isEnabled: Bool { enabled }

    init(engine: LabDiagnosticsEngine = .shared, files: any LabDiagnosticPersisting = LabDiagnosticFiles(),
         enabled: Bool = DeviceLabAvailability.enabled, capturesDeviceSamples: Bool = true, now: @escaping () -> Date = Date.init) {
        self.engine = engine; self.files = files; self.enabled = enabled
        self.capturesDeviceSamples = capturesDeviceSamples; self.now = now
        reload()
    }
    deinit { sampling?.cancel() }
    func reload() {
        guard enabled, activeID == nil else { return }
        do {
            guard let data = try files.read() else { reports = []; readable = true; error = nil; return }
            let archive = try JSONDecoder().decode(LabDiagnosticArchive.self, from: data)
            guard archive.version == 1, archive.reports.count <= 5,
                  Set(archive.reports.map(\.id)).count == archive.reports.count,
                  archive.reports.allSatisfy(Self.valid) else { throw CocoaError(.fileReadCorruptFile) }
            reports = archive.reports.map { report in
                var recovered = report
                if recovered.ended == nil {
                    recovered.ended = .interrupted
                    for i in recovered.requests.indices where recovered.requests[i].durationMilliseconds == nil { recovered.requests[i].failure = .unfinished }
                }
                return recovered
            }
            readable = true; prune()
            do { try persist(); error = nil }
            catch { self.error = "Diagnostic report could not be saved. Retry saving or clear diagnostic records." }
        } catch { readable = false; self.error = "Diagnostic records could not be read. Existing files were preserved." }
    }
    private static func valid(_ report: LabDiagnosticReport) -> Bool {
        func duration(_ value: Double) -> Bool { value.isFinite && value >= 0 && value <= 86_400_000 }
        let spans = report.clientSpans ?? []
        guard spans.count <= 120, (0...1_000_000).contains(report.droppedClientSpans ?? 0) else { return false }
        var seen = Set<UUID>()
        for span in spans {
            guard !seen.contains(span.id), span.parentID.map({ seen.contains($0) }) ?? true,
                  duration(span.offsetMilliseconds), span.durationMilliseconds.map(duration) ?? true,
                  (span.durationMilliseconds == nil) == (span.outcome == .unfinished) else { return false }
            seen.insert(span.id)
        }
        guard report.requests.allSatisfy({ $0.clientSpanID.map { seen.contains($0) } ?? true }) else { return false }
        return report.startedAt.timeIntervalSince1970.isFinite && duration(report.durationMilliseconds)
            && report.requests.count <= 160 && report.markers.count <= 60 && report.samples.count <= 301
            && Set(report.requests.map(\.id)).count == report.requests.count
            && Set(report.markers.map(\.id)).count == report.markers.count
            && Set(report.samples.map(\.id)).count == report.samples.count
            && duration(report.samplingOverheadMilliseconds) && report.droppedRequests >= 0 && report.droppedMarkers >= 0
            && report.requests.allSatisfy { duration($0.offsetMilliseconds) && ($0.durationMilliseconds.map(duration) ?? true)
                && ($0.status.map { (100...599).contains($0) } ?? true) && ($0.receivedBytes.map { $0 >= 0 } ?? true)
                && $0.phases.count <= 24 && $0.phases.allSatisfy { duration($0.milliseconds) }
                && ($0.serverTrace.map { $0.isValid } ?? true)
                && ($0.serverTrace == nil || $0.serverTrace?.requestID == $0.id) }
            && report.markers.allSatisfy { duration($0.offsetMilliseconds) }
            && report.samples.allSatisfy { duration($0.offsetMilliseconds) && $0.callbackCount >= 0 && $0.longCallbackGaps >= 0
                && ($0.cadenceHz.map { $0.isFinite && $0 >= 0 } ?? true)
                && ($0.longestCallbackGapMilliseconds.map(duration) ?? true) }
    }
    func start(_ task: LabDiagnosticTask) {
        guard canStart, let report = engine.start(task: task, now: now()) else { return }
        exportData = nil; notice = nil; reports.insert(report, at: 0); reports = Array(reports.prefix(5))
        activeID = report.id; ticks = 0
        do { try persist() } catch { storageFailed(); return }
        guard capturesDeviceSamples else { return }
        cadence = LabDiagnosticCadence(); cadence?.start()
        sampling = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(2)) } catch { return }
                guard let self, self.activeID != nil else { return }
                self.tick()
            }
        }
    }
    func mark(_ marker: LabDiagnosticMarker) { guard activeID != nil else { return }; engine.mark(marker); refresh() }
    func tick() {
        guard let report = engine.snapshot() else { return }
        if report.durationMilliseconds >= 600_000 { stop(.timeLimit); return }
        let began = LabDiagnosticsEngine.clock()
        if capturesDeviceSamples {
            let frame = cadence?.take()
            let thermal: LabDiagnosticSample.Thermal
            switch ProcessInfo.processInfo.thermalState {
            case .nominal: thermal = .nominal
            case .fair: thermal = .fair
            case .serious: thermal = .serious
            case .critical: thermal = .critical
            @unknown default: thermal = .unknown
            }
            engine.sample(.init(id: UUID(), offsetMilliseconds: report.durationMilliseconds,
                physicalFootprintBytes: Self.footprint(), thermal: thermal,
                lowPower: ProcessInfo.processInfo.isLowPowerModeEnabled, callbackCount: frame?.count ?? 0,
                cadenceHz: frame?.hz, longestCallbackGapMilliseconds: frame?.longest, longCallbackGaps: frame?.longGaps ?? 0))
        }
        refresh(); prune(); ticks += 1
        if ticks % 3 == 0 { do { try persist() } catch { storageFailed() } }
        engine.addOverhead((LabDiagnosticsEngine.clock() - began) * 1000)
    }
    func refresh() {
        guard let report = engine.snapshot(), let index = reports.firstIndex(where: { $0.id == report.id }) else { return }
        reports[index] = report
    }
    func stop(_ reason: LabDiagnosticEnd = .stopped) {
        guard activeID != nil else { return }
        if let report = engine.stop(reason), let index = reports.firstIndex(where: { $0.id == report.id }) { reports[index] = report }
        activeID = nil; sampling?.cancel(); sampling = nil; cadence?.stop(); cadence = nil
        do { try persist(); error = nil; notice = "Diagnostic report saved on this device" }
        catch { self.error = "Diagnostic report could not be saved. Retry saving or clear diagnostic records." }
    }
    private func storageFailed() {
        stop(.storageFailure)
        error = "Diagnostic report could not be saved. Retry saving or clear diagnostic records."
    }
    func retryStorage() {
        guard enabled, activeID == nil else { return }
        if !readable { reload(); return }
        do { prune(); try persist(); error = nil; notice = "Diagnostic report saved on this device" }
        catch { self.error = "Diagnostic report could not be saved. Retry saving or clear diagnostic records." }
    }
    func contextChanged() { exportData = nil; stop(.contextChanged) }
    func backgrounded() { exportData = nil; stop(.background) }
    func prepareExport(_ id: UUID) {
        exportData = nil
        guard enabled, readable else { return }
        prune()
        do {
            try persist()
            guard let report = reports.first(where: { $0.id == id }), report.ended != nil else { return }
            exportData = try Self.encoder().encode(LabDiagnosticArchive(version: 1, reports: [report]))
        }
        catch { self.error = "Diagnostic export could not be prepared. Retry saving first." }
    }
    func closeExport() { exportData = nil }
    func clear() {
        guard enabled, activeID == nil else { return }
        exportData = nil
        do { try files.clear(); reports = []; readable = true; error = nil; notice = "Diagnostic records cleared from this device" }
        catch { self.error = "Diagnostic records could not be cleared. Existing records remain available." }
    }
    func prune() {
        let date = now()
        reports.removeAll { $0.id != activeID && (date.timeIntervalSince($0.startedAt) >= 86_400 || $0.startedAt.timeIntervalSince(date) > 300) }
    }
    private func persist() throws { try files.write(Self.encoder().encode(LabDiagnosticArchive(version: 1, reports: reports))) }
    private static func encoder() -> JSONEncoder { let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]; return encoder }
    private static func footprint() -> UInt64? {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &info) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) }
        }
        return result == KERN_SUCCESS ? info.phys_footprint : nil
    }
}

@MainActor
private final class LabDiagnosticCadence: NSObject {
    struct Window { let count: Int; let hz: Double?; let longest: Double?; let longGaps: Int }
    private var link: CADisplayLink?
    private var previous: Double?
    private var first: Double?
    private var count = 0, gaps = 0
    private var longest = 0.0
    func start() { let link = CADisplayLink(target: self, selector: #selector(frame(_:))); self.link = link; link.add(to: .main, forMode: .common) }
    func stop() { link?.invalidate(); link = nil }
    @objc private func frame(_ link: CADisplayLink) {
        // Callback cadence is not rendered FPS. Do not request a higher display refresh rate.
        let time = LabDiagnosticsEngine.clock()
        if first == nil { first = time }
        if let previous {
            let gap = max(0, time - previous); longest = max(longest, gap)
            let expected = link.targetTimestamp - link.timestamp
            if expected > 0, gap > expected * 1.5 { gaps += 1 }
        }
        previous = time; count += 1
    }
    func take() -> Window {
        let elapsed = (previous ?? 0) - (first ?? 0)
        let value = Window(count: count, hz: count > 1 && elapsed > 0 ? Double(count - 1) / elapsed : nil,
            longest: count > 1 ? longest * 1000 : nil, longGaps: gaps)
        count = 0; gaps = 0; longest = 0; first = nil; previous = nil
        return value
    }
}
