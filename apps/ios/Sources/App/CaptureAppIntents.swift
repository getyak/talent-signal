import AppIntents
import Foundation
import UniformTypeIdentifiers

struct ImportConversationScreenshotIntent: AppIntent {
    static let title: LocalizedStringResource = "Review conversation screenshot"
    static let description = IntentDescription(
        "Open Talent Signal to review text and identity before saving a conversation screenshot."
    )
    static let openAppWhenRun = true

    @Parameter(title: "Screenshot")
    var screenshot: IntentFile

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let url = screenshot.fileURL else {
            throw CaptureAppIntentError.fileUnavailable
        }

        let didStartAccess = url.startAccessingSecurityScopedResource()
        defer {
            if didStartAccess {
                url.stopAccessingSecurityScopedResource()
            }
        }

        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        guard !data.isEmpty else {
            throw CaptureAppIntentError.fileUnavailable
        }
        let type = (try? url.resourceValues(forKeys: [.contentTypeKey]).contentType)
        guard type?.conforms(to: .image) != false else {
            throw CaptureAppIntentError.notAnImage
        }
        let seed = try await PendingCaptureInbox.shared.stage(
            imageData: data,
            fileName: url.lastPathComponent.isEmpty
                ? "conversation-screenshot"
                : url.lastPathComponent,
            mediaType: type?.preferredMIMEType ?? "image/*",
            origin: .appShortcut
        )
        await CaptureHandoffStore.shared.present(seed)
        return .result(
            dialog: "Ready for text and identity review in Talent Signal."
        )
    }
}

struct TalentSignalShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ImportConversationScreenshotIntent(),
            phrases: [
                "Review screenshot in \(.applicationName)",
                "Capture conversation with \(.applicationName)"
            ],
            shortTitle: "Review screenshot",
            systemImageName: "text.viewfinder"
        )
    }
}

enum CaptureAppIntentError: LocalizedError {
    case fileUnavailable
    case notAnImage

    var errorDescription: String? {
        switch self {
        case .fileUnavailable:
            return "The screenshot could not be read. Choose an image and try again."
        case .notAnImage:
            return "Choose an image file for conversation review."
        }
    }
}
