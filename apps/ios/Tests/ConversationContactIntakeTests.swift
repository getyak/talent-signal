import XCTest
@testable import TalentSignal

final class ConversationContactIntakeTests: XCTestCase {
    func testProposesEnglishContactFromNaturalMessage() {
        let draft = ConversationContactIntake.propose(
            "Add Maya Chen for the Chief Product Officer search, maya@brightway.com, referred by Elena."
        )

        XCTAssertEqual(draft?.name, "Maya Chen")
        XCTAssertEqual(draft?.relationshipContext, "Chief Product Officer")
        XCTAssertEqual(draft?.identityClue?.type, "email")
        XCTAssertEqual(draft?.identityClue?.value, "maya@brightway.com")
    }

    func testShortRelationshipConnectorDoesNotBecomePartOfName() {
        let draft = ConversationContactIntake.propose(
            "Add Noor Vega for Design, email noor@example.com"
        )

        XCTAssertEqual(draft?.name, "Noor Vega")
        XCTAssertEqual(draft?.relationshipContext, "Design")
    }

    func testProposesChineseContactFromNaturalMessage() {
        let draft = ConversationContactIntake.propose(
            "添加联系人陈晓，用于产品负责人搜索，邮箱 xiao.chen@example.com，下周可聊。"
        )

        XCTAssertEqual(draft?.name, "陈晓")
        XCTAssertEqual(draft?.relationshipContext, "产品负责人搜索")
        XCTAssertEqual(draft?.identityClue?.value, "xiao.chen@example.com")
    }

    func testProposesHighPrecisionContactWithoutCommandOrFormLabels() {
        let draft = ConversationContactIntake.propose(
            "Maya Chen, maya@brightway.com, Chief Product Officer"
        )

        XCTAssertEqual(draft?.name, "Maya Chen")
        XCTAssertEqual(draft?.identityClue?.value, "maya@brightway.com")
        XCTAssertEqual(draft?.relationshipContext, "Chief Product Officer")
        XCTAssertEqual(draft?.interpreter, .deterministic)
    }

    func testProposesHighPrecisionChineseContactWithoutCommand() {
        let draft = ConversationContactIntake.propose(
            "陈晓 xiao.chen@example.com，产品负责人搜索"
        )

        XCTAssertEqual(draft?.name, "陈晓")
        XCTAssertEqual(draft?.identityClue?.value, "xiao.chen@example.com")
        XCTAssertEqual(draft?.relationshipContext, "产品负责人搜索")
    }

    func testDoesNotTurnOrdinaryQuestionIntoContactMutation() {
        XCTAssertNil(
            ConversationContactIntake.propose(
                "What changed for Maya Chen since the last conversation?"
            )
        )
    }

    func testDoesNotTurnIdentityQuestionIntoImplicitContactMutation() {
        XCTAssertNil(
            ConversationContactIntake.propose(
                "Can you check Maya Chen, maya@brightway.com?"
            )
        )
        XCTAssertFalse(
            ConversationContactIntake.requiresContactClarification(
                "Can you check Maya Chen, maya@brightway.com?"
            )
        )
        XCTAssertTrue(
            ConversationContactIntake.requiresContactClarification(
                "Remember this person for Product: unknown@example.com"
            )
        )
    }

    func testDoesNotTreatNarrativePrefixAsAHighPrecisionName() {
        XCTAssertNil(
            ConversationContactIntake.propose(
                "Met Maya Chen, maya@brightway.com, Chief Product Officer"
            )
        )
    }

    func testRequiresAReadableName() {
        XCTAssertNil(
            ConversationContactIntake.propose(
                "Add a contact for the design search, unknown@example.com"
            )
        )
    }

    func testPreservesTheExactReviewedSourceNote() {
        let source = "  Add Priya Shah for Finance, PRIYA@example.com.  "

        let draft = ConversationContactIntake.propose(source)

        XCTAssertEqual(
            draft?.sourceNote,
            "Add Priya Shah for Finance, PRIYA@example.com."
        )
    }

