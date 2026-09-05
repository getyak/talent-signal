import SwiftUI

struct LabCIView: View {
    let id: String
    @ObservedObject var regressions: LabRegressionStore
    @ObservedObject var store: LabCIStore
    @Environment(\.appLanguage) private var language
    @State private var jobID = ""
    @State private var runInput = ""
    @FocusState private var editingRun: Bool
    private var record: LabRegressionRecord? { regressions.record?.id == id ? regressions.record : nil }
    var body: some View {
        Form {
            Section {
                Text(language.text("Verify that CI checked this exact case and rerun."))
                Text(language.text("This reads an existing GitHub run. It does not run a model or change a release rule."))
                    .font(.footnote).foregroundStyle(Color.tsMutedInk)
            }
            if let record {
                Section(language.text("Check a CI run")) {
                    if record.ci?.available == true, let repository = record.ci?.repository {
                        LabInfoRow(label: language.text("Trusted repository"), value: repository)
                        Picker(language.text("Product rerun"), selection: $jobID) {
                            Text(language.text("Choose a completed rerun")).tag("")
                            ForEach(record.reruns.filter { ["completed", "failed", "cancelled", "partial", "unknown"].contains($0.status) }) { run in
                                Text(verbatim: runTitle(run)).tag(run.id)
                            }
                        }.accessibilityIdentifier("lab-ci-rerun")
                        if let selected = record.reruns.first(where: { $0.id == jobID }) {
                            LabInfoRow(label: language.text("Selected product rerun"), value: "\(LabJobCopy.text(selected.status, language))\n\(selected.id)")
                                .accessibilityIdentifier("lab-ci-selected-run")
                        }
                        TextField(language.text("GitHub run URL or ID"), text: $runInput)
                            .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                            .focused($editingRun).submitLabel(.done).onSubmit { editingRun = false }
                            .accessibilityIdentifier("lab-ci-run-input")
                        Button(language.text("Verify CI record")) {
                            editingRun = false
                            if let runID = LabCIInput.runID(runInput, repository: repository) {
                                Task { await store.verify(record: record, jobID: jobID, runID: runID); await regressions.load() }
                            }
                        }.disabled(store.isWorking || store.pending != nil || jobID.isEmpty || LabCIInput.runID(runInput, repository: repository) == nil)
                            .accessibilityIdentifier("lab-ci-verify")
                    } else {
                        Text(language.text("CI verification is not configured for this backend."))
                        Text(language.text("An operator must connect a trusted workflow and read-only GitHub access before verification is available."))
                            .font(.footnote).foregroundStyle(Color.tsMutedInk)
                    }
                }.disabled(store.isWorking)
                if let latest = record.ci?.latest {
                    Section(language.text("Last verification")) {
                        Text(language.text(latest.state == "verified" ? "CI record verified" : "CI record not verified"))
                            .accessibilityIdentifier("lab-ci-receipt-status")
                        if latest.state == "verified" {
                            Text(language.text(latest.integrity == "pass" ? "Recorded integrity checks passed" : "Recorded integrity checks need attention"))
                                .accessibilityIdentifier("lab-ci-integrity")
                            Text(language.text("Output quality still needs review. Release enforcement is not verified."))
                                .font(.footnote).foregroundStyle(Color.tsMutedInk)
                        } else { Text(language.text(LabCICopy.reason(latest.reason_code))).font(.footnote) }
                        LabInfoRow(label: language.text("Checked"), value: latest.checked_at)
                        TimelineView(.periodic(from: .now, by: 30)) { context in
                            if record.release_check == "ci_needs_refresh" || (LabCIInput.date(latest.valid_until) ?? .distantPast) <= context.date {
                                Text(language.text("Refresh verification before relying on this record."))
                                    .font(.footnote).accessibilityIdentifier("lab-ci-needs-refresh")
                            }
                        }
                        if let url = latest.runURL { Link(language.text("Open GitHub run"), destination: url) }
                        DisclosureGroup(language.text("Verification details")) {
                            LabInfoRow(label: language.text("Product rerun"), value: latest.job_id)
                            LabInfoRow(label: language.text("CI source revision"), value: latest.source_revision ?? language.text("Not reported"))
                            LabInfoRow(label: language.text("Product source revision"), value: latest.backend_revision ?? language.text("Not reported"))
                            LabInfoRow(label: language.text("Run attempt"), value: latest.github_run_attempt.map(String.init) ?? language.text("Not reported"))
                            LabInfoRow(label: language.text("Workflow result"), value: latest.workflow_conclusion.map { LabCICopy.conclusion($0, language) } ?? language.text("Not reported"))
                            LabInfoRow(label: language.text("Backend job result"), value: latest.job_conclusion.map { LabCICopy.conclusion($0, language) } ?? language.text("Not reported"))
                            LabInfoRow(label: language.text("Report fingerprint"), value: latest.report_digest ?? language.text("Not reported"))
                            Text(language.text("Verification expires within 15 minutes. A new CI attempt, changed trust settings, expired report or deleted source requires another check."))
                                .font(.footnote).foregroundStyle(Color.tsMutedInk)
                        }
                    }
                }
            }
            Section {
                if store.isWorking { ProgressView(language.text("Checking CI evidence…")) }
                if let pending = store.pending {
                    Text(language.text("A CI verification request needs readback."))
                    LabInfoRow(label: language.text("Saved case"), value: pending.regressionID)
                    Button(language.text("Recover CI verification")) { Task { await store.recover(); await regressions.load() } }
                        .disabled(store.isWorking).accessibilityIdentifier("lab-ci-recover")
                    if store.canRetry {
                        Button(language.text("Retry the same verification")) { Task { await store.retry(); await regressions.load() } }
                            .disabled(store.isWorking).accessibilityIdentifier("lab-ci-retry")
                    }
                    Button(language.text("Dismiss pending verification")) { store.dismissPending() }.disabled(store.isWorking)
                }
                if let error = store.error { Text(language.text(error)).font(.footnote).foregroundStyle(Color.tsVermilion) }
                Button(language.text("Refresh saved case")) { Task { await store.recover(); await regressions.load() } }
                    .disabled(store.isWorking || regressions.isWorking).accessibilityIdentifier("lab-ci-refresh")
            }
        }.navigationTitle(language.text("CI verification"))
        .task {
            await store.recover(); await regressions.select(id)
            if jobID.isEmpty { jobID = record?.reruns.first(where: { ["completed", "failed", "cancelled", "partial", "unknown"].contains($0.status) })?.id ?? "" }
        }
    }
    private func runTitle(_ run: LabJobSummary) -> String {
        let time = LabCIInput.date(run.created_at)?.formatted(.dateTime.month(.twoDigits).day(.twoDigits).hour().minute().locale(language.locale)) ?? language.text("Not reported")
        return "\(time) · \(run.id.prefix(8))"
    }
}

