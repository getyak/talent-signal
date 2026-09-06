import SwiftUI

struct LabTaskTrialView: View {
    @ObservedObject var store: LabTaskTrialStore
    @Environment(\.appLanguage) private var language
    @State private var task = "relationship_text"
    @State private var model = ""
    @State private var preset = "baseline"
    @State private var minutes = 15
    @State private var question = ""
    @State private var minimumSamples = 5
    @State private var stopAfterAdverse = 1
    @State private var confirmStart = false
    @State private var selectedTrial: (task: String, model: String, preset: String, minutes: Int,
        question: String, minimumSamples: Int, stopAfterAdverse: Int)?
    @State private var stopping: LabTaskTrial?
    private var capability: LabTaskCapability? { store.configuration?.tasks.first { $0.id == task } }
    private var presets: [String] { capability?.models.first { $0.id == model }?.prompt_presets ?? [] }
    var body: some View {
        List {
            Section {
                Text(language.text("Try an approved configuration in your normal product tasks. It applies only to this sign-in and returns to the default when it expires or you stop it."))
                Text(language.text("This is an opt-in observation for this sign-in, not an online A/B assignment. Starting it makes no model call and cannot establish causation."))
                    .font(.footnote).foregroundStyle(Color.tsMutedInk)
            }
            if let configuration = store.configuration {
                if let receipt = store.receipt {
                    Section(language.text("Configuration receipt")) {
                        LabInfoRow(label: language.text("Status"), value: language.text(receipt.status))
                            .accessibilityIdentifier("lab-trial-receipt-status-row")
                        LabInfoRow(label: language.text("Trial ID"), value: receipt.id)
                    }
                }
                if let active = store.active(task) {
                    Section(language.text("Active trial")) {
                        LabInfoRow(label: language.text("Model"), value: active.model)
                            .accessibilityIdentifier("lab-trial-active-model")
                        LabInfoRow(label: language.text("Prompt preset"), value: presetName(active.prompt_preset))
                        LabInfoRow(label: language.text("Expires at"), value: displayDate(active.expires_at))
                        LabInfoRow(label: language.text("Test question"), value: active.observation_plan.question)
                        LabInfoRow(label: language.text("Sample unit"), value: language.text("One unique product request"))
                        LabInfoRow(label: language.text("Minimum sample target"), value: "\(active.observation_plan.minimum_samples)")
                        LabInfoRow(label: language.text("Guardrail"), value: String(format:
                            language.text("Stop after %lld fallback or failure outcomes"),
                            Int64(active.observation_plan.stop_after_adverse_outcomes)))
                        LabInfoRow(label: language.text("Prompt revision"), value: active.prompt_revision)
                    }
                }
                let observations = configuration.observations.filter { $0.task == task }
                let summaries = configuration.summaries.filter { summary in
                    configuration.trials.first(where: { $0.id == summary.trial_id })?.task == task
                }
                if let summary = summaries.first {
                    Section(language.text("Observation window")) {
                        LabInfoRow(label: language.text("Independent samples"), value: "\(summary.samples)")
                            .accessibilityIdentifier("lab-trial-summary-samples")
                        LabInfoRow(label: language.text("Used in product"), value: "\(summary.accepted)")
                        LabInfoRow(label: language.text("Fallback"), value: "\(summary.fallback)")
                        LabInfoRow(label: language.text("Product failed"), value: "\(summary.product_failed)")
                        LabInfoRow(label: language.text("Outcome unknown"), value: "\(summary.unverified)")
                        Label(summaryName(summary.evidence_state), systemImage:
                            summary.evidence_state == "guardrail_stopped" ? "exclamationmark.octagon" : "chart.bar.doc.horizontal")
                            .foregroundStyle(summary.evidence_state == "guardrail_stopped" ? Color.tsVermilion : Color.tsInk)
                            .accessibilityIdentifier("lab-trial-summary-state")
                        Text(language.text("These are descriptive observations from one opt-in session. Lab does not report a winner or causal improvement."))
                            .font(.footnote).foregroundStyle(Color.tsMutedInk)
                            .accessibilityIdentifier("lab-trial-no-causal-claim")
                    }
                }
                Section(language.text("Actual task execution")) {
                    if observations.isEmpty {
                        Text(language.text("No execution has been reported. Return to the product and run this task, then refresh here."))
                    }
                    ForEach(observations.prefix(5)) { item in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(language.text(item.measurement.execution == "local_only" ? "Completed locally without a model call" : item.measurement.execution == "remote" ? "Observed model execution" : "Execution could not be verified"))
                                .font(.headline)
                            LabInfoRow(label: language.text("Requested model"), value: item.measurement.requested_model)
                            LabInfoRow(label: language.text("Actual model"), value: item.measurement.actual_model ?? language.text("Not reported"))
                            LabInfoRow(label: language.text("Provider status"), value: language.text(item.measurement.status))
                            LabInfoRow(label: language.text("Product result"), value: outcomeName(item.product_outcome))
                            LabInfoRow(label: language.text("Duration"), value: "\(item.measurement.duration_ms) ms")
                            LabInfoRow(label: language.text("Actual prompt revision"), value: item.measurement.actual_prompt_revision ?? language.text("Not reported"))
                            if let failure = item.measurement.error_code { Text(failure).font(.caption).foregroundStyle(Color.tsVermilion) }
                        }.accessibilityIdentifier("lab-trial-observation-\(item.id)")
                    }
                }
                Section(language.text("Task configuration")) {
                    Picker(language.text("Task"), selection: $task) {
                        ForEach(configuration.tasks) { value in Text(taskName(value.id)).tag(value.id) }
                    }.accessibilityIdentifier("lab-trial-task")
                    LabInfoRow(label: language.text("Default model"), value: capability?.default_model ?? language.text("Not available"))
                    if capability?.models.isEmpty == false {
                        Picker(language.text("Model"), selection: $model) {
                            ForEach(capability?.models ?? []) { value in Text(value.id).tag(value.id) }
                        }.accessibilityIdentifier("lab-trial-model")
                        Picker(language.text("Prompt preset"), selection: $preset) {
                            ForEach(presets, id: \.self) { value in Text(presetName(value)).tag(value) }
                        }.accessibilityIdentifier("lab-trial-preset")
                        Picker(language.text("Trial duration"), selection: $minutes) {
                            ForEach([5, 15, 30, 60], id: \.self) { value in Text(String(format: language.text("%lld min"), Int64(value))).tag(value) }
                        }
                        TextField(language.text("Test question"), text: $question, axis: .vertical)
                            .lineLimit(2...4)
                            .onChange(of: question) { value in
                                if value.count > 240 { question = String(value.prefix(240)) }
                            }
                            .accessibilityIdentifier("lab-trial-question")
                        Picker(language.text("Independent sample target"), selection: $minimumSamples) {
                            ForEach([3, 5, 10, 20], id: \.self) { value in
                                Text(String(format: language.text("%lld unique tasks"), Int64(value))).tag(value)
                            }
                        }
                        Picker(language.text("Automatic stop guardrail"), selection: $stopAfterAdverse) {
                            ForEach([1, 2, 3], id: \.self) { value in
                                Text(String(format: language.text("%lld fallback or failure outcomes"), Int64(value))).tag(value)
                            }
                        }
                        LabInfoRow(label: language.text("Success signal"), value: language.text("Product used the selected configuration"))
                        LabInfoRow(label: language.text("Rollback"), value: language.text("Default configuration for new tasks"))
                    } else {
                        Text(language.text("No admitted model is available for this task. Ask the backend operator to configure this capability."))
                    }
                }
            } else if store.service == nil {
                Text(language.text("Sign in to a configured internal backend to try task models."))
            }
            Section {
                if store.isWorking { ProgressView() }
                if let error = store.error { Text(language.text(error)).foregroundStyle(Color.tsVermilion).font(.footnote) }
                Button(language.text("Refresh configuration")) { Task { await store.load(); reconcileSelection() } }
                    .disabled(store.isWorking || store.service == nil)
                    .accessibilityIdentifier("lab-trial-refresh")
                if store.canRetry {
                    Button(language.text("Retry the saved configuration request")) { Task { await store.retry() } }
                }
                if let checkedAt = store.checkedAt {
                    LabInfoRow(label: language.text("Last verified"), value: checkedAt.formatted())
                }
            }
        }
        .navigationTitle(language.text("Models & session trials"))
        .safeAreaInset(edge: .bottom) {
            if store.configuration != nil, capability?.models.isEmpty == false {
                VStack(spacing: 8) {
                    if let receipt = store.receipt, receipt.status != "active" {
                        Label(language.text("Default configuration restored"), systemImage: "checkmark.circle.fill")
                            .font(.footnote.weight(.semibold)).foregroundStyle(Color.tsInk)
                            .accessibilityIdentifier("lab-trial-receipt-status")
                    }
                    HStack(spacing: 12) {
                        Button {
                            selectedTrial = (task, model, preset, minutes, question,
                                minimumSamples, stopAfterAdverse); confirmStart = true
                        } label: {
                            Text(language.text("Start session trial")).frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(store.isWorking || store.pending != nil || !presets.contains(preset)
                            || question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("lab-trial-start")
                        if let active = store.active(task) {
                            Button(language.text("Return to default"), role: .destructive) { stopping = active }
                                .buttonStyle(.bordered)
                                .disabled(store.isWorking || store.pending != nil)
                                .accessibilityIdentifier("lab-trial-stop")
                        }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(.bar)
            }
        }
        .onAppear {
            if question.isEmpty {
                question = language.text("Does this configuration complete normal product tasks without fallback?")
            }
        }
        .onChange(of: task) { _ in reconcileSelection() }
        .onChange(of: model) { _ in if !presets.contains(preset) { preset = presets.first ?? "baseline" } }
        .task {
            while !Task.isCancelled {
                if !confirmStart && stopping == nil { await store.load(); reconcileSelection() }
                do { try await Task.sleep(nanoseconds: 15_000_000_000) } catch { return }
            }
        }
        .refreshable { await store.load(); reconcileSelection() }
        .confirmationDialog(language.text("Apply this configuration to this sign-in?"), isPresented: $confirmStart, titleVisibility: .visible) {
            Button(language.text("Start trial")) {
                if let selectedTrial { Task { await store.start(task: selectedTrial.task,
                    model: selectedTrial.model, preset: selectedTrial.preset, minutes: selectedTrial.minutes,
                    question: selectedTrial.question, minimumSamples: selectedTrial.minimumSamples,
                    stopAfterAdverse: selectedTrial.stopAfterAdverse) } }
            }
                .accessibilityIdentifier("lab-trial-confirm-start")
        } message: {
            if let selectedTrial {
                Text([taskName(selectedTrial.task), selectedTrial.model, presetName(selectedTrial.preset),
                    String(format: language.text("%lld min"), Int64(selectedTrial.minutes)),
                    selectedTrial.question,
                    String(format: language.text("At least %lld unique product requests"), Int64(selectedTrial.minimumSamples)),
                    String(format: language.text("Automatically stop after %lld fallback or failure outcomes"), Int64(selectedTrial.stopAfterAdverse)),
                    language.text("New tasks use the selected model and prompt until expiry. Existing tasks keep their original configuration. Normal model charges may apply when you run a task.")].joined(separator: "\n"))
            }
        }
        .confirmationDialog(language.text("Return new tasks to the default configuration?"), isPresented: Binding(get: { stopping != nil }, set: { if !$0 { stopping = nil } }), titleVisibility: .visible) {
            if let stopping {
                Button(language.text("Stop trial"), role: .destructive) { Task { await store.stop(stopping); self.stopping = nil } }
                    .accessibilityIdentifier("lab-trial-confirm-stop")
            }
        }
    }
    private func reconcileSelection() {
        if capability?.models.contains(where: { $0.id == model }) != true { model = capability?.models.first?.id ?? "" }
        if !presets.contains(preset) { preset = presets.first ?? "baseline" }
    }
    private func displayDate(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value) else { return value }
        return date.formatted(.dateTime.month().day().hour().minute().locale(language.locale))
    }
    private func outcomeName(_ outcome: String?) -> String {
        language.text(["accepted": "Used in the product", "fallback": "Product used a fallback",
            "product_failed": "Product task failed", "unverified": "Not verified"][outcome ?? "unverified"] ?? "Not verified")
    }
    private func summaryName(_ state: String) -> String {
        language.text(["collecting": "Collecting independent samples",
            "minimum_reached": "Descriptive sample target reached",
            "outcomes_incomplete": "Some product outcomes are unknown",
            "ended_below_minimum": "Window ended below the sample target",
            "guardrail_stopped": "Guardrail stopped the trial and restored the default"][state] ?? state)
    }
    private func taskName(_ id: String) -> String {
        language.text(["relationship_text": "Relationship answers", "relationship_image": "Image understanding", "unscoped_chat": "Workspace conversation"][id] ?? id)
    }
    private func presetName(_ id: String) -> String {
        language.text(["baseline": "Current baseline", "concise": "Concise answer", "evidence_first": "Evidence first"][id] ?? id)
    }
}
