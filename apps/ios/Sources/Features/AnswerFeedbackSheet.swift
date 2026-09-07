import SwiftUI

struct AnswerFeedbackSelection: Identifiable {
    let sessionID: UUID
    let turn: AgentSessionTurn
    var id: UUID { turn.id }
}

@MainActor
final class AnswerFeedbackEditor: ObservableObject {
    @Published var category: AnswerFeedbackCategory = .factError { didSet { verified = false } }
    @Published var proposal = "" { didSet { verified = false } }
    @Published private(set) var source: AnswerFeedbackSource?
    @Published private(set) var record: AnswerFeedbackRecord?
    @Published private(set) var isBusy = false
    @Published private(set) var error: Error?
    @Published private(set) var verified = false
    private(set) var pending: (id: UUID, mutation: AnswerFeedbackMutation)?
    private let client: any AnswerFeedbackServing
    let sessionID: UUID, turnID: UUID, taskID: String
    var canEdit: Bool { source?.sourceState == "available" && !isBusy && pending == nil }
    var canWithdraw: Bool { record?.status == "active" && !isBusy && pending == nil }
    var hasPending: Bool { pending != nil }
    var hasUnsavedDraft: Bool {
        if hasPending { return true }
        guard let record else { return !proposal.isEmpty || category != .factError }
        return category != record.category || proposal.trimmingCharacters(in: .whitespacesAndNewlines) != (record.expectedBehaviorProposal ?? "")
    }

    init(client: any AnswerFeedbackServing, sessionID: UUID, turnID: UUID, taskID: String) {
        self.client = client; self.sessionID = sessionID; self.turnID = turnID; self.taskID = taskID
    }
    func load(synchronize: () async -> Bool) async {
        guard !isBusy, pending == nil else { return }
        isBusy = true; error = nil; verified = false; source = nil
        defer { isBusy = false }
        do {
            let records = try await client.list(sessionID: sessionID, turnID: turnID)
            let stableID = AnswerFeedbackMutation.stableID(["answer-feedback.v1", sessionID.uuidString, turnID.uuidString])
            let saved = records.first { $0.id == stableID } ?? records.first
            if let saved {
                guard saved.sessionID == sessionID, saved.turnID == turnID else { throw AnswerFeedbackError.invalidResponse }
                category = saved.category; proposal = saved.expectedBehaviorProposal ?? ""
            }
            record = saved
            guard await synchronize() else { throw AnswerFeedbackError.unavailable }
            let loaded = try await client.source(sessionID: sessionID, turnID: turnID)
            guard loaded.taskID.lowercased() == taskID.lowercased() else { throw AnswerFeedbackError.conflict }
            source = loaded
        } catch { self.error = error }
    }
    func save(withdraw: Bool = false) async {
        guard !isBusy else { return }
        if pending == nil {
            guard withdraw ? canWithdraw : canEdit,
                  let executionID = withdraw ? record?.executionID : source?.executionID,
                  let outputHash = withdraw ? record?.outputHash : source?.outputHash else { return }
            let id = record?.id ?? AnswerFeedbackMutation.stableID(["answer-feedback.v1", sessionID.uuidString, turnID.uuidString])
            let revision = record?.revision ?? 0
            // Withdrawal is bound to the saved record, even after the Session
            // endpoint returns 410. The server ignores Session CAS for withdrawal.
            let sessionRevision = source?.sessionRevision ?? 1
            let operation = withdraw ? "withdraw" : "submit"
            let text = withdraw ? "" : proposal.trimmingCharacters(in: .whitespacesAndNewlines)
            guard text.utf16.count <= 2000 else { error = AnswerFeedbackError.invalidResponse; return }
            let selectedCategory = withdraw ? record!.category : category
            let key = AnswerFeedbackMutation.stableID(["answer-feedback-operation.v1", id.uuidString,
                String(revision), String(sessionRevision), executionID.uuidString, outputHash,
                operation, selectedCategory.rawValue, text])
            pending = (id, AnswerFeedbackMutation(idempotencyKey: key, expectedRevision: revision,
                sessionID: sessionID, turnID: turnID, expectedSessionRevision: sessionRevision,
                executionID: executionID, outputHash: outputHash, operation: operation,
                category: selectedCategory, expectedBehaviorProposal: text))
        }
        guard let pending else { return }
        isBusy = true; error = nil; verified = false
        defer { isBusy = false }
        do {
            let saved = try await client.submit(id: pending.id, mutation: pending.mutation)
            let readback = try await client.read(id: pending.id)
            guard readback.id == saved.id, readback.revision == saved.revision,
                  readback.sessionID == sessionID, readback.turnID == turnID,
                  readback.outputHash == pending.mutation.outputHash,
                  readback.executionID == pending.mutation.executionID,
                  readback.category == pending.mutation.category,
                  readback.status == (pending.mutation.operation == "withdraw" ? "withdrawn" : "active"),
                  readback.adjudication == "proposed",
                  pending.mutation.operation == "withdraw" || (readback.expectedBehaviorProposal ?? "") == pending.mutation.expectedBehaviorProposal
            else { throw AnswerFeedbackError.conflict }
            record = readback; self.pending = nil
            if readback.status == "withdrawn" { proposal = ""; category = readback.category }
            verified = true
        } catch {
            self.error = error
            if case AnswerFeedbackError.conflict = error { self.pending = nil; source = nil }
        }
    }
}

