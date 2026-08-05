import SwiftUI
import XCTest
@testable import TalentSignal

final class CandidateSignalTests: XCTestCase {
    func testBundledCatalogMatchesFrozenEightCaseContract() throws {
        let suite = try FixtureCatalog.bundled.validated()

        XCTAssertEqual(suite.suiteID, "talent-signal-candidate-momentum-v1")
        XCTAssertEqual(suite.version, "2026-08-05.1")
        XCTAssertEqual(
            suite.cases.map(\.id),
            [
                "TS-CORE-01",
                "TS-CORE-02",
                "TS-CORE-03",
                "TS-CORE-04",
                "TS-ID-01",
                "TS-ID-03",
                "TS-ACT-01",
                "TS-BOUND-01"
            ]
        )
        XCTAssertEqual(
            suite.cases.map(\.expected.disposition),
            [
                .proposeAction,
                .noAction,
                .clarify,
                .proposeAction,
                .clarify,
                .noAction,
                .proposeAction,
                .block
            ]
        )
    }

    func testTSCORE01BeginsWithProposalsAndRequiresSeparateActionPreview() throws {
        let fixture = try XCTUnwrap(FixtureCatalog.fixture(id: "TS-CORE-01"))
        var review = ReviewSession(fixture: fixture)

        XCTAssertEqual(review.facts.count, 4)
        XCTAssertTrue(review.facts.allSatisfy { $0.decision == .pending })
        XCTAssertFalse(review.canPreviewAction)
        XCTAssertNil(review.makeActionPreview())

        for fact in review.facts {
            XCTAssertTrue(review.confirm(factID: fact.id))
        }

        XCTAssertTrue(review.allFactsReviewed)
        XCTAssertTrue(review.canPreviewAction)
        let preview = try XCTUnwrap(review.makeActionPreview())
        XCTAssertEqual(preview.action.target, "client remote-work policy")
        XCTAssertTrue(preview.exactEffect.contains("No message, meeting, contact, ATS record, or reminder"))
        XCTAssertTrue(review.isPreviewCurrent)
    }

    func testEditingAfterPreviewInvalidatesStaleAction() throws {
        let fixture = try XCTUnwrap(FixtureCatalog.fixture(id: "TS-CORE-01"))
        var review = ReviewSession(fixture: fixture)
        for fact in review.facts {
            XCTAssertTrue(review.confirm(factID: fact.id))
        }
        XCTAssertNotNil(review.makeActionPreview())

        let first = try XCTUnwrap(review.facts.first)
        XCTAssertTrue(review.edit(factID: first.id, value: "Corrected competing process"))

        XCTAssertNil(review.preview)
        XCTAssertFalse(review.isPreviewCurrent)
    }

    func testAmbiguousDateCannotBeConfirmedWithoutEditing() throws {
        let fixture = try XCTUnwrap(FixtureCatalog.fixture(id: "TS-CORE-03"))
        var review = ReviewSession(fixture: fixture)
        let fact = try XCTUnwrap(review.facts.first)

        XCTAssertEqual(fact.assertion.status, .ambiguous)
        XCTAssertFalse(review.confirm(factID: fact.id))
        XCTAssertTrue(review.edit(factID: fact.id, value: "Ask candidate for exact date and timezone"))
        XCTAssertFalse(review.canPreviewAction)
        XCTAssertNil(review.fixture.expected.action)
    }

    func testSupersessionPreservesPriorAndConditionalValues() throws {
        let fixture = try XCTUnwrap(FixtureCatalog.fixture(id: "TS-CORE-04"))
        let fact = try XCTUnwrap(fixture.expected.assertions.first)

        XCTAssertEqual(fixture.context.priorState?["work_mode_constraint"], "Remote is required.")
        XCTAssertEqual(fact.status, .superseded)
        XCTAssertEqual(
            fact.value,
            "three office days, conditional on reporting to the COO"
        )
        XCTAssertTrue(fact.evidenceQuote.contains("if the role reports to the COO"))
    }

    func testNoActionAndForwardedSpeakerCasesDoNotManufactureCandidateIntent() throws {
        let friendly = try XCTUnwrap(FixtureCatalog.fixture(id: "TS-CORE-02"))
        XCTAssertEqual(friendly.expected.disposition, .noAction)
        XCTAssertTrue(friendly.expected.assertions.isEmpty)
        XCTAssertNil(friendly.expected.action)

        let forwarded = try XCTUnwrap(FixtureCatalog.fixture(id: "TS-ID-03"))
        let assertion = try XCTUnwrap(forwarded.expected.assertions.first)
        XCTAssertEqual(forwarded.messages.first?.speaker, "recruiter")
        XCTAssertEqual(assertion.field, "relocation_requirement")
        XCTAssertTrue(assertion.value.contains("hiring manager"))
        XCTAssertEqual(forwarded.expected.disposition, .noAction)
        XCTAssertNil(forwarded.expected.action)
    }

    func testIdentityAmbiguityStaysUnbound() throws {
        let fixture = try XCTUnwrap(FixtureCatalog.fixture(id: "TS-ID-01"))
        let review = ReviewSession(fixture: fixture)

        XCTAssertNil(fixture.context.candidate)
        XCTAssertEqual(fixture.context.candidateOptions?.count, 2)
        XCTAssertTrue(review.hasUnresolvedIdentity)
        XCTAssertTrue(review.facts.isEmpty)
        XCTAssertFalse(review.canPreviewAction)
    }

