import XCTest
@testable import TalentSignalMac

final class RelationshipWorkspaceLayoutTests: XCTestCase {
    func testMixedScriptDisplayLabelKeepsPersonNamePrimaryAndPreservesDescriptor() {
        let identity = RelationshipHeaderIdentity(
            displayLabel: "Alexandra 陈嘉宁-Sørensen — International Leadership & Platform Transformation"
        )

        XCTAssertEqual(identity.primaryName, "Alexandra 陈嘉宁-Sørensen")
        XCTAssertEqual(identity.descriptor, "International Leadership & Platform Transformation")
    }

    func testDisplayLabelWithoutRelationshipSeparatorRemainsWhole() {
        let identity = RelationshipHeaderIdentity(displayLabel: "Alexandra 陈嘉宁-Sørensen")

        XCTAssertEqual(identity.primaryName, "Alexandra 陈嘉宁-Sørensen")
        XCTAssertNil(identity.descriptor)
    }
}
