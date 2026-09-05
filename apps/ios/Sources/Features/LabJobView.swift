import SwiftUI

struct LabJobView: View {
    @ObservedObject var store: LabJobStore
    @ObservedObject var previous: LabExperimentStore
    @ObservedObject var regressions: LabRegressionStore
    var regression: LabRegressionRecord? = nil
    @Environment(\.appLanguage) private var language
    @State private var task = "relationship_text"
    @State private var cases = Set<String>()
    @State private var modelA = ""
    @State private var modelB = ""
    @State private var presetA = "baseline"
    @State private var presetB = "concise"
    @State private var repetitions = 1
    @State private var callLimit = 2
    @State private var prepared: LabJobRequest?
    @State private var confirmsRun = false
    @State private var confirmsCancel = false
    @State private var initializedRegression = false
    private var plannedCalls: Int { cases.count * 2 * repetitions }
    var body: some View {
        List {
            Section {
                Text(language.text(regression == nil ? "Compare real answers across a frozen set of cases." : "Rerun the same input against today's admitted configurations.")).font(.headline)
                Text(language.text("Synthetic input · Real model calls · No business-write tools"))
                    .font(.footnote).foregroundStyle(Color.tsMutedInk)
                if let regression {
                    Text(language.text(regression.snapshot.sample.title))
                    Text(language.text("The original input and reference time stay frozen. Review notes and expected behavior are never added to the model input."))
                        .font(.footnote).foregroundStyle(Color.tsMutedInk)
                }
            }
            if let catalog = store.catalog {
                configuration(catalog)
                if let record = store.record, regression == nil || record.definition.regression_source?.id == regression?.id { results(record) }
                if !catalog.jobs.isEmpty, regression == nil {
                    Section(language.text("Recent batches")) {
                        ForEach(catalog.jobs) { item in
                            Button { Task { await store.select(item.id) } } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(LabJobCopy.task(item.task ?? "relationship_text", language)).font(.caption.weight(.semibold))
                                    Text(item.models.joined(separator: " / "))
                                    Text(verbatim: "\(item.case_count) × \(item.repetitions) × 2 · \(LabJobCopy.text(item.status, language))")
                                        .font(.caption).foregroundStyle(Color.tsMutedInk)
                                }
                            }.disabled(store.pending != nil || store.isWorking).accessibilityIdentifier("lab-job-history-\(item.id)")
                        }
                    }
                }
            } else {
                Section {
                    Text(language.text("Connect an internal backend")).font(.headline)
                    Text(language.text("Sign in to an enabled backend to run and recover experiment batches."))
                }
            }
            Section {
                if store.isWorking { ProgressView() }
                if let error = store.error { Text(error).font(.footnote).foregroundStyle(Color.tsVermilion) }
                Button(language.text("Refresh batches")) { Task { await store.load(); defaults() } }
                    .disabled(store.isWorking || store.service == nil).accessibilityIdentifier("lab-job-refresh")
                if store.canRetry {
                    Button(language.text("Retry the saved batch request")) { Task { await store.retry() } }
                        .accessibilityIdentifier("lab-job-retry")
                }
                if let checked = store.checkedAt { LabInfoRow(label: language.text("Last verified"), value: checked.formatted()) }
                NavigationLink(language.text("Previous single-case comparisons")) { LabExperimentView(store: previous) }
                    .accessibilityIdentifier("lab-job-previous-comparisons")
            }
        }
        .navigationTitle(language.text(regression == nil ? "AI experiments" : "Rerun regression"))
        .task { await store.load(); defaults() }
        .task(id: store.record?.id) {
            while !Task.isCancelled, store.record?.isActive == true {
                do { try await Task.sleep(nanoseconds: 2_000_000_000) } catch { return }
                await store.refresh()
                if store.error != nil { return }
            }
        }
        .onChange(of: modelA) { _ in defaults() }
        .onChange(of: modelB) { _ in defaults() }
        .onChange(of: task) { _ in cases.removeAll(); modelA = ""; modelB = ""; defaults() }
        .onChange(of: plannedCalls) { _ in callLimit = max(2, plannedCalls) }
        .confirmationDialog(language.text("Run this frozen experiment batch?"), isPresented: $confirmsRun, titleVisibility: .visible) {
            Button(language.text("Run batch")) { if let prepared { Task { await store.start(prepared) } } }
                .accessibilityIdentifier("lab-job-confirm-start")
        } message: {
            if let prepared {
                Text([prepared.configurations.map { "\($0.model) · \(LabJobCopy.text($0.prompt_preset, language))" }.joined(separator: "\n"),
                    "\(prepared.case_ids.count) × \(prepared.repetitions) × 2",
                    String(format: language.text("At most %lld reserved calls; each requests up to 1,600 output tokens."), Int64(prepared.call_limit)),
                    language.text("Provider charges may apply. A monetary price cap is unavailable. Input and output expire after seven days.")].joined(separator: "\n"))
            }
        }
        .confirmationDialog(language.text("Stop the remaining calls?"), isPresented: $confirmsCancel, titleVisibility: .visible) {
            Button(language.text("Cancel remaining calls"), role: .destructive) { Task { await store.cancel() } }
                .accessibilityIdentifier("lab-job-confirm-cancel")
        } message: { Text(language.text("A request already sent may still finish and be charged. Its result will remain with this batch.")) }
    }
    private func defaults() {
        guard let catalog = store.catalog else { return }
        if let regression {
            if !initializedRegression {
                initializedRegression = true; task = regression.snapshot.task ?? regression.snapshot.sample.task ?? "relationship_text"
                cases = [regression.snapshot.sample.id]
                modelA = regression.snapshot.configurations[0].model; modelB = regression.snapshot.configurations[1].model
                presetA = regression.snapshot.configurations[0].prompt_preset; presetB = regression.snapshot.configurations[1].prompt_preset
            }
            return
        }
        let casesForTask = taskCases(catalog), modelsForTask = taskModels(catalog)
        cases = cases.intersection(Set(casesForTask.map(\.id)))
        if cases.isEmpty, let first = casesForTask.first { cases = [first.id] }
        if !modelsForTask.contains(where: { $0.id == modelA }) { modelA = modelsForTask.first?.id ?? "" }
        if !modelsForTask.contains(where: { $0.id == modelB }) { modelB = modelsForTask.dropFirst().first?.id ?? modelA }
        if modelsForTask.first(where: { $0.id == modelA })?.prompt_presets.contains(presetA) != true { presetA = "baseline" }
        if modelsForTask.first(where: { $0.id == modelB })?.prompt_presets.contains(presetB) != true { presetB = "baseline" }
    }
    @ViewBuilder private func configuration(_ catalog: LabJobCatalog) -> some View {
        Section(language.text("Experiment task")) {
            Picker(language.text("Product path"), selection: $task) {
                ForEach(["relationship_text", "relationship_image", "unscoped_chat"].filter { candidate in
                    catalog.cases.contains { ($0.task ?? "relationship_text") == candidate }
                        && catalog.models.contains { ($0.task ?? "relationship_text") == candidate }
                }, id: \.self) { candidate in Text(LabJobCopy.task(candidate, language)).tag(candidate) }
            }.disabled(regression != nil).accessibilityIdentifier("lab-job-task")
            Text(language.text(task == "relationship_image" ? "The frozen synthetic screenshot is sent only to the admitted vision model."
                : task == "unscoped_chat" ? "The product Workspace Agent runs against a read-only synthetic contact directory."
                : "Reviewed synthetic evidence is sent through the relationship answer path."))
                .font(.footnote).foregroundStyle(Color.tsMutedInk)
        }
        Section(language.text("New frozen batch")) {
            NavigationLink {
                LabJobCasePicker(cases: taskCases(catalog), selection: $cases)
            } label: {
                LabInfoRow(label: language.text("Test cases"), value: String(format: language.text("%lld selected"), Int64(cases.count)))
            }.disabled(regression != nil).accessibilityIdentifier("lab-job-cases")
            Stepper(value: $repetitions, in: 1...3) {
                LabInfoRow(label: language.text("Runs per configuration"), value: "\(repetitions)")
            }.accessibilityIdentifier("lab-job-repetitions")
            Text(language.text("Repeated runs measure variation; they are not additional independent cases."))
                .font(.footnote).foregroundStyle(Color.tsMutedInk)
        }
        choice(language.text("Configuration A"), model: $modelA, preset: $presetA, catalog: catalog, identifier: "a")
        choice(language.text("Configuration B"), model: $modelB, preset: $presetB, catalog: catalog, identifier: "b")
        Section(language.text("Call budget")) {
            if plannedCalls >= 2 {
                Stepper(value: $callLimit, in: 2...plannedCalls) {
                    LabInfoRow(label: language.text("Maximum reserved calls"), value: "\(callLimit) / \(plannedCalls)")
                }.accessibilityIdentifier("lab-job-budget")
            }
            LabInfoRow(label: language.text("Workspace daily batch allowance"), value: "\(max(0, catalog.daily_call_limit - catalog.daily_calls_reserved)) / \(catalog.daily_call_limit)")
            Text(language.text("A reserved call may have reached the provider even if its result is unknown. Reservations are not refunded automatically."))
                .font(.footnote).foregroundStyle(Color.tsMutedInk)
            Button(language.text("Review and run")) {
                prepared = LabJobRequest(id: UUID().uuidString.lowercased(), catalog_revision: catalog.catalog_revision,
                    task: task, case_ids: regression.map { [$0.snapshot.sample.id] } ?? taskCases(catalog).filter { cases.contains($0.id) }.map(\.id),
                    configurations: [.init(model: modelA, prompt_preset: presetA), .init(model: modelB, prompt_preset: presetB)], repetitions: repetitions, call_limit: callLimit,
                    regression_source: regression.map { .init(id: $0.id, content_hash: $0.content_hash) })
                confirmsRun = true
            }.disabled(!catalog.enabled || cases.isEmpty || !admitted(catalog, modelA, presetA) || !admitted(catalog, modelB, presetB) || store.isWorking || store.pending != nil || store.record?.isActive == true)
                .accessibilityIdentifier("lab-job-start")
            if !admitted(catalog, modelA, presetA) || !admitted(catalog, modelB, presetB) {
                Text(language.text("A saved configuration is no longer available. Choose an admitted model and prompt before running."))
                    .font(.footnote).foregroundStyle(Color.tsMutedInk)
            }
            if let active = store.record, active.isActive, let regression, active.definition.regression_source?.id != regression.id {
                Text(language.text("Another batch is active. Finish or cancel it in AI experiments before starting this rerun."))
                    .font(.footnote)
            }
        }
    }
    private func admitted(_ catalog: LabJobCatalog, _ model: String, _ preset: String) -> Bool {
        taskModels(catalog).contains { $0.id == model && $0.prompt_presets.contains(preset) }
    }
    private func taskCases(_ catalog: LabJobCatalog) -> [LabJobCase] {
        catalog.cases.filter { ($0.task ?? "relationship_text") == task }
    }
    private func taskModels(_ catalog: LabJobCatalog) -> [LabJobCatalog.Model] {
        catalog.models.filter { ($0.task ?? "relationship_text") == task }
    }
    private func choice(_ title: String, model: Binding<String>, preset: Binding<String>, catalog: LabJobCatalog, identifier: String) -> some View {
        let models = taskModels(catalog)
        return Section(title) {
            Picker(language.text("Model"), selection: model) {
                if !models.contains(where: { $0.id == model.wrappedValue }) { Text(language.text("Unavailable") + ": " + model.wrappedValue).tag(model.wrappedValue) }
                ForEach(models) { Text($0.id).tag($0.id) }
            }.accessibilityIdentifier("lab-job-model-\(identifier)")
            Picker(language.text("Prompt preset"), selection: preset) {
                if models.first(where: { $0.id == model.wrappedValue })?.prompt_presets.contains(preset.wrappedValue) != true {
                    Text(language.text("Unavailable") + ": " + LabJobCopy.text(preset.wrappedValue, language)).tag(preset.wrappedValue)
                }
                ForEach(models.first(where: { $0.id == model.wrappedValue })?.prompt_presets ?? [], id: \.self) {
                    Text(LabJobCopy.text($0, language)).tag($0)
                }
            }.accessibilityIdentifier("lab-job-prompt-\(identifier)")
        }
    }
    @ViewBuilder private func results(_ record: LabJobRecord) -> some View {
        Section(language.text("Current batch")) {
            LabInfoRow(label: language.text("Status"), value: LabJobCopy.text(record.status, language))
                .accessibilityElement(children: .combine).accessibilityIdentifier("lab-job-status")
            LabInfoRow(label: language.text("Comparison"), value: LabJobCopy.text(record.definition.comparison, language))
            LabInfoRow(label: language.text("Product path"), value: LabJobCopy.task(record.definition.task, language))
            LabInfoRow(label: language.text("Reserved calls"), value: "\(record.calls_reserved) / \(record.definition.call_limit)")
            if record.status == "unknown" {
                Text(language.text("A worker lost contact after reserving a call. This batch will not restart automatically; the provider result and charge may be unknown."))
            } else if record.isActive {
                Text(language.text("The server owns this batch. You can leave and recover it by its saved ID."))
                Button(language.text("Cancel remaining calls"), role: .destructive) { confirmsCancel = true }
                    .disabled(store.isWorking || store.pending != nil || record.status == "cancelling").accessibilityIdentifier("lab-job-cancel")
            }
            Text(language.text(record.quality == "blocked" ? "A hard check failed. Preference or speed cannot remove this failure." : "Content review is still required. No automatic winner or release approval is claimed."))
                .font(.footnote).foregroundStyle(record.quality == "blocked" ? Color.tsVermilion : Color.tsMutedInk)
            ForEach(record.definition.cases) { sample in
                NavigationLink { LabJobCaseResults(record: record, sample: sample, regressions: regressions, jobs: store, previous: previous) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(language.text(sample.title))
                        let attempts = record.attempts.filter { $0.case_id == sample.id }
                        Text(verbatim: "\(attempts.filter { $0.status == "completed" }.count) / \(attempts.count) · \(language.text("Completed executions"))")
                            .font(.caption).foregroundStyle(Color.tsMutedInk)
                    }
                }.accessibilityIdentifier("lab-job-case-\(sample.id)")
            }
            if !record.isActive {
                NavigationLink(language.text("Review this comparison")) { LabJobReviewView(store: store, record: record) }
                    .accessibilityIdentifier("lab-job-review")
            }
            DisclosureGroup(language.text("Frozen configuration")) {
                LabInfoRow(label: language.text("Batch ID"), value: record.id)
                LabInfoRow(label: language.text("Snapshot"), value: record.definition_hash)
                LabInfoRow(label: language.text("Backend revision"), value: record.definition.backend_revision ?? language.text("Not reported"))
                LabInfoRow(label: language.text("Reference time"), value: record.definition.reference_time)
                LabInfoRow(label: language.text("Instrument revision"), value: record.definition.instrument_revision)
            }
        }
    }
}

