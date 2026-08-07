import AppIntents
import SwiftUI

@main
struct TalentSignalApp: App {
    private var requestedColorScheme: ColorScheme? {
        ProcessInfo.processInfo.arguments.contains("--force-dark") ? .dark : nil
    }

    var body: some Scene {
        WindowGroup {
            CandidateSignalView()
                .preferredColorScheme(requestedColorScheme)
                .task {
                    let configured = CaptureHandoffStore.shared
                        .configureDeterministicLaunch(
                            arguments: ProcessInfo.processInfo.arguments
                        )
                    if !configured {
                        await CaptureHandoffStore.shared.restorePendingCapture()
                    }
                    TalentSignalShortcuts.updateAppShortcutParameters()
                }
        }
    }
}
