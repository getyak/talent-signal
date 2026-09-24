import Foundation
import Sparkle

struct DesktopUpdatePresentation: Equatable {
    enum Phase: String { case disabled, idle, checking, available, downloading, installing, failed, information }
    var phase: Phase = .disabled
    var version: String?
    var offerID: UUID?
    var progress: Int?
    var status = "此预览版尚未启用签名更新"
    var lastChecked: Date?
    var canInstall: Bool { phase == .available }
    var busy: Bool { phase == .checking || phase == .downloading || phase == .installing }
}

/// One click authorizes only the offered update, including its eventual relaunch.
/// Sparkle retains all archive verification and installation responsibilities.
@MainActor
final class DesktopUpdateSession {
    private(set) var state = DesktopUpdatePresentation() {
        didSet { onChange?(state) }
    }
    var onChange: ((DesktopUpdatePresentation) -> Void)?
    private var pending: ((SPUUserUpdateChoice) -> Void)?
    private var authorized = false
    private var repliedToReady = false
    private var offeredStage: SPUUserUpdateStage = .notDownloaded

    func configure() { state.phase = .idle; state.status = "新版本会在左下角提醒你" }
    func checking() {
        guard pending == nil, !authorized else { return }
        state.phase = .checking; state.status = "正在检查更新…"
    }
    func offer(version: String, verified: Bool, informationOnly: Bool, stage: SPUUserUpdateStage = .notDownloaded,
               reply: @escaping (SPUUserUpdateChoice) -> Void) {
        guard pending == nil, !authorized else { reply(.dismiss); return }
        guard verified else { fail("更新信息未通过签名校验。当前版本仍可使用。"); reply(.dismiss); return }
        state.lastChecked = Date()
        guard !informationOnly else {
            state.phase = .information; state.version = nil
            state.status = "有版本公告，请查看版本记录；此公告没有可安装的更新。"
            reply(.dismiss); return
        }
        pending = reply; offeredStage = stage
        state.offerID = UUID()
        state.version = version; state.progress = nil
        state.phase = .available; state.status = "\(version) 可用，点击后更新并重启"
    }
    func install(offerID: UUID?) {
        guard let offerID, offerID == state.offerID, state.canInstall, let reply = pending else { return }
        pending = nil; authorized = true; repliedToReady = false
        state.offerID = nil
        state.phase = offeredStage == .notDownloaded ? .downloading : .installing
        state.status = offeredStage == .notDownloaded ? "正在下载更新…" : "正在更新并重启…"
        reply(.install)
    }
    func downloadProgress(_ percent: Int?) {
        guard authorized, state.phase == .downloading else { return }
        state.progress = percent.map { max(0, min(100, $0)) }
        state.status = state.progress.map { "正在下载更新 \($0)%" } ?? "正在下载更新…"
    }
    func extracting() {
        guard authorized else { return }
        state.phase = .installing; state.progress = nil; state.status = "正在校验并准备更新…"
    }
    func ready(reply: (SPUUserUpdateChoice) -> Void) {
        guard authorized, !repliedToReady, state.phase == .downloading || state.phase == .installing else {
            // Skip cancels staged installation; dismiss could still install on quit.
            reply(.skip); return
        }
        repliedToReady = true
        state.phase = .installing; state.progress = nil; state.status = "正在更新并重启…"
        reply(.install)
    }
    func waitingForQuit() {
        guard authorized else { return }
        state.status = "正在等待应用退出；若退出被取消，可再次尝试重启。"
    }
    func noUpdate(status: String, verified: Bool) {
        guard verified else { fail("未能验证更新信息。当前版本仍可使用，请稍后重试。"); return }
        pending = nil; authorized = false; repliedToReady = false
        state.offerID = nil
        state.phase = .idle; state.version = nil; state.progress = nil
        state.lastChecked = Date(); state.status = status
    }
    func fail(_ message: String = "未能完成更新。当前版本仍可使用，请重试检查更新。") {
        let reply = pending
        pending = nil; authorized = false; repliedToReady = false
        state.offerID = nil
        state.phase = .failed; state.version = nil; state.progress = nil; state.status = message
        reply?(.dismiss)
    }
    func dismiss() {
        pending = nil; authorized = false; repliedToReady = false
        state.offerID = nil
        if state.phase == .available || state.phase == .downloading || state.phase == .installing {
            state.phase = .idle; state.version = nil; state.progress = nil
            state.status = "更新已结束；可重新检查更新"
        }
    }
}
