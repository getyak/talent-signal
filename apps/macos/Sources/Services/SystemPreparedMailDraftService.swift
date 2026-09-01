import AppKit
import Foundation

@MainActor
struct SystemPreparedMailDraftService: PreparedMailDraftOpening {
    func openDraft(subject: String, body: String) -> Result<MailDraftHandoffReceipt, MailDraftHandoffFailure> {
        let reviewedSubject = subject.trimmingCharacters(in: .whitespacesAndNewlines)
        let reviewedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !reviewedBody.isEmpty else { return .failure(.emptyDraft) }

        var components = URLComponents()
        components.scheme = "mailto"
        components.path = ""
        components.queryItems = [
            URLQueryItem(name: "subject", value: reviewedSubject),
            URLQueryItem(name: "body", value: reviewedBody),
        ]
        guard let url = components.url else { return .failure(.invalidDraftURL) }
        guard NSWorkspace.shared.open(url) else { return .failure(.systemRejectedOpen) }
        return .success(MailDraftHandoffReceipt(subject: reviewedSubject, openedAt: Date()))
    }
}
