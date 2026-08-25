import AppIntents
import Combine
import Foundation
import OSLog
import UniformTypeIdentifiers

enum CaptureIntentDestination: String, Equatable, Sendable {
    case hub
    case foregroundAudio
}

@MainActor
final class CaptureIntentRouter: ObservableObject {
    struct Request: Identifiable, Equatable {
        let id = UUID()
        let destination: CaptureIntentDestination
    }

    static let shared = CaptureIntentRouter()

    @Published private(set) var request: Request?

    private init() {}

    func route(to destination: CaptureIntentDestination) {
        request = Request(destination: destination)
    }

    func consume(_ id: UUID) {
        guard request?.id == id else { return }
        request = nil
    }
}

struct CaptureSignalIntent: AppIntent {
    static let title: LocalizedStringResource = "Capture Signal"
    static let description = IntentDescription(
        "Open Talent Signal to choose a purpose-bound text, screenshot, or foreground audio capture."
    )

    @available(iOS 26.0, *)
    static let supportedModes: IntentModes = .foreground(.immediate)

    // Compatibility for iOS 16–25. `supportedModes` replaces this on iOS 26.
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await MainActor.run {
            CaptureIntentRouter.shared.route(to: .hub)
        }
        return .result(
            dialog: "Talent Signal opened to Capture. Nothing has been recorded or uploaded."
        )
    }
}

struct RecordSignalIntent: AppIntent {
    static let title: LocalizedStringResource = "Record Signal"
    static let description = IntentDescription(
        "Open Talent Signal before requesting microphone permission or starting a recording."
    )

    @available(iOS 26.0, *)
    static let supportedModes: IntentModes = .foreground(.immediate)

    // Compatibility for iOS 16–25. Recording never runs inside the intent.
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await MainActor.run {
            CaptureIntentRouter.shared.route(to: .foregroundAudio)
        }
        return .result(
            dialog: "Talent Signal opened for foreground recording. Recording has not started."
        )
    }
}

struct ImportConversationScreenshotIntent: AppIntent {
    static let title: LocalizedStringResource = "Review conversation screenshot"
    static let description = IntentDescription(
        "Save a conversation screenshot on this device for later text and identity review."
    )

    @available(iOS 26.0, *)
    static let supportedModes: IntentModes = .background

    // Compatibility for iOS 16–25. `supportedModes` replaces this on iOS 26.
    static let openAppWhenRun = false

    @Parameter(title: "Screenshot")
    var screenshot: IntentFile

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let trace = CaptureIntentTrace()
        trace.mark("intent_received")
        let input = try loadInput()
        trace.mark("asset_ready")

        let type = input.mediaType
        guard type?.conforms(to: .image) != false else {
            throw CaptureAppIntentError.notAnImage
        }

        _ = try await PendingCaptureInbox.shared.stage(
            imageData: input.data,
            fileName: input.fileName,
            mediaType: type?.preferredMIMEType ?? "image/*",
            origin: .appShortcut
        )
        trace.mark("persisted")
        trace.mark("review_enqueued")
        trace.mark("intent_returning")
        return .result(
            dialog: "Captured quietly. Open Talent Signal when you are ready to review."
        )
    }

    private func loadInput() throws -> ScreenshotInput {
        if let url = screenshot.fileURL {
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
            let urlType = try? url.resourceValues(
                forKeys: [.contentTypeKey]
            ).contentType
            return ScreenshotInput(
                data: data,
                fileName: url.lastPathComponent.isEmpty
                    ? screenshot.filename
                    : url.lastPathComponent,
                mediaType: urlType ?? screenshot.type
            )
        }

        let data = screenshot.data
        guard !data.isEmpty else {
            throw CaptureAppIntentError.fileUnavailable
        }
        return ScreenshotInput(
            data: data,
            fileName: screenshot.filename.isEmpty
                ? "conversation-screenshot"
                : screenshot.filename,
            mediaType: screenshot.type
        )
    }
}

struct TalentSignalShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CaptureSignalIntent(),
            phrases: [
                "Capture Signal with \(.applicationName)",
                "Remember a Signal in \(.applicationName)"
            ],
            shortTitle: "Capture Signal",
            systemImageName: "waveform.badge.plus"
        )
        AppShortcut(
            intent: RecordSignalIntent(),
            phrases: [
                "Record a Signal with \(.applicationName)",
                "Open Signal recorder in \(.applicationName)"
            ],
            shortTitle: "Record Signal",
            systemImageName: "mic"
        )
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

private struct ScreenshotInput {
    let data: Data
    let fileName: String
    let mediaType: UTType?
}

private struct CaptureIntentTrace {
    private static let logger = Logger(
        subsystem: "com.talentsignal.app",
        category: "shortcut-capture"
    )

    private let startedAt = Date()

    func mark(_ event: String) {
        let elapsedMilliseconds = Date().timeIntervalSince(startedAt) * 1_000
        Self.logger.notice(
            "shortcut_capture event=\(event, privacy: .public) elapsed_ms=\(elapsedMilliseconds, privacy: .public)"
        )
    }
}