private struct LabJobCasePicker: View {
    let cases: [LabJobCase]
    @Binding var selection: Set<String>
    @Environment(\.appLanguage) private var language
    var body: some View {
        List {
            ForEach(["development", "held_out"], id: \.self) { partition in
                Section(language.text(partition == "development" ? "Development cases" : "Reserved validation cases")) {
                    ForEach(cases.filter { $0.partition == partition }) { sample in
                        Toggle(isOn: Binding(get: { selection.contains(sample.id) }, set: { if $0 { selection.insert(sample.id) } else { selection.remove(sample.id) } })) {
                            Text(language.text(sample.title))
                        }.accessibilityIdentifier("lab-job-select-\(sample.id)")
                        DisclosureGroup(language.text("Inspect input & expected behavior")) {
                            Text(sample.expected).font(.footnote)
                            Text(sample.input_json).font(.caption).textSelection(.enabled)
                        }
                    }
                }
            }
        }.navigationTitle(language.text("Test cases"))
    }
}

private struct LabJobCaseResults: View {
    let record: LabJobRecord
    let sample: LabJobCase
    @ObservedObject var regressions: LabRegressionStore
    @ObservedObject var jobs: LabJobStore
    @ObservedObject var previous: LabExperimentStore
    @Environment(\.appLanguage) private var language
    var body: some View {
        List {
            Section(language.text("Expected behavior")) { Text(sample.expected) }
            ForEach(record.attempts.filter { $0.case_id == sample.id }.sorted { ($0.repetition, $0.configuration_index) < ($1.repetition, $1.configuration_index) }) { attempt in
                Section("\(attempt.configuration_index == 0 ? "A" : "B") · \(language.text("Run")) \(attempt.repetition)") {
                    LabInfoRow(label: language.text("Status"), value: LabJobCopy.text(attempt.status, language))
                    LabInfoRow(label: language.text("Actual model"), value: attempt.actual_model ?? language.text("Not reported"))
                    LabInfoRow(label: language.text("Execution"), value: language.text(attempt.execution == "local_only" ? "Local product path" : attempt.execution == "remote" ? "Remote model" : "Unknown"))
                    if let title = attempt.title { Text(title).font(.headline) }
                    if let answer = attempt.answer { Text(answer).textSelection(.enabled).accessibilityIdentifier("lab-job-answer-\(attempt.ordinal)") }
                    if let code = attempt.error_code { Text(LabJobCopy.text(code, language)).font(.footnote).foregroundStyle(Color.tsVermilion) }
                    LabInfoRow(label: language.text("Provider time"), value: attempt.duration_ms.map { String(format: "%.2f s", Double($0) / 1000) } ?? language.text("Not reported"))
                    LabInfoRow(label: language.text("Tokens in / out"), value: attempt.input_tokens.flatMap { input in attempt.output_tokens.map { "\(input) / \($0)" } } ?? language.text("Not reported"))
                    DisclosureGroup(language.text("Checks and run evidence")) {
                        ForEach(attempt.checks) { check in
                            VStack(alignment: .leading) {
                                Text(verbatim: "\(check.id) · \(LabJobCopy.text(check.verdict, language))").font(.caption.weight(.semibold))
                                Text(language.text(check.summary)).font(.footnote)
                            }
                        }
                        LabInfoRow(label: language.text("Actual prompt revision"), value: attempt.actual_prompt_revision ?? language.text("Not reported"))
                        LabInfoRow(label: language.text("Provider request"), value: attempt.provider_request_id ?? language.text("Not reported"))
                        LabInfoRow(label: language.text("Remote requests started"), value: attempt.remote_requests_started.map(String.init) ?? language.text("Not reported"))
                        LabInfoRow(label: language.text("Citations"), value: attempt.citation_ids.joined(separator: "\n"))
                    }
                    if !record.isActive, ["completed", "failed", "unknown"].contains(attempt.status) {
                        NavigationLink(language.text("Save this failure as a regression")) {
                            LabRegressionSaveView(store: regressions, jobs: jobs, previous: previous, job: record, attempt: attempt, sample: sample)
                        }.accessibilityIdentifier("lab-job-save-regression-\(attempt.ordinal)")
                    }
                }
            }
            DisclosureGroup(language.text("Frozen input")) { Text(sample.input_json).font(.caption).textSelection(.enabled) }
        }.navigationTitle(language.text(sample.title))
    }
}

