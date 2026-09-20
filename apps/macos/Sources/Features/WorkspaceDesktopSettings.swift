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
            Button("日程") { browser?.navigate(.calendar) }
                .keyboardShortcut("2").disabled(browser == nil)
            Button("工作区设置") { browser?.navigate(.settings) }
                .keyboardShortcut(",", modifiers: [.command, .shift]).disabled(browser == nil)
        }
    }
}

struct WorkspaceDesktopSettings: View {
    @AppStorage("workspace.desktop.zoom") private var zoom = 1.0
    @AppStorage("workspace.desktop.floating") private var floating = false
    @AppStorage("workspace.web.origin") private var origin = ""
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Form {
            Section {
                LabeledContent("内容大小") {
                    Picker("内容大小", selection: $zoom) {
                        Text("紧凑 · 90%").tag(0.9)
                        Text("默认 · 100%").tag(1.0)
                        Text("舒适 · 110%").tag(1.1)
                        Text("大号 · 125%").tag(1.25)
                        Text("特大 · 150%").tag(1.5)
                    }.labelsHidden().frame(width: 155)
                }
                Toggle("工作区保持在其他窗口上方", isOn: $floating)
            } header: {
                Text("阅读与窗口")
            } footer: {
                Text("仅影响这台 Mac。网页中的外观偏好在工作区设置中管理。")
            }
            Section("工作区") {
                LabeledContent("当前服务") {
                    Text(WorkspaceOrigin.configured(saved: origin)?.url.host ?? "尚未连接")
                        .foregroundStyle(.secondary).lineLimit(1)
                        .truncationMode(.middle).textSelection(.enabled)
                }
                Button {
                    WorkspaceNavigation.shared.pending = .settings
                    openWindow(id: "workspace")
                } label: {
                    HStack {
                        Text("账号、外观与连接")
                        Spacer()
                        Image(systemName: "arrow.up.right").foregroundStyle(.secondary)
                    }
                }.buttonStyle(.plain)
            }
            Section("键盘快捷键") {
                shortcut("新对话", "⌘ N")
                shortcut("搜索人物与对话", "⌘ K")
                shortcut("人物 / 日程", "⌘ 1 / ⌘ 2")
                shortcut("返回 / 前进", "⌘ [ / ⌘ ]")
                shortcut("本机设置", "⌘ ,")
            }
        }
        .formStyle(.grouped)
        .frame(width: 480, height: 540)
        .background(WorkspaceWindowBehavior(floating: floating))
    }

    private func shortcut(_ title: String, _ keys: String) -> some View {
        LabeledContent(title) {
            Text(keys).font(.system(.caption, design: .monospaced)).foregroundStyle(.secondary)
        }
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
