import SwiftUI
import UniformTypeIdentifiers

struct LabMetricKitView: View {
    @ObservedObject private var store = LabMetricKitStore.shared
    @Environment(\.appLanguage) private var language
    @Environment(\.scenePhase) private var scenePhase
    @State private var confirmsClear = false
    var body: some View {
        List {
            Section {
                Text(language.text("MetricKit provides historical summaries from iOS. They are separate from your task recordings and are not live performance readings."))
                if !store.supportsDelivery {
                    Text(language.text("MetricKit delivery requires a physical device. This Simulator can preview the report layout."))
                        .accessibilityIdentifier("lab-metrics-unavailable")
                } else if let until = store.receiveUntil {
                    LabInfoRow(label: language.text("Receiving during this app session, until:"),
                        value: until.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened).locale(language.locale)))
                    Button(language.text("Pause receiving reports")) { store.pause() }.accessibilityIdentifier("lab-metrics-pause")
                } else {
                    Button(language.text("Receive reports for up to 24 hours")) { store.start() }
                        .disabled(!store.canReceive).accessibilityIdentifier("lab-metrics-start")
                }
                if !store.enabled { Text(language.text("MetricKit reception requires an internal device-tools build.")) }
                Text(language.text("Receiving stops when you pause, close the app process or reach 24 hours. Reopening the app does not resume it. Background delivery depends on iOS."))
                    .font(.footnote)
            }
            if let error = store.error {
                Section {
                    Text(language.text(error)).foregroundStyle(Color.tsVermilion)
                    Button(language.text("Retry MetricKit storage")) { store.retryStorage() }
                }
            }
            if let notice = store.notice { Text(language.text(notice)).font(.footnote).accessibilityIdentifier("lab-metrics-notice") }
            Section {
                if store.records.isEmpty {
                    Text(language.text("No MetricKit summaries received"))
                        .accessibilityIdentifier("lab-metrics-empty")
                    Text(language.text("No report does not mean zero crashes or good performance. iOS decides when data is available; refreshing cannot force a report."))
                        .font(.footnote)
                }
                ForEach(store.records) { record in
                    NavigationLink {
                        LabMetricKitDetail(summary: record.summary, receivedAt: record.receivedAt) { store.prepareExport(record.id) }
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(language.text(record.summary.kind == .metrics ? "Historical app metrics" : "System diagnostic counts"))
                            Text(record.summary.end, style: .date).font(.caption)
                            Text(record.summary.end, style: .time).font(.caption)
                        }
                    }.accessibilityIdentifier("lab-metrics-record-\(record.id)")
                }
                Button(language.text("Refresh saved summaries")) { store.refresh() }.disabled(!store.enabled)
                Button(language.text("Clear local MetricKit summaries"), role: .destructive) { confirmsClear = true }
                    .disabled(!store.enabled).accessibilityIdentifier("lab-metrics-clear")
            } header: { Text(language.text("Historical summaries")) }
              footer: { Text(language.text("Up to 20 summaries covering the last 7 days, stored privately on this device. No raw system payloads, call stacks, exception messages, names or source content are retained. Clearing pauses reception and removes only these local copies.")) }
            Section {
                NavigationLink {
                    LabMetricKitDetail(summary: Self.example, receivedAt: nil, export: nil)
                } label: { Text(language.text("Preview a synthetic report")) }
                    .accessibilityIdentifier("lab-metrics-example")
                Text(language.text("Metrics usually describe a past 24-hour window and may arrive separately by source. Diagnostics can arrive sooner when available. Reports may span app versions and cannot identify a specific model or backend."))
                Text(language.text("For a crash stack, hang investigation or precise CPU analysis, use Xcode Organizer and Instruments. Xcode-injected MetricKit payloads must not be treated as field performance evidence."))
            } header: { Text(language.text("Read the report correctly")) }
        }
        .navigationTitle(language.text("MetricKit history"))
        .task { store.refresh() }
        .onChange(of: scenePhase) { phase in
            if phase == .active { store.refresh() }
            if phase == .background { store.closeExport() }
        }
        .confirmationDialog(language.text("Pause reception and clear local summaries?"), isPresented: $confirmsClear, titleVisibility: .visible) {
            Button(language.text("Clear local MetricKit summaries"), role: .destructive) { store.clear() }
        } message: { Text(language.text("System-held reports and separately exported files are not deleted. Receiving is paused, and reopening the app will not resume it.")) }
        .sheet(isPresented: Binding(get: { store.exportData != nil }, set: { if !$0 { store.closeExport() } })) {
            if let data = store.exportData { LabMetricKitExport(data: data, close: store.closeExport) }
        }
    }
    static var example: LabMetricKitSummary {
        .init(origin: .syntheticExample, kind: .metrics,
            begin: Date(timeIntervalSince1970: 1_788_307_200), end: Date(timeIntervalSince1970: 1_788_393_600),
            latestVersion: "0.1.0", multipleVersions: true,
            values: [.init(kind: .cpuSeconds, number: 36), .init(kind: .foregroundSeconds, number: 240),
                .init(kind: .peakMemoryBytes, number: 104_857_600)],
            histograms: [.init(kind: .firstDraw, buckets: [.init(lowerSeconds: 0, upperSeconds: 0.5, count: 2),
                .init(lowerSeconds: 0.5, upperSeconds: 1, count: 1)], truncated: false)])
    }
}

