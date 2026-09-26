import AppKit
import SwiftUI

enum WorkspaceDestination: String, CaseIterable {
    case home = "", people = "people", calendar = "meetings", settings = "settings"

    func url(in origin: WorkspaceOrigin) -> URL {
        rawValue.isEmpty ? origin.entryURL : origin.entryURL.appendingPathComponent(rawValue)
    }
}

@MainActor
final class WorkspaceNavigation: ObservableObject {
    static let shared = WorkspaceNavigation()
    @Published var pending: WorkspaceDestination?
}

struct WorkspaceDesktopCommands: Commands {
    @FocusedObject private var browser: WorkspaceBrowser?

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("新对话") { browser?.navigate(.home) }
                .keyboardShortcut("n").disabled(browser == nil)
        }
        CommandGroup(after: .toolbar) {
            Divider()
            Button("返回") { browser?.webView.goBack() }
                .keyboardShortcut("[").disabled(browser?.webView.canGoBack != true)
            Button("前进") { browser?.webView.goForward() }
                .keyboardShortcut("]").disabled(browser?.webView.canGoForward != true)
            Button("重新载入") { browser?.retry() }
                .keyboardShortcut("r").disabled(browser == nil)
        }
        CommandMenu("前往") {
            Button("人物") { browser?.navigate(.people) }
                .keyboardShortcut("1").disabled(browser == nil)
            Button("时间") { browser?.navigate(.calendar) }
                .keyboardShortcut("2").disabled(browser == nil)
            Button("工作区设置") { browser?.navigate(.settings) }
                .keyboardShortcut(",", modifiers: [.command, .shift]).disabled(browser == nil)
        }
    }
}

enum WorkspaceSettingsSection: String, CaseIterable, Identifiable {
    case profile, account, appearance, workspace, connections, device, updates, advanced
    var id: String { rawValue }
    var title: String {
        switch self {
        case .profile: "个人资料"
        case .account: "账号与安全"
        case .appearance: "外观与偏好"
        case .workspace: "工作空间"
        case .connections: "连接与权限"
        case .device: "此设备"
        case .updates: "软件更新"
        case .advanced: "更多设置"
        }
    }
    var symbol: String {
        switch self {
        case .profile: "person.crop.circle"
        case .account: "lock"
        case .appearance: "circle.lefthalf.filled"
        case .workspace: "person.2"
        case .connections: "link"
        case .device: "laptopcomputer"
        case .updates: "arrow.down.circle"
        case .advanced: "ellipsis.circle"
        }
    }
    var isWeb: Bool { self != .device && self != .updates }
    func url(in origin: WorkspaceOrigin) -> URL {
        var parts = URLComponents(url: origin.url.appendingPathComponent("workspace/settings"), resolvingAgainstBaseURL: false)!
        if self != .profile { parts.queryItems = [URLQueryItem(name: "section", value: rawValue)] }
        return parts.url!
    }
    static func resolve(_ url: URL, origin: WorkspaceOrigin) -> Self? {
        guard origin.contains(url), url.path == "/workspace/settings" || url.path == "/workspace/settings/" else { return nil }
        let value = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "section" })?.value
        if value == nil || value == "overview" { return .profile }
        guard let section = Self(rawValue: value!), section.isWeb else { return nil }
        return section
    }
}

@MainActor
final class WorkspaceSettingsNavigation: ObservableObject {
    static let shared = WorkspaceSettingsNavigation()
    @Published var selection: WorkspaceSettingsSection = .profile
}

/// A second view of the same origin-specific data store, never a reload of the conversation.
private struct ConnectedSettingsSurface: View {
    @StateObject private var browser: WorkspaceBrowser
    @ObservedObject private var navigation = WorkspaceSettingsNavigation.shared
    @ObservedObject private var connection = WorkspaceConnection.shared
    @AppStorage("workspace.desktop.zoom") private var zoom = 1.0
    @Environment(\.openSettings) private var openSettings

    init(origin: WorkspaceOrigin) {
        let section = WorkspaceSettingsNavigation.shared.selection
        _browser = StateObject(wrappedValue: WorkspaceBrowser(origin: origin, settings: true,
            initialURL: (section.isWeb ? section : .profile).url(in: origin)))
    }
    var body: some View {
        ZStack {
            WorkspaceWebSurface(browser: browser, zoom: zoom)
            if let failure = browser.failure {
                VStack(spacing: 16) {
                    Text("设置暂不可用").font(.title2)
                    Text(failure).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Button("重新载入", action: browser.retry)
                    Button("检查本机连接") { navigation.selection = .device }
                }.padding(40).frame(maxWidth: .infinity, maxHeight: .infinity).background(.background)
            } else if browser.loading {
                ProgressView().controlSize(.small).frame(maxHeight: .infinity, alignment: .top).padding(12).allowsHitTesting(false)
            }
        }
        .onAppear { browser.openSettings = { openSettings() } }
        .onChange(of: navigation.selection) { _, section in
            guard section.isWeb else { return }
            let destination = section.url(in: browser.origin)
            guard browser.webView.url != destination else { return }
            browser.webView.load(URLRequest(url: destination))
        }
        .onChange(of: connection.inspectorEnabled) { _, enabled in browser.webView.isInspectable = enabled }
        .alert("在浏览器中打开？", isPresented: Binding(get: { browser.externalURL != nil }, set: { if !$0 { browser.externalURL = nil } })) {
            Button("打开") { if let url = browser.externalURL { NSWorkspace.shared.open(url) }; browser.externalURL = nil }
            Button("取消", role: .cancel) { browser.externalURL = nil }
        } message: { Text(browser.externalURL?.host ?? "此链接位于工作区之外。") }
    }
}

