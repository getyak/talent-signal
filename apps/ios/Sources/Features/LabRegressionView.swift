import SwiftUI
import UniformTypeIdentifiers

struct LabRegressionLibrary: View {
    @ObservedObject var store: LabRegressionStore
    @ObservedObject var jobs: LabJobStore
    @ObservedObject var previous: LabExperimentStore
    @Environment(\.appLanguage) private var language
    var body: some View {
        List {
            Section {
                Text(language.text("Keep a failure reproducible.")).font(.headline)
                Text(language.text("Save a specific experiment output and expected behavior. Rerun the frozen input after a change."))
                    .font(.footnote).foregroundStyle(Color.tsMutedInk)
            }
            Section(language.text("Saved cases")) {
                if store.items.isEmpty { Text(language.text("Open an experiment output to save your first regression case.")) }
                ForEach(store.items) { item in
                    NavigationLink {
                        LabRegressionDetailView(id: item.id, store: store, jobs: jobs, previous: previous)
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(language.text(item.title))
                            Text(item.failure_categories.map { LabJobCopy.text($0, language) }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(Color.tsMutedInk)
                        }
                    }.disabled(store.pending != nil || store.isWorking).accessibilityIdentifier("lab-regression-\(item.id)")
                }
            }
            LabRegressionRecoverySection(store: store)
        }.navigationTitle(language.text("Regression cases"))
        .task { await store.load() }
    }
}

struct LabRegressionSaveView: View {
    @ObservedObject var store: LabRegressionStore
    @ObservedObject var jobs: LabJobStore
    @ObservedObject var previous: LabExperimentStore
    let job: LabJobRecord
    let attempt: LabJobAttempt
    let sample: LabJobCase
    @Environment(\.appLanguage) private var language
    @State private var failures = Set<String>()
    @State private var expected = ""
    @State private var note = ""
    @State private var requestedID: String?
    @FocusState private var editing: Bool
    var body: some View {
        Form {
            Section(language.text("Selected output")) {
                Text(language.text(sample.title)).font(.headline)
                Text(verbatim: "\(attempt.configuration_index == 0 ? "A" : "B") · \(language.text("Run")) \(attempt.repetition) · \(attempt.actual_model ?? attempt.requested_model)")
                    .font(.footnote).foregroundStyle(Color.tsMutedInk)
                Text(attempt.answer ?? LabJobCopy.text(attempt.error_code ?? attempt.status, language))
                    .font(.footnote)
            }
            Section(language.text("Expected behavior")) {
                TextEditor(text: $expected).focused($editing).frame(minHeight: 90).accessibilityIdentifier("lab-regression-expected")
                    .onChange(of: expected) { value in if value.count > 2000 { expected = String(value.prefix(2000)) } }
            }.disabled(store.pending != nil || (requestedID != nil && requestedID == store.record?.id))
            Section(language.text("What needs correction?")) {
                ForEach(LabJobCopy.failures, id: \.self) { category in
                    Toggle(LabJobCopy.text(category, language), isOn: Binding(get: { failures.contains(category) }, set: { if $0 { failures.insert(category) } else { failures.remove(category) } }))
                        .accessibilityIdentifier("lab-regression-category-\(category)")
                }
            }.disabled(store.pending != nil || (requestedID != nil && requestedID == store.record?.id))
            Section(language.text("Review note · Optional")) {
                TextEditor(text: $note).focused($editing).frame(minHeight: 65).accessibilityIdentifier("lab-regression-note")
                    .onChange(of: note) { value in if value.count > 2000 { note = String(value.prefix(2000)) } }
                Text(language.text("Use synthetic content only. The saved case is retained for 90 days and can be deleted. Notes are never sent as model input."))
                    .font(.footnote).foregroundStyle(Color.tsMutedInk)
            }.disabled(store.pending != nil || (requestedID != nil && requestedID == store.record?.id))
            if let id = requestedID, store.record?.id == id {
                Section {
                    Text(language.text("Regression case saved")).accessibilityIdentifier("lab-regression-saved")
                    NavigationLink(language.text("Open saved case")) { LabRegressionDetailView(id: id, store: store, jobs: jobs, previous: previous) }
                        .accessibilityIdentifier("lab-regression-open-saved")
                }
            }
            LabRegressionRecoverySection(store: store)
        }.navigationTitle(language.text("Save regression")).scrollDismissesKeyboard(.interactively)
        .onAppear { if expected.isEmpty { expected = sample.expected } }
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(language.text("Save case")) {
                    editing = false
                    let id = UUID().uuidString.lowercased(); requestedID = id
                    let request = LabRegressionRequest(id: id, source_job_id: job.id, source_attempt_id: attempt.id, source_definition_hash: job.definition_hash,
                        failure_categories: failures.sorted(), expected_behavior: expected.trimmingCharacters(in: .whitespacesAndNewlines), review_note: note.trimmingCharacters(in: .whitespacesAndNewlines))
                    Task { await store.save(request) }
                }.disabled(failures.isEmpty || expected.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.service == nil || store.isWorking || store.pending != nil || (requestedID != nil && requestedID == store.record?.id))
                    .accessibilityIdentifier("lab-regression-confirm-save")
            }
        }
    }
}

