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
                ProgressView(language.text("Checking generated files…"))
                    .font(.caption)
            } else if listFailed {
                Button(language.text("Files could not be loaded. Retry")) {
                    listAttempt += 1
                }
                .font(.caption)
            }
            if !files.isEmpty {
                Text(language.text("Generated files · analysis to verify"))
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
                                    notice = language.text("This file is unavailable. Try again or generate it from current evidence.")
                                }
                            }
                        }
                    } label: {
                        Label(language.text("Save ") + file.name, systemImage: "arrow.down.document")
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
            if case .failure = result { notice = language.text("The file could not be saved. Try again.") }
        }
        .onChange(of: exporting) { showing in if !showing { document = nil } }
        .onDisappear { loadingTask?.cancel(); loadingTask = nil; document = nil; files = [] }
    }
}
