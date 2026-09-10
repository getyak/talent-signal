import SwiftUI
import UniformTypeIdentifiers

private struct RunArtifactDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.json, .plainText, .commaSeparatedText]
    let data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        self.data = data
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct RunArtifactsView: View {
    let taskID: String
    let language: AppLanguage
    let list: () async throws -> [RunArtifact]
    let download: (RunArtifact) async throws -> Data
    @State private var files: [RunArtifact] = []
    @State private var busy = false
    @State private var notice: String?
    @State private var document: RunArtifactDocument?
    @State private var filename = "analysis.json"
    @State private var contentType: UTType = .json
    @State private var exporting = false
    @State private var loadingTask: Task<Void, Never>?
    @State private var listing = true
    @State private var listFailed = false
    @State private var listAttempt = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if listing {
                ProgressView(language.text("Checking generated files…", zhHans: "正在检查生成的文件…"))
                    .font(.caption)
            } else if listFailed {
                Button(language.text("Files could not be loaded. Retry", zhHans: "文件列表加载失败，重试")) {
                    listAttempt += 1
                }
                .font(.caption)
            }
            if !files.isEmpty {
                Text(language.text("Generated files · analysis to verify", zhHans: "生成的文件 · 分析结果，待核实"))
                    .font(.caption).foregroundStyle(.secondary)
                ForEach(files) { file in
                    Button {
                        busy = true; notice = nil
                        loadingTask = Task { @MainActor in
                            defer { busy = false; loadingTask = nil }
                            do {
                                let data = try await download(file)
                                try Task.checkCancellation()
                                document = RunArtifactDocument(data: data)
                                filename = file.name
                                contentType = UTType(mimeType: file.mediaType) ?? .plainText
                                exporting = true
                            } catch {
                                if !Task.isCancelled {
                                    notice = language.text("This file is unavailable. Try again or generate it from current evidence.", zhHans: "文件暂不可用。请重试，或根据当前资料重新生成。")
                                }
                            }
                        }
                    } label: {
                        Label(language.text("Save ", zhHans: "保存 ") + file.name, systemImage: "arrow.down.document")
                    }
                    .buttonStyle(.bordered).disabled(busy)
                    .accessibilityIdentifier("run-artifact-\(file.id)")
                }
            }
            if let notice { Text(notice).font(.caption).foregroundStyle(.secondary).accessibilityAddTraits(.updatesFrequently) }
        }
        .task(id: "\(taskID):\(listAttempt)") {
            files = []; listing = true; listFailed = false
            do {
                let current = try await list()
                try Task.checkCancellation()
                files = current; listing = false
            } catch {
                if !Task.isCancelled { files = []; listing = false; listFailed = true }
            }
        }
        .fileExporter(isPresented: $exporting, document: document, contentType: contentType, defaultFilename: filename) { result in
            document = nil
            if case .failure = result { notice = language.text("The file could not be saved. Try again.", zhHans: "文件未能保存，请重试。") }
        }
        .onChange(of: exporting) { showing in if !showing { document = nil } }
        .onDisappear { loadingTask?.cancel(); loadingTask = nil; document = nil; files = [] }
    }
}
