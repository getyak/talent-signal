import SwiftUI
import UIKit

struct LabResetView: View {
    private struct ReviewedPlan: Identifiable {
        let id = UUID()
        let context: LabResetContext
        let actions: [LabResetAction]
        var pendingID: UUID?
    }
    @ObservedObject private var store: LabResetStore
    @Environment(\.appLanguage) private var language
    @Environment(\.labRuntime) private var runtime
    @Environment(\.labDisplayStore) private var display
    let refreshWorkspace: (() async -> Bool)?
    private let demoOnly: Bool
    private let onboarding: any StandaloneOnboardingPersisting
    init(refreshWorkspace: (() async -> Bool)?, demoOnly: Bool = false,
         onboarding: any StandaloneOnboardingPersisting = FileStandaloneOnboardingStore()) {
        self.refreshWorkspace = refreshWorkspace; self.demoOnly = demoOnly; self.onboarding = onboarding
        _store = ObservedObject(wrappedValue: demoOnly ? .demo : .shared)
        _selection = State(initialValue: demoOnly ? [.demo] : [.networkCache])
    }
    private var actions: [LabResetAction] { demoOnly ? [.demo] : LabResetAction.allCases }
    @State private var selection: Set<LabResetAction> = [.networkCache]
    @State private var reviewedPlan: ReviewedPlan?
    @State private var confirmsStop = false
    private var executor: LabResetExecutor {
        LabResetExecutor(session: demoOnly ? nil : runtime?.sessionStore, display: display, onboarding: onboarding, refreshWorkspace: refreshWorkspace)
    }
    private var accountLabel: String {
        if case let .signedIn(session) = runtime?.sessionStore.phase { return session.account.name }
        return language.text("Not signed in")
    }
    var body: some View {
        ScrollViewReader { reader in
        List {
            Section {
                Text(language.text("Choose what this test needs."))
                    .font(.title2.weight(.semibold))
                Text(language.text("Review the exact scope, run once, and keep a result for each step. An interrupted reset resumes with the same operation ID."))
                    .font(.subheadline).foregroundStyle(Color.tsMutedInk)
            }
            if let error = store.error {
                Section { Text(language.text(error)).foregroundStyle(Color.tsVermilion) }
            }
            if store.unfinished == nil {
                Section(language.text("Select reset steps")) {
                    ForEach(actions) { action in
                        Toggle(isOn: Binding(get: { selection.contains(action) }, set: { if $0 { selection.insert(action) } else { selection.remove(action) } })) {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(language.text(action.title))
                                Text(language.text(action.detail)).font(.caption).foregroundStyle(Color.tsMutedInk)
                                if !available(action) { Text(language.text(unavailable(action))).font(.caption).foregroundStyle(Color.tsMutedInk) }
                            }.padding(.vertical, 3)
                        }
                        .disabled(store.isWorking || !available(action))
                        .accessibilityIdentifier("lab-reset-select-\(action.rawValue)")
                    }
                }
                Section {
                    Button(language.text("Review reset plan")) {
                        reviewedPlan = .init(context: executor.context, actions: actions.filter(selection.contains))
                    }
                    .disabled(store.isWorking || selection.isEmpty || !selection.allSatisfy(available))
                    .accessibilityIdentifier("lab-reset-review")
                }
            }
            if store.isWorking { Section { ProgressView(language.text("Checking reset steps…")) } }
            ForEach(store.operations) { operation in
                Section {
                    Text(operation.startedAt, format: .dateTime.year().month().day().hour().minute())
                        .font(.caption).foregroundStyle(Color.tsMutedInk)
                    Text(operation.id.uuidString.lowercased()).font(.caption.monospaced()).textSelection(.enabled)
                        .accessibilityIdentifier("lab-reset-operation")
                    ForEach(operation.steps) { step in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(language.text(step.action.title))
                            Label(language.text(status(step)), systemImage: step.state == .verified ? "checkmark.circle" : "clock")
                                .font(.caption).foregroundStyle(Color.tsMutedInk)
                            if let remaining = step.remainingCacheBytes {
                                LabInfoRow(label: language.text("Remaining cache"), value: ByteCountFormatter.string(fromByteCount: Int64(remaining), countStyle: .file))
                            }
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("lab-reset-result-\(step.action.rawValue)-\(step.state.rawValue)")
                    }
                    if !operation.closed {
                        Button(language.text("Review and resume this reset")) {
                            reviewedPlan = .init(context: operation.context,
                                actions: operation.steps.filter { $0.state != .verified }.map(\.action), pendingID: operation.id)
                        }.disabled(store.isWorking).accessibilityIdentifier("lab-reset-resume")
                        Button(language.text("Stop remaining reset steps")) { confirmsStop = true }
                            .disabled(store.isWorking)
                            .accessibilityIdentifier("lab-reset-stop")
                    }
                } header: {
                    Text(language.text(operation.complete ? "Reset verified" : operation.stoppedAt != nil ? "Further reset steps stopped" : "Reset needs attention"))
                        .accessibilityIdentifier("lab-reset-operation-status-\(operation.complete ? "verified" : operation.stoppedAt != nil ? "stopped" : "pending")")
                }
                .id(operation.id)
            }
            Section {
                Button(language.text("Refresh reset records")) { store.reload() }.disabled(store.isWorking)
                if let runtime {
                    NavigationLink { LabSessionEndingsView(store: runtime.sessionStore) } label: { Text(language.text("Sign-in & recovery")) }
                }
            } footer: {
                Text(language.text("The trusted environment directory, original captures, account data, drafts and pending operation recovery are preserved. Creating an empty server test workspace is a separate capability."))
            }
        }
        .onChange(of: store.isWorking) { working in
            if !working, let id = store.operations.first?.id { reader.scrollTo(id, anchor: .top) }
        }
        .onChange(of: store.operations.first?.stoppedAt) { _ in
            if let id = store.operations.first?.id { reader.scrollTo(id, anchor: .top) }
        }
        .navigationTitle(language.text(demoOnly ? "Reset Demo Data" : "Restart a device test"))
        .navigationBarTitleDisplayMode(.inline)
        .task { store.reload() }
        .sheet(item: $reviewedPlan) { plan in review(plan) }
        .confirmationDialog(language.text("Stop remaining reset steps?"), isPresented: $confirmsStop, titleVisibility: .visible) {
            Button(language.text("Stop remaining steps")) { if let pending = store.unfinished { store.stopRemaining(pending.id) } }
        } message: {
            Text(language.text("This stops further execution. It does not undo completed steps or mark uncertain results as verified. Any unfinished sign-out remains separately recoverable."))
        }
        }
    }
    private func available(_ action: LabResetAction) -> Bool {
        switch action {
        case .demo: executor.context.demoTarget != nil
        case .display: display != nil
        case .workspace: refreshWorkspace != nil
        case .signOut: executor.context.credentialFingerprint != nil
        default: true
        }
    }
    private func unavailable(_ action: LabResetAction) -> String {
        switch action {
        case .demo: "No unchanged synthetic Demo is saved. Personal captures and edited examples cannot be cleared by this control."
        case .workspace: "Open Lab from a connected workspace to refresh it."
        case .signOut: "There is no signed-in account to close."
        default: "This control requires the app's Lab entry."
        }
    }
    private func status(_ step: LabResetStep) -> String {
        switch step.state {
        case .verified: "Readback verified"
        case .pending: "Not started"
        case .running: store.isWorking ? "Checking…" : "Interrupted; readback needs retry"
        case .needsRetry: "Not fully verified; retry required"
        }
    }
    private func review(_ plan: ReviewedPlan) -> some View {
        let actions = plan.actions
        let target = plan.context
        let runner = executor
        let permissions = LabResetPermissions.current()
        return NavigationStack {
            List {
                if demoOnly {
                    Section(language.text("Local introduction")) {
                        Text(language.text("Only the reviewed synthetic Demo on this device will be reset."))
                    }
                } else { Section(language.text("Current connection")) {
                    LabInfoRow(label: language.text("Backend"), value: runtime?.sessionStore.baseURL?.host ?? language.text("Local preview"))
                    LabInfoRow(label: language.text("Account"), value: accountLabel)
                    if target.ownerScope != runner.context.ownerScope {
                        Text(language.text("This reset belongs to an earlier account. Device steps require that account; an existing sign-out can retry only its original credential."))
                    }
                }
                }
                Section(language.text("Steps to run")) {
                    ForEach(actions) { action in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(language.text(action.title)).font(.headline)
                            Text(language.text(action.detail)).font(.subheadline).foregroundStyle(Color.tsMutedInk)
                        }
                    }
                }
                Section(language.text("Preserved")) {
                    Text(language.text("Original images and recordings · saved drafts · pending operation IDs · server contacts and evidence · trusted environment directory · system permissions"))
                    Text(language.text(demoOnly ? "Return to the introduction to see Welcome. The reset result stays available after relaunch." : actions.contains(.signOut) ? "After sign-out, continue at the sign-in screen. Reset and sign-out results remain available there in Lab." : (actions.contains(.onboarding) || actions.contains(.demo)) ? "You will stay in Lab. Restarted onboarding opens at Welcome the next time you enter the local introduction." : "You will stay in Lab to review the reset results."))
                }
                Section {
                    LabInfoRow(label: language.text("Microphone"), value: language.text(permissions.microphone))
                    LabInfoRow(label: language.text("Photos"), value: language.text(permissions.photos))
                    LabInfoRow(label: language.text("Contacts"), value: language.text(permissions.contacts))
                    LabInfoRow(label: language.text("Calendar"), value: language.text(permissions.calendar))
                } header: { Text(language.text("System permissions · unchanged")) } footer: {
                    Text(language.text("Read-only permission status. This review does not request access or read protected content."))
                }
                Section {
                    Button(language.text("Run reviewed reset"), role: .destructive) {
                        reviewedPlan = nil
                        Task {
                            if let id = plan.pendingID { await store.resume(id, executor: runner) }
                            else { await store.start(actions: Set(actions), reviewedContext: target, executor: runner) }
                        }
                    }.disabled(store.isWorking).accessibilityIdentifier("lab-reset-confirm")
                }
            }
            .navigationTitle(language.text("Review reset plan"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(language.text("Cancel")) { reviewedPlan = nil } } }
        }
    }
}
