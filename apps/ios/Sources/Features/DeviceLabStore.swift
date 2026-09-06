import Foundation
import SwiftUI

private struct LabReduceMotionKey: EnvironmentKey {
    static let defaultValue = false
}
extension EnvironmentValues {
    var labReduceMotion: Bool {
        get { self[LabReduceMotionKey.self] }
        set { self[LabReduceMotionKey.self] = newValue }
    }
}

enum DeviceLabAvailability {
    static var enabled: Bool {
#if DEBUG
        true
#else
        Bundle.main.object(forInfoDictionaryKey: "TalentSignalDeviceLabEnabled") as? String == "YES"
#endif
    }
}

final class LabOnboardingMemoryStore: StandaloneOnboardingPersisting {
    private var state: StandaloneOnboardingState?
    init(startsInReview: Bool = false) {
        if startsInReview { var value = StandaloneOnboardingState.fresh(); value.startFirstProgressExample(); state = value }
    }
    func load() throws -> StandaloneOnboardingState? { state }
    func save(_ state: StandaloneOnboardingState) throws { self.state = state }
    func reset() throws { state = nil }
}

@MainActor
final class DeviceLabStore: ObservableObject {
    @Published private(set) var cacheBytes = 0
    @Published private(set) var cacheAfterClear: Int?
    @Published private(set) var isClearing = false
    private let cache: URLCache

    init(cache: URLCache = .shared) {
        self.cache = cache
        refreshCache()
    }
    func refreshCache() { cacheBytes = cache.currentMemoryUsage + cache.currentDiskUsage }
    func clearCache() async {
        guard !isClearing else { return }
        isClearing = true
        defer { isClearing = false }
        // URLCache alone is rebuildable. No Application Support, Keychain, App Group or defaults deletion.
        cache.removeAllCachedResponses()
        // Disk removal is asynchronous. Verify the observed size before reporting completion.
        for _ in 0..<5 {
            refreshCache()
            if cacheBytes == 0 { break }
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
        refreshCache()
        cacheAfterClear = cacheBytes
    }
}
