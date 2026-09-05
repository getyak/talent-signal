import SwiftUI

@MainActor
struct TextSignalCaptureView: View {
    private enum FocusField: Hashable {
        case exactText
        case purpose
        case proposedMilestone
        case proposalReason
    }

    @StateObject private var store: TextSignalCaptureStore
    @State private var isScopePickerPresented = false
    @State private var scopeQuery = ""
    @FocusState private var focusedField: FocusField?
    @Environment(\.dismiss) private var dismiss
    let onDismiss: () -> Void

    init(
        backendURL: URL,
        accessToken: String? = nil,
        workspaceID: String? = nil,
        runtimeScope: String? = nil,
        recordID: UUID = UUID(),
        initialRecord: TextSignalOutboxRecord? = nil,
        onDismiss: @escaping () -> Void = {}
    ) {
        _store = StateObject(
            wrappedValue: TextSignalCaptureStore(
                recordID: recordID,
                initialRecord: initialRecord,
                outbox: TextSignalOutbox.scoped(runtimeScope, backendURL: backendURL, workspaceID: workspaceID),
                service: URLTextSignalSyncClient(
                    baseURL: backendURL,
                    accessToken: accessToken,
                    workspaceID: workspaceID
                )
            )
        )
        self.onDismiss = onDismiss
    }

