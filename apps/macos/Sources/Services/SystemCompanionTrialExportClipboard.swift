import AppKit
import Foundation

@MainActor
struct SystemCompanionTrialExportClipboard: CompanionTrialExportCopying {
    func copyTrialExport(_ text: String) -> Bool {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        return pasteboard.setString(text, forType: .string)
    }
}
