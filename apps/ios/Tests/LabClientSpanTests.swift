import XCTest
import UIKit
@testable import TalentSignal

@MainActor
final class LabClientSpanTests: XCTestCase {
    func testAutomaticImageAudioAndDisplayStagesUseProductBoundaries() async throws {
        _ = LabDiagnosticsEngine.shared.stop(.stopped)
        XCTAssertNotNil(LabDiagnosticsEngine.shared.start(task: .sendImage, now: Date()))
        defer { _ = LabDiagnosticsEngine.shared.stop(.stopped) }

        let directory = FileManager.default.temporaryDirectory
            .appending(path: "lab-automatic-stages-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24))
        let imageData = try XCTUnwrap(renderer.image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 24, height: 24))
        }.pngData())
        let inbox = PendingCaptureInbox(directoryURL: directory)
        _ = try await inbox.stage(
            imageData: imageData,
            fileName: "synthetic.png",
            mediaType: "image/png",
            origin: .photosPicker
        )

        let audio = AudioSignalCaptureStore(recorder: DeterministicAudioSignalRecorder())
        audio.authorizingParty = "Synthetic participant"
        audio.authorizationBasis = "Direct synthetic permission"
        audio.authorizationConfirmed = true
        await audio.start(sceneIsActive: true)
        XCTAssertTrue(audio.isRecording)
        audio.stop()

        let voice = VoiceInputStore(recorder: DeterministicVoiceDictationRecorder())
        await voice.start(sceneIsActive: true, transcriber: DeterministicVoiceTranscriber())
        XCTAssertTrue(voice.isRecording)
        await voice.stopAndTranscribe()
        XCTAssertEqual(voice.transcript, "What changed in this search?")

        let display = LabDisplayCallbackStage()
        XCTAssertTrue(display.begin())
        display.receivedDisplayCallback()

        let report = try XCTUnwrap(LabDiagnosticsEngine.shared.stop(.stopped))
        let spans = try XCTUnwrap(report.clientSpans)
        XCTAssertEqual(spans.filter { $0.kind == .imagePreparation }.count, 1)
        XCTAssertEqual(spans.filter { $0.kind == .audioSessionPreparation }.count, 2)
        XCTAssertEqual(spans.filter { $0.kind == .audioPayloadFinalization }.count, 2)
        XCTAssertEqual(spans.filter { $0.kind == .voiceTranscription }.count, 1)
        XCTAssertEqual(spans.filter { $0.kind == .firstDisplayCallback }.count, 1)
        XCTAssertTrue(spans.allSatisfy {
            $0.outcome == .completed && $0.durationMilliseconds != nil
        })
        let json = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
        XCTAssertFalse(json.contains("Synthetic participant"))
        XCTAssertFalse(json.contains("Direct synthetic permission"))
        XCTAssertFalse(json.contains("What changed in this search?"))
    }

    func testActualWorkspaceReadLinksThreeRequestsDecodingAndStatePublication() async throws {
        XCTAssertNotNil(LabDiagnosticsEngine.shared.start(task: .openPerson, now: Date()))
        let store = LabFaultStore(enabled: true)
        await store.start(.staleEvidence, minutes: 1)
        for _ in 0..<200 where store.isWorking { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertFalse(store.isWorking)
        let report = try XCTUnwrap(LabDiagnosticsEngine.shared.stop(.stopped))
        let spans = try XCTUnwrap(report.clientSpans)
        let root = try XCTUnwrap(spans.first { $0.kind == .workspaceRead })
        XCTAssertEqual(root.outcome, .completed)
        XCTAssertEqual(spans.filter { $0.kind == .responseDecoding }.count, 3)
        XCTAssertEqual(spans.filter { $0.kind == .statePublished }.count, 1)
        XCTAssertTrue(spans.filter { $0.parentID != nil }.allSatisfy { $0.parentID == root.id })
        XCTAssertEqual(report.requests.count, 3)
        XCTAssertTrue(report.requests.allSatisfy { $0.clientSpanID == root.id && $0.origin == .syntheticFault })
        await store.close()
    }

    func testConcurrentTaskLocalOperationsKeepTheirOwnRequestParents() async throws {
        XCTAssertNotNil(LabDiagnosticsEngine.shared.start(task: .requestFailure, now: Date()))
        let first = try LabFaultWorkspaceService(preset: .staleEvidence, seconds: 60, enabled: true)
        let second = try LabFaultWorkspaceService(preset: .staleEvidence, seconds: 60, enabled: true)
        async let a = LabClientDiagnostics.measure(.relationshipTask) { try await first.loadWorkspace() }
        async let b = LabClientDiagnostics.measure(.conversationTask) { try await second.loadWorkspace() }
        _ = try await (a, b)
        let report = try XCTUnwrap(LabDiagnosticsEngine.shared.stop(.stopped))
        let roots = report.clientSpans?.filter { $0.parentID == nil } ?? []
        XCTAssertEqual(roots.count, 2)
        for root in roots { XCTAssertEqual(report.requests.filter { $0.clientSpanID == root.id }.count, 3) }
        await first.close(); await second.close()
    }

    func testSpanBoundsStopAndStaleParentsCannotCrossRecordings() throws {
        let engine = LabDiagnosticsEngine(enabled: true)
        XCTAssertNotNil(engine.start(task: .sendText, now: Date()))
        let old = try XCTUnwrap(engine.beginClientSpan(.conversationTask, parent: nil))
        for _ in 0..<121 { _ = engine.beginClientSpan(.responseDecoding, parent: old) }
        let first = try XCTUnwrap(engine.stop(.background))
        XCTAssertEqual(first.clientSpans?.count, 120)
        XCTAssertEqual(first.droppedClientSpans, 2)
        XCTAssertTrue(first.clientSpans?.allSatisfy { $0.outcome == .unfinished && $0.durationMilliseconds == nil } == true)
        XCTAssertNotNil(engine.start(task: .sendImage, now: Date()))
        XCTAssertNil(engine.beginClientSpan(.requestEncoding, parent: old))
        engine.finishClientSpan(old, outcome: .completed)
        XCTAssertNil(engine.stop(.stopped)?.clientSpans)
    }

    func testCancelledWorkspaceReadIsNotReportedAsCompleted() async throws {
        XCTAssertNotNil(LabDiagnosticsEngine.shared.start(task: .requestFailure, now: Date()))
        let store = LabFaultStore(enabled: true)
        await store.start(.latency, minutes: 1)
        try await Task.sleep(for: .milliseconds(50))
        await store.cancelRead()
        let report = try XCTUnwrap(LabDiagnosticsEngine.shared.stop(.stopped))
        XCTAssertEqual(report.clientSpans?.first { $0.kind == .workspaceRead }?.outcome, .cancelled)
        XCTAssertFalse(report.clientSpans?.contains { $0.kind == .statePublished } == true)
        await store.close()
    }
}
