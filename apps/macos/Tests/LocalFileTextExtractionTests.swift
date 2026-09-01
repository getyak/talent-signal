import AppKit
import XCTest
@testable import TalentSignalMac

final class LocalFileTextExtractionTests: XCTestCase {
    func testExplicitPlainTextFileIsReadExactlyAndFingerprintIsStable() async throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("talent-signal-local-file-\(UUID().uuidString).txt")
        let text = "Candidate: Another process is moving faster.\nCandidate: I need the remote work policy."
        try text.data(using: .utf8)?.write(to: url, options: .atomic)
        defer { try? FileManager.default.removeItem(at: url) }

        let extractor = SystemLocalFileTextExtractor()
        let first = try await extractor.extract(url: url)
        let second = try await extractor.extract(url: url)

        XCTAssertEqual(first.recognizedText, text)
        XCTAssertEqual(first.mediaType, "text/plain")
        XCTAssertEqual(first.method, .localPlainText)
        XCTAssertEqual(first.sourceFingerprint, second.sourceFingerprint)
        XCTAssertEqual(first.rawData, second.rawData)
    }

    func testExplicitScreenshotFileRunsThroughLocalVisionOCR() async throws {
        let imageData = try makeSyntheticScreenshotPNG(
            text: "Candidate: I need the remote work policy before September 3, 2026."
        )
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("talent-signal-local-file-\(UUID().uuidString).png")
        try imageData.write(to: url, options: .atomic)
        defer { try? FileManager.default.removeItem(at: url) }

        let extraction = try await SystemLocalFileTextExtractor().extract(url: url)

        XCTAssertEqual(extraction.method, .localImageOCR)
        XCTAssertEqual(extraction.mediaType, "image/png")
        XCTAssertTrue(extraction.recognizedText.localizedCaseInsensitiveContains("remote work policy"))
        XCTAssertEqual(extraction.rawData, imageData)
        XCTAssertEqual(extraction.sourceFingerprint.count, 64)
    }

    func testUnsupportedFileTypeFailsWithoutAResult() async throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("talent-signal-local-file-\(UUID().uuidString).bin")
        try Data([0, 1, 2, 3]).write(to: url, options: .atomic)
        defer { try? FileManager.default.removeItem(at: url) }

        do {
            _ = try await SystemLocalFileTextExtractor().extract(url: url)
            XCTFail("Expected unsupported data to fail closed")
        } catch let error as LocalFileTextExtractionError {
            XCTAssertEqual(error, .unsupportedType)
        }
    }

    private func makeSyntheticScreenshotPNG(text: String) throws -> Data {
        let width = 1_800
        let height = 500
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
        NSAttributedString(
            string: text,
            attributes: [
                .font: NSFont.monospacedSystemFont(ofSize: 42, weight: .semibold),
                .foregroundColor: NSColor.black,
            ]
        ).draw(at: NSPoint(x: 60, y: 220))

        return try XCTUnwrap(bitmap.representation(using: .png, properties: [:]))
    }
}
