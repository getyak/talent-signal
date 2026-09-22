import AppKit
import Combine
import Sparkle

struct DesktopUpdateConfiguration {
    static let productionFeed = "https://github.com/getyak/talent-signal/releases/download/macos-updates/appcast.xml"

    static func isValid(feed: String, publicKey: String, allowsLocalFeed: Bool = false) -> Bool {
        guard let key = Data(base64Encoded: publicKey), key.count == 32 else { return false }
        if feed == productionFeed { return true }
        #if DEBUG
        if allowsLocalFeed, let url = URL(string: feed), url.scheme == "http", url.host == "127.0.0.1",
           url.user == nil, url.password == nil, url.query == nil, url.fragment == nil { return true }
        #endif
        return false
    }
}

@MainActor
final class DesktopUpdater: NSObject, ObservableObject, SPUUpdaterDelegate, @preconcurrency SPUStandardUserDriverDelegate {
    static let shared = DesktopUpdater()
    @Published private(set) var availableVersion: String?
    @Published private(set) var canCheck = false
    @Published private(set) var sessionInProgress = false
    @Published private(set) var status = "此预览版尚未启用签名更新"
    @Published var automaticChecks = true {
        didSet { if started { controller.updater.automaticallyChecksForUpdates = automaticChecks } }
    }
    @Published var includesPreview = UserDefaults.standard.bool(forKey: "workspace.updates.preview") {
        didSet { UserDefaults.standard.set(includesPreview, forKey: "workspace.updates.preview") }
    }
    private var started = false
    private lazy var controller = SPUStandardUpdaterController(startingUpdater: false,
                                                              updaterDelegate: self, userDriverDelegate: self)
    var isConfigured: Bool {
        var rehearsal = false
        #if DEBUG
        rehearsal = Bundle.main.object(forInfoDictionaryKey: "TalentSignalUpdateRehearsal") as? Bool == true
        #endif
        return DesktopUpdateConfiguration.isValid(
            feed: Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") as? String ?? "",
            publicKey: Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String ?? "",
            allowsLocalFeed: rehearsal)
    }
    var appVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—"
        return "\(version) (\(build))"
    }

    func start() {
        guard !started, isConfigured,
              !ProcessInfo.processInfo.arguments.contains("--ui-testing") else { return }
        started = true
        controller.updater.publisher(for: \.canCheckForUpdates).assign(to: &$canCheck)
        controller.updater.publisher(for: \.sessionInProgress).assign(to: &$sessionInProgress)
        controller.startUpdater()
        automaticChecks = controller.updater.automaticallyChecksForUpdates
        // Restart/install always remains an explicit decision in Sparkle's review UI.
        controller.updater.automaticallyDownloadsUpdates = false
        status = "更新会在这里安静地提醒你"
    }

    func checkForUpdates() {
        start()
        guard started, canCheck || availableVersion != nil else { return }
        status = availableVersion == nil ? "正在检查更新…" : "新版本可用"
        controller.checkForUpdates(nil)
    }

    var supportsGentleScheduledUpdateReminders: Bool { true }
    func standardUserDriverShouldHandleShowingScheduledUpdate(_ update: SUAppcastItem,
                                                              andInImmediateFocus immediateFocus: Bool) -> Bool { false }
    func standardUserDriverWillHandleShowingUpdate(_ handleShowingUpdate: Bool,
                                                   forUpdate update: SUAppcastItem, state: SPUUserUpdateState) {
        availableVersion = update.displayVersionString
        status = "\(update.displayVersionString) 可供更新"
    }
    func standardUserDriverWillFinishUpdateSession() { availableVersion = nil }
    func allowedChannels(for updater: SPUUpdater) -> Set<String> { includesPreview ? ["preview"] : [] }
    func updater(_ updater: SPUUpdater, didAbortWithError error: Error) {
        availableVersion = nil
        if (error as NSError).code == SUError.noUpdateError.rawValue { status = "当前已是最新版本" }
        else { status = "未能完成更新。当前版本仍可使用，请稍后重试。" }
    }
}