private struct LabJobReviewView: View {
    @ObservedObject var store: LabJobStore
    let record: LabJobRecord
    @Environment(\.appLanguage) private var language
    @State private var review = "inconclusive"
    @State private var failures = Set<String>()
    var body: some View {
        List {
            Section {
                Picker(language.text("Your review"), selection: $review) {
                    ForEach(["a", "b", "tie", "inconclusive"], id: \.self) { Text(LabJobCopy.text($0, language)).tag($0) }
                }
                Text(language.text("Preference is separate from correctness. This review changes neither the product model nor a release gate."))
                    .font(.footnote).foregroundStyle(Color.tsMutedInk)
                if let saved = store.record {
                    LabInfoRow(label: language.text("Saved review"), value: LabJobCopy.text(saved.review, language))
                        .accessibilityElement(children: .combine).accessibilityIdentifier("lab-job-saved-review")
                }
            }
            Section(language.text("What needs correction?")) {
                ForEach(LabJobCopy.failures, id: \.self) { category in
                    Toggle(LabJobCopy.text(category, language), isOn: Binding(get: { failures.contains(category) }, set: { if $0 { failures.insert(category) } else { failures.remove(category) } }))
                }
            }
            if let error = store.error { Text(error).foregroundStyle(Color.tsVermilion) }
        }.navigationTitle(language.text("Review comparison"))
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(language.text("Save review")) { Task { await store.review(.init(review: review, failure_categories: failures.sorted())) } }
                    .disabled(store.isWorking).accessibilityIdentifier("lab-job-save-review")
            }
        }
        .onAppear { review = record.review == "unreviewed" ? "inconclusive" : record.review; failures = Set(record.failure_categories) }
    }
}

