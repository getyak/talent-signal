import SwiftUI

@MainActor
struct LabExperimentView: View {
    @ObservedObject var store: LabExperimentStore
    @Environment(\.appLanguage) private var appLanguage
    @State private var caseID = ""
    @State private var modelA = ""
    @State private var modelB = ""
    @State private var confirmsRun = false

    var body: some View {
        List {
            Section {
                Text(appLanguage.text("Compare the answers you would actually review in the product."))
                    .font(.headline)
                Text(appLanguage.text("Synthetic evidence · Real model calls · No business writes"))
                    .font(.footnote).foregroundStyle(Color.tsMutedInk)
            }
            if let catalog = store.catalog {
                configuration(catalog)
            } else {
                Section {
                    Text(appLanguage.text("Connect an internal backend"))
                        .font(.headline)
                    Text(appLanguage.text("Sign in to a configured internal backend to inspect remote requests."))
                    Button(appLanguage.text("Try again")) { Task { await store.load() } }
                        .disabled(store.isWorking || store.service == nil)
                }
            }
            if store.isWorking { ProgressView().accessibilityLabel(appLanguage.text("Loading")) }
            if let error = store.error {
                Section {
                    Text(error).font(.footnote).foregroundStyle(Color.tsVermilion)
                    Button(appLanguage.text("Check saved run")) { Task { await store.refreshRun() } }
                        .disabled(store.isWorking)
                    if store.canResubmit {
                        Button(appLanguage.text("Retry the same experiment")) { Task { await store.retryUnacceptedRequest() } }
                            .disabled(store.isWorking)
                    }
                } footer: { Text(appLanguage.text("A lost response does not start another paid run. Check the saved experiment first.")) }
            }
            if let record = store.record { results(record) }
            if let history = store.catalog?.experiments, !history.isEmpty {
                Section(appLanguage.text("Recent experiments")) {
                    ForEach(history) { record in
                        Button { store.select(record) } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(store.catalog?.cases.first(where: { $0.id == record.case_id })?.title ?? record.case_id)
                                Text(verbatim: "\(record.models.joined(separator: " / ")) · \(appLanguage.text(record.status))")
                                    .font(.caption).foregroundStyle(Color.tsMutedInk)
                            }
                        }
                        .disabled(store.pendingRequest != nil)
                    }
                }
            }
        }
        .navigationTitle(appLanguage.text("AI experiments"))
        .onAppear { selectDefaults() }
        .onChange(of: store.catalog?.models) { _ in selectDefaults() }
        .task(id: store.record?.id) {
            while !Task.isCancelled, store.record?.status == "running" {
                do { try await Task.sleep(nanoseconds: 2_000_000_000) }
                catch { return }
                await store.refreshRun()
                if store.error != nil { return }
            }
        }
        .confirmationDialog(appLanguage.text("Run two real model calls?"), isPresented: $confirmsRun, titleVisibility: .visible) {
            Button(appLanguage.text("Run comparison")) {
                Task { await store.start(caseID: caseID, models: [modelA, modelB]) }
            }
            .accessibilityIdentifier("lab-experiment-confirm")
        } message: {
            Text(appLanguage.text("Only the selected synthetic case is sent. Each call allows up to 1,600 output tokens. Provider charges may apply; price information is unavailable. Results are kept for seven days."))
        }
    }

    private func selectDefaults() {
        guard let catalog = store.catalog else { return }
        if !catalog.cases.contains(where: { $0.id == caseID }) { caseID = catalog.cases.first?.id ?? "" }
        if !catalog.models.contains(modelA) { modelA = catalog.models.first ?? "" }
        if !catalog.models.contains(modelB) { modelB = catalog.models.dropFirst().first ?? modelA }
    }

    private func configuration(_ catalog: LabExperimentCatalog) -> some View {
        Section {
            Picker(appLanguage.text("Test case"), selection: $caseID) {
                ForEach(catalog.cases) { item in Text(item.title).tag(item.id) }
            }
            if let selected = catalog.cases.first(where: { $0.id == caseID }) {
                DisclosureGroup(appLanguage.text("Inspect input & expected behavior")) {
                    Text(selected.input).font(.footnote).textSelection(.enabled)
                    Text(selected.expected).font(.footnote.weight(.medium)).padding(.top, 6)
                }
            }
            Picker(appLanguage.text("Configuration A"), selection: $modelA) {
                ForEach(catalog.models, id: \.self) { Text($0).tag($0) }
            }
            Picker(appLanguage.text("Configuration B"), selection: $modelB) {
                ForEach(catalog.models, id: \.self) { Text($0).tag($0) }
            }
            if !catalog.enabled {
                Text(appLanguage.text("No model is configured. Device tools and deterministic examples remain available."))
            } else if modelA == modelB {
                Text(appLanguage.text("The same model is selected twice. This checks repeatability, not a model upgrade."))
                    .font(.footnote).foregroundStyle(Color.tsMutedInk)
            }
            Button { confirmsRun = true } label: {
                Label(appLanguage.text("Run comparison"), systemImage: "play.fill")
                    .frame(minHeight: 44)
            }
            .disabled(!catalog.enabled || modelA.isEmpty || modelB.isEmpty || store.isWorking || store.pendingRequest != nil || store.record?.status == "running")
            .accessibilityIdentifier("lab-experiment-run")
        } header: { Text(appLanguage.text("ONE CASE · TWO CONFIGURATIONS")) }
    }

    @ViewBuilder
    private func results(_ record: LabExperimentRecord) -> some View {
        Section {
            LabInfoRow(label: appLanguage.text("Test case"),
                       value: store.catalog?.cases.first(where: { $0.id == record.case_id })?.title ?? record.case_id)
            LabInfoRow(label: appLanguage.text("Status"), value: appLanguage.text(record.status))
            if record.status == "running" {
                ProgressView(appLanguage.text("Running on the server. You can leave this screen."))
            }
            if record.status == "unknown" {
                Text(appLanguage.text("The server could not verify completion. A provider call may have been charged. This run will not restart automatically."))
            }
            Text(appLanguage.text("Read both answers against the evidence. Successful execution is not a quality verdict."))
                .font(.footnote).foregroundStyle(Color.tsMutedInk)
        } header: { Text(appLanguage.text("RESULTS")) }

        ForEach(Array(record.results.enumerated()), id: \.offset) { index, result in
            Section(index == 0 ? appLanguage.text("Configuration A") : appLanguage.text("Configuration B")) {
                LabInfoRow(label: appLanguage.text("Actual model"), value: result.model)
                if let title = result.title { Text(title).font(.headline) }
                if let answer = result.answer { Text(answer).textSelection(.enabled) }
                if result.status == "failed" {
                    Label(appLanguage.text("Provider request failed or output could not be verified"), systemImage: "exclamationmark.triangle")
                }
                LabInfoRow(label: appLanguage.text("Provider time"), value: String(format: "%.2f s", Double(result.duration_ms) / 1000))
                LabInfoRow(label: appLanguage.text("Tokens in / out"), value: result.input_tokens.flatMap { input in
                    result.output_tokens.map { "\(input) / \($0)" }
                } ?? appLanguage.text("Not reported"))
                DisclosureGroup(appLanguage.text("Run evidence")) {
                    LabInfoRow(label: appLanguage.text("Citations"), value: result.citation_ids.joined(separator: "\n"))
                    LabInfoRow(label: appLanguage.text("Provider request"), value: result.provider_request_id ?? appLanguage.text("Not reported"))
                }
            }
        }
        if record.status != "running" {
            Section {
                LabInfoRow(label: appLanguage.text("Your review"), value: appLanguage.text(record.review))
                    .accessibilityIdentifier("lab-experiment-review-value")
                Button(appLanguage.text("A is more useful")) { Task { await store.review("a") } }
                    .disabled(record.results.first?.status != "completed")
                Button(appLanguage.text("B is more useful")) { Task { await store.review("b") } }
                    .disabled(record.results.count != 2 || record.results.last?.status != "completed")
                Button(appLanguage.text("About the same")) { Task { await store.review("tie") } }
                    .disabled(record.status != "completed")
                Button(appLanguage.text("Save for correction")) { Task { await store.review("needs_review") } }
                    .accessibilityIdentifier("lab-experiment-save-review")
            } header: { Text(appLanguage.text("HUMAN REVIEW")) }
            footer: { Text(appLanguage.text("Your review is saved with this experiment. It does not change the product model or activate a release gate.")) }
            .disabled(store.isWorking)
        }
        Section {
            DisclosureGroup(appLanguage.text("Frozen configuration")) {
                LabInfoRow(label: appLanguage.text("Experiment"), value: record.id)
                LabInfoRow(label: appLanguage.text("Snapshot"), value: record.snapshot_hash)
                LabInfoRow(label: appLanguage.text("Prompt revision"), value: record.prompt_version)
                LabInfoRow(label: appLanguage.text("Backend revision"), value: record.backend_revision ?? appLanguage.text("Not reported"))
                LabInfoRow(label: appLanguage.text("Expires"), value: record.expires_at)
                Text(appLanguage.text("Cost unavailable · Up to two provider calls · Zero business writes"))
                    .font(.footnote)
            }
        }
    }
}
