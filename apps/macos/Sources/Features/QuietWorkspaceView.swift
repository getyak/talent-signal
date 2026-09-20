import AppKit
import SwiftUI
import WebKit

/// The product window has no script handlers or native capability bridge.
/// Native intake remains a separate, explicitly opened window with its own scope.
struct WorkspaceOrigin: Equatable {
    let url: URL

    init?(_ value: String, allowLocalDevelopment: Bool = false) {
        guard let url = URL(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = url.host, !host.isEmpty,
              url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/" else { return nil }
        var validScheme = url.scheme == "https"
        #if DEBUG
        if allowLocalDevelopment, url.scheme == "http", host == "127.0.0.1" {
            validScheme = true
        }
        #endif
        guard validScheme else { return nil }
        self.url = url
    }

    static func configured(saved: String, environment: String? = ProcessInfo.processInfo.environment["TALENT_SIGNAL_WEB_ORIGIN"], bundled: String? = Bundle.main.object(forInfoDictionaryKey: "TalentSignalWebOrigin") as? String) -> WorkspaceOrigin? {
        parseConfigured(saved) ?? parseConfigured(environment ?? bundled ?? "")
    }

    static func parseConfigured(_ value: String) -> WorkspaceOrigin? {
        #if DEBUG
        return WorkspaceOrigin(value, allowLocalDevelopment: ProcessInfo.processInfo.arguments.contains("--web-workspace-testing"))
        #else
        return WorkspaceOrigin(value)
        #endif
    }

    var entryURL: URL { url.appendingPathComponent("workspace") }

    func contains(_ candidate: URL) -> Bool {
        candidate.scheme == url.scheme && candidate.host == url.host &&
            (candidate.port ?? (url.scheme == "https" ? 443 : 80)) ==
            (url.port ?? (url.scheme == "https" ? 443 : 80)) &&
            candidate.user == nil && candidate.password == nil
    }
}

@MainActor
final class WorkspaceBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    let origin: WorkspaceOrigin
    let webView: WKWebView
    @Published var failure: String?
    @Published var loading = true
    @Published var canGoBack = false
    @Published var externalURL: URL?
    private var navigationObservation: NSKeyValueObservation?

