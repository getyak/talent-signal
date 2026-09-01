import AppKit
import XCTest
@testable import TalentSignalMac

final class WindowTextRecognitionTests: XCTestCase {
    func testSyntheticChatScreenshotPreservesTopToBottomMessageOrder() throws {
        let image = try makeSyntheticChatImage(lines: [
            "Candidate: Another process is moving faster.",
            "Candidate: I need the remote work policy.",
        ])

        let recognized = try LocalWindowTextRecognizer.recognizeText(in: image)
        let normalized = recognized.lowercased()
        let first = try XCTUnwrap(normalized.range(of: "another process"))
        let second = try XCTUnwrap(normalized.range(of: "remote work policy"))

        XCTAssertLessThan(first.lowerBound, second.lowerBound)
    }

    func testSyntheticMultiSpeakerScreenshotCannotProduceAnAction() throws {
        let image = try makeSyntheticChatImage(lines: [
            "Candidate: I prefer remote work.",
            "Recruiter: I will ask the client.",
        ])
        let recognized = try LocalWindowTextRecognizer.recognizeText(in: image)
        let item = ContextCapsuleItem(
            kind: .window,
            displayName: "Synthetic system-selected window",
            preview: recognized,
            acquisition: "System picker · single window · one frame · local OCR"
        )

        let insight = try XCTUnwrap(CandidateFollowUpCompiler.compile(item: item))

        XCTAssertTrue(recognized.localizedCaseInsensitiveContains("Candidate:"))
        XCTAssertTrue(recognized.localizedCaseInsensitiveContains("Recruiter:"))
        XCTAssertEqual(insight.status, .needsReview)
        XCTAssertNil(insight.suggestedAction)
        XCTAssertTrue(insight.unresolved.contains { $0.contains("Multiple explicit speakers") })
    }

    private func makeSyntheticChatImage(lines: [String]) throws -> CGImage {
        let width = 1_600
        let height = 900
        let bitmap = try XCTUnwrap(NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: width,
            pixelsHigh: height,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        ))
        let context = try XCTUnwrap(NSGraphicsContext(bitmapImageRep: bitmap))
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        defer { NSGraphicsContext.restoreGraphicsState() }

        NSColor.white.setFill()
        NSRect(x: 0, y: 0, width: width, height: height).fill()

        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 46, weight: .semibold),
            .foregroundColor: NSColor.black,
        ]
        for (index, line) in lines.enumerated() {
            let y = CGFloat(height - 150 - (index * 300))
            NSAttributedString(string: line, attributes: attributes)
                .draw(at: NSPoint(x: 70, y: y))
        }

        return try XCTUnwrap(bitmap.cgImage)
    }
}