    func testAvailabilityDoesNotBecomeMeetingConsent() throws {
        let fixture = try XCTUnwrap(FixtureCatalog.fixture(id: "TS-ACT-01"))
        let action = try XCTUnwrap(fixture.expected.action)

        XCTAssertEqual(fixture.expected.assertions.first?.field, "availability")
        XCTAssertEqual(action.type, "prepare_question")
        XCTAssertEqual(action.target, "candidate meeting confirmation")
        XCTAssertTrue(action.reason.contains("exact date and timezone"))
        XCTAssertTrue(fixture.expected.mustNot.contains("create a calendar event"))
    }

    func testFitScoreRequestIsBlockedWithoutAssertionsOrAction() throws {
        let fixture = try XCTUnwrap(FixtureCatalog.fixture(id: "TS-BOUND-01"))

        XCTAssertEqual(fixture.expected.disposition, .block)
        XCTAssertTrue(fixture.expected.assertions.isEmpty)
        XCTAssertNil(fixture.expected.action)
        XCTAssertTrue(fixture.expected.mustNot.contains("produce a culture-fit score"))
        XCTAssertTrue(fixture.expected.mustNot.contains("rank candidate quality"))
    }

    func testLoopbackValidationRejectsRemoteHosts() {
        XCTAssertTrue(URLFixtureLoader.isLoopback(URL(string: "http://127.0.0.1:8787/fixtures.json")!))
        XCTAssertTrue(URLFixtureLoader.isLoopback(URL(string: "http://localhost:8787/fixtures.json")!))
        XCTAssertTrue(URLFixtureLoader.isLoopback(URL(string: "http://[::1]:8787/fixtures.json")!))
        XCTAssertFalse(URLFixtureLoader.isLoopback(URL(string: "https://example.com/fixtures.json")!))
        XCTAssertFalse(URLFixtureLoader.isLoopback(URL(string: "file:///tmp/fixtures.json")!))
    }

    func testEvidencePaletteHasEnhancedDarkContrast() {
        let darkTraits = UITraitCollection(userInterfaceStyle: .dark)
        let ink = UIColor(Color.tsInk).resolvedColor(with: darkTraits)
        let mutedInk = UIColor(Color.tsMutedInk).resolvedColor(with: darkTraits)
        let evidence = UIColor(Color.tsEvidence).resolvedColor(with: darkTraits)

        XCTAssertGreaterThanOrEqual(contrastRatio(ink, evidence), 7)
        XCTAssertGreaterThanOrEqual(contrastRatio(mutedInk, evidence), 7)
    }

    func testLaunchScenariosAreDeterministic() {
        XCTAssertEqual(
            AppLaunchConfiguration.parse(
                arguments: ["TalentSignal", "--fixture-id", "TS-CORE-01"]
            ),
            AppLaunchConfiguration(scenario: .fixture("TS-CORE-01"), endpoint: nil)
        )
        XCTAssertEqual(
            AppLaunchConfiguration.parse(
                arguments: ["TalentSignal", "--scenario", "unrelated-image"]
            ).scenario,
            .unrelatedImage
        )
        XCTAssertEqual(
            AppLaunchConfiguration.parse(
                arguments: ["TalentSignal", "--scenario", "stale-preview"]
            ).scenario,
            .stalePreview
        )
        XCTAssertEqual(
            AppLaunchConfiguration.parse(
                arguments: [
                    "TalentSignal",
                    "--backend-url", "http://127.0.0.1:4317"
                ]
            ),
            AppLaunchConfiguration(
                scenario: .backend,
                endpoint: nil,
                backendEndpoint: "http://127.0.0.1:4317"
            )
        )
    }

    @MainActor
    func testUnrelatedImageStateNeverCarriesFixtureFacts() {
        let store = CandidateSignalStore(
            importDelayNanoseconds: 0,
            launchConfiguration: AppLaunchConfiguration(
                scenario: .unrelatedImage,
                endpoint: nil
            )
        )

        XCTAssertEqual(store.stage, .reviewingUnboundImage)
        XCTAssertNil(store.session)
        XCTAssertTrue(store.sourceNotice.contains("unbound"))
    }

    @MainActor
    func testImportCancellationLeavesNoSession() {
        let store = CandidateSignalStore(
            importDelayNanoseconds: 1_000_000_000,
            launchConfiguration: AppLaunchConfiguration(scenario: .idle, endpoint: nil)
        )

        store.beginFixtureImport()
        XCTAssertEqual(store.stage, .importing(.fixture("TS-CORE-01")))
        store.cancelImport()

        XCTAssertEqual(store.stage, .importCancelled(.fixture("TS-CORE-01")))
        XCTAssertNil(store.session)
    }

    private func contrastRatio(_ first: UIColor, _ second: UIColor) -> CGFloat {
        let firstLuminance = relativeLuminance(first)
        let secondLuminance = relativeLuminance(second)
        let lighter = max(firstLuminance, secondLuminance)
        let darker = min(firstLuminance, secondLuminance)
        return (lighter + 0.05) / (darker + 0.05)
    }

    private func relativeLuminance(_ color: UIColor) -> CGFloat {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        XCTAssertTrue(color.getRed(&red, green: &green, blue: &blue, alpha: &alpha))

        return 0.2126 * linearized(red)
            + 0.7152 * linearized(green)
            + 0.0722 * linearized(blue)
    }

    private func linearized(_ component: CGFloat) -> CGFloat {
        component <= 0.04045
            ? component / 12.92
            : pow((component + 0.055) / 1.055, 2.4)
    }
}
