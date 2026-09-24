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

struct WorkspaceDesktopSettings: View {
    @AppStorage("workspace.desktop.zoom") private var zoom = 1.0
    @AppStorage("workspace.desktop.floating") private var floating = false
    @ObservedObject private var updater = DesktopUpdater.shared
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        TabView {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    WorkspaceConnectionForm(mode: .settings) {
                        openWindow(id: "workspace")
                    }
                    .frame(maxWidth: 400)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 28)
                .padding(.top, 24)
                .padding(.bottom, 28)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .tabItem { Label("连接", systemImage: "network") }
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
            }.formStyle(.grouped).tabItem { Label("更新", systemImage: "arrow.down.circle") }
            Form {
                Picker("内容大小", selection: $zoom) {
                    Text("90%").tag(0.9); Text("100%").tag(1.0); Text("110%").tag(1.1)
                    Text("125%").tag(1.25); Text("150%").tag(1.5)
                }
                Toggle("窗口保持在其他窗口上方", isOn: $floating)
                LabeledContent("新对话", value: "⌘ N")
                LabeledContent("人物 / 日程", value: "⌘ 1 / ⌘ 2")
                LabeledContent("连接", value: "⌘ ,")
                LabeledContent("重新载入", value: "⌘ R")
            }.formStyle(.grouped).tabItem { Label("外观", systemImage: "textformat.size") }
        }
        .padding(12).frame(width: 550, height: 600)
        .task { updater.start() }
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
