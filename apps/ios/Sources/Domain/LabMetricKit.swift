import Foundation
import CryptoKit

// A projection, never the raw MetricKit JSON, metadata or call-stack tree.
struct LabMetricKitSummary: Codable, Identifiable {
    enum Origin: String, Codable { case metricKit, syntheticExample }
    enum Kind: String, Codable { case metrics, diagnostics }
    struct Value: Codable {
        enum Kind: String, Codable, CaseIterable {
            case cpuSeconds, gpuSeconds, foregroundSeconds, backgroundSeconds, peakMemoryBytes
            case crashes, hangs, cpuExceptions, diskExceptions, launchDiagnostics
            var title: String {
                switch self {
                case .cpuSeconds: return "Cumulative CPU time"
                case .gpuSeconds: return "Cumulative GPU time"
                case .foregroundSeconds: return "Foreground app time"
                case .backgroundSeconds: return "Background app time"
                case .peakMemoryBytes: return "Peak memory reported by iOS"
                case .crashes: return "Crash diagnostic entries"
                case .hangs: return "Hang diagnostic entries"
                case .cpuExceptions: return "CPU exception entries"
                case .diskExceptions: return "Disk-write exception entries"
                case .launchDiagnostics: return "Launch diagnostic entries"
                }
            }
            var isCount: Bool { [.crashes, .hangs, .cpuExceptions, .diskExceptions, .launchDiagnostics].contains(self) }
        }
        let kind: Kind
        let number: Double
    }
    struct Histogram: Codable {
        enum Kind: String, Codable { case firstDraw, hangDuration }
        struct Bucket: Codable { let lowerSeconds: Double; let upperSeconds: Double; let count: Int }
        let kind: Kind
        let buckets: [Bucket]
        let truncated: Bool
    }
    let origin: Origin
    let kind: Kind
    let begin: Date
    let end: Date
    let latestVersion: String?
    let multipleVersions: Bool?
    let values: [Value]
    let histograms: [Histogram]
    var id: String { SHA256.hash(data: (try? Self.encoder.encode(self)) ?? Data()).map { String(format: "%02x", $0) }.joined() }
    private static var encoder: JSONEncoder { let value = JSONEncoder(); value.outputFormatting = [.sortedKeys]; return value }
    var isValid: Bool {
        func number(_ value: Double) -> Bool { value.isFinite && (0...1e16).contains(value) }
        guard begin.timeIntervalSince1970.isFinite, end.timeIntervalSince1970.isFinite,
              end >= begin, end.timeIntervalSince(begin) <= 7 * 86_400,
              values.count <= 10, Set(values.map(\.kind)).count == values.count,
              values.allSatisfy({ number($0.number) && $0.kind.isCount == (kind == .diagnostics)
                  && (!$0.kind.isCount || $0.number.rounded() == $0.number) }),
              kind != .diagnostics || (histograms.isEmpty && multipleVersions == nil),
              histograms.count <= 2, Set(histograms.map(\.kind)).count == histograms.count,
              latestVersion.map({ Self.version($0) == $0 }) ?? true else { return false }
        return histograms.allSatisfy { histogram in
            guard histogram.buckets.count <= 64 else { return false }
            var previous = 0.0
            for bucket in histogram.buckets {
                guard number(bucket.lowerSeconds), number(bucket.upperSeconds), bucket.upperSeconds >= bucket.lowerSeconds,
                      bucket.lowerSeconds >= previous, (0...1_000_000_000).contains(bucket.count) else { return false }
                previous = bucket.upperSeconds
            }
            return true
        }
    }
    static func version(_ value: String) -> String? {
        guard !value.isEmpty, value.utf8.count <= 64,
              value.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._+-").contains($0) }) else { return nil }
        return value
    }
}
struct LabMetricKitRecord: Codable, Identifiable {
    let summary: LabMetricKitSummary
    let receivedAt: Date
    var id: String { summary.id }
}
struct LabMetricKitArchive: Codable {
    let version: Int
    var ignoreThrough: Date?
    var records: [LabMetricKitRecord]
}