struct LabRegressionDetailView: View {
    let id: String
    @ObservedObject var store: LabRegressionStore
    @ObservedObject var jobs: LabJobStore
    @ObservedObject var previous: LabExperimentStore
    @Environment(\.appLanguage) private var language
    @State private var confirmsDelete = false
    @State private var showsRun = false
    var body: some View {
        List {
            if let record = store.record, record.id == id {
                Section {
                    Text(language.text(record.snapshot.sample.title)).font(.headline)
                    Text(language.text(LabCICopy.status(record.release_check))).accessibilityIdentifier("lab-regression-release-status")
                    Text(language.text("Saving a case, checking it in CI and approving its quality are separate steps."))
                        .font(.footnote).foregroundStyle(Color.tsMutedInk)
                    NavigationLink(language.text("CI verification")) { LabCIView(id: id, regressions: store, store: store.ci) }
                        .accessibilityIdentifier("lab-regression-ci")
                }
                Section(language.text("Expected behavior")) {
                    Text(record.snapshot.expected_behavior)
                    Text(record.snapshot.failure_categories.map { LabJobCopy.text($0, language) }.joined(separator: " · ")).font(.caption)
                    if !record.snapshot.review_note.isEmpty { Text(record.snapshot.review_note).font(.footnote).foregroundStyle(Color.tsMutedInk) }
                }
                Section(language.text("Observed result")) {
                    Text(record.snapshot.source_attempt.answer ?? LabJobCopy.text(record.snapshot.source_attempt.error_code ?? record.snapshot.source_attempt.status, language))
                    LabInfoRow(label: language.text("Actual model"), value: record.snapshot.source_attempt.actual_model ?? language.text("Not reported"))
                }
                Section {
                    NavigationLink(language.text("Configure a rerun")) { LabJobView(store: jobs, previous: previous, regressions: store, regression: record) }
                        .accessibilityIdentifier("lab-regression-rerun")
                    ForEach(record.reruns) { run in
                        Button {
                            Task { await jobs.select(run.id); if jobs.record?.id == run.id { showsRun = true } }
                        } label: {
                            VStack(alignment: .leading) {
                                Text(LabJobCopy.text(run.status, language))
                                Text(run.created_at).font(.caption).foregroundStyle(Color.tsMutedInk)
                            }
                        }.disabled(jobs.isWorking || jobs.pending != nil).accessibilityIdentifier("lab-regression-run-\(run.id)")
                    }
                } header: { Text(language.text("Reruns")) }
                Section {
                    DisclosureGroup(language.text("Frozen input")) { Text(record.snapshot.sample.input_json).font(.caption).textSelection(.enabled) }
                    DisclosureGroup(language.text("Source and retention")) {
                        LabInfoRow(label: language.text("Snapshot"), value: record.content_hash)
                        LabInfoRow(label: language.text("Source batch"), value: record.snapshot.source_job_id)
                        LabInfoRow(label: language.text("Source execution"), value: record.snapshot.source_attempt.id)
                        LabInfoRow(label: language.text("Reference time"), value: record.snapshot.reference_time)
                        LabInfoRow(label: language.text("Expires"), value: record.expires_at)
                    }
                    Button(language.text("Review export")) { Task { await store.prepareExport() } }
                        .disabled(store.isWorking || store.pending != nil).accessibilityIdentifier("lab-regression-export")
                    Button(language.text("Delete regression case"), role: .destructive) { confirmsDelete = true }
                        .disabled(store.isWorking || store.pending != nil).accessibilityIdentifier("lab-regression-delete")
                }
            }
            LabRegressionRecoverySection(store: store)
        }.navigationTitle(language.text("Regression case"))
        .task { await store.select(id) }
        .navigationDestination(isPresented: $showsRun) {
            if let record = store.record { LabJobView(store: jobs, previous: previous, regressions: store, regression: record) }
        }
        .confirmationDialog(language.text("Delete this case and its derived results?"), isPresented: $confirmsDelete, titleVisibility: .visible) {
            Button(language.text("Delete case and derived results"), role: .destructive) { Task { await store.remove() } }
                .accessibilityIdentifier("lab-regression-confirm-delete")
        } message: {
            Text(language.text("This removes the saved input, output, review, derived cases and rerun results. Reserved calls may still be charged. Previously exported files must be removed separately."))
        }
        .sheet(isPresented: Binding(get: { store.exportData != nil }, set: { if !$0 { store.clearExport() } })) {
            if let data = store.exportData { LabRegressionExportView(id: id, data: data, onClose: { store.clearExport() }) }
        }
    }
}

