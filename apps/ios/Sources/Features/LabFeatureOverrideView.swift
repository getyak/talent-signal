import SwiftUI

struct LabFeatureOverrideView: View {
    @ObservedObject var store: LabFeatureOverrideStore
    @Environment(\.appLanguage) private var language
    @State private var value = "inline_excerpt"
    @State private var minutes = 15
    @State private var confirmsStart = false
    @State private var stopping: LabFeatureOverride?

    private let featureID = "relationship_evidence_preview"
    private var feature: LabFeatureCatalogEntry? { store.configuration?.features.first { $0.id == featureID } }
    private var active: LabFeatureOverride? { store.active(featureID) }

    var body: some View {
        List {
            Section {
                Text(language.text("Try a named product presentation change in normal relationship answers. It applies only to this sign-in and expires automatically."))
                Text(language.text("The experiment never removes evidence checks, changes confirmed state, or authorizes an action."))
                    .font(.footnote).foregroundStyle(Color.tsMutedInk)
            }

            if let feature {
                Section(language.text("Effective configuration")) {
                    LabInfoRow(label: language.text("Server value"), value: valueName(feature.server_value))
                    LabInfoRow(label: language.text("This sign-in override"), value: active.map { valueName($0.override_value) } ?? language.text("None"))
                    LabInfoRow(label: language.text("Actually effective"), value: valueName(active?.effective_value ?? feature.server_value))
                        .accessibilityIdentifier("lab-feature-effective-value")
                    if let active {
                        LabInfoRow(label: language.text("Expires at"), value: displayDate(active.expires_at))
                        LabInfoRow(label: language.text("Override ID"), value: active.id)
                    }
                }

                Section(language.text("Experiment")) {
                    Text(language.text(feature.summary)).font(.subheadline)
                    Picker(language.text("Evidence preview"), selection: $value) {
                        ForEach(feature.allowed_values.filter { $0 != feature.server_value }, id: \.self) {
                            Text(valueName($0)).tag($0)
                        }
                    }
                    Picker(language.text("Duration"), selection: $minutes) {
                        ForEach([5, 15, 30, 60], id: \.self) {
                            Text(String(format: language.text("%lld min"), Int64($0))).tag($0)
                        }
                    }
                    LabInfoRow(label: language.text("Required product capability"), value: language.text("Reviewed relationship citations"))
                    LabInfoRow(label: language.text("Definition revision"), value: feature.definition_revision)
                    Text(language.text(feature.safety_boundary)).font(.footnote).foregroundStyle(Color.tsMutedInk)
                }
            } else if store.service == nil {
                Text(language.text("Sign in to a configured internal backend to try feature overrides."))
            }

            if let receipt = store.receipt {
                Section(language.text("Latest receipt")) {
                    LabInfoRow(label: language.text("Status"), value: statusName(receipt))
                    LabInfoRow(label: language.text("Recorded override value"), value: valueName(receipt.effective_value))
                }
            }

            Section {
                if store.isWorking { ProgressView() }
                if let error = store.error { Text(language.text(error)).font(.footnote).foregroundStyle(Color.tsVermilion) }
                Button(language.text("Refresh effective value")) { Task { await store.load() } }
                    .disabled(store.isWorking || store.service == nil)
                    .accessibilityIdentifier("lab-feature-refresh")
                if store.canRetry {
                    Button(language.text("Retry the saved feature change")) { Task { await store.retry() } }
                }
                if let checkedAt = store.checkedAt {
                    LabInfoRow(label: language.text("Last verified"), value: checkedAt.formatted())
                }
            }
        }
        .id(active?.id ?? "server-default")
        .navigationTitle(language.text("Feature overrides"))
        .safeAreaInset(edge: .bottom) {
            if feature != nil {
                HStack(spacing: 12) {
                    Button(language.text(active == nil ? "Apply to this sign-in" : "Replace override")) { confirmsStart = true }
                        .buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
                        .disabled(store.isWorking || store.pending != nil)
                        .accessibilityIdentifier("lab-feature-start")
                    if let active {
                        Button(language.text("Return to server value"), role: .destructive) { stopping = active }
                            .buttonStyle(.bordered).disabled(store.isWorking || store.pending != nil)
                            .accessibilityIdentifier("lab-feature-stop")
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 10).background(.bar)
            }
        }
        .task {
            while !Task.isCancelled {
                if !confirmsStart && stopping == nil { await store.load() }
                do { try await Task.sleep(nanoseconds: 15_000_000_000) } catch { return }
            }
        }
        .refreshable { await store.load() }
        .confirmationDialog(language.text("Apply this feature value to new relationship answers?"), isPresented: $confirmsStart, titleVisibility: .visible) {
            Button(language.text("Apply override")) { Task { await store.start(featureID: featureID, value: value, minutes: minutes) } }
                .accessibilityIdentifier("lab-feature-confirm-start")
        } message: {
            Text(language.text("New answers in this sign-in will show reviewed exact evidence excerpts inline until the override expires. Existing answers keep their original receipt."))
        }
        .confirmationDialog(language.text("Return new answers to the server value?"), isPresented: Binding(get: { stopping != nil }, set: { if !$0 { stopping = nil } }), titleVisibility: .visible) {
            if let stopping {
                Button(language.text("Stop override"), role: .destructive) { Task { await store.stop(stopping); self.stopping = nil } }
                    .accessibilityIdentifier("lab-feature-confirm-stop")
            }
        }
    }

    private func valueName(_ value: String) -> String {
        language.text(["source_only": "Source card only", "inline_excerpt": "Source with exact excerpt"][value] ?? value)
    }
    private func statusName(_ value: LabFeatureOverride) -> String {
        if value.status == "stopped", value.stop_reason == "configuration_changed" { return language.text("Stopped after configuration changed") }
        return language.text(value.status)
    }
    private func displayDate(_ value: String) -> String {
        let detailed = ISO8601DateFormatter(); detailed.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = detailed.date(from: value) ?? ISO8601DateFormatter().date(from: value) else { return value }
        return date.formatted(.dateTime.month().day().hour().minute().locale(language.locale))
    }
}
