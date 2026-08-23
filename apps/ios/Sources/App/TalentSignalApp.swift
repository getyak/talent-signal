import AppIntents
import SwiftUI

@main
struct TalentSignalApp: App {
    @Environment(\.scenePhase) private var scenePhase

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
                .onChange(of: scenePhase) { phase in
                    guard phase == .active else { return }
                    Task {
                        await CaptureHandoffStore.shared.restorePendingCapture()
                    }
                }
        }
    }
}
