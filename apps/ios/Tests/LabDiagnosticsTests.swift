import XCTest
import Network
@testable import TalentSignal

@MainActor
final class LabDiagnosticsTests: XCTestCase {
    func testTypedCaptureExcludesSecretsAndRejectsLateCrossSessionResults() throws {
        var time = 100.0
        let engine = LabDiagnosticsEngine(enabled: true, clock: { time })
        var request = URLRequest(url: URL(string: "https://private.test/v1/people/private-name?token=SECRET_QUERY#SECRET_FRAGMENT")!)
        request.httpMethod = "POST"; request.httpBody = Data("PRIVATE_CONVERSATION".utf8)
        request.setValue("SECRET_CREDENTIAL", forHTTPHeaderField: "Authorization")
        XCTAssertNil(engine.begin(request))
        let first = try XCTUnwrap(engine.start(task: .sendText, now: Date()))
        let ticket = try XCTUnwrap(engine.begin(request))
        time = 102; engine.mark(.firstContent)
        engine.finish(ticket, status: 429, receivedBytes: 512,
            error: NSError(domain: "PRIVATE_ERROR", code: 1, userInfo: [NSLocalizedDescriptionKey: "PRIVATE_DESCRIPTION"]))
        let report = try XCTUnwrap(engine.stop(.stopped))
        XCTAssertEqual(report.requests.first?.durationMilliseconds, 2000)
        XCTAssertEqual(report.requests.first?.route, .workspace)
        XCTAssertEqual(report.requests.first?.status, 429)
        XCTAssertEqual(report.requests.first?.failure, .transport)
        let encoded = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
        for text in ["private.test", "private-name", "SECRET", "PRIVATE", "Authorization"] { XCTAssertFalse(encoded.contains(text)) }
        let second = try XCTUnwrap(engine.start(task: .scrolling, now: Date()))
        XCTAssertNotEqual(first.id, second.id)
        engine.finish(ticket, status: 200, receivedBytes: 20, error: nil)
        XCTAssertTrue(engine.snapshot()?.requests.isEmpty == true)
        _ = engine.stop(.stopped)
    }

    func testBoundsExpiryAndUnknownRequestsRemainTruthful() throws {
        var time = 0.0
        let engine = LabDiagnosticsEngine(enabled: true, clock: { time })
        _ = engine.start(task: .requestFailure, now: Date())
        let request = URLRequest(url: URL(string: "https://example.test/health/ready")!)
        for _ in 0..<170 { _ = engine.begin(request) }
        for _ in 0..<65 { engine.mark(.problem) }
        time = 600
        XCTAssertNil(engine.begin(request), "No new capture after the monotonic deadline")
        let report = try XCTUnwrap(engine.stop(.timeLimit))
        XCTAssertEqual(report.requests.count, 160)
        XCTAssertEqual(report.droppedRequests, 10)
        XCTAssertEqual(report.markers.count, 60)
        XCTAssertEqual(report.droppedMarkers, 5)
        XCTAssertTrue(report.requests.allSatisfy { $0.failure == .unfinished && $0.durationMilliseconds == nil })
        XCTAssertEqual(report.ended, .timeLimit)
    }

    func testCheckpointRelaunchNeverResumesAndLateResultsCannotResurrectDeletion() throws {
        var time = 0.0
        let files = DiagnosticMemoryFiles()
        let engine = LabDiagnosticsEngine(enabled: true, clock: { time })
        let store = LabDiagnosticsStore(engine: engine, files: files, enabled: true, capturesDeviceSamples: false)
        store.start(.sendImage)
        let ticket = try XCTUnwrap(engine.begin(URLRequest(url: URL(string: "https://example.test/captures")!)))
        time = 2; store.tick(); time = 4; store.tick(); time = 6; store.tick()
        let restored = LabDiagnosticsStore(engine: LabDiagnosticsEngine(enabled: true), files: files, enabled: true, capturesDeviceSamples: false)
        XCTAssertNil(restored.activeID)
        XCTAssertEqual(restored.reports.first?.ended, .interrupted)
        XCTAssertEqual(restored.reports.first?.requests.first?.failure, .unfinished)
        store.stop()
        restored.clear()
        engine.finish(ticket, status: 200, receivedBytes: 100, error: nil)
        XCTAssertNil(try files.read())
        XCTAssertTrue(restored.reports.isEmpty)
    }

