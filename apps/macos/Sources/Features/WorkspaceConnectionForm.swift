import AppKit
import SwiftUI

struct WorkspaceConnectionForm: View {
    var onConnected: () -> Void
    @ObservedObject private var connection = WorkspaceConnection.shared
    @State private var address = ""
    @State private var localDevelopment = false
    @State private var advanced = false
    @State private var result: ConnectionProbeResult?
    @State private var probing = false
    @State private var probeID = UUID()
    @State private var probeTask: Task<Void, Never>?
    @State private var error: String?
    @State private var confirmSwitch = false
    @State private var copied = false

    private var parsed: WorkspaceOrigin? { WorkspaceConnection.parseInput(address, allowLocalDevelopment: localDevelopment) }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 8) {
                Label(connection.origin == nil ? "连接你的工作区" : "连接与调试", systemImage: "network")
                    .font(.title2.weight(.semibold))
                Text("在这台 Mac 上继续同一份对话、人物和日程。")
                    .font(.callout).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("工作区服务").font(.callout.weight(.medium))
                TextField("https://你的工作区地址", text: $address)
                    .textFieldStyle(.roundedBorder).accessibilityIdentifier("connection.address")
                    .onSubmit { requestSave() }
                Text("可以粘贴完整工作区链接。API 由该工作区的服务端配置。")
                    .font(.caption).foregroundStyle(.secondary)
                if let parsed, parsed.url.absoluteString != address.trimmingCharacters(in: .whitespacesAndNewlines) {
                    Text("将连接 \(parsed.url.absoluteString)").font(.caption).foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                HStack(spacing: 12) {
                    Button(action: testConnection) {
                        HStack(spacing: 6) {
                            if probing { ProgressView().controlSize(.mini) }
                            Text(probing ? "检查中…" : "测试连接")
                        }
                    }.disabled(parsed == nil || probing).accessibilityIdentifier("connection.test")
                    Spacer()
                    Button(connection.origin == nil ? "打开工作区" : "保存连接", action: requestSave)
                        .buttonStyle(.borderedProminent).disabled(parsed == nil)
                        .accessibilityIdentifier("connection.save")
                }
            }
            if let error { Text(error).font(.callout).foregroundStyle(.red) }
            else if !address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && parsed == nil {
                Text("请使用 HTTPS 地址或工作区链接。本机 HTTP 需在开发与诊断中启用；地址不能包含账号、查询参数或片段。")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let result {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: result.reachable ? "checkmark.circle" : "exclamationmark.circle")
                        .foregroundStyle(result.reachable ? Color.secondary : Color.orange)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(result.summary).font(.callout.weight(.medium))
                        Text(result.detail).font(.caption).foregroundStyle(.secondary)
                    }
                }.accessibilityElement(children: .combine).accessibilityIdentifier("connection.result")
            }
            Divider()
            DisclosureGroup("开发与诊断", isExpanded: $advanced) {
                VStack(alignment: .leading, spacing: 14) {
                    Toggle("允许本机开发服务", isOn: $localDevelopment)
                    Text("仅允许 localhost、127.0.0.1 或 ::1 使用 HTTP；远端始终使用 HTTPS。")
                        .font(.caption).foregroundStyle(.secondary)
                    Button("填入本机开发地址") { localDevelopment = true; address = "http://127.0.0.1:3000" }
                    Toggle("启用网页检查器", isOn: $connection.inspectorEnabled)
                    Text("开启后，可通过 Safari 的开发菜单检查此窗口。仅在调试时开启。")
                        .font(.caption).foregroundStyle(.secondary)
                    HStack {
                        Text("客户端 \(DesktopUpdater.shared.appVersion)").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Button(copied ? "已复制" : "复制诊断摘要") {
                            let summary = "Talent Signal \(DesktopUpdater.shared.appVersion)\nmacOS \(ProcessInfo.processInfo.operatingSystemVersionString)\nConnection: \(result?.summary ?? "Not checked")\n\(result?.detail ?? "")\nLocal development: \(localDevelopment)\nInspector: \(connection.inspectorEnabled)\nWorkspace address, cookies and content omitted."
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(summary, forType: .string)
                            copied = true
                        }
                    }
                    Text("摘要不包含服务地址、账号、登录凭据或对话内容。")
                        .font(.caption).foregroundStyle(.secondary)
                }.padding(.top, 14)
            }.font(.callout)
            Text("切换服务后会重新载入页面。不同服务的登录状态单独保存。")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(28)
        .onAppear {
            address = connection.origin?.url.absoluteString ?? ""
            localDevelopment = connection.allowsLocalDevelopment
        }
        .onChange(of: address) { _, _ in invalidateProbe() }
        .onChange(of: localDevelopment) { _, _ in invalidateProbe() }
        .onDisappear { invalidateProbe() }
        .confirmationDialog("切换工作区服务？", isPresented: $confirmSwitch, titleVisibility: .visible) {
            Button("切换并重新载入") { save() }
            Button("取消", role: .cancel) {}
        } message: {
            Text("请先完成当前输入或上传。将打开 \(parsed?.url.absoluteString ?? "")，现有服务的登录状态会保留。")
        }
    }

    private func invalidateProbe() {
        probeTask?.cancel(); probeTask = nil
        probeID = UUID(); probing = false; result = nil; error = nil; copied = false
    }
    private func testConnection() {
        guard let origin = parsed else { return }
        invalidateProbe(); probing = true
        let id = probeID
        probeTask = Task {
            let observed = await WorkspaceConnectionProbe(origin: origin).run()
            guard !Task.isCancelled, probeID == id else { return }
            result = observed; probing = false
        }
    }
    private func requestSave() {
        guard let parsed else { error = "请输入 HTTPS 工作区地址；本机 HTTP 需要启用开发服务。"; return }
        if let current = connection.origin, current != parsed { confirmSwitch = true }
        else { save() }
    }
    private func save() {
        guard connection.save(address, allowLocalDevelopment: localDevelopment) else { return }
        onConnected()
    }
}