    func testExtractsPhoneAndLinkedInIdentityClues() {
        XCTAssertEqual(
            ConversationContactIntake.propose(
                "Save Alex Kim for Growth, phone +65 9123 4567"
            )?.identityClue,
            .init(type: "phone", value: "+65 9123 4567")
        )
        XCTAssertEqual(
            ConversationContactIntake.propose(
                "Create Jordan Lee for Product, https://linkedin.com/in/jordan-lee"
            )?.identityClue,
            .init(
                type: "linkedin_url",
                value: "https://linkedin.com/in/jordan-lee"
            )
        )
    }

    func testAuthoritativeMatchesIgnoreNameOnlyResults() {
        let sameName = person(id: "name", name: "Maya Chen")
        var confirmed = person(id: "confirmed", name: "Maya C.")
        confirmed.identityMatches = [
            .init(
                kind: "confirmed_handle",
                handleType: "email",
                displayHint: "m•••@example.com",
                sourceResourceID: nil,
                expiredAt: nil
            )
        ]

        XCTAssertEqual(
            ConversationContactMatchPolicy.authoritativeMatches(
                in: [sameName, confirmed]
            ).map(\.id),
            ["confirmed"]
        )
    }

    func testCurrentOwnerLocksHistoricalOwnerAndRequiresConflictReview() {
        var current = person(id: "current", name: "Maya Current")
        current.identityMatches = [
            .init(
                kind: "confirmed_handle",
                handleType: "email",
                displayHint: "m•••@example.com",
                sourceResourceID: nil,
                expiredAt: nil
            )
        ]
        var historical = person(id: "historical", name: "Maya Historical")
        historical.identityMatches = [
            .init(
                kind: "expired_handle",
                handleType: "email",
                displayHint: "m•••@example.com",
                sourceResourceID: nil,
                expiredAt: "2026-08-01T00:00:00.000Z"
            )
        ]

        let matches = [historical, current]

        XCTAssertTrue(
            ConversationContactMatchPolicy.hasCurrentHistoricalConflict(in: matches)
        )
        XCTAssertTrue(
            ConversationContactMatchPolicy.canSelect(current, among: matches)
        )
        XCTAssertFalse(
            ConversationContactMatchPolicy.canSelect(historical, among: matches)
        )
    }

    func testSameNameReviewIsCaseWidthAndDiacriticInsensitive() {
        let draft = ConversationContactDraft(
            name: "MÁYA CHEN",
            identityClue: nil,
            relationshipContext: "General relationship",
            sourceNote: "Add MÁYA CHEN"
        )

        XCTAssertEqual(
            ConversationContactMatchPolicy.sameNameReview(
                for: draft,
                in: [person(id: "one", name: "Maya Chen"), person(id: "two", name: "Maya Li")]
            ).map(\.id),
            ["one"]
        )
    }