    func testBackgroundContextAndStorageFailureStopCaptureWithRecoverableReport() throws {
        let files = DiagnosticMemoryFiles()
        let engine = LabDiagnosticsEngine(enabled: true)
        let store = LabDiagnosticsStore(engine: engine, files: files, enabled: true, capturesDeviceSamples: false)
        store.start(.scrolling); store.backgrounded()
        XCTAssertEqual(store.reports.first?.ended, .background)
        XCTAssertNil(engine.snapshot())
        store.start(.openPerson); store.contextChanged()
        XCTAssertEqual(store.reports.first?.ended, .contextChanged)
        files.failWrites = true
        store.start(.recording)
        XCTAssertNil(store.activeID)
        XCTAssertEqual(store.reports.first?.ended, .storageFailure)
        XCTAssertNotNil(store.error); XCTAssertFalse(store.canStart)
        files.failWrites = false; store.retryStorage()
        XCTAssertNil(store.error); XCTAssertTrue(store.canStart)
        let restored = LabDiagnosticsStore(engine: LabDiagnosticsEngine(enabled: true), files: files, enabled: true, capturesDeviceSamples: false)
        XCTAssertEqual(restored.reports.first?.ended, .storageFailure)
    }

    func testRetentionExportAndCorruptionRecoveryAreBounded() throws {
        var date = Date(timeIntervalSince1970: 1_800_000_000)
        let files = DiagnosticMemoryFiles()
        let store = LabDiagnosticsStore(engine: LabDiagnosticsEngine(enabled: true), files: files, enabled: true, capturesDeviceSamples: false, now: { date })
        for _ in 0..<7 { store.start(.scrolling); store.stop(); date += 1 }
        XCTAssertEqual(store.reports.count, 5)
        let id = try XCTUnwrap(store.reports.first?.id)
        store.prepareExport(id)
        let export = try JSONDecoder().decode(LabDiagnosticArchive.self, from: XCTUnwrap(store.exportData))
        XCTAssertEqual(export.reports.count, 1); XCTAssertEqual(export.reports.first?.id, id)
        store.closeExport(); XCTAssertNil(store.exportData)
        date += 86_400; store.prepareExport(id)
        XCTAssertNil(store.exportData); XCTAssertTrue(store.reports.isEmpty)
        // Invalid data must not be replaced by starting or retrying a new recording.
        store.start(.scrolling); store.stop()
        let retainedID = try XCTUnwrap(store.reports.first?.id)
        let corrupt = Data("PRIVATE_CORRUPT_DATA".utf8); files.value = corrupt
        store.reload(); store.start(.sendText); store.retryStorage(); store.prepareExport(retainedID)
        XCTAssertNil(store.exportData)
        XCTAssertFalse(store.canStart); XCTAssertEqual(files.value, corrupt)
        files.failClear = true; store.clear(); XCTAssertEqual(files.value, corrupt)
        files.failClear = false; store.clear(); XCTAssertNil(files.value); XCTAssertTrue(store.canStart)
    }

    func testDisabledBuildDoesNotReadRecordOrMutateFiles() {
        let files = DiagnosticMemoryFiles(); files.value = Data("keep".utf8)
        let engine = LabDiagnosticsEngine(enabled: false)
        let store = LabDiagnosticsStore(engine: engine, files: files, enabled: false, capturesDeviceSamples: false)
        store.start(.scrolling); store.clear(); store.retryStorage()
        XCTAssertNil(engine.start(task: .scrolling, now: Date()))
        XCTAssertNil(store.activeID); XCTAssertFalse(store.canStart)
        XCTAssertEqual(files.reads, 0); XCTAssertEqual(files.value, Data("keep".utf8))
    }

