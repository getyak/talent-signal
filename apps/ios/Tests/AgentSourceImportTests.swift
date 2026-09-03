import Contacts
import XCTest
@testable import TalentSignal

@MainActor
final class AgentSourceImportTests: XCTestCase {
    func testProfileReferenceStoreKeepsWorkspacesSeparateAndDeletesExactly() throws {
        let suiteName = "AgentSourceImportTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let alpha = AgentProfileReferenceStore(
            workspaceID: "workspace-alpha",
            defaults: defaults
        )
        let beta = AgentProfileReferenceStore(
            workspaceID: "workspace-beta",
            defaults: defaults
        )

        XCTAssertTrue(alpha.upsert(platform: .github, value: "maya-chen"))
        XCTAssertEqual(alpha.references.count, 1)
        XCTAssertTrue(beta.references.isEmpty)

        let restored = AgentProfileReferenceStore(
            workspaceID: "workspace-alpha",
            defaults: defaults
        )
        XCTAssertEqual(restored.references.first?.value, "https://github.com/maya-chen")
        XCTAssertTrue(
            AgentProfileReferenceStore.deleteAll(
                workspaceID: "workspace-alpha",
                defaults: defaults
            )
        )
        XCTAssertTrue(
            AgentProfileReferenceStore(
                workspaceID: "workspace-alpha",
                defaults: defaults
            ).references.isEmpty
        )
    }

    func testProfileReferencesNormalizeHandlesWithoutClaimingConnection() throws {
        XCTAssertEqual(
            try AgentProfileReference(platform: .linkedIn, value: "maya-chen").value,
            "https://www.linkedin.com/in/maya-chen"
        )
        XCTAssertEqual(
            try AgentProfileReference(platform: .x, value: "@maya_product").value,
            "https://x.com/maya_product"
        )
        XCTAssertEqual(
            try AgentProfileReference(platform: .instagram, value: "maya.chen").value,
            "https://www.instagram.com/maya.chen"
        )
        XCTAssertEqual(
            try AgentProfileReference(platform: .whatsApp, value: "+86 138 0013 8000").value,
            "https://wa.me/8613800138000"
        )
        XCTAssertEqual(
            try AgentProfileReference(platform: .weChat, value: "maya_wechat").url,
            nil
        )
    }

    func testProfileReferenceRejectsAnotherPlatformsHost() {
        XCTAssertThrowsError(
            try AgentProfileReference(
                platform: .linkedIn,
                value: "https://github.com/maya"
            )
        ) { error in
            XCTAssertEqual(error as? AgentProfileReferenceError, .wrongPlatform)
        }

        XCTAssertThrowsError(
            try AgentProfileReference(
                platform: .github,
                value: "https://github.com/maya/private-repository"
            )
        )
        XCTAssertThrowsError(
            try AgentProfileReference(
                platform: .whatsApp,
                value: "https://wa.me/not-a-phone"
            )
        )
        XCTAssertThrowsError(
            try AgentProfileReference(
                platform: .website,
                value: "https://user:password@example.com"
            )
        )
    }

    func testProfileReferenceCodecKeepsLatestValuePerPlatform() throws {
        let earlier = try AgentProfileReference(
            platform: .github,
            value: "old-handle",
            updatedAt: Date(timeIntervalSince1970: 1)
        )
        let later = try AgentProfileReference(
            platform: .github,
            value: "new-handle",
            updatedAt: Date(timeIntervalSince1970: 2)
        )
        let linkedIn = try AgentProfileReference(
            platform: .linkedIn,
            value: "maya-chen",
            updatedAt: Date(timeIntervalSince1970: 3)
        )

        let decoded = AgentProfileReferenceCodec.decode(
            try AgentProfileReferenceCodec.encode([earlier, later, linkedIn])
        )

        XCTAssertEqual(decoded.count, 2)
        XCTAssertEqual(
            decoded.first(where: { $0.platform == .github })?.value,
            "https://github.com/new-handle"
        )
    }

    func testParsesLinkedInConnectionsCSVAndKeepsUnmappedColumnsVisible() throws {
        let csv = """
        First Name,Last Name,URL,Email Address,Company,Position,Connected On,Private note
        Maya,Chen,https://www.linkedin.com/in/maya,maya@example.com,Northstar,"VP, Product",03 Sep 2026,Do not import
        """

        let draft = try ContactImportParser.parse(
            data: Data(csv.utf8),
            fileName: "Connections.csv",
            sourceKind: .linkedInConnections,
            importedAt: Date(timeIntervalSince1970: 1_788_400_000)
        )

        XCTAssertEqual(draft.records.count, 1)
        XCTAssertEqual(draft.records[0].displayName, "Maya Chen")
        XCTAssertEqual(draft.records[0].organization, "Northstar")
        XCTAssertEqual(draft.records[0].jobTitle, "VP, Product")
        XCTAssertEqual(draft.records[0].identityClue?.type, "email")
        XCTAssertEqual(draft.unmappedColumns, ["Private note"])
        XCTAssertEqual(draft.contentHash.count, 64)
    }

    func testParsesQuotedMultilineCSVWithoutFlatteningRows() throws {
        let csv = """
        Full Name,Email,Company,Notes
        "Maya Chen",maya@example.com,"Northstar, Inc.","Met at summit
        Follow up later"
        """

        let draft = try ContactImportParser.parse(
            data: Data(csv.utf8),
            fileName: "contacts.csv",
            sourceKind: .contactsFile
        )

        XCTAssertEqual(draft.records.count, 1)
        XCTAssertEqual(draft.records[0].organization, "Northstar, Inc.")
        XCTAssertTrue(draft.records[0].warnings.contains(.notesExcluded))
        XCTAssertFalse(
            draft.records[0]
                .contactDraft(
                    displayName: "Maya Chen",
                    relationshipContext: "Product community",
                    fileName: draft.fileName
                )
                .sourceNote.contains("Follow up later")
        )
    }

    func testParsesTabAndSemicolonDelimitedExports() throws {
        let tabSeparated = "Name\tEmail\tCompany\nMaya Chen\tmaya@example.com\tNorthstar\n"
        let tabDraft = try ContactImportParser.parse(
            data: Data(tabSeparated.utf8),
            fileName: "contacts.tsv",
            sourceKind: .contactsFile
        )
        XCTAssertEqual(tabDraft.records.first?.organization, "Northstar")

        let semicolonSeparated = "Name;Email;Company\nMaya Chen;maya@example.com;Northstar\n"
        let semicolonDraft = try ContactImportParser.parse(
            data: Data(semicolonSeparated.utf8),
            fileName: "contacts.csv",
            sourceKind: .contactsFile
        )
        XCTAssertEqual(semicolonDraft.records.first?.organization, "Northstar")
    }

    func testMarksExactHandleDuplicateButDoesNotMergeNameOnlyRows() throws {
        let csv = """
        Name,Email,Company
        Maya Chen,maya@example.com,Northstar
        M. Chen,MAYA@example.com,Northstar
        Alex Lee,,Studio A
        Alex Lee,,Studio A
        """

        let draft = try ContactImportParser.parse(
            data: Data(csv.utf8),
            fileName: "contacts.csv",
            sourceKind: .contactsFile
        )

        XCTAssertEqual(draft.records[1].duplicateOfRow, 2)
        XCTAssertFalse(draft.records[1].isReviewable)
        XCTAssertNil(draft.records[2].duplicateOfRow)
        XCTAssertNil(draft.records[3].duplicateOfRow)
    }

    func testExactDuplicateKeepsMeaningfulEmailPunctuation() throws {
        let csv = """
        Name,Email
        Maya Chen,a.b@example.com
        Mina Chen,ab@example.com
        """

        let draft = try ContactImportParser.parse(
            data: Data(csv.utf8),
            fileName: "contacts.csv",
            sourceKind: .contactsFile
        )

        XCTAssertNil(draft.records[0].duplicateOfRow)
        XCTAssertNil(draft.records[1].duplicateOfRow)
    }

    func testMissingNameAndUnsafeFieldsStayBlockedOrUnconfirmed() throws {
        let csv = """
        Name,Email,Phone,URL
        ,not-an-email,123,http://example.com/maya
        """

        let draft = try ContactImportParser.parse(
            data: Data(csv.utf8),
            fileName: "contacts.csv",
            sourceKind: .contactsFile
        )

        let record = try XCTUnwrap(draft.records.first)
        XCTAssertFalse(record.isReviewable)
        XCTAssertNil(record.identityClue)
        XCTAssertEqual(
            Set(record.warnings),
            Set([.missingName, .invalidEmail, .invalidPhone, .insecureProfileURL])
        )
    }

    func testParsesUTF16ChineseContacts() throws {
        let csv = "姓名,邮箱,公司\n陈美雅,maya@example.com,北辰\n"
        let data = try XCTUnwrap(csv.data(using: .utf16))

        let draft = try ContactImportParser.parse(
            data: data,
            fileName: "联系人.csv",
            sourceKind: .contactsFile
        )

        XCTAssertEqual(draft.records.first?.displayName, "陈美雅")
        XCTAssertEqual(draft.records.first?.organization, "北辰")
    }

    func testParsesGoogleAndOutlookExportHeaders() throws {
        let googleCSV = """
        Name,E-mail 1 - Value,Phone 1 - Value,Organization 1 - Name,Organization 1 - Title,Website 1 - Value
        Maya Chen,maya@example.com,+1 415 555 0100,Northstar,VP Product,https://example.com/maya
        """
        let google = try ContactImportParser.parse(
            data: Data(googleCSV.utf8),
            fileName: "google-contacts.csv",
            sourceKind: .contactsFile
        )
        XCTAssertEqual(google.records.first?.organization, "Northstar")
        XCTAssertEqual(google.records.first?.jobTitle, "VP Product")
        XCTAssertEqual(google.records.first?.identityClue?.type, "email")

        let outlookCSV = """
        First Name,Last Name,E-mail Address,Business Phone,Company,Job Title,Web Page
        Maya,Chen,,+1 415 555 0100,Northstar,VP Product,https://example.com/maya
        """
        let outlook = try ContactImportParser.parse(
            data: Data(outlookCSV.utf8),
            fileName: "outlook-contacts.csv",
            sourceKind: .contactsFile
        )
        XCTAssertEqual(outlook.records.first?.displayName, "Maya Chen")
        XCTAssertEqual(outlook.records.first?.identityClue?.type, "phone")
    }

    func testParsesVCardWithoutPromotingItsNotes() throws {
        let contact = CNMutableContact()
        contact.givenName = "Maya"
        contact.familyName = "Chen"
        contact.organizationName = "Northstar"
        contact.jobTitle = "VP Product"
        contact.emailAddresses = [
            CNLabeledValue(label: CNLabelWork, value: "maya@example.com" as NSString),
        ]
        contact.note = "Private note that must remain excluded"
        let data = try CNContactVCardSerialization.data(with: [contact])

        let draft = try ContactImportParser.parse(
            data: data,
            fileName: "maya.vcf",
            sourceKind: .contactsFile
        )

        XCTAssertEqual(draft.records.first?.displayName, "Maya Chen")
        XCTAssertEqual(draft.records.first?.identityClue?.value, "maya@example.com")
        let record = try XCTUnwrap(draft.records.first)
        XCTAssertFalse(
            record.contactDraft(
                displayName: record.displayName,
                relationshipContext: "General relationship",
                fileName: draft.fileName
            ).sourceNote.contains("Private note")
        )
    }

    func testRejectsEmptyMalformedAndOversizedFiles() {
        XCTAssertThrowsError(
            try ContactImportParser.parse(
                data: Data(),
                fileName: "contacts.csv",
                sourceKind: .contactsFile
            )
        ) { XCTAssertEqual($0 as? ContactImportParserError, .empty) }

        XCTAssertThrowsError(
            try ContactImportParser.parse(
                data: Data("Name,Email\n\"Maya,maya@example.com".utf8),
                fileName: "contacts.csv",
                sourceKind: .contactsFile
            )
        ) { XCTAssertEqual($0 as? ContactImportParserError, .malformedCSV) }

        XCTAssertThrowsError(
            try ContactImportParser.parse(
                data: Data(repeating: 0, count: ContactImportParser.maximumByteCount + 1),
                fileName: "contacts.csv",
                sourceKind: .contactsFile
            )
        ) { XCTAssertEqual($0 as? ContactImportParserError, .tooLarge) }
    }

    func testRejectsUnsafeEncodingAndBoundedTableShapes() {
        XCTAssertThrowsError(
            try ContactImportParser.parse(
                data: Data([0x80, 0x81, 0x82]),
                fileName: "contacts.csv",
                sourceKind: .contactsFile
            )
        ) { XCTAssertEqual($0 as? ContactImportParserError, .unsupportedEncoding) }

        let wideHeader = (0 ... ContactImportParser.maximumColumnCount)
            .map { $0 == 0 ? "Name" : "Field\($0)" }
            .joined(separator: ",")
        XCTAssertThrowsError(
            try ContactImportParser.parse(
                data: Data("\(wideHeader)\nMaya\n".utf8),
                fileName: "contacts.csv",
                sourceKind: .contactsFile
            )
        ) { XCTAssertEqual($0 as? ContactImportParserError, .tooManyColumns) }

        let oversizedField = String(
            repeating: "a",
            count: ContactImportParser.maximumFieldCharacterCount + 1
        )
        XCTAssertThrowsError(
            try ContactImportParser.parse(
                data: Data("Name\n\(oversizedField)\n".utf8),
                fileName: "contacts.csv",
                sourceKind: .contactsFile
            )
        ) { XCTAssertEqual($0 as? ContactImportParserError, .fieldTooLarge) }
    }

    func testRejectsMoreRowsThanCanBeReviewed() {
        let rows = Array(
            repeating: "Maya Chen,maya@example.com",
            count: ContactImportParser.maximumRecordCount + 1
        )
        let csv = (["Name,Email"] + rows).joined(separator: "\n")

        XCTAssertThrowsError(
            try ContactImportParser.parse(
                data: Data(csv.utf8),
                fileName: "contacts.csv",
                sourceKind: .contactsFile
            )
        ) { XCTAssertEqual($0 as? ContactImportParserError, .tooManyRows) }
    }
}