    init(origin: WorkspaceOrigin) {
        self.origin = origin
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController = WKUserContentController()
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        navigationObservation = webView.observe(\.canGoBack, options: [.new]) { [weak self] _, _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.canGoBack = self.webView.canGoBack
            }
        }
        webView.load(URLRequest(url: origin.entryURL))
    }

    func navigate(_ destination: WorkspaceDestination) {
        webView.load(URLRequest(url: destination.url(in: origin)))
    }

    func retry() {
        failure = nil
        if let current = webView.url, origin.contains(current) { webView.reload() }
        else { webView.load(URLRequest(url: origin.entryURL)) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if origin.contains(url) {
            if action.targetFrame == nil {
                webView.load(action.request)
                decisionHandler(.cancel)
            } else { decisionHandler(.allow) }
            return
        }
        // Cross-origin auth or source links are never silently launched by a redirect.
        if action.targetFrame?.isMainFrame != false,
           ["https", "http"].contains(url.scheme ?? "") {
            externalURL = url
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        loading = true
        failure = nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loading = false
        canGoBack = webView.canGoBack
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        recordFailure(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        recordFailure(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loading = false
        failure = "页面已暂停，请重新载入。已保存的对话仍保留在工作区。"
    }

    private func recordFailure(_ error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        loading = false
        failure = "暂时无法打开工作区。请检查网络、Tailscale 和工作区服务，再重试。"
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard let url = frame.request.url, origin.contains(url), let window = webView.window else {
            completionHandler(false); return
        }
        let alert = NSAlert()
        alert.messageText = "工作区确认 · \(origin.url.host ?? "Talent Signal")"
        alert.informativeText = message
        alert.addButton(withTitle: "确认")
        alert.addButton(withTitle: "取消")
        alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard let url = frame.request.url, origin.contains(url), let window = webView.window else {
            completionHandler(); return
        }
        let alert = NSAlert()
        alert.messageText = "工作区 · \(origin.url.host ?? "Talent Signal")"
        alert.informativeText = message
        alert.addButton(withTitle: "好")
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard let url = frame.request.url, origin.contains(url) else { completionHandler(nil); return }
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.begin { result in completionHandler(result == .OK ? panel.urls : nil) }
    }
}

private struct WorkspaceWebSurface: NSViewRepresentable {
    let browser: WorkspaceBrowser
    let zoom: Double
    func makeNSView(context: Context) -> WKWebView {
        browser.webView.pageZoom = min(1.5, max(0.9, zoom))
        return browser.webView
    }
    func updateNSView(_ nsView: WKWebView, context: Context) {
        nsView.pageZoom = min(1.5, max(0.9, zoom))
    }
}

private struct ConnectedQuietWorkspace: View {
    @ObservedObject private var navigation = WorkspaceNavigation.shared
    @StateObject private var browser: WorkspaceBrowser
    @Environment(\.openWindow) private var openWindow
    @AppStorage("workspace.desktop.zoom") private var zoom = 1.0
    @AppStorage("workspace.desktop.floating") private var floating = false

    init(origin: WorkspaceOrigin) { _browser = StateObject(wrappedValue: WorkspaceBrowser(origin: origin)) }

    private func consumeDestination() {
        guard let destination = navigation.pending else { return }
        navigation.pending = nil
        browser.navigate(destination)
    }

    var body: some View {
        ZStack(alignment: .top) {
            WorkspaceWebSurface(browser: browser, zoom: zoom)
            if browser.loading {
                ProgressView().controlSize(.mini).padding(6)
                    .accessibilityLabel("正在载入工作区").allowsHitTesting(false)
            }
            if let failure = browser.failure {
                VStack(spacing: 18) {
                    Image(systemName: "network.slash").font(.title)
                    Text("工作区暂不可用").font(.title2)
                    Text(failure).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Button("重新载入", action: browser.retry).buttonStyle(.borderedProminent)
                }
                .padding(40).frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(TSBrand.canvas)
            }
        }
        .focusedSceneObject(browser)
        .background(WorkspaceWindowBehavior(floating: floating))
        .onAppear { consumeDestination() }
        .onChange(of: navigation.pending) { _, _ in consumeDestination() }
        .toolbar {
            ToolbarItemGroup(placement: .navigation) {
                Button { browser.webView.goBack() } label: { Image(systemName: "chevron.left") }
                    .disabled(!browser.canGoBack).help("返回")
            }
            ToolbarItem {
                Menu {
                    Button("新对话") { browser.navigate(.home) }
                    Button("工作区设置") { browser.navigate(.settings) }
                    Divider()
                    Button("重新载入", action: browser.retry)
                    Button("本机工具") { openWindow(id: "native-tools") }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }.help("工作区操作")
            }
        }
        .alert("在浏览器中打开？", isPresented: Binding(
            get: { browser.externalURL != nil }, set: { if !$0 { browser.externalURL = nil } }
        )) {
            Button("打开") {
                if let url = browser.externalURL { NSWorkspace.shared.open(url) }
                browser.externalURL = nil
            }
            Button("取消", role: .cancel) { browser.externalURL = nil }
        } message: {
            Text(browser.externalURL?.host ?? "此链接位于工作区之外。")
        }
    }
}

struct QuietWorkspaceView: View {
    @AppStorage("workspace.web.origin") private var savedOrigin = ""
    @State private var originDraft = ""
    @State private var error: String?
    @State private var editingOrigin = false

    private var configured: WorkspaceOrigin? { WorkspaceOrigin.configured(saved: savedOrigin) }

    var body: some View {
        if let origin = configured {
            ConnectedQuietWorkspace(origin: origin).id(origin.url)
                .toolbar {
                    ToolbarItem {
                        Button("工作区地址", systemImage: "network") {
                            originDraft = origin.url.absoluteString
                            editingOrigin = true
                        }
                    }
                }
                .sheet(isPresented: $editingOrigin) { connectionForm.frame(width: 540, height: 360) }
        } else { connectionForm }
    }

    private var connectionForm: some View {
            VStack(alignment: .leading, spacing: 20) {
                TSBrandMark(size: 28)
                Text("打开你的工作区").font(.title2)
                Text("连接 Talent Signal Web，在 Mac 上继续同一份对话、人物和日程。")
                    .foregroundStyle(.secondary)
                TextField("https://你的工作区地址", text: $originDraft)
                    .textFieldStyle(.roundedBorder).onSubmit(connect)
                if let error { Text(error).foregroundStyle(.red) }
                HStack {
                    Button("继续", action: connect).buttonStyle(.borderedProminent)
                    if editingOrigin { Button("取消") { editingOrigin = false; error = nil } }
                }
                Text("仅保存服务地址。登录由工作区完成，本机工具另行授权。")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .padding(40).frame(maxWidth: 540)
            .frame(maxWidth: .infinity, maxHeight: .infinity).background(TSBrand.canvas)
    }

    private func connect() {
        guard let origin = WorkspaceOrigin.parseConfigured(originDraft) else {
            error = "请输入 HTTPS 工作区地址，不包含路径、账号或查询参数。"
            return
        }
        savedOrigin = origin.url.absoluteString
        editingOrigin = false
        error = nil
    }
}