struct AnswerFeedbackSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appLanguage) private var language
    @StateObject private var editor: AnswerFeedbackEditor
    @State private var confirmClose = false
    let synchronize: () async -> Bool
    init(editor: AnswerFeedbackEditor, synchronize: @escaping () async -> Bool) {
        _editor = StateObject(wrappedValue: editor)
        self.synchronize = synchronize
    }
    init(selection: AnswerFeedbackSelection, client: any AnswerFeedbackServing, synchronize: @escaping () async -> Bool) {
        _editor = StateObject(wrappedValue: AnswerFeedbackEditor(client: client, sessionID: selection.sessionID,
            turnID: selection.turn.id, taskID: selection.turn.response.taskID))
        self.synchronize = synchronize
    }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(language.text("Tell us what needs correcting in this answer. Your note is a proposal for review; it does not change contact facts."))
                        .font(.callout).foregroundStyle(Color.tsMutedInk)
                    Picker(language.text("Reason"), selection: $editor.category) {
                        ForEach(AnswerFeedbackCategory.corrections) { category in
                            Text(category.title(language)).tag(category)
                        }
                    }
                    .disabled(!editor.canEdit)
                    TextField(language.text("What should the answer say? (optional)"),
                              text: $editor.proposal, axis: .vertical)
                        .lineLimit(3...8).disabled(!editor.canEdit)
                        .accessibilityIdentifier("answer-feedback-proposal")
                    if editor.proposal.utf16.count > 2000 {
                        Text(language.text("Use 2,000 characters or fewer."))
                            .foregroundStyle(Color.tsMutedInk)
                    }
                }
                if let source = editor.source, source.sourceState != "available" {
                    Section {
                        Text(language.text("The original answer context is no longer available for correction. Saved feedback can still be withdrawn."))
                    }
                }
                if editor.error != nil {
                    Section {
                        Text(language.text(editor.hasPending
                            ? "The save could not be confirmed. Retry continues the same submission."
                            : "The answer or feedback may have changed. Reload before editing."))
                        Button(language.text(editor.hasPending ? "Retry" : "Reload")) {
                            Task { if editor.hasPending { await editor.save() } else { await editor.load(synchronize: synchronize) } }
                        }.disabled(editor.isBusy)
                    }
                }
                if let record = editor.record {
                    Section {
                        Text(language.text(record.status == "withdrawn" ? "Feedback withdrawn" : "Saved · pending review"))
                            .accessibilityIdentifier("answer-feedback-saved-state")
                        if editor.verified {
                            Text(language.text("Saved state verified with the server."))
                                .font(.caption).foregroundStyle(Color.tsMutedInk)
                        }
                        if editor.canWithdraw {
                            Button(language.text("Withdraw feedback"), role: .destructive) {
                                Task { await editor.save(withdraw: true) }
                            }.accessibilityIdentifier("answer-feedback-withdraw")
                        }
                    }
                }
                Section {
                    Button(language.text(editor.record == nil ? "Save feedback" : "Save changes")) {
                        Task { await editor.save() }
                    }
                    .disabled(!editor.canEdit || editor.proposal.utf16.count > 2000)
                    .accessibilityIdentifier("answer-feedback-submit")
                    if editor.isBusy { ProgressView() }
                }
            }
            .navigationTitle(language.text("Correct answer"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button(language.text("Close")) {
                    if editor.hasUnsavedDraft { confirmClose = true } else { dismiss() }
                }.disabled(editor.isBusy)
            } }
            .alert(language.text("Leave feedback?"), isPresented: $confirmClose) {
                Button(language.text("Keep editing"), role: .cancel) {}
                Button(language.text("Leave"), role: .destructive) { dismiss() }
            } message: {
                Text(language.text(editor.hasPending
                    ? "Saving has not been confirmed. Reopening will read the server state; your local draft will be discarded."
                    : "Your unsaved edits will be discarded."))
            }
            .tint(Color.tsInk)
            .interactiveDismissDisabled(editor.isBusy || editor.hasUnsavedDraft)
            .task { await editor.load(synchronize: synchronize) }
        }
    }
}
