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
        }
    }
}