enum LabJobCopy {
    static let failures = ["unsupported_claim", "wrong_identity", "missed_uncertainty", "stale_evidence", "unsafe_action", "bad_structure", "provider_failure", "latency", "other"]
    static func task(_ key: String, _ language: AppLanguage) -> String {
        language.text(["relationship_text": "Relationship answer", "relationship_image": "Image understanding",
            "unscoped_chat": "Workspace Agent"][key] ?? key)
    }
    static func text(_ key: String, _ language: AppLanguage) -> String {
        language.text(["baseline": "Current baseline", "concise": "Concise answer", "evidence_first": "Evidence first",
            "queued": "Queued", "running": "Running", "cancelling": "Cancelling", "cancelled": "Cancelled", "completed": "Completed", "partial": "Partially completed", "failed": "Failed", "unknown": "Unknown", "pending": "Not started", "dispatching": "Call reserved",
            "repeatability": "Repeatability check", "model": "Model comparison", "prompt": "Prompt comparison", "combined": "Combined configuration comparison",
            "a": "A is more useful", "b": "B is more useful", "tie": "About the same", "inconclusive": "Cannot decide yet", "unreviewed": "Not reviewed",
            "unsupported_claim": "Unsupported claim", "wrong_identity": "Wrong identity", "missed_uncertainty": "Uncertainty was missed", "stale_evidence": "Stale evidence", "unsafe_action": "Unsafe action claim", "bad_structure": "Invalid answer structure", "provider_failure": "Provider failure", "latency": "Slow response", "other": "Another issue",
            "pass": "Passed", "fail": "Failed", "skipped": "Skipped",
            "CALL_BUDGET_EXHAUSTED": "The call budget was reached before this attempt.", "CANCELLED_BEFORE_DISPATCH": "Cancelled before a provider request was sent.",
            "WORKER_LOST_AFTER_RESERVATION": "Completion is unknown after the worker lost contact.", "STOPPED_AFTER_UNKNOWN_ATTEMPT": "Stopped because an earlier attempt is unknown.",
            "REGRESSION_DELETED_OR_EXPIRED": "The source regression was deleted or expired. No new call was sent.",
            "FROZEN_CONFIGURATION_CHANGED": "The frozen configuration changed. No new call was sent.", "PROVIDER_FAILED_OR_CONFIGURATION_UNVERIFIED": "Provider request failed or output could not be verified", "OUTPUT_HARD_CHECK_FAILED": "The output failed a hard check."][key] ?? key)
    }
}