    func testActualURLSessionMetricsAndRedirectRejection() async throws {
        let server = try DiagnosticLoopbackServer()
        let port = try await server.start()
        defer { server.stop(); _ = LabDiagnosticsEngine.shared.stop(.stopped) }
        XCTAssertNotNil(LabDiagnosticsEngine.shared.start(task: .requestFailure, now: Date()))
        let configuration = URLSessionConfiguration.ephemeral
        let session = URLSession(configuration: configuration, delegate: RuntimeRedirectGuard(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let url = try XCTUnwrap(URL(string: "http://127.0.0.1:\(port)/health/ready"))
        var request = URLRequest(url: url); request.setValue("SYNTHETIC_SECRET", forHTTPHeaderField: "Authorization")
        let (data, response) = try await TalentSignalNetworking.data(for: request, using: session)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        XCTAssertEqual(data, Data("{}".utf8))
        var redirect = URLRequest(url: url.deletingLastPathComponent().appendingPathComponent("redirect"))
        redirect.setValue("SYNTHETIC_SECRET", forHTTPHeaderField: "Authorization")
        let (_, redirectResponse) = try await TalentSignalNetworking.data(for: redirect, using: session)
        XCTAssertEqual((redirectResponse as? HTTPURLResponse)?.statusCode, 302, "The per-task metrics delegate must preserve redirect rejection")
        let report = try XCTUnwrap(LabDiagnosticsEngine.shared.stop(.stopped))
        XCTAssertEqual(report.requests.count, 2)
        XCTAssertGreaterThan(report.requests[0].durationMilliseconds ?? 0, 80)
        XCTAssertTrue(report.requests[0].phases.contains { $0.kind == .waitForResponse && $0.milliseconds >= 80 })
        let json = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
        XCTAssertFalse(json.contains("127.0.0.1")); XCTAssertFalse(json.contains("SYNTHETIC_SECRET"))
    }

    func testRealFileRoundTripExclusionAndVerifiedDeletion() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = LabDiagnosticFiles(url: directory.appendingPathComponent("reports.json"))
        let data = Data("synthetic".utf8)
        try file.write(data); XCTAssertEqual(try file.read(), data)
        XCTAssertEqual(try directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        try file.clear(); XCTAssertNil(try file.read())
    }

    func testFullStageArchiveFitsProtectedStorageAndOversizePreservesPreviousFile() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let files = LabDiagnosticFiles(url: directory.appendingPathComponent("reports.json"))
        let date = Date()
        let reports = (0..<5).map { _ -> LabDiagnosticReport in
            var report = LabDiagnosticReport(id: UUID(), task: .openPerson, startedAt: date, simulator: true)
            report.durationMilliseconds = 600_000; report.ended = .timeLimit
            let rootID = UUID()
            report.clientSpans = (0..<120).map { index in
                LabClientSpan(id: index == 0 ? rootID : UUID(), parentID: index == 0 ? nil : rootID,
                    kind: .workspaceRead, offsetMilliseconds: 0, durationMilliseconds: 600_000, outcome: .completed)
            }
            report.requests = (0..<160).map { _ in
                let id = UUID()
                return LabDiagnosticRequest(id: id, offsetMilliseconds: 0, route: .workspace, method: .GET,
                    origin: .runtime, durationMilliseconds: 600_000, status: 200, receivedBytes: Int.max,
                    phases: (0..<24).map { _ in .init(kind: .waitForResponse, milliseconds: 600_000) },
                    serverTrace: .init(version: 1, requestID: id, origin: .backend, durationMilliseconds: 600_000,
                        spans: (0..<16).map { _ in .init(kind: .databaseConnection, offsetMilliseconds: 0,
                            durationMilliseconds: 600_000, outcome: .completed) }, droppedSpans: 1_000_000), clientSpanID: rootID)
            }
            report.markers = (0..<60).map { _ in .init(id: UUID(), offsetMilliseconds: 600_000, marker: .interactive) }
            report.samples = (0..<301).map { _ in .init(id: UUID(), offsetMilliseconds: 600_000,
                physicalFootprintBytes: UInt64.max, thermal: .serious, lowPower: false,
                callbackCount: 240, cadenceHz: 120, longestCallbackGapMilliseconds: 32, longCallbackGaps: 1) }
            return report
        }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(LabDiagnosticArchive(version: 1, reports: reports))
        XCTAssertLessThanOrEqual(data.count, 6_000_000)
        try files.write(data)
        let restored = LabDiagnosticsStore(engine: LabDiagnosticsEngine(enabled: true), files: files,
            enabled: true, capturesDeviceSamples: false, now: { date })
        XCTAssertNil(restored.error); XCTAssertEqual(restored.reports.count, 5)
        XCTAssertEqual(restored.reports.first?.requests.last?.serverTrace?.spans.count, 16)
        let previous = try files.read()
        XCTAssertThrowsError(try files.write(Data(repeating: 0, count: 6_000_001)))
        XCTAssertEqual(try files.read(), previous)
    }
}

private final class DiagnosticMemoryFiles: LabDiagnosticPersisting {
    var value: Data?
    var failWrites = false, failClear = false
    var reads = 0
    func read() throws -> Data? { reads += 1; return value }
    func write(_ data: Data) throws { if failWrites { throw CocoaError(.fileWriteOutOfSpace) }; value = data }
    func clear() throws { if failClear { throw CocoaError(.fileWriteNoPermission) }; value = nil }
}

private final class DiagnosticLoopbackServer: @unchecked Sendable {
    private let queue = DispatchQueue(label: "lab-diagnostics-proof-server")
    private let listener: NWListener
    init() throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters)
    }
    func start() async throws -> UInt16 {
        listener.newConnectionHandler = { [queue] connection in
            connection.start(queue: queue)
            connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { data, _, _, _ in
                let redirect = data.map { String(decoding: $0, as: UTF8.self).contains("GET /health/redirect ") } ?? false
                let response = redirect
                    ? "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/must-not-follow\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    : "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}"
                queue.asyncAfter(deadline: .now() + 0.1) {
                    connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in connection.cancel() })
                }
            }
        }
        return try await withCheckedThrowingContinuation { continuation in
            listener.stateUpdateHandler = { [listener] state in
                switch state {
                case .ready:
                    listener.stateUpdateHandler = nil
                    if let port = listener.port { continuation.resume(returning: port.rawValue) }
                    else { continuation.resume(throwing: URLError(.cannotConnectToHost)) }
                case .failed(let error): listener.stateUpdateHandler = nil; continuation.resume(throwing: error)
                default: break
                }
            }
            listener.start(queue: queue)
        }
    }
    func stop() { listener.cancel() }
}
