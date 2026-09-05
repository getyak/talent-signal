import XCTest
@testable import TalentSignal

@MainActor
final class LabMetricKitTests: XCTestCase {
    private let date = Date(timeIntervalSince1970: 1_800_000_000)
    private func summary(end: Date, origin: LabMetricKitSummary.Origin = .metricKit) -> LabMetricKitSummary {
        .init(origin: origin, kind: .metrics, begin: end - 86_400, end: end, latestVersion: "0.1.0",
            multipleVersions: true, values: [.init(kind: .cpuSeconds, number: 42)], histograms: [])
    }
    private func settled() async { try? await Task.sleep(for: .milliseconds(15)) }

    func testReceiptDedupeMissingValuesExportAndRelaunchWithoutResubscription() async throws {
        let files = MetricMemoryFiles(); var sources: [MetricFakeSource] = []
        let store = LabMetricKitStore(enabled: true, supportsDelivery: true, files: files, now: { self.date }, factory: { callback in
            let value = MetricFakeSource(callback); sources.append(value); return value
        })
        XCTAssertTrue(store.records.isEmpty); XCTAssertTrue(sources.isEmpty)
        store.start(); XCTAssertEqual(sources.count, 1)
        let value = summary(end: date)
        sources[0].emit([value, value]); await settled()
        XCTAssertEqual(store.records.count, 1)
        XCTAssertEqual(store.records[0].summary.values.count, 1, "Missing GPU/memory values must not become zero")
        XCTAssertEqual(store.records[0].receivedAt, date)
        store.prepareExport(value.id)
        let data = try XCTUnwrap(store.exportData)
        let exported = try JSONDecoder().decode(LabMetricKitArchive.self, from: data)
        XCTAssertEqual(exported.records.first?.id, value.id)
        XCTAssertFalse(String(decoding: data, as: UTF8.self).contains("callStack"))
        store.pause(); XCTAssertEqual(sources[0].stops, 1)
        let restored = LabMetricKitStore(enabled: true, supportsDelivery: true, files: files, now: { self.date }, factory: { _ in XCTFail("No automatic resubscription"); return MetricFakeSource { _ in } })
        XCTAssertNil(restored.receiveUntil); XCTAssertEqual(restored.records.first?.id, value.id)
    }

    func testClearAndPauseRejectQueuedCallbacksAndOldSubscriptionGeneration() async {
        let files = MetricMemoryFiles(); var sources: [MetricFakeSource] = []
        let store = LabMetricKitStore(enabled: true, supportsDelivery: true, files: files, now: { self.date }, factory: { callback in
            let value = MetricFakeSource(callback); sources.append(value); return value
        })
        store.start(); sources[0].emit([summary(end: date)]); store.clear(); await settled()
        XCTAssertTrue(store.records.isEmpty); XCTAssertNotNil(files.data)
        store.start()
        sources[0].emit([summary(end: date - 1)])
        sources[1].emit([summary(end: date), summary(end: date + 1)]); await settled()
        XCTAssertEqual(store.records.count, 1); XCTAssertEqual(store.records.first?.summary.end, date + 1)
        store.pause(); sources[1].emit([summary(end: date - 2)]); await settled()
        XCTAssertEqual(store.records.count, 1)
        store.clear()
        var freshSource: MetricFakeSource?
        let restored = LabMetricKitStore(enabled: true, supportsDelivery: true, files: files, now: { self.date }, factory: { callback in
            let value = MetricFakeSource(callback); freshSource = value; return value
        })
        restored.start()
        freshSource?.emit([summary(end: date), summary(end: date + 1), summary(end: date + 2)])
        await settled()
        XCTAssertEqual(restored.records.count, 1)
        XCTAssertEqual(restored.records.first?.summary.end, date + 2, "The saved deletion watermark rejects prior system payloads after relaunch")
        restored.pause()
    }

    func testMonotonicExpiryRetentionLimitsAndSyntheticRejection() async {
        var wall = date; var clock = 0.0; var source: MetricFakeSource?
        let store = LabMetricKitStore(enabled: true, supportsDelivery: true, files: MetricMemoryFiles(), now: { wall }, clock: { clock }, factory: { callback in
            let value = MetricFakeSource(callback); source = value; return value
        })
        store.start()
        source?.emit([summary(end: date, origin: .syntheticExample), summary(end: date + 1000), summary(end: date - 8 * 86_400)])
        await settled(); XCTAssertTrue(store.records.isEmpty)
        source?.emit((0..<20).map { summary(end: date - Double($0)) }); await settled()
        source?.emit((20..<30).map { summary(end: date - Double($0)) }); await settled()
        XCTAssertEqual(store.records.count, 20)
        wall -= 60; clock = 86_400
        source?.emit([summary(end: date + 1)]); await settled()
        XCTAssertNil(store.receiveUntil); XCTAssertEqual(source?.stops, 1)
        wall = date + 7 * 86_400; store.refresh(); XCTAssertTrue(store.records.isEmpty)
    }

