import SwiftUI

@MainActor
struct LabWorkspaceView: View {
    @Environment(\.appLanguage) private var language
    @ObservedObject var store: LabWorkspaceStore
    let onEntered: (() -> Void)?
    @State private var durationHours = 4
    @State private var confirmsEndCurrent = false
    @State private var endingWorkspace: LabWorkspace?

    init(store: LabWorkspaceStore, onEntered: (() -> Void)? = nil) {
        self.store = store
        self.onEntered = onEntered
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Label(language.text("Isolated test workspace"), systemImage: "shippingbox")
                        .font(.title3.weight(.semibold))
                    Text(language.text("A real empty server workspace for testing product flows without copying people, conversations or drafts from your account."))
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 6)
            }

            if let journey = store.journey {
                journeySection(journey)
            } else {
                createSection
            }

            if store.journey == nil {
                workspaceList
            }

            if let receipt = store.receipt {
                Section(language.text("Cleanup receipt")) {
                    LabInfoRow(label: language.text("Workspace"), value: receipt.id.uuidString.lowercased())
                    LabInfoRow(label: language.text("Server state"), value: stateLabel(receipt.state))
                        .accessibilityIdentifier("lab-workspace-receipt-state")
                    LabInfoRow(label: language.text("Remaining data rows"), value: receipt.dataRows.map(String.init) ?? "—")
                        .accessibilityIdentifier("lab-workspace-receipt-rows")
                    if let error = receipt.cleanupError {
                        Label(cleanupErrorLabel(error), systemImage: "exclamationmark.triangle")
                            .foregroundStyle(Color.orange)
                    }
                    if receipt.state == .deleted {
                        Button(language.text("Done")) { store.dismissFinishedReceipt() }
                    }
                }
            }

            if let notice = store.notice {
                Section {
                    Text(language.text(notice))
                        .font(.footnote)
                        .foregroundStyle(store.secureStoreFailed ? Color.red : Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("lab-workspace-notice")
                }
            }
        }
        .navigationTitle(language.text("Test workspace"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.reconcile() }
        .refreshable { await store.reconcile() }
        .confirmationDialog(language.text("End and delete this test workspace?"),
                            isPresented: $confirmsEndCurrent, titleVisibility: .visible) {
            Button(language.text("End test workspace"), role: .destructive) {
                Task { await store.endCurrentWorkspace() }
            }
            .accessibilityIdentifier("lab-workspace-confirm-end-current")
        } message: {
            Text(language.text("The app returns to your original account first, revokes the test entry, then asks the server to delete all scoped test data and media."))
        }
        .confirmationDialog(language.text("Delete this saved test workspace?"),
                            isPresented: Binding(get: { endingWorkspace != nil }, set: { if !$0 { endingWorkspace = nil } }),
                            titleVisibility: .visible) {
            Button(language.text("Delete test workspace"), role: .destructive) {
                guard let workspace = endingWorkspace else { return }
                endingWorkspace = nil
                Task { await store.end(workspace) }
            }
            .accessibilityIdentifier("lab-workspace-confirm-delete")
        } message: {
            Text(language.text("The server will close new writes, remove scoped data and media, and report the cleanup result here."))
        }
    }

    @ViewBuilder
    private func journeySection(_ journey: LabWorkspaceJourney) -> some View {
        Section(language.text("Current protected journey")) {
            LabInfoRow(label: language.text("State"), value: phaseLabel(journey.phase))
            if let workspace = journey.workspace {
                LabInfoRow(label: language.text("Workspace"), value: workspace.name)
                LabInfoRow(label: language.text("Expires"), value: workspace.expiresAt.formatted(date: .abbreviated, time: .shortened))
                LabInfoRow(label: language.text("Data rows"), value: workspace.dataRows.map(String.init) ?? "—")
                Label(workspace.isEmptyAndIsolated
                      ? language.text("Server verified empty and isolated")
                      : language.text("Waiting for empty-state verification"),
                      systemImage: workspace.isEmptyAndIsolated ? "checkmark.shield" : "clock")
                    .foregroundStyle(workspace.isEmptyAndIsolated ? Color.green : Color.orange)
                    .accessibilityIdentifier("lab-workspace-empty-proof")
            }
            if journey.isChildPhase {
                Button(language.text("Return to original workspace")) {
                    Task { await store.returnToOwner() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(store.isWorking)
                .accessibilityIdentifier("lab-workspace-return")
                Button(language.text("End test workspace"), role: .destructive) { confirmsEndCurrent = true }
                    .disabled(store.isWorking)
                    .accessibilityIdentifier("lab-workspace-end-current")
            } else if journey.phase != .finished {
                Button(language.text("Resume protected operation")) { Task { await store.retry() } }
                    .disabled(store.isWorking)
                    .accessibilityIdentifier("lab-workspace-retry")
            }
            if store.isWorking { ProgressView().accessibilityIdentifier("lab-workspace-working") }
        }
    }

    private var createSection: some View {
        Section {
            Picker(language.text("Automatic expiry"), selection: $durationHours) {
                Text(language.text("1 hour")).tag(1)
                Text(language.text("4 hours")).tag(4)
                Text(language.text("24 hours")).tag(24)
            }
            Button {
                Task {
                    await store.createAndEnter(durationHours: durationHours)
                    closeAfterVerifiedEntry()
                }
            } label: {
                Label(language.text("Create empty test workspace"), systemImage: "plus.circle.fill")
            }
            .buttonStyle(.borderedProminent)
            .disabled(store.isWorking)
            .accessibilityIdentifier("lab-workspace-create")
            if store.isWorking { ProgressView() }
        } footer: {
            Text(language.text("The server creates a separate synthetic account. It receives no people, captures, conversations, drafts or pending actions from your current account."))
        }
    }

    @ViewBuilder
    private var workspaceList: some View {
        let available = store.workspaces.filter { $0.state != .deleted }
        if !available.isEmpty {
            Section(language.text("Server workspaces")) {
                ForEach(available) { workspace in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(workspace.name).font(.body.weight(.medium))
                        Text("\(stateLabel(workspace.state)) · \(workspace.expiresAt.formatted(date: .omitted, time: .shortened))")
                            .font(.caption).foregroundStyle(Color.tsMutedInk)
                        HStack {
                            if workspace.state == .active && workspace.expiresAt > .now {
                                Button(language.text("Enter")) {
                                    Task {
                                        await store.enter(workspace)
                                        closeAfterVerifiedEntry()
                                    }
                                }
                                    .disabled(store.isWorking)
                            }
                            Button(language.text("Delete"), role: .destructive) { endingWorkspace = workspace }
                                .disabled(store.isWorking)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    private func phaseLabel(_ phase: LabWorkspaceJourney.Phase) -> String {
        switch phase {
        case .preparing: language.text("Preparing protected request")
        case .entryReady: language.text("Ready to enter")
        case .childActive: language.text("Testing in isolated workspace")
        case .returning: language.text("Returning to original account")
        case .ownerActive: language.text("Original account restored")
        case .stopPending: language.text("Waiting for server cleanup")
        case .deleting: language.text("Server cleanup in progress")
        case .finished: language.text("Cleanup verified")
        }
    }

    private func stateLabel(_ state: LabWorkspace.State) -> String {
        switch state {
        case .active: language.text("Active")
        case .expired: language.text("Expired")
        case .deleting: language.text("Deleting")
        case .deleted: language.text("Deleted")
        }
    }

    private func cleanupErrorLabel(_ value: String) -> String {
        switch value {
        case "schema_changed": language.text("Database cleanup coverage changed")
        case "media_scope_changed": language.text("Media storage scope changed")
        case "media_unsettled": language.text("A media write still needs reconciliation")
        case "media_cleanup_failed": language.text("Media cleanup needs retry")
        case "data_cleanup_failed": language.text("Data cleanup needs retry")
        default: language.text("Cleanup needs review")
        }
    }

    private func closeAfterVerifiedEntry() {
        guard store.journey?.phase == .childActive,
              store.currentWorkspace?.isEmptyAndIsolated == true else { return }
        onEntered?()
    }
}

@MainActor
struct LabWorkspaceBanner: View {
    @Environment(\.appLanguage) private var language
    @ObservedObject var store: LabWorkspaceStore
    @State private var showsManager = false

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Label(language.text("TEST WORKSPACE · ISOLATED"), systemImage: "shippingbox.fill")
                .font(.caption.weight(.bold))
            HStack(spacing: 12) {
                Button(language.text("Return to original")) { Task { await store.returnToOwner() } }
                    .disabled(store.isWorking)
                    .accessibilityIdentifier("lab-workspace-banner-return")
                Button(language.text("Manage")) { showsManager = true }
                    .accessibilityIdentifier("lab-workspace-banner-manage")
            }
            .font(.subheadline.weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .foregroundStyle(Color.white)
        .background(Color.tsVermilion)
        .accessibilityElement(children: .contain)
        .sheet(isPresented: $showsManager) {
            NavigationStack { LabWorkspaceView(store: store) }
        }
    }
}

@MainActor
struct LabWorkspaceRecoveryView: View {
    @Environment(\.appLanguage) private var language
    @ObservedObject var store: LabWorkspaceStore
    @ObservedObject var sessionStore: AppSessionStore
    @State private var showsManager = false

    var body: some View {
        ZStack {
            Color.tsSurface.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 18) {
                Image(systemName: "lock.shield").font(.largeTitle).foregroundStyle(Color.tsVermilion)
                Text(language.text("Workspace recovery required"))
                    .font(.title2.weight(.semibold)).foregroundStyle(Color.tsInk)
                Text(language.text(store.notice ?? "The protected test-workspace record does not match the active account. Account content stays closed until recovery is verified."))
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                if store.journey?.hasReturnCredential == true && sessionStore.phase == .signedOut {
                    Button(language.text("Verify and restore original account")) {
                        Task { await store.recoverOriginalSession() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(store.isWorking)
                }
                if sessionStore.currentSession != nil {
                    Button(language.text("Sign out mismatched account"), role: .destructive) {
                        Task { _ = await sessionStore.signOut() }
                    }
                    .disabled(sessionStore.isWorking)
                }
                Button(language.text("Review recovery details")) { showsManager = true }
                if store.isWorking { ProgressView() }
            }
            .padding(28)
        }
        .accessibilityIdentifier("lab-workspace-recovery")
        .sheet(isPresented: $showsManager) {
            NavigationStack { LabWorkspaceView(store: store) }
        }
    }
}
