import SwiftUI

struct LabEnvironmentView: View {
    @ObservedObject var runtime: LabRuntimeStore
    @Environment(\.appLanguage) private var language
    @State private var blockingWork = 0
    @State private var confirm = false
    var body: some View {
        List {
            Section {
                Text(language.text("Choose an already deployed backend. Your drafts and pending operations stay with their original environment."))
                LabInfoRow(label: language.text("Current environment"), value: runtime.current.map { language.text($0.name) } ?? language.text("Not connected"))
                    .accessibilityIdentifier("lab-current-environment")
                    .accessibilityValue(runtime.current?.id ?? "unconfigured")
                if blockingWork > 0 {
                    Text(language.text("Finish active requests or recording before switching."))
                }
            }
            Section(language.text("Approved environments")) {
                ForEach(runtime.directory.profiles) { profile in
                    Button { Task { await runtime.inspect(profile) } } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(language.text(profile.name)).font(.headline)
                            Text(profile.endpoint.absoluteString).font(.footnote).foregroundStyle(Color.tsMutedInk)
                        }.frame(minHeight: 44)
                    }
                    .disabled(runtime.isWorking)
                    .accessibilityIdentifier("lab-environment-\(profile.id)")
                }
                if runtime.directory.profiles.count < 2 {
                    Text(language.text("Additional targets must be included in this internal build's approved directory."))
                        .font(.footnote)
                }
            }
            if runtime.isWorking { ProgressView(language.text("Verifying environment")) }
            if let error = runtime.error { Text(language.text(error)).foregroundStyle(Color.tsVermilion).font(.footnote) }
            if let target = runtime.verified {
                Section(language.text("Verified target")) {
                    LabInfoRow(label: language.text("Backend revision"), value: target.manifest.revision ?? language.text("Not reported"))
                    LabInfoRow(label: language.text("Deployment"), value: target.manifest.deployment_id ?? language.text("Not reported"))
                    LabInfoRow(label: language.text("Data domain"), value: target.manifest.data_domain)
                    LabInfoRow(label: language.text("Last verified"), value: target.checkedAt.formatted())
                    Button(language.text("Switch to this environment")) { confirm = true }
                        .disabled(runtime.isWorking || blockingWork > 0)
                        .accessibilityIdentifier("lab-environment-switch")
                }
            }
            if let receipt = runtime.receipt {
                Section(language.text("Last switch")) {
                    LabInfoRow(label: language.text("Environment"), value: receipt.from + " → " + receipt.to)
                    LabInfoRow(label: language.text("Deployment"), value: receipt.deploymentID)
                    Text(language.text(receipt.requiresSignIn ? "Target selected. Sign in to verify its workspace." : "Target workspace verified."))
                }
            }
        }
        .navigationTitle(language.text("Environment & version"))
        .task {
            while !Task.isCancelled {
                blockingWork = runtime.blockingWork
                do { try await Task.sleep(nanoseconds: 300_000_000) } catch { return }
            }
        }
        .confirmationDialog(language.text("Switch runtime environment?"), isPresented: $confirm, titleVisibility: .visible) {
            Button(language.text("Switch environment")) { Task { await runtime.activateVerifiedTarget() } }
                .accessibilityIdentifier("lab-environment-confirm")
        } message: {
            Text(language.text("The app will close this workspace and use the target's separate sign-in. Saved sources and recovery records are preserved in their original scope. No data is copied to the target."))
        }
    }
}