private struct LabMetricKitDetail: View {
    let summary: LabMetricKitSummary
    let receivedAt: Date?
    let export: (() -> Void)?
    @Environment(\.appLanguage) private var language
    var body: some View {
        List {
            Section {
                Text(language.text(summary.origin == .syntheticExample ? "Synthetic example · not a device measurement" : "Received through MetricKit"))
                    .font(.headline).accessibilityIdentifier("lab-metrics-origin")
                LabInfoRow(label: language.text("Window starts"), value: dateTime(summary.begin))
                LabInfoRow(label: language.text("Window ends"), value: dateTime(summary.end))
                if let receivedAt { LabInfoRow(label: language.text("Received on this device"), value: dateTime(receivedAt)) }
                LabInfoRow(label: language.text("Latest reported app version"), value: summary.latestVersion ?? language.text("Unavailable"))
                if summary.multipleVersions == true { Text(language.text("This window includes multiple app versions. Do not attribute it to one build.")) }
                if let export { Button(language.text("Review MetricKit export"), action: export).accessibilityIdentifier("lab-metrics-export") }
            }
            Section {
                ForEach(LabMetricKitSummary.Value.Kind.allCases.filter { $0.isCount == (summary.kind == .diagnostics) }, id: \.self) { kind in
                    LabInfoRow(label: language.text(kind.title), value: formatted(kind))
                }
                Text(language.text("Cumulative CPU and GPU time are totals, not utilization percentages. Missing values are unavailable, not zero. Diagnostic counts are entries in this payload, not crash-free rates."))
                    .font(.footnote)
            } header: { Text(language.text("Reported values")) }
            ForEach(summary.histograms, id: \.kind) { histogram in
                Section {
                    ForEach(Array(histogram.buckets.enumerated()), id: \.offset) { _, bucket in
                        LabInfoRow(label: String(format: language.text("%.3f–%.3f seconds"), bucket.lowerSeconds, bucket.upperSeconds),
                            value: String(format: language.text("Observations: %lld"), Int64(bucket.count)))
                    }
                    if histogram.buckets.isEmpty { Text(language.text("No histogram buckets reported")) }
                    if histogram.truncated { Text(language.text("Only the first 64 histogram buckets are retained.")) }
                } header: { Text(language.text(histogram.kind == .firstDraw ? "Time to first draw distribution" : "Hang duration distribution")) }
            }
            Text(language.text("Time to first draw is a system launch measure. It does not establish that workspace data loaded or the app became usable."))
        }.navigationTitle(language.text("MetricKit summary"))
    }
    private func dateTime(_ value: Date) -> String { value.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened).locale(language.locale)) }
    private func formatted(_ kind: LabMetricKitSummary.Value.Kind) -> String {
        guard let value = summary.values.first(where: { $0.kind == kind })?.number else { return language.text("Unavailable") }
        if kind.isCount { return String(format: "%.0f", value) }
        if kind == .peakMemoryBytes { return ByteCountFormatter.string(fromByteCount: Int64(value), countStyle: .memory) }
        return String(format: language.text("%.2f seconds"), value)
    }
}

private struct LabMetricKitExport: View {
    let data: Data
    let close: () -> Void
    @Environment(\.appLanguage) private var language
    @State private var exporting = false
    @State private var result: String?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(language.text("This is the retained typed summary, not the raw system payload. Review it before saving a separate copy. Nothing is submitted automatically."))
                    Text(String(decoding: data, as: UTF8.self)).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                        .accessibilityIdentifier("lab-metrics-export-json")
                    if let result { Text(language.text(result)) }
                }.padding()
            }.navigationTitle(language.text("Review export"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(language.text("Close"), action: close) }
                ToolbarItem(placement: .confirmationAction) { Button(language.text("Export JSON")) { exporting = true } }
            }
            .fileExporter(isPresented: $exporting, document: LabRegressionExportDocument(data: data), contentType: .json,
                          defaultFilename: "lab-metrickit-summary") { response in
                switch response {
                case .success(let url):
                    let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
                    result = (try? Data(contentsOf: url)) == data ? "Diagnostic file saved and verified. No issue was submitted." : "The file provider reported a save. The exported copy could not be verified."
                case .failure: result = "Diagnostic file was not saved. You can try again."
                }
            }
        }
    }
}
