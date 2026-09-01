import AppKit

@MainActor
protocol PreparedDraftCopying {
    func copyPreparedDraft(_ text: String) -> Bool
}

@MainActor
struct SystemPreparedDraftClipboard: PreparedDraftCopying {
    func copyPreparedDraft(_ text: String) -> Bool {
        NSPasteboard.general.clearContents()
        return NSPasteboard.general.setString(text, forType: .string)
    }
}
