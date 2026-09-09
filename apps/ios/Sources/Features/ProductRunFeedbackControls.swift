import SwiftUI

@MainActor
final class ProductRunFeedbackEditor: ObservableObject {
    @Published private(set) var detail: ProductRunFeedbackDetail?
    @Published private(set) var busy = false
    @Published private(set) var error = false
    @Published var reasons: [String] = []
    @Published var comment = ""
    @Published var correction = ""
    private var mutationVersion = 0
    private(set) var pending: ProductRunFeedbackRequest?
    let client: any AnswerFeedbackServing
    let taskID: String
    var sentiment: String? { detail?.run.feedback.sentiment }
    init(client: any AnswerFeedbackServing, taskID: String) { self.client = client; self.taskID = taskID }
    func load() async {
        guard !busy else { return }
        let version = mutationVersion
        do {
            let value = try await client.productRun(taskID: taskID)
            guard version == mutationVersion else { return }
            detail = value; reasons = value.run.feedback.reasons
            comment = value.run.feedback.comment; correction = value.run.feedback.correction
        } catch { /* Older responses still remain readable; surface failure only after a tap. */ }
    }
    @discardableResult func save(_ sentiment: String?, notes: Bool = false, retry: Bool = false) async -> Bool {
        guard !busy else { return false }
        busy = true; error = false; mutationVersion += 1
        defer { busy = false }
        do {
            let source: ProductRunFeedbackDetail
            if let detail { source = detail } else { source = try await client.productRun(taskID: taskID) }
            guard let hash = source.run.output_hash else { throw AnswerFeedbackError.unavailable }
            let operation: ProductRunFeedbackRequest
            if retry, let pending { operation = pending }
            else {
                operation = .init(idempotency_key: UUID().uuidString.lowercased(), expected_revision: source.run.feedback.revision,
                    output_hash: hash, sentiment: sentiment, reasons: notes && sentiment != nil ? reasons : [],
                    comment: notes && sentiment != nil ? comment : "", correction: notes && sentiment != nil ? correction : "", selected_text: "")
            }
            pending = operation
            let result = try await client.react(taskID: taskID, request: operation)
            guard result.run.output_hash == operation.output_hash,
                  result.run.feedback.revision == operation.expected_revision + 1,
                  result.run.feedback.sentiment == operation.sentiment else { throw AnswerFeedbackError.conflict }
            detail = result; pending = nil
            reasons = result.run.feedback.reasons; comment = result.run.feedback.comment; correction = result.run.feedback.correction
            return true
        } catch {
            self.error = true
            if case AnswerFeedbackError.conflict = error,
               let fresh = try? await client.productRun(taskID: taskID), let original = pending, let hash = fresh.run.output_hash {
                detail = fresh
                pending = .init(idempotency_key: UUID().uuidString.lowercased(), expected_revision: fresh.run.feedback.revision,
                    output_hash: hash, sentiment: original.sentiment, reasons: original.reasons, comment: original.comment,
                    correction: original.correction, selected_text: original.selected_text)
            }
            return false
        }
    }
}

