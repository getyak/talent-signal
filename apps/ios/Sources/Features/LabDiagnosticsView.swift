import SwiftUI
import UniformTypeIdentifiers

struct LabDiagnosticsView: View {
    @ObservedObject private var store = LabDiagnosticsStore.shared
    @Environment(\.appLanguage) private var language
    @State private var task = LabDiagnosticTask.scrolling
    @State private var confirmsClear = false
    @State private var probing = false
    @State private var probeResult: String?
    let baseURL: URL?
    var body: some View {
        List {
            Section {
                NavigationLink { LabMetricKitView() } label: {
                    Label(language.text("MetricKit history"), systemImage: "chart.bar.xaxis")
                }.accessibilityIdentifier("lab-diagnostics-metrickit")
                NavigationLink { LabFaultView() } label: {
                    Label(language.text("Isolated fault tests"), systemImage: "network.badge.shield.half.filled")
                }.accessibilityIdentifier("lab-diagnostics-faults")
            }
            Section {
                Text(language.text("Choose a task, start recording, close Lab and reproduce the problem. Return here to inspect the report."))
                Picker(language.text("Task to investigate"), selection: $task) {
                    ForEach(LabDiagnosticTask.allCases) { Text(language.text($0.title)).tag($0) }
                }.disabled(store.activeID != nil).accessibilityIdentifier("lab-diagnostics-task")
                if store.activeID == nil {
                    Button(language.text("Start diagnostic recording")) { store.start(task) }
                        .disabled(!store.canStart).accessibilityIdentifier("lab-diagnostics-start")
                } else {
                    Button(language.text("Stop and review")) { store.stop() }.accessibilityIdentifier("lab-diagnostics-stop")
                    ForEach(LabDiagnosticMarker.allCases) { marker in
                        Button(language.text(marker.title)) { store.mark(marker) }
                            .accessibilityIdentifier("lab-diagnostics-mark-\(marker.rawValue)")
                    }
                }
                if let baseURL {
                    Button(language.text("Check connection")) { Task { await checkConnection(baseURL) } }
                        .disabled(probing)
                        .accessibilityIdentifier("product-lab-probe")
                    if probing { ProgressView() }
                    if let probeResult { Text(probeResult).font(.footnote).accessibilityIdentifier("lab-diagnostics-probe-result") }
                }
                if !store.isEnabled { Text(language.text("Diagnostic recording requires an internal device-tools build.")) }
            } header: { Text(language.text("Reproduce a task")) }
              footer: { Text(language.text("Up to 10 minutes. Stops on background, account change or environment change. A relaunch keeps the last checkpoint and never restarts recording.")) }
            if let error = store.error {
                Section {
                    Text(language.text(error)).foregroundStyle(Color.tsVermilion)
                    Button(language.text("Retry diagnostic storage")) { store.retryStorage() }
                }
            }
            if let notice = store.notice { Text(language.text(notice)).font(.footnote).accessibilityIdentifier("lab-diagnostics-notice") }
            Section {
                if store.reports.isEmpty { Text(language.text("No diagnostic reports yet")) }
                ForEach(store.reports) { report in
                    NavigationLink {
                        LabDiagnosticReportView(store: store, id: report.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(language.text(report.task.title)).font(.headline)
                            Text(report.startedAt, style: .time).font(.caption)
                            Text(language.text(report.ended?.title ?? "Recording diagnostics")).font(.footnote)
                            Text(String(format: language.text("%lld requests · %lld samples"), Int64(report.requests.count), Int64(report.samples.count))).font(.caption)
                        }.padding(.vertical, 4)
                    }.accessibilityIdentifier("lab-diagnostics-report-\(report.id.uuidString)")
                }
                Button(language.text("Clear diagnostic records"), role: .destructive) { confirmsClear = true }
                    .disabled(store.activeID != nil || !store.isEnabled).accessibilityIdentifier("lab-diagnostics-clear")
            } header: { Text(language.text("On-device reports")) }
              footer: { Text(language.text("At most 5 reports, retained for 24 hours and pruned on access. No request bodies, headers, full URLs, names, screenshots or audio are recorded. Separate exported copies remain yours to remove.")) }
            Section {
                Text(language.text("Request time covers the client request. Available DNS, connection, TLS and response phases are shown separately; missing metrics remain unavailable. Server, model and UI completion need their own evidence."))
                Text(language.text("Display-link cadence measures main-run-loop callbacks, not rendered FPS or GPU work. Recording adds overhead. Compare on the same physical device, power mode, appearance and cache state."))
                Text(language.text("For cold launch, CPU, hangs or leaks, connect Xcode Instruments and inspect the LabDiagnosticSession signpost with Time Profiler, Hangs or Allocations. TestFlight cannot start Instruments for you."))
            } header: { Text(language.text("How to interpret measurements")) }
        }
        .navigationTitle(language.text("Performance & diagnostics"))
        .task { if store.activeID == nil { store.reload() } }
        .confirmationDialog(language.text("Clear all diagnostic records on this device?"), isPresented: $confirmsClear, titleVisibility: .visible) {
            Button(language.text("Clear diagnostic records"), role: .destructive) { store.clear() }
        } message: { Text(language.text("This removes only diagnostic reports. Experiments, captured sources, drafts and separate exported files are preserved.")) }
    }
    private func checkConnection(_ baseURL: URL) async {
        guard !probing else { return }
        await LabClientDiagnostics.observe(.healthProbe) { await measuredConnection(baseURL) }
    }
    private func measuredConnection(_ baseURL: URL) async -> LabClientSpan.Outcome {
        guard !probing else { return .skipped }
        probing = true; probeResult = nil
        defer { probing = false; store.refresh() }
        guard RuntimeEndpoint.permitted(baseURL, allowsLoopbackHTTP: DeviceLabAvailability.enabled) else {
            probeResult = language.text("This configured endpoint cannot be used for a health probe.")
            return .skipped
        }
        let start = LabDiagnosticsEngine.clock()
        var request = URLRequest(url: baseURL.appendingPathComponent("health/ready"))
        request.timeoutInterval = 8
        do {
            let (_, response) = try await TalentSignalNetworking.data(for: request, using: TalentSignalNetworking.session)
            if let response = response as? HTTPURLResponse {
                probeResult = String(format: language.text("Health probe: HTTP %lld · %.1f ms"), Int64(response.statusCode), (LabDiagnosticsEngine.clock() - start) * 1000)
                return (200...299).contains(response.statusCode) ? .completed : .failed
            }
            probeResult = language.text("Health probe returned no HTTP status")
            return .failed
        } catch {
            probeResult = language.text("Health probe did not complete. No authenticated or model request was made.")
            return LabClientDiagnostics.failure(error)
        }
    }
}