struct WorkspaceDesktopSettings: View {
    @AppStorage("workspace.desktop.zoom") private var zoom = 1.0
    @AppStorage("workspace.desktop.floating") private var floating = false
    @ObservedObject private var updater = DesktopUpdater.shared
    @ObservedObject private var connection = WorkspaceConnection.shared
    @ObservedObject private var navigation = WorkspaceSettingsNavigation.shared
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text("设置").font(.headline).padding(.horizontal, 12).padding(.vertical, 16)
                ForEach(WorkspaceSettingsSection.allCases) { section in
                    if section == .device || section == .advanced { Divider().padding(.vertical, 10) }
                    Button { navigation.selection = section } label: {
                        Label(section.title, systemImage: section.symbol)
                            .font(.system(size: 13, weight: navigation.selection == section ? .medium : .regular))
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).padding(.vertical, 11)
                            .background(navigation.selection == section ? Color.primary.opacity(0.075) : .clear, in: RoundedRectangle(cornerRadius: 8))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("settings.section.\(section.rawValue)")
                    .accessibilityAddTraits(navigation.selection == section ? .isSelected : [])
                }
                Spacer(minLength: 16)
            }.padding(12).frame(width: 196).frame(maxHeight: .infinity).background(.bar)
            Divider()
            ZStack {
                if let origin = connection.origin {
                    ConnectedSettingsSurface(origin: origin).id(origin.url)
                        .opacity(navigation.selection.isWeb ? 1 : 0)
                        .allowsHitTesting(navigation.selection.isWeb)
                        .accessibilityHidden(!navigation.selection.isWeb)
                }
                if navigation.selection == .updates {
                    updatesPane
                } else if navigation.selection == .device || connection.origin == nil {
                    devicePane
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 800, idealWidth: 880, maxWidth: .infinity, minHeight: 620, idealHeight: 700, maxHeight: .infinity)
        .task { updater.start() }
    }

    private var devicePane: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("此设备").font(.title2.weight(.semibold))
                VStack(alignment: .leading, spacing: 16) {
                    Picker("内容大小", selection: $zoom) {
                        Text("90%").tag(0.9); Text("100%").tag(1.0); Text("110%").tag(1.1)
                        Text("125%").tag(1.25); Text("150%").tag(1.5)
                    }
                    Toggle("工作窗口保持在最前", isOn: $floating)
                }
                Divider()
                WorkspaceConnectionForm(mode: .settings) { openWindow(id: "workspace") }
                DisclosureGroup("键盘快捷键") {
                    VStack(spacing: 12) {
                        LabeledContent("新对话", value: "⌘ N")
                        LabeledContent("人物 / 日程", value: "⌘ 1 / ⌘ 2")
                        LabeledContent("设置", value: "⌘ ,")
                        LabeledContent("重新载入", value: "⌘ R")
                    }.padding(.top, 12)
                }
            }.padding(32).frame(maxWidth: 640, alignment: .leading).frame(maxWidth: .infinity)
        }.background(.background)
    }

    private var updatesPane: some View {
            Form {
                Section {
                    LabeledContent("当前版本", value: updater.appVersion)
                    Text(updater.status).foregroundStyle(.secondary)
                    if let checked = updater.presentation.lastChecked {
                        LabeledContent("上次验证更新源", value: checked.formatted(date: .abbreviated, time: .shortened))
                    }
                    if let offerID = updater.presentation.offerID {
                        Button("更新并重启") { updater.installUpdate(offerID: offerID) }
                            .accessibilityIdentifier("updates.install")
                    } else {
                        Button("检查更新") { updater.checkForUpdates() }
                            .disabled(!updater.isConfigured || !updater.canCheck || updater.presentation.busy)
                            .accessibilityIdentifier("updates.check")
                    }
                    if updater.canRetryRelaunch {
                        Button("再次尝试重启") { updater.retryRelaunch() }
                    }
                }
                Section {
                    Toggle("自动检查更新", isOn: $updater.automaticChecks).disabled(!updater.isConfigured)
                    Toggle("接收预览版本", isOn: $updater.includesPreview)
                        .disabled(!updater.isConfigured || updater.sessionInProgress)
                } footer: {
                    Text("新版本会在左下角提醒。点击“更新并重启”后，会下载、校验并重新打开应用，不再弹出确认。未点击时不会安装或重启。")
                }
                Section {
                    Link("版本记录与安装帮助", destination: URL(string: "https://github.com/getyak/talent-signal/releases?q=macos-")!)
                    if !updater.isConfigured {
                        Text("正式签名更新尚未配置。可从版本记录下载已发布的安装包。")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }.formStyle(.grouped)

    }
}

struct WorkspaceWindowBehavior: NSViewRepresentable {
    let floating: Bool

    final class View: NSView {
        var floating = false
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            window?.level = floating ? .floating : .normal
        }
    }

    func makeNSView(context: Context) -> View { View() }
    func updateNSView(_ view: View, context: Context) {
        view.floating = floating
        view.window?.level = floating ? .floating : .normal
    }
}