    func testStorageFailurePausesAndPreservesCorruptOrUndeletableFiles() async throws {
        let files = MetricMemoryFiles(); var source: MetricFakeSource?
        let store = LabMetricKitStore(enabled: true, supportsDelivery: true, files: files, now: { self.date }, factory: { callback in
            let value = MetricFakeSource(callback); source = value; return value
        })
        store.start(); files.failWrites = true; source?.emit([summary(end: date)]); await settled()
        XCTAssertNotNil(store.error); XCTAssertNil(store.receiveUntil)
        XCTAssertEqual(store.records.count, 1)
        files.failWrites = false; store.retryStorage(); XCTAssertNil(store.error)
        let corrupt = Data("PRIVATE_UNREADABLE_INPUT".utf8); files.data = corrupt
        store.reload(); store.start(); store.prepareExport(summary(end: date).id)
        XCTAssertNil(store.exportData); XCTAssertFalse(store.canReceive); XCTAssertEqual(files.data, corrupt)
        files.failWrites = true; store.clear(); XCTAssertEqual(files.data, corrupt)
        files.failWrites = false; store.clear(); XCTAssertNotNil(files.data); XCTAssertTrue(store.canReceive)
    }

    func testDisabledCapabilityAndSimulatorDoNotCreateSystemSubscriber() {
        let files = MetricMemoryFiles(); files.data = Data("keep".utf8)
        let disabled = LabMetricKitStore(enabled: false, supportsDelivery: true, files: files, factory: { _ in XCTFail(); return MetricFakeSource { _ in } })
        disabled.start(); disabled.clear(); disabled.refresh(); disabled.retryStorage()
        XCTAssertEqual(files.reads, 0); XCTAssertEqual(files.data, Data("keep".utf8))
        let simulator = LabMetricKitStore(enabled: true, supportsDelivery: false, files: MetricMemoryFiles(), factory: { _ in XCTFail(); return MetricFakeSource { _ in } })
        simulator.start(); XCTAssertNil(simulator.receiveUntil)
    }

    func testTypedProjectionValidationAndProtectedFullArchive() throws {
        XCTAssertNil(LabMetricKitSummary.version("private name\ntrace"))
        let example = LabMetricKitView.example
        XCTAssertTrue(example.isValid)
        let bad = LabMetricKitSummary(origin: .metricKit, kind: .metrics, begin: date, end: date - 1,
            latestVersion: nil, multipleVersions: nil, values: [], histograms: [])
        XCTAssertFalse(bad.isValid)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let files = LabDiagnosticFiles(url: directory.appendingPathComponent("metric-summary.json"))
        let records = (0..<20).map { index in
            let value = LabMetricKitSummary(origin: .metricKit, kind: .metrics, begin: date - 86_400, end: date - Double(index),
                latestVersion: "0.1.0", multipleVersions: false, values: [.init(kind: .cpuSeconds, number: 42)],
                histograms: [.firstDraw, .hangDuration].map { kind in
                    .init(kind: kind, buckets: (0..<64).map { bucket in
                        .init(lowerSeconds: Double(bucket), upperSeconds: Double(bucket + 1), count: 100)
                    }, truncated: true)
                })
            return LabMetricKitRecord(summary: value, receivedAt: date)
        }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(LabMetricKitArchive(version: 1, records: records))
        XCTAssertLessThanOrEqual(data.count, 1_000_000)
        try files.write(data)
        let store = LabMetricKitStore(enabled: true, supportsDelivery: false, files: files, now: { self.date })
        XCTAssertNil(store.error); XCTAssertEqual(store.records.count, 20)
        XCTAssertEqual(store.records.first?.summary.histograms.first?.buckets.count, 64)
        XCTAssertEqual(try directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        store.clear()
        let cleared = try JSONDecoder().decode(LabMetricKitArchive.self, from: XCTUnwrap(files.read()))
        XCTAssertTrue(cleared.records.isEmpty); XCTAssertEqual(cleared.ignoreThrough, date)
    }
}

private final class MetricFakeSource: LabMetricKitReceiving {
    let receive: ([LabMetricKitSummary]) -> Void
    var starts = 0, stops = 0
    init(_ receive: @escaping ([LabMetricKitSummary]) -> Void) { self.receive = receive }
    func start() { starts += 1 }
    func stop() { stops += 1 }
    func emit(_ values: [LabMetricKitSummary]) { receive(values) }
}
private final class MetricMemoryFiles: LabDiagnosticPersisting {
    var data: Data?
    var reads = 0
    var failWrites = false, failClear = false
    func read() throws -> Data? { reads += 1; return data }
    func write(_ value: Data) throws { if failWrites { throw CocoaError(.fileWriteOutOfSpace) }; data = value }
    func clear() throws { if failClear { throw CocoaError(.fileWriteNoPermission) }; data = nil }
}