enum LabCICopy {
    static func status(_ value: String) -> String {
        switch value {
        case "ci_verified": "CI record verified"
        case "ci_needs_refresh": "CI verification needs refresh"
        default: "No verified CI record"
        }
    }
    static func conclusion(_ value: String, _ language: AppLanguage) -> String {
        language.text(value == "success" ? "Passed" : "Failed")
    }
    static func reason(_ value: String) -> String {
        switch value {
        case "LAB_CI_WORKFLOW_CHANGED", "LAB_CI_WORKFLOW_NOT_TRUSTED", "LAB_CI_REPOSITORY_MISMATCH": "This run does not match the configured trusted workflow."
        case "LAB_CI_RUN_INCOMPLETE", "LAB_CI_JOB_INCOMPLETE", "LAB_CI_STEP_NOT_EXECUTED", "LAB_CI_STEP_NOT_FOUND", "LAB_CI_JOB_NOT_FOUND": "The required CI check did not complete in this run."
        case "LAB_CI_ARTIFACT_NOT_FOUND", "LAB_CI_ARTIFACT_INVALID", "LAB_CI_EVIDENCE_EXPIRED", "LAB_CI_EVIDENCE_CHANGED": "The CI report is missing, expired or changed. Check the latest run."
        case "LAB_CI_REPORT_CONTENT_MISMATCH", "LAB_CI_REPORT_REVISION_MISMATCH", "LAB_CI_ARTIFACT_HASH_MISMATCH", "LAB_CI_GATE_CONCLUSION_MISMATCH": "The CI report could not be matched to this exact case and rerun."
        default: "CI evidence could not be verified. Refresh or check the workflow configuration."
        }
    }
}