struct ProductRunFeedbackControls: View {
    @Environment(\.appLanguage) private var language
    @StateObject private var editor: ProductRunFeedbackEditor
    @State private var showNotes = false
    let onCorrection: ((String) -> Void)?
    init(client: any AnswerFeedbackServing, taskID: String, onCorrection: ((String) -> Void)? = nil) {
        _editor = StateObject(wrappedValue: ProductRunFeedbackEditor(client: client, taskID: taskID))
        self.onCorrection = onCorrection
    }
    private var options: [(String, String)] {
        editor.sentiment == "helpful" ? [
            ("new_insight", "A new insight"), ("remembered_context", "Remembered context"),
            ("clear_next_step", "A clear next step"), ("ready_to_use", "Ready to use")
        ] : [
            ("wrong_intent", "Misunderstood my request"), ("wrong_memory", "Missing or wrong context"),
            ("incorrect_information", "Incorrect or outdated"), ("not_actionable", "Not useful in practice"),
            ("poor_expression", "Wording or tone")
        ]
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 0) {
                vote("helpful", symbol: "hand.thumbsup", title: language.text("Helpful"), identifier: "ask-feedback-helpful")
                vote("unhelpful", symbol: "hand.thumbsdown", title: language.text("Not helpful"), identifier: "ask-feedback-unhelpful")
                if editor.busy { ProgressView().controlSize(.small).padding(.horizontal, 8) }
                else if editor.sentiment != nil {
                    Button { showNotes = true } label: {
                        Text(language.text("Add a note · optional"))
                            .font(.caption).padding(.horizontal, 8).frame(minHeight: 44)
                    }.accessibilityIdentifier("run-feedback-add-note")
                }
            }
            if editor.error {
                HStack {
                    Text(language.text("Feedback was not confirmed."))
                    Button(language.text("Retry")) { Task { await editor.save(editor.sentiment, retry: true) } }
                }.font(.caption).foregroundStyle(Color.tsMutedInk).accessibilityIdentifier("run-feedback-error")
            }
        }
        .foregroundStyle(Color.tsMutedInk)
        .task(id: editor.taskID) { await editor.load() }
        .sheet(isPresented: $showNotes) {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Label(language.text("Your rating is saved"), systemImage: "checkmark")
                            .font(.caption).foregroundStyle(Color.tsMutedInk)
                        Text(editor.sentiment == "helpful" ? language.text("What helped most?")
                             : language.text("How could this help more?"))
                            .font(.title3.weight(.semibold))
                        VStack(spacing: 0) {
                            ForEach(options, id: \.0) { reason in
                                Button {
                                    if editor.reasons.contains(reason.0) { editor.reasons.removeAll { $0 == reason.0 } }
                                    else { editor.reasons.append(reason.0) }
                                } label: {
                                    HStack { Text(language.text(reason.1)); Spacer()
                                        Image(systemName: editor.reasons.contains(reason.0) ? "checkmark.circle.fill" : "circle") }
                                        .font(.callout).frame(minHeight: 46).contentShape(Rectangle())
                                }.buttonStyle(.plain).accessibilityAddTraits(editor.reasons.contains(reason.0) ? .isSelected : [])
                            }
                        }
                        TextField(language.text("Anything to add? (optional)"), text: $editor.comment, axis: .vertical)
                            .lineLimit(3...6).padding(14).background(Color.tsMutedInk.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                            .accessibilityIdentifier("run-feedback-comment")
                        if editor.comment.utf16.count > 2000 { Text(language.text("Keep the note within 2,000 characters.")).font(.caption) }
                        if editor.sentiment == "unhelpful" {
                            TextField(language.text("What should the answer say? (optional)"), text: $editor.correction, axis: .vertical)
                                .lineLimit(3...6).padding(14).background(Color.tsMutedInk.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                                .accessibilityIdentifier("run-feedback-correction")
                            if editor.correction.utf16.count > 900 { Text(language.text("Keep the correction within 900 characters.")).font(.caption) }
                        }
                        if editor.error { Text(language.text("Could not save. Retry keeps the same submission.")) }
                        Button(language.text("Save note")) {
                            Task { if await editor.save(editor.sentiment, notes: true, retry: editor.pending != nil) { showNotes = false } }
                        }.buttonStyle(.borderedProminent).tint(Color.tsInk).foregroundStyle(Color.tsEvidence)
                            .controlSize(.large).frame(maxWidth: .infinity, minHeight: 44)
                            .disabled(editor.busy || editor.comment.utf16.count > 2000 || editor.correction.utf16.count > 900)
                            .accessibilityIdentifier("run-feedback-save-note")
                        if let onCorrection, !editor.correction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Button(language.text("Revise with this")) {
                                Task { let text = editor.correction; if await editor.save(editor.sentiment, notes: true) { showNotes = false; onCorrection(text) } }
                            }.disabled(editor.busy || editor.correction.utf16.count > 900)
                        }
                    }.padding(24)
                }
                .navigationTitle(language.text("Answer feedback"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) {
                    Button(language.text("Close")) { showNotes = false }.disabled(editor.busy)
                } }
            }.presentationDetents([.large]).interactiveDismissDisabled(editor.busy).tint(Color.tsInk)
        }
    }
    private func vote(_ value: String, symbol: String, title: String, identifier: String) -> some View {
        Button {
            Task {
                let next = editor.sentiment == value ? nil : value
                if await editor.save(next) { if next == "unhelpful" { showNotes = true } }
            }
        } label: { Image(systemName: symbol + (editor.sentiment == value ? ".fill" : ""))
                .font(.system(size: 15)).frame(width: 44, height: 44).contentShape(Rectangle()) }
            .buttonStyle(.plain).disabled(editor.busy).accessibilityLabel(title)
            .accessibilityValue(editor.sentiment == value ? language.text("Selected") : "")
            .accessibilityIdentifier(identifier)
    }
}