private struct LabDiagnosticReportView: View {
    @ObservedObject var store: LabDiagnosticsStore
    let id: UUID
    @Environment(\.appLanguage) private var language
    private var report: LabDiagnosticReport? { store.reports.first { $0.id == id } }
    var body: some View {
        List {
            if let report {
                Section {
                    LabInfoRow(label: language.text("Task to investigate"), value: language.text(report.task.title))
                    LabInfoRow(label: language.text("Recording status"), value: language.text(report.ended?.title ?? "Recording diagnostics"))
                    LabInfoRow(label: language.text("Recorded duration"), value: milliseconds(report.durationMilliseconds))
                    Text(language.text(report.simulator ? "Simulator measurement · verify performance on a physical device" : "Measured on this device"))
                        .font(.footnote)
                    if report.ended != nil {
                        Button(language.text("Review diagnostic export")) { store.prepareExport(id) }
                            .accessibilityIdentifier("lab-diagnostics-export")
                    }
                }
                Section {
                    LabInfoRow(label: language.text("Request samples"), value: String(report.requests.count))
                    if report.requests.contains(where: { $0.origin == .syntheticFault }) {
                        Text(language.text("This report includes isolated synthetic requests. Their status and latency are not server performance measurements."))
                    }
                    LabInfoRow(label: language.text("Device samples"), value: String(report.samples.count))
                    if let peak = report.samples.compactMap(\.physicalFootprintBytes).max() {
                        LabInfoRow(label: language.text("Peak sampled physical footprint"), value: ByteCountFormatter.string(fromByteCount: Int64(clamping: peak), countStyle: .memory))
                    }
                    if let gap = report.samples.compactMap(\.longestCallbackGapMilliseconds).max() {
                        LabInfoRow(label: language.text("Longest sampled callback gap"), value: milliseconds(gap))
                    }
                    LabInfoRow(label: language.text("Measured sampling and checkpoint work"), value: milliseconds(report.samplingOverheadMilliseconds))
                    if report.droppedRequests + report.droppedMarkers > 0 {
                        Text(language.text("Some events exceeded the report limit. This is a partial timeline."))
                    }
                    Text(language.text("Peaks are sampled observations. They do not establish a leak, a rendering failure or the cause of a delay."))
                        .font(.footnote)
                } header: { Text(language.text("Measured summary")) }
                Section {
                    if report.markers.isEmpty { Text(language.text("No manual task markers")) }
                    ForEach(report.markers) { marker in
                        LabInfoRow(label: language.text(marker.marker.title), value: "+\(milliseconds(marker.offsetMilliseconds))")
                    }
                } header: { Text(language.text("Your task markers")) }
                  footer: { Text(language.text("Manual markers record your observation time. They are separate from automatic network measurements.")) }
                if let spans = report.clientSpans, !spans.isEmpty {
                    Section {
                        ForEach(spans) { span in
                            LabInfoRow(label: language.text(span.kind.title),
                                value: "+\(milliseconds(span.offsetMilliseconds)) · \(span.durationMilliseconds.map(milliseconds) ?? language.text("Unfinished")) · \(language.text(span.outcome.title))")
                                .padding(.leading, span.parentID == nil ? 0 : 12)
                        }
                        if (report.droppedClientSpans ?? 0) > 0 { Text(language.text("Some client stages exceeded the recording limit.")) }
                        Text(language.text("Client stages may contain other stages and network requests. State updated means the store changed, not that a frame rendered or the task became usable."))
                        Text(language.text("First display callback means the main run loop reached one display-link callback after presentation. It does not prove that pixels reached the screen or that the task was usable."))
                    } header: { Text(language.text("Client operation timeline")) }
                }
                Section {
                    if report.requests.isEmpty { Text(language.text("No instrumented requests were observed")) }
                    ForEach(report.requests) { request in
                        NavigationLink {
                            List {
                                LabInfoRow(label: language.text("Request category"), value: request.route.rawValue)
                                if let parent = report.clientSpans?.first(where: { $0.id == request.clientSpanID }) {
                                    LabInfoRow(label: language.text("Client operation"), value: language.text(parent.kind.title))
                                }
                                LabInfoRow(label: language.text("Measurement source"), value: language.text(request.origin?.title ?? "Legacy record · transport source unknown"))
                                LabInfoRow(label: language.text("Method"), value: request.method.rawValue)
                                LabInfoRow(label: language.text("Elapsed request time"), value: request.durationMilliseconds.map(milliseconds) ?? language.text("Unavailable"))
                                LabInfoRow(label: language.text("HTTP status"), value: request.status.map(String.init) ?? language.text("Unavailable"))
                                if let failure = request.failure { LabInfoRow(label: language.text("Transport result"), value: failure.rawValue) }
                                ForEach(Array(request.phases.enumerated()), id: \.offset) { _, phase in
                                    LabInfoRow(label: language.text(phase.kind.title), value: milliseconds(phase.milliseconds))
                                }
                                if let trace = request.serverTrace {
                                    Section {
                                        Text(language.text(trace.origin == .backend ? "Matched server measurement" : "Synthetic server fixture measurement"))
                                            .accessibilityIdentifier("lab-diagnostic-server-origin")
                                        LabInfoRow(label: language.text("Server handling before response"), value: milliseconds(trace.durationMilliseconds))
                                        ForEach(Array(trace.spans.enumerated()), id: \.offset) { _, span in
                                            LabInfoRow(label: language.text(span.kind.title),
                                                value: "+\(milliseconds(span.offsetMilliseconds)) · \(span.durationMilliseconds.map(milliseconds) ?? language.text("Unfinished")) · \(language.text(span.outcome.title))")
                                        }
                                        if trace.droppedSpans > 0 { Text(language.text("The server stage limit was reached. This trace is partial.")) }
                                        Text(language.text("Server offsets use the server's monotonic clock. They cannot be subtracted from device timestamps. Adapter spans can include tools and overlap other spans; they are not first-token timing."))
                                    } header: { Text(language.text("Server stages")) }
                                } else {
                                    Text(language.text("No matching server stages were received. The backend may not support this capture, or the response did not complete."))
                                }
                                Text(language.text("Each row is one client attempt. TLS can overlap connection time; phase durations must not be summed. Unfinished requests may still complete outside this recording."))
                            }.navigationTitle(language.text("Request measurement"))
                        } label: {
                            LabInfoRow(label: "\(request.method.rawValue) · \(request.route.rawValue)",
                                value: "+\(milliseconds(request.offsetMilliseconds)) · \(request.durationMilliseconds.map(milliseconds) ?? language.text("Unfinished"))")
                        }.accessibilityIdentifier("lab-diagnostic-request-\(request.id)")
                    }
                } header: { Text(language.text("Request timeline")) }
                Section {
                    ForEach(report.samples) { sample in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(String(format: language.text("After %@"), milliseconds(sample.offsetMilliseconds))).font(.caption)
                            Text(String(format: language.text("Thermal: %@ · Low power: %@"), sample.thermal.rawValue, language.text(sample.lowPower ? "On" : "Off")))
                            if let hz = sample.cadenceHz { Text(String(format: language.text("Display-link callbacks: %.1f Hz"), hz)) }
                            if let footprint = sample.physicalFootprintBytes { Text(ByteCountFormatter.string(fromByteCount: Int64(clamping: footprint), countStyle: .memory)) }
                        }.font(.footnote)
                    }
                } header: { Text(language.text("Device timeline")) }
            } else { Text(language.text("This diagnostic report is no longer available")) }
        }
        .navigationTitle(language.text("Diagnostic report"))
        .sheet(isPresented: Binding(get: { store.exportData != nil }, set: { if !$0 { store.closeExport() } })) {
            if let data = store.exportData { LabDiagnosticExportView(id: id, data: data, close: store.closeExport) }
        }
    }
    private func milliseconds(_ value: Double) -> String { String(format: "%.1f ms", value) }
}

