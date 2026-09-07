import Foundation
import XCTest
@testable import TalentSignal

final class AgentMarkdownTests: XCTestCase {
    func testStructuredGFMIncludesNestedListsTaskListsAndTables() {
        let result = AgentMarkdownParser.parse("""
        ## Follow-up

        3. Keep **source** evidence.
           - Preserve the *context*.
        4. Review before saving.

        - [ ] Confirm the relationship
        - [x] Read the note

        | Person | Next step |
        | --- | --- |
        | 李明 | Review **draft** |
        """)
        guard case let .heading(level, title) = result.first else {
            return XCTFail("Expected semantic heading")
        }
        XCTAssertEqual(level, 2)
        XCTAssertEqual(String(title.characters), "Follow-up")
        XCTAssertTrue(result.contains { block in
            guard case let .listItem(marker, children) = block else { return false }
            return marker == "3." && children.contains {
                if case .listItem("•", _) = $0 { return true }
                return false
            }
        })
        XCTAssertTrue(result.contains { if case .listItem("☐", _) = $0 { return true }; return false })
        XCTAssertTrue(result.contains { if case .listItem("☑", _) = $0 { return true }; return false })
        guard case let .table(headers, rows) = result.last else {
            return XCTFail("Expected GFM table")
        }
        XCTAssertEqual(headers.map { String($0.characters) }, ["Person", "Next step"])
        XCTAssertEqual(rows[0].map { String($0.characters) }, ["李明", "Review draft"])
    }

    func testCodeIsLiteralAndIncompleteFenceRemainsReadable() {
        let source = "```swift\nlet value = \"**literal**\"\n"
        guard case let .code(language, text) = AgentMarkdownParser.parse(source).first else {
            return XCTFail("Expected code for an unfinished streamed fence")
        }
        XCTAssertEqual(language, "swift")
        XCTAssertEqual(text, "let value = \"**literal**\"\n")
    }

    func testLinksCannotExecuteSchemesAndImagesDoNotLoadRemotely() {
        XCTAssertNil(AgentMarkdownParser.safeLink("javascript:alert(1)"))
        XCTAssertNil(AgentMarkdownParser.safeLink("talentsignal://confirm?person=123"))
        XCTAssertNil(AgentMarkdownParser.safeLink("file:///private/conversation"))
        XCTAssertNil(AgentMarkdownParser.safeLink("https://user:password@example.com"))
        XCTAssertNotNil(AgentMarkdownParser.safeLink("https://example.com/source"))
        let blocks = AgentMarkdownParser.parse("![Private image](https://example.com/tracker.png) [Read](https://example.com/source)")
        guard case let .paragraph(text) = blocks.first else { return XCTFail("Expected readable inline content") }
        XCTAssertEqual(String(text.characters), "Private image Read")
        XCTAssertEqual(text.runs.compactMap(\.link), [URL(string: "https://example.com/source")!])
    }

    func testNestedEmphasisKeepsBothStylesAndQuotedContent() {
        let result = AgentMarkdownParser.parse("> Keep **strong and *emphasized*** text.\n\n~~Superseded~~")
        guard case let .quote(children) = result.first,
              case let .paragraph(text) = children.first else { return XCTFail("Expected quote") }
        XCTAssertEqual(String(text.characters), "Keep strong and emphasized text.")
        XCTAssertTrue(text.runs.contains {
            $0.inlinePresentationIntent?.contains(.stronglyEmphasized) == true
                && $0.inlinePresentationIntent?.contains(.emphasized) == true
        })
        guard case let .paragraph(struck) = result.last else { return XCTFail("Expected paragraph") }
        XCTAssertTrue(struck.runs.contains { $0.inlinePresentationIntent?.contains(.strikethrough) == true })
    }
}
