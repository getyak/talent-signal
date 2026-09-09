import SwiftUI

struct ScreenshotProfileReview: View {
    let task: ScreenshotContactTask
    let draft: ScreenshotContactTask.ProfileDraft
    let language: AppLanguage
    let onResume: ((ScreenshotContactResumeBody) -> Void)?
    @State private var name: String
    @State private var values: [Int: String]

    init(task: ScreenshotContactTask, draft: ScreenshotContactTask.ProfileDraft, language: AppLanguage,
         onResume: ((ScreenshotContactResumeBody) -> Void)?) {
        self.task = task; self.draft = draft; self.language = language; self.onResume = onResume
        _name = State(initialValue: draft.displayName)
        _values = State(initialValue: Dictionary(uniqueKeysWithValues: draft.fields.map { ($0.clueIndex, $0.value) }))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(task.question ?? language.text("Review contact details")).font(.headline)
            Text(verbatim: draft.platform).font(.caption).foregroundStyle(Color.tsMutedInk)
            Text(language.text("No contact has been created. Clear a field to omit it; retained accounts will be checked for duplicates."))
                .font(.caption).foregroundStyle(Color.tsMutedInk)
            TextField(language.text("Contact name for filing"), text: $name).textFieldStyle(.roundedBorder)
            ForEach(draft.fields) { field in
                VStack(alignment: .leading, spacing: 6) {
                    Text(language.text(Self.fieldLabel(field.kind))).font(.caption)
                    TextField(language.text(Self.fieldLabel(field.kind)), text: Binding(
                        get: { values[field.clueIndex] ?? "" }, set: { values[field.clueIndex] = String($0.prefix(300)) }
                    )).textFieldStyle(.roundedBorder)
                    DisclosureGroup(language.text("View screenshot evidence")) {
                        Text(field.sourceExcerpt).font(.caption).textSelection(.enabled)
                        Text(verbatim: "\(language.text("Image")) \(field.sourceImageIndex + 1)").font(.caption2)
                    }.font(.caption)
                }
            }
            Text(language.text("Your edits are saved as your review. Original screenshot text remains separate."))
                .font(.caption).foregroundStyle(Color.tsMutedInk)
            ForEach(task.candidates) { candidate in
                Button { confirm(candidate) } label: {
                    Text(verbatim: "\(language.text("Save to")) \(candidate.displayName) · \(candidate.relationshipLabel)").frame(minHeight: 44)
                }.buttonStyle(.bordered).disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            Button(language.text("Confirm details and save")) { confirm(nil) }
                .buttonStyle(.borderedProminent).frame(minHeight: 44)
                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .disabled(onResume == nil)
        .accessibilityIdentifier("screenshot-profile-review")
    }

    private func confirm(_ candidate: ScreenshotContactTask.Candidate?) {
        let fields = draft.fields.compactMap { field -> ScreenshotContactProfileConfirmation.Field? in
            let value = (values[field.clueIndex] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return value.isEmpty ? nil : .init(clueIndex: field.clueIndex, value: value)
        }
        let review = ScreenshotContactProfileConfirmation(expectedRevision: task.revision,
            displayName: String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200)), fields: fields,
            selectedPersonID: candidate?.personID, selectedRelationshipContextID: candidate?.relationshipContextID)
        onResume?(.init(expectedRevision: task.revision, profileConfirmation: review))
    }

    static func fieldLabel(_ kind: String) -> String {
        switch kind {
        case "name": return "Screenshot name"
        case "company": return "Company"
        case "job_title": return "Job title"
        case "handle": return "Platform account"
        default: return "Profile URL"
        }
    }
}