private struct LabRegressionRecoverySection: View {
    @ObservedObject var store: LabRegressionStore
    @Environment(\.appLanguage) private var language
    var body: some View {
        Section {
            if store.isWorking { ProgressView() }
            if store.pending != nil { Text(language.text("A saved request needs readback. Refresh to recover the same operation.")) }
            if let deletion = store.deletion {
                Text(language.text("Regression case deleted")).accessibilityIdentifier("lab-regression-deleted")
                Text(String(format: language.text("%lld derived batch records were cleared."), Int64(deletion.affected_job_ids.count)))
                    .font(.footnote)
            }
            if let error = store.error { Text(language.text(error)).font(.footnote).foregroundStyle(Color.tsVermilion) }
            Button(language.text("Refresh regression cases")) { Task { await store.load() } }
                .disabled(store.isWorking || store.service == nil).accessibilityIdentifier("lab-regression-refresh")
            if store.canRetry {
                Button(language.text("Retry saved regression request")) { Task { await store.retry() } }
                    .accessibilityIdentifier("lab-regression-retry")
            }
        }
    }
}

struct LabRegressionExportDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    let data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

private struct LabRegressionExportView: View {
    let id: String
    let data: Data
    let onClose: () -> Void
    @Environment(\.appLanguage) private var language
    @State private var exporting = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(language.text("This file includes synthetic input, model output and your review. Inspect it before saving a separate copy."))
                    Text(String(decoding: data, as: UTF8.self)).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                        .accessibilityIdentifier("lab-regression-export-json")
                    if let error { Text(error).foregroundStyle(Color.tsVermilion) }
                }.padding()
            }.navigationTitle(language.text("Review export"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(language.text("Close"), action: onClose).accessibilityIdentifier("lab-regression-export-close") }
                ToolbarItem(placement: .confirmationAction) { Button(language.text("Export JSON")) { exporting = true }.accessibilityIdentifier("lab-regression-export-file") }
            }
            .fileExporter(isPresented: $exporting, document: LabRegressionExportDocument(data: data), contentType: .json, defaultFilename: "lab-regression-\(id).json") { result in
                if case .failure(let failure) = result { error = failure.localizedDescription }
            }
        }
    }
}