    init(
        store: TextSignalCaptureStore,
        onDismiss: @escaping () -> Void = {}
    ) {
        _store = StateObject(wrappedValue: store)
        self.onDismiss = onDismiss
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if store.isDeleted {
                        status
                        Button("Done") {
                            onDismiss()
                            dismiss()
                        }
                        .buttonStyle(TSSecondaryButtonStyle())
                        .accessibilityIdentifier("finish-text-signal-deletion")
                    } else {
                        intro
                        cachedWorkspaceBoundary
                        Group {
                            exactText
                            scope
                            attribution
                            optionalProposal
                        }
                        .disabled(!store.isDraftEditable)
                        status
                        actions
                    }
                    safetyBoundary
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.tsCanvas.ignoresSafeArea())
            .navigationTitle("Text Signal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        onDismiss()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Close text Signal")
                }
            }
        }
        .sheet(isPresented: $isScopePickerPresented) { scopePickerSheet }
        .tint(.tsVermilion)
        .task { store.load() }
        .accessibilityIdentifier("text-signal-capture")
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("INTENTIONAL CAPTURE")
                .font(.caption2.weight(.bold))
                .tracking(1.1)
                .foregroundStyle(Color.tsVermilion)
            Text("Preserve the words first.")
                .font(.custom("Georgia", size: 36, relativeTo: .largeTitle))
                .foregroundStyle(Color.tsInk)
                .tracking(-0.8)
            Text("Saving is local only. Sync creates reviewed evidence; an optional change remains a Proposal until you review every item.")
                .font(.body)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var exactText: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("1 · Exact text")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.tsMutedInk)
                Spacer()
                if focusedField != nil {
                    Button("Done") { focusedField = nil }
                        .font(.body.weight(.semibold))
                        .accessibilityIdentifier("dismiss-text-signal-keyboard")
                }
            }
            TextEditor(text: $store.text)
                .focused($focusedField, equals: .exactText)
                .font(.body)
                .foregroundStyle(Color.tsInk)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 150)
                .padding(12)
                .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 14))
                .overlay {
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.tsLine, lineWidth: 1)
                }
                .accessibilityLabel("Exact Signal text")
                .accessibilityIdentifier("text-signal-body")

            TextField("Purpose", text: $store.purpose, axis: .vertical)
                .focused($focusedField, equals: .purpose)
                .textFieldStyle(.plain)
                .padding(12)
                .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 12))
                .overlay {
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.tsLine, lineWidth: 1)
                }
                .accessibilityIdentifier("text-signal-purpose")
        }
    }

    private var scope: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("2 · Pursuit and Person")
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.tsMutedInk)

            if store.scopes.isEmpty {
                Text(
                    store.workspaceVerification == .cachedOffline
                        ? "Canonical roles are unavailable offline. A saved Signal can reopen only inside this device's previously verified workspace."
                        : "No confirmed candidate role is available yet. The text can still be saved locally."
                )
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(14)
                    .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 14))
            } else {
                Button {
                    scopeQuery = ""
                    isScopePickerPresented = true
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(store.selectedScope?.pickerLabel ?? "Choose Pursuit and Person")
                            .foregroundStyle(Color.tsInk)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.up.chevron.down")
                            .foregroundStyle(Color.tsMutedInk)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .padding(.horizontal, 12)
                .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 14))
                .overlay {
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.tsLine, lineWidth: 1)
                }
                .accessibilityIdentifier("text-signal-scope")
            }

            if let selected = store.selectedScope {
                Text("Selected: \(selected.personDisplayLabel) · \(selected.identityClue) · Person \(selected.personID.prefix(8)) · Role \(selected.roleType.capitalized) · Current \(selected.currentMilestone.replacingOccurrences(of: "_", with: " ")) · revision \(selected.pursuitRevision)")
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(selected.accessibilityLabel + ", current milestone \(selected.currentMilestone.replacingOccurrences(of: "_", with: " ")), revision \(selected.pursuitRevision)")
                    .accessibilityIdentifier("text-signal-scope-readback")
            }
        }
    }

    private var filteredScopes: [TextSignalScope] {
        let query = scopeQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return store.scopes }
        return store.scopes.filter { scope in
            [
                scope.personDisplayLabel,
                scope.personID,
                scope.relationshipContextLabel ?? "",
                scope.relationshipContextID ?? "",
                scope.pursuitTitle,
                scope.pursuitID,
                scope.roleType,
                scope.roleID,
            ].contains { $0.localizedCaseInsensitiveContains(query) }
        }
    }

    private var scopePickerSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                TextField("Search name, Person record, Pursuit, or context", text: $scopeQuery)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("text-signal-scope-search")

                if filteredScopes.isEmpty {
                    Text("No matching Pursuit or Person record")
                        .font(.subheadline)
                        .foregroundStyle(Color.tsMutedInk)
                        .frame(maxWidth: .infinity, minHeight: 120)
                        .accessibilityIdentifier("text-signal-scope-empty-search")
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 10) {
                            ForEach(filteredScopes) { scope in
                                Button {
                                    store.selectedScopeID = scope.id
                                    isScopePickerPresented = false
                                } label: {
                                    HStack(alignment: .top, spacing: 12) {
                                        VStack(alignment: .leading, spacing: 5) {
                                            Text(scope.personDisplayLabel)
                                                .font(.headline)
                                                .foregroundStyle(Color.tsInk)
                                            Text("\(scope.identityClue) · Person \(scope.personID.prefix(8))")
                                                .font(.subheadline)
                                                .foregroundStyle(Color.tsMutedInk)
                                            Text("\(scope.pursuitTitle) · \(scope.roleType.capitalized)")
                                                .font(.caption)
                                                .foregroundStyle(Color.tsMutedInk)
                                        }
                                        Spacer(minLength: 8)
                                        if store.selectedScopeID == scope.id {
                                            Image(systemName: "checkmark.circle.fill")
                                                .foregroundStyle(Color.tsConfirmed)
                                                .accessibilityHidden(true)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(14)
                                    .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 14))
                                    .overlay {
                                        RoundedRectangle(cornerRadius: 14)
                                            .stroke(Color.tsLine, lineWidth: 1)
                                    }
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(scope.accessibilityLabel)
                                .accessibilityIdentifier("text-signal-scope-option-\(scope.id)")
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                    .accessibilityIdentifier("text-signal-scope-options")
                }
            }
            .padding(20)
            .background(Color.tsCanvas.ignoresSafeArea())
            .navigationTitle("Choose scope")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { isScopePickerPresented = false }
                }
            }
        }
        .tint(.tsVermilion)
    }

    @ViewBuilder
    private var cachedWorkspaceBoundary: some View {
        if store.workspaceVerification == .cachedOffline {
            TextSignalStatusCard(
                icon: "wifi.slash",
                title: "Offline workspace binding",
                detail: "This device previously verified the same account and endpoint. Saved text is local; canonical roles and sync require a live readback."
            )
            .accessibilityIdentifier("text-signal-cached-workspace")
        }
    }

    private var attribution: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("3 · Who authored these words?")
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.tsMutedInk)
            Text("Nothing is preselected. Unresolved attribution can sync as evidence but cannot support the optional milestone Proposal.")
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)

            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 108), spacing: 8)],
                alignment: .leading,
                spacing: 8
            ) {
                ForEach(TextSignalSpeaker.allCases) { speaker in
                    Button {
                        store.speaker = speaker
                    } label: {
                        Text(speaker.label)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.tsInk)
                            .frame(minHeight: 44)
                            .padding(.horizontal, 14)
                            .background(
                                store.speaker == speaker
                                    ? Color.tsVermilion.opacity(0.12)
                                    : Color.tsSurface,
                                in: Capsule()
                            )
                            .overlay {
                                Capsule().stroke(
                                    store.speaker == speaker
                                        ? Color.tsVermilion
                                        : Color.tsLine,
                                    lineWidth: 1
                                )
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(store.speaker == speaker ? .isSelected : [])
                    .accessibilityIdentifier("text-signal-speaker-\(speaker.rawValue)")
                }
            }
        }
    }

    private var optionalProposal: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("OPTIONAL · STAGE A REVIEW CARD")
                .font(.caption2.weight(.bold))
                .tracking(0.8)
                .foregroundStyle(Color.tsVermilion)
            Text("Choose evidence only, or stage one human-readable milestone for separate item review. You never type an internal enum or restate the evidence rationale.")
                .font(.caption)
                .foregroundStyle(Color.tsMutedInk)

            Picker(
                "Review proposal",
                selection: Binding(
                    get: { store.proposedMilestone },
                    set: { store.selectProposedMilestone($0) }
                )
            ) {
                Text("Evidence only").tag("")
                ForEach(TextSignalMilestoneChoice.allCases) { choice in
                    Text(choice.label).tag(choice.rawValue)
                }
            }
                .pickerStyle(.menu)
                .padding(12)
                .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 12))
                .overlay {
                    RoundedRectangle(cornerRadius: 12).stroke(Color.tsLine, lineWidth: 1)
                }
                .accessibilityIdentifier("text-signal-proposed-milestone")

            if !store.proposalReason.isEmpty {
                Text(store.proposalReason)
                    .font(.caption)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("text-signal-proposal-reason")
            }
        }
        .padding(16)
        .background(Color.tsSurfaceMuted, in: RoundedRectangle(cornerRadius: 16))
    }

    @ViewBuilder
    private var status: some View {
        switch store.phase {
        case .loadingScopes:
            TextSignalStatusCard(
                icon: "arrow.triangle.2.circlepath",
                title: "Loading canonical scope",
                detail: "No text is sent while Pursuits and People load."
            )
        case .editing:
            EmptyView()
        case .savedLocal:
            TextSignalStatusCard(
                icon: "lock.iphone",
                title: "Saved on this device",
                detail: "The text is protected by iOS Complete File Protection. It is not synced, analyzed, or confirmed."
            )
            .accessibilityIdentifier("text-signal-saved-local")
        case .queued:
            TextSignalStatusCard(
                icon: "tray.full",
                title: "Queued with one stable Signal ID",
                detail: "Retry will reuse the same idempotency keys."
            )
        case .uploading:
            TextSignalStatusCard(
                icon: "arrow.up.circle",
                title: "Syncing reviewed evidence",
                detail: "Success remains hidden until Capture, Resource, exact fragment, identity, and optional Proposal readback agree."
            )
        case let .synced(receipt):
            TextSignalStatusCard(
                icon: "checkmark.shield",
                title: "Evidence synced",
                detail: receiptDetail(receipt, proposalReady: false),
                auditDetail: receiptAuditDetail(receipt)
            )
            .accessibilityIdentifier("text-signal-synced-receipt")
        case let .stagedForReview(receipt):
            TextSignalStatusCard(
                icon: "doc.badge.clock",
                title: "Proposal ready for review",
                detail: receiptDetail(receipt, proposalReady: true),
                auditDetail: receiptAuditDetail(receipt)
            )
            .accessibilityIdentifier("text-signal-proposal-receipt")
        case let .failed(message):
            TextSignalStatusCard(
                icon: "exclamationmark.triangle",
                title: "Sync not verified",
                detail: message
            )
            .accessibilityIdentifier("text-signal-failed")
        case .deleting:
            TextSignalStatusCard(
                icon: "trash",
                title: "Deleting governed evidence",
                detail: "Local text remains until server deletion readback succeeds."
            )
        case let .deleted(receipt):
            TextSignalStatusCard(
                icon: "checkmark",
                title: "Signal deleted",
                detail: receipt.map {
                    _ in "Server deletion was confirmed, then the local payload was removed."
                } ?? "The unsynced local payload was removed.",
                auditDetail: receipt.map { "Deletion \($0.deletionID)" }
            )
            .accessibilityIdentifier("text-signal-deleted")
        }
    }

    private func receiptDetail(
        _ receipt: TextSignalSyncReceipt,
        proposalReady: Bool
    ) -> String {
        let scope = store.selectedScope
        let humanScope = scope.map {
            "\($0.personDisplayLabel) · \($0.identityClue) · \($0.pursuitTitle) · \($0.roleType.humanized)"
        } ?? "Selected Person and Pursuit"
        if proposalReady {
            return "\(humanScope). Exact reviewed evidence is staged for separate item review; no Pursuit field changed."
        }
        return "\(humanScope). Reviewed evidence was attached; no Pursuit field changed."
    }

    private func receiptAuditDetail(_ receipt: TextSignalSyncReceipt) -> String {
        "Person \(receipt.personID) · role \(receipt.roleID) · context \(receipt.relationshipContextID ?? "none") · Capture \(receipt.captureID) · Resource \(receipt.resourceID) · Proposal \(receipt.proposalID ?? "none")"
    }

    private var actions: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !store.isDeleted {
                Button("Save locally") { store.saveLocally() }
                    .buttonStyle(TSSecondaryButtonStyle())
                    .disabled(!store.canSaveLocally || store.isBusy)
                    .accessibilityIdentifier("save-text-signal-locally")

                if store.offersInitialSync {
                    Button(store.proposedMilestone.isEmpty ? "Sync evidence" : "Sync and stage Proposal") {
                        store.queueAndSync()
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .disabled(!store.canSync)
                    .accessibilityIdentifier("sync-text-signal")
                }

                if store.offersInitialSync, let block = store.syncBlockingMessage {
                    Text(block)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("text-signal-sync-block")
                }

                if case .failed = store.phase {
                    Button("Retry with the same Signal ID") { store.retry() }
                        .buttonStyle(TSPrimaryButtonStyle())
                        .disabled(!store.canSync)
                        .accessibilityIdentifier("retry-text-signal")
                }

                Button("Delete this Signal", role: .destructive) { store.delete() }
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight: 44)
                    .disabled(!store.canDelete)
                    .accessibilityIdentifier("delete-text-signal")

                if let block = store.deletionBlockingMessage {
                    Text(block)
                        .font(.caption)
                        .foregroundStyle(Color.tsMutedInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var safetyBoundary: some View {
        Label(
            "Capture creates no message, meeting, external CRM write, candidate score, or confirmed Pursuit state.",
            systemImage: "lock.shield"
        )
        .font(.caption)
        .foregroundStyle(Color.tsMutedInk)
        .fixedSize(horizontal: false, vertical: true)
    }
}

private struct TextSignalStatusCard: View {
    let icon: String
    let title: String
    let detail: String
    var auditDetail: String? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 13) {
            Image(systemName: icon)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.tsInk)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(Color.tsInk)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                if let auditDetail {
                    DisclosureGroup("Audit details") {
                        Text(auditDetail)
                            .font(.caption2)
                            .foregroundStyle(Color.tsMutedInk)
                            .accessibilityIdentifier("text-signal-audit-values")
                    }
                    .accessibilityIdentifier("text-signal-audit-details")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16).stroke(Color.tsLine, lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
    }
}