private struct LabDiagnosticExportView: View {
    let id: UUID
    let data: Data
    let close: () -> Void
    @Environment(\.appLanguage) private var language
    @State private var exporting = false
    @State private var resultMessage: String?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(language.text("This JSON contains task labels, timestamps, durations, request categories and device measurements. Review this exact copy before saving it. Nothing is submitted automatically."))
                    Text(String(decoding: data, as: UTF8.self)).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                        .accessibilityIdentifier("lab-diagnostics-export-json")
                    if let resultMessage { Text(language.text(resultMessage)).accessibilityIdentifier("lab-diagnostics-export-result") }
                }.padding()
            }.navigationTitle(language.text("Review export"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(language.text("Close"), action: close).accessibilityIdentifier("lab-diagnostics-export-close") }
                ToolbarItem(placement: .confirmationAction) { Button(language.text("Export JSON")) { exporting = true } }
            }
            .fileExporter(isPresented: $exporting, document: LabRegressionExportDocument(data: data), contentType: .json, defaultFilename: "lab-diagnostic-\(id.uuidString).json") { result in
                switch result {
                case .success(let url):
                    let access = url.startAccessingSecurityScopedResource()
                    defer { if access { url.stopAccessingSecurityScopedResource() } }
                    resultMessage = (try? Data(contentsOf: url)) == data ? "Diagnostic file saved and verified. No issue was submitted." : "The file provider reported a save. The exported copy could not be verified."
                case .failure: resultMessage = "Diagnostic file was not saved. You can try again."
                }
            }
        }
    }
}

struct LabDiagnosticsRoot<Content: View>: View {
    @ObservedObject var store: LabDiagnosticsStore
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.appLanguage) private var language
    @ViewBuilder let content: () -> Content
    var body: some View {
        VStack(spacing: 0) {
            if store.activeID != nil {
                HStack {
                    Text(language.text("Recording diagnostics")).font(.caption.weight(.semibold)).accessibilityIdentifier("lab-diagnostics-active")
                    Spacer(minLength: 4)
                    Button { store.mark(.problem) } label: { Image(systemName: "flag").frame(width: 44, height: 44).contentShape(Rectangle()) }
                        .accessibilityLabel(language.text("Problem observed")).accessibilityIdentifier("lab-diagnostics-quick-mark")
                    Button { store.stop() } label: { Text(language.text("Stop")).frame(minWidth: 44, minHeight: 44).contentShape(Rectangle()) }
                        .accessibilityIdentifier("lab-diagnostics-quick-stop")
                }.buttonStyle(.plain).padding(.horizontal, 16).background(Color.tsSurface)
            }
            content()
        }
        .onChange(of: scenePhase) { phase in
            if phase == .background { store.backgrounded() }
            else if phase == .active, store.activeID == nil { store.reload() }
        }
    }
}