    func testWorkspacePersonDecodesConfirmedIdentityMatchEvidence() throws {
        let data = Data(
            #"""
            {
              "id": "11111111-1111-4111-8111-111111111111",
              "display_label": "Maya Chen",
              "context_count": 1,
              "capture_count": 2,
              "confirmed_identity_count": 1,
              "last_activity_at": "2026-08-28T00:00:00.000Z",
              "profile": null,
              "contexts": [],
              "identity_matches": [{
                "kind": "confirmed_handle",
                "handle_type": "email",
                "display_hint": "m•••@example.com",
                "source_resource_id": null
              }]
            }
            """#.utf8
        )

        let person = try JSONDecoder().decode(WorkspacePerson.self, from: data)

        XCTAssertEqual(person.identityMatches.first?.kind, "confirmed_handle")
        XCTAssertEqual(person.identityMatches.first?.handleType, "email")
        XCTAssertEqual(person.identityMatches.first?.displayHint, "m•••@example.com")
    }

    func testModelInterpreterProducesOnlyAReviewableExactSourceDraft() async {
        let interpreter = AdaptiveConversationContactIntentInterpreter(
            model: StubContactIntentModel(
                output: .init(
                    isContactIntent: true,
                    name: "Maya Chen",
                    identityType: "email",
                    identityValue: "MAYA@brightway.com",
                    relationshipContext: "CPO search"
                )
            )
        )

        let result = await interpreter.interpret(
            "Met Maya Chen for the CPO search — MAYA@brightway.com"
        )

        guard case let .contact(draft) = result else {
            return XCTFail("Expected a reviewable contact draft")
        }
        XCTAssertEqual(draft.name, "Maya Chen")
        XCTAssertEqual(draft.identityClue?.value, "maya@brightway.com")
        XCTAssertEqual(draft.relationshipContext, "CPO search")
        XCTAssertEqual(draft.interpreter, .foundationModel)
        XCTAssertEqual(
            draft.sourceNote,
            "Met Maya Chen for the CPO search — MAYA@brightway.com"
        )
    }

    func testModelInterpreterAbstainsWhenNameWasInvented() async {
        let interpreter = AdaptiveConversationContactIntentInterpreter(
            model: StubContactIntentModel(
                output: .init(
                    isContactIntent: true,
                    name: "Maya Chen",
                    identityType: "email",
                    identityValue: "unknown@example.com",
                    relationshipContext: "Product"
                )
            )
        )

        let result = await interpreter.interpret(
            "Remember this person for Product: unknown@example.com"
        )

        XCTAssertEqual(result, .needsClarification)
    }

    func testModelInterpreterRejectsNormalizedTextThatWasNotCopiedExactly() async {
        let interpreter = AdaptiveConversationContactIntentInterpreter(
            model: StubContactIntentModel(
                output: .init(
                    isContactIntent: true,
                    name: "MAYA CHEN",
                    identityType: "email",
                    identityValue: "maya@brightway.com",
                    relationshipContext: "CPO search"
                )
            )
        )

        let result = await interpreter.interpret(
            "Met Maya Chen for the CPO search — MAYA@brightway.com"
        )

        XCTAssertEqual(result, .needsClarification)
    }

    func testModelInterpreterRejectsInventedOrUnsupportedIdentityClue() async {
        let interpreter = AdaptiveConversationContactIntentInterpreter(
            model: StubContactIntentModel(
                output: .init(
                    isContactIntent: true,
                    name: "Maya Chen",
                    identityType: "social_score",
                    identityValue: "high",
                    relationshipContext: "Product"
                )
            )
        )

        let result = await interpreter.interpret(
            "Met Maya Chen for Product; keep in touch."
        )

        XCTAssertEqual(result, .needsClarification)
    }

    func testModelInterpreterKeepsOrdinaryQuestionOutOfContactTools() async {
        let interpreter = AdaptiveConversationContactIntentInterpreter(
            model: StubContactIntentModel(
                output: .init(
                    isContactIntent: false,
                    name: "Maya Chen",
                    identityType: "none",
                    identityValue: "",
                    relationshipContext: ""
                )
            )
        )

        let result = await interpreter.interpret(
            "What changed for Maya Chen since our last conversation?"
        )

        XCTAssertEqual(result, .notContact)
    }

    func testUnavailableModelClarifiesContactShapeButRoutesQuestionNormally() async {
        let interpreter = AdaptiveConversationContactIntentInterpreter(
            model: FailingContactIntentModel()
        )

        let contactResult = await interpreter.interpret(
            "Remember this person for Product: unknown@example.com"
        )
        let questionResult = await interpreter.interpret(
            "Can you check Maya Chen, maya@example.com?"
        )

        XCTAssertEqual(contactResult, .needsClarification)
        XCTAssertEqual(questionResult, .notContact)
    }

    func testOlderPersistedDraftDecodesWithoutInterpreterMetadata() throws {
        let data = Data(
            #"{"name":"Maya Chen","identityClue":null,"relationshipContext":"Product","sourceNote":"Add Maya Chen"}"#.utf8
        )

        let draft = try JSONDecoder().decode(ConversationContactDraft.self, from: data)

        XCTAssertNil(draft.interpreter)
    }

    private func person(id: String, name: String) -> WorkspacePerson {
        WorkspacePerson(
            id: id,
            displayLabel: name,
            contextCount: 0,
            captureCount: 0,
            confirmedIdentityCount: 0,
            lastActivityAt: "2026-08-28T00:00:00.000Z",
            profile: nil,
            contexts: []
        )
    }
}

private struct StubContactIntentModel: ConversationContactIntentModelGenerating {
    let output: ConversationContactModelOutput

    func generate(from source: String) async throws -> ConversationContactModelOutput {
        output
    }
}

private struct FailingContactIntentModel: ConversationContactIntentModelGenerating {
    func generate(from source: String) async throws -> ConversationContactModelOutput {
        throw URLError(.cannotConnectToHost)
    }
}
