import Foundation

struct MailDraftHandoffReceipt: Equatable, Sendable {
    let subject: String
    let openedAt: Date
}

enum MailDraftHandoffFailure: Error, Equatable, Sendable {
    case emptyDraft
    case invalidDraftURL
    case systemRejectedOpen
}

enum MailDraftHandoffStatus: Equatable, Sendable {
    case notOpened
    case opened(MailDraftHandoffReceipt)
    case failed(String)
}

@MainActor
protocol PreparedMailDraftOpening {
    func openDraft(subject: String, body: String) -> Result<MailDraftHandoffReceipt, MailDraftHandoffFailure>
}
