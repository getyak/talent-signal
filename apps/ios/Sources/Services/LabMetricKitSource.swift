import Foundation
import MetricKit

protocol LabMetricKitReceiving: AnyObject { @MainActor func start(); @MainActor func stop() }

// The callback only carries a typed projection; raw payloads never cross into
// the store, persistence, export or logs. Each subscription has a new receiver.
final class LabMetricKitSource: NSObject, LabMetricKitReceiving {
    private let receive: ([LabMetricKitSummary]) -> Void
    init(receive: @escaping ([LabMetricKitSummary]) -> Void) { self.receive = receive }
    @MainActor func start() {
        let manager = MXMetricManager.shared
        manager.add(self)
        didReceive(manager.pastPayloads)
        didReceive(manager.pastDiagnosticPayloads)
    }
    @MainActor func stop() { MXMetricManager.shared.remove(self) }
    static func metrics(_ payload: MXMetricPayload) -> LabMetricKitSummary {
        var values: [LabMetricKitSummary.Value] = []
        func add(_ kind: LabMetricKitSummary.Value.Kind, _ number: Double?) {
            if let number, number.isFinite, (0...1e16).contains(number) { values.append(.init(kind: kind, number: number)) }
        }
        add(.cpuSeconds, payload.cpuMetrics?.cumulativeCPUTime.converted(to: .seconds).value)
        add(.gpuSeconds, payload.gpuMetrics?.cumulativeGPUTime.converted(to: .seconds).value)
        add(.foregroundSeconds, payload.applicationTimeMetrics?.cumulativeForegroundTime.converted(to: .seconds).value)
        add(.backgroundSeconds, payload.applicationTimeMetrics?.cumulativeBackgroundTime.converted(to: .seconds).value)
        add(.peakMemoryBytes, payload.memoryMetrics?.peakMemoryUsage.converted(to: .bytes).value)
        var histograms: [LabMetricKitSummary.Histogram] = []
        if let value = payload.applicationLaunchMetrics?.histogrammedTimeToFirstDraw { histograms.append(histogram(value, kind: .firstDraw)) }
        if let value = payload.applicationResponsivenessMetrics?.histogrammedApplicationHangTime { histograms.append(histogram(value, kind: .hangDuration)) }
        return .init(origin: .metricKit, kind: .metrics, begin: payload.timeStampBegin, end: payload.timeStampEnd,
            latestVersion: LabMetricKitSummary.version(payload.latestApplicationVersion),
            multipleVersions: payload.includesMultipleApplicationVersions, values: values, histograms: histograms)
    }
    static func diagnostics(_ payload: MXDiagnosticPayload) -> LabMetricKitSummary {
        var values: [LabMetricKitSummary.Value] = []
        func add(_ kind: LabMetricKitSummary.Value.Kind, _ count: Int?) {
            if let count { values.append(.init(kind: kind, number: Double(count))) }
        }
        add(.crashes, payload.crashDiagnostics?.count)
        add(.hangs, payload.hangDiagnostics?.count)
        add(.cpuExceptions, payload.cpuExceptionDiagnostics?.count)
        add(.diskExceptions, payload.diskWriteExceptionDiagnostics?.count)
        add(.launchDiagnostics, payload.appLaunchDiagnostics?.count)
        return .init(origin: .metricKit, kind: .diagnostics, begin: payload.timeStampBegin, end: payload.timeStampEnd,
            latestVersion: nil, multipleVersions: nil, values: values, histograms: [])
    }
    private static func histogram(_ value: MXHistogram<UnitDuration>, kind: LabMetricKitSummary.Histogram.Kind) -> LabMetricKitSummary.Histogram {
        let enumerator = value.bucketEnumerator
        var buckets: [LabMetricKitSummary.Histogram.Bucket] = []
        while buckets.count < 64, let bucket = enumerator.nextObject() as? MXHistogramBucket<UnitDuration> {
            buckets.append(.init(lowerSeconds: bucket.bucketStart.converted(to: .seconds).value,
                upperSeconds: bucket.bucketEnd.converted(to: .seconds).value,
                count: Int(clamping: bucket.bucketCount)))
        }
        return .init(kind: kind, buckets: buckets.sorted { $0.lowerSeconds < $1.lowerSeconds }, truncated: enumerator.nextObject() != nil)
    }
}
extension LabMetricKitSource: MXMetricManagerSubscriber {
    func didReceive(_ payloads: [MXMetricPayload]) { receive(payloads.prefix(20).map(Self.metrics)) }
    func didReceive(_ payloads: [MXDiagnosticPayload]) { receive(payloads.prefix(20).map(Self.diagnostics)) }
}
