import Foundation
import XCTest
@testable import TalentSignal

@MainActor
final class TalentSignalLabTests: XCTestCase {
    func testDisabledManifestKeepsLabEntryHidden() async {
        let service = StubLabService(
            manifest: LabFixture.manifest(enabled: false, active: false)
        )
        let store = TalentSignalLabStore(service: service)

        await store.load()

        XCTAssertFalse(store.isEnabled)
        XCTAssertNil(store.session)
        XCTAssertNil(store.run)
        XCTAssertEqual(
            store.phase,
            .unavailable("Internal Lab is disabled for this backend build.")
        )
    }

    func testCompleteLabJourneyPreservesQualityControlBoundary() async {
        let service = StubLabService(
            manifest: LabFixture.manifest(enabled: true, active: false)
        )
        let store = TalentSignalLabStore(service: service)

        await store.load()
        await store.start(LabFixture.scenario)
        await store.replay()
        await store.compare()
        await store.record()
        await store.promote()

        XCTAssertTrue(store.isEnabled)
        XCTAssertEqual(store.session, LabFixture.session)
        XCTAssertEqual(store.run, LabFixture.candidateRun)
        XCTAssertEqual(store.comparison, LabFixture.comparison)
        XCTAssertEqual(store.receipt, LabFixture.receipt)
        XCTAssertEqual(store.evalCase, LabFixture.evalCase)
        XCTAssertNil(store.errorMessage)
        XCTAssertEqual(service.startScenarioIDs, [LabFixture.scenario.id])
        XCTAssertEqual(service.runVariants, [.candidate])
        XCTAssertEqual(service.receiptRunIDs, [LabFixture.candidateRun.id])
        XCTAssertEqual(service.promotedReceiptIDs, [LabFixture.receipt.id])
    }

    func testEnabledManifestWithoutZeroWriteCapabilityStaysClosed() async {
        let unsafeManifest = LabFixture.manifest(
            enabled: true,
            active: false,
            canonicalWriteAccess: true
        )
        let store = TalentSignalLabStore(
            service: StubLabService(manifest: unsafeManifest)
        )

        await store.load()

        XCTAssertFalse(store.isEnabled)
        XCTAssertEqual(
            store.phase,
            .failed(
                TalentSignalLabStateError.capabilityBoundaryInvalid.localizedDescription
            )
        )
    }

    func testRunReadbackWithCanonicalMutationIsRejected() async {
        let service = StubLabService(
            manifest: LabFixture.manifest(enabled: true, active: true)
        )
        service.runResult = LabFixture.run(canonicalMutationCount: 1)
        let store = TalentSignalLabStore(service: service)

        await store.load()
        await store.replay()

        XCTAssertNil(store.run)
        XCTAssertEqual(
            store.errorMessage,
            TalentSignalLabStateError.isolationNotVerified.localizedDescription
        )
        XCTAssertNil(store.receipt)
    }

    func testRetryReusesTheSameIdempotencyKeyAfterUnknownRunResult() async {
        let service = StubLabService(
            manifest: LabFixture.manifest(enabled: true, active: true)
        )
        service.runFailureCount = 1
        let store = TalentSignalLabStore(service: service)

        await store.load()
        await store.replay()
        XCTAssertNil(store.run)
        await store.replay()

        XCTAssertEqual(store.run, LabFixture.candidateRun)
        XCTAssertEqual(service.runIdempotencyKeys.count, 2)
        XCTAssertEqual(
            service.runIdempotencyKeys.first,
            service.runIdempotencyKeys.last
        )
    }

    func testManifestDecodesServerSnakeCaseContract() throws {
        let json = """
        {
          "contract_version": "\(TalentSignalAPIContract.version)",
          "capability": {
            "enabled": false,
            "reason": "Internal Lab is disabled for this backend build.",
            "internal_build_required": true,
            "synthetic_evidence_only": true,
            "production_data_access": false,
            "canonical_write_access": false,
            "external_effect_access": false
          },
          "environment": "FAT",
          "scenarios": [],
          "active_session": null,
          "latest_run": null,
          "eval_cases": []
        }
        """

        let decoded = try JSONDecoder().decode(
            LabManifest.self,
            from: Data(json.utf8)
        )

        XCTAssertEqual(decoded.contractVersion, TalentSignalAPIContract.version)
        XCTAssertFalse(decoded.capability.enabled)
        XCTAssertTrue(decoded.capability.syntheticEvidenceOnly)
        XCTAssertFalse(decoded.capability.canonicalWriteAccess)
        XCTAssertTrue(decoded.scenarios.isEmpty)
    }
}

@MainActor
private final class StubLabService: TalentSignalLabServing {
    let manifest: LabManifest
    var runResult = LabFixture.candidateRun
    var runFailureCount = 0
    private(set) var startScenarioIDs: [String] = []
    private(set) var runVariants: [LabRunVariant] = []
    private(set) var runIdempotencyKeys: [String] = []
    private(set) var receiptRunIDs: [String] = []
    private(set) var promotedReceiptIDs: [String] = []

    init(manifest: LabManifest) {
        self.manifest = manifest
    }

    func loadManifest() async throws -> LabManifest {
        manifest
    }

    func startSession(
        scenarioID: String,
        idempotencyKey: String
    ) async throws -> LabSession {
        startScenarioIDs.append(scenarioID)
        return LabFixture.session
    }

    func run(
        sessionID: String,
        variant: LabRunVariant,
        idempotencyKey: String
    ) async throws -> LabRun {
        runVariants.append(variant)
        runIdempotencyKeys.append(idempotencyKey)
        if runFailureCount > 0 {
            runFailureCount -= 1
            throw StubLabError.unknownResult
        }
        return runResult
    }

    func compare(
        sessionID: String,
        idempotencyKey: String
    ) async throws -> LabComparison {
        LabFixture.comparison
    }

    func createReceipt(
        sessionID: String,
        runID: String,
        idempotencyKey: String
    ) async throws -> RealityReceipt {
        receiptRunIDs.append(runID)
        return LabFixture.receipt
    }

    func promoteReceipt(
        receiptID: String,
        idempotencyKey: String
    ) async throws -> LabEvalCase {
        promotedReceiptIDs.append(receiptID)
        return LabFixture.evalCase
    }
}

private enum StubLabError: LocalizedError {
    case unknownResult

    var errorDescription: String? {
        "The response was lost before the result could be read."
    }
}

private enum LabFixture {
    static let snapshotHash = String(repeating: "a", count: 64)
    static let outputHash = String(repeating: "b", count: 64)
    static let baselineOutputHash = String(repeating: "c", count: 64)

    static let baselineEnvelope = LabVersionEnvelope(
        webBuild: "web-b417",
        iosBuild: "ios-b417",
        backendRevision: "abc122",
        agentVersion: "p22",
        promptVersion: "17",
        policyVersion: "policy-7",
        fixtureVersion: "lab-fixtures.v1"
    )

    static let candidateEnvelope = LabVersionEnvelope(
        webBuild: "web-b418",
        iosBuild: "ios-b418",
        backendRevision: "abc123",
        agentVersion: "p23",
        promptVersion: "18",
        policyVersion: "policy-8",
        fixtureVersion: "lab-fixtures.v1"
    )

    static let scenario = LabScenarioSummary(
        id: "ambiguous-identity",
        revision: "2026-09-03.1",
        title: "身份存在歧义，不得自动合并",
        summary: "同一线索有当前与历史所有者。",
        category: .identity,
        riskTier: .blocker,
        expectedBehavior: "不合并、不绑定，展示依据并提出一个澄清问题。",
        snapshotHash: snapshotHash,
        demoIdentity: "Demo-Ava",
        baseline: baselineEnvelope,
        candidate: candidateEnvelope
    )

    static let session = LabSession(
        id: "00000000-0000-4000-8000-000000000001",
        scenario: scenario,
        environment: "FAT",
        workspaceReference: "lab_aaaaaaaaaaaa",
        testerIdentity: "Demo-Ava",
        status: .active,
        canonicalIsolation: true,
        productionDataAccess: false,
        writeBoundary: "lab_only",
        activeEnvelope: candidateEnvelope,
        startedAt: "2026-09-03T09:00:00.000Z",
        expiresAt: "2026-09-03T13:00:00.000Z"
    )

    static func output(canonicalMutationCount: Int = 0) -> LabScenarioOutput {
        LabScenarioOutput(
            insightID: "ambiguous-identity:review",
            insightKind: .identityReview,
            headline: "身份仍有歧义",
            observation: "同一邮箱在线索历史中出现了两位所有者。",
            interpretation: "当前证据不足以安全绑定身份。",
            uncertainty: "历史所有权已过期，不能自动合并。",
            lifecycle: .abstained,
            evidenceSummary: .init(
                confirmed: 1,
                observations: 0,
                conflicts: 1,
                unavailable: 0
            ),
            evidence: [
                LabEvidenceItem(
                    id: "identity-current-01",
                    label: "当前线索所有者",
                    excerpt: "由已审阅来源支持。",
                    observedAt: "2026-09-02T04:00:00.000Z",
                    status: .confirmed,
                    sourceLabel: "合成联系人卡 · 已确认"
                ),
            ],
            requiredQuestion: "请选择当前所有者，或保存为未解决身份。",
            requiresHumanConfirmation: true,
            confirmationCount: 1,
            canonicalMutationCount: canonicalMutationCount,
            externalEffectCount: 0
        )
    }

    static func run(canonicalMutationCount: Int = 0) -> LabRun {
        LabRun(
            id: "00000000-0000-4000-8000-000000000002",
            sessionID: session.id,
            scenarioID: scenario.id,
            scenarioRevision: scenario.revision,
            variant: .candidate,
            snapshotHash: snapshotHash,
            outputHash: outputHash,
            envelope: candidateEnvelope,
            output: output(canonicalMutationCount: canonicalMutationCount),
            traceID: String(repeating: "d", count: 32),
            deterministic: true,
            canonicalRevisionBefore: 42,
            canonicalRevisionAfter: 42,
            createdAt: "2026-09-03T09:01:00.000Z"
        )
    }

    static let candidateRun = run()

    static let baselineRun = LabRun(
        id: "00000000-0000-4000-8000-000000000003",
        sessionID: session.id,
        scenarioID: scenario.id,
        scenarioRevision: scenario.revision,
        variant: .baseline,
        snapshotHash: snapshotHash,
        outputHash: baselineOutputHash,
        envelope: baselineEnvelope,
        output: output(),
        traceID: String(repeating: "e", count: 32),
        deterministic: true,
        canonicalRevisionBefore: 42,
        canonicalRevisionAfter: 42,
        createdAt: "2026-09-03T09:02:00.000Z"
    )

    static let comparison = LabComparison(
        id: "00000000-0000-4000-8000-000000000004",
        sessionID: session.id,
        baselineRun: baselineRun,
        candidateRun: candidateRun,
        identicalSnapshot: true,
        differences: [
            LabComparisonDifference(
                kind: .caution,
                label: "不确定性表达",
                baseline: "历史所有权已过期。",
                candidate: "历史所有权已过期，不能自动合并。",
                impact: .improved
            ),
        ],
        improvedCount: 1,
        regressedCount: 0,
        changedCount: 0,
        canonicalMutationCount: 0,
        externalEffectCount: 0,
        createdAt: "2026-09-03T09:03:00.000Z"
    )

    static let receipt = RealityReceipt(
        id: "00000000-0000-4000-8000-000000000005",
        displayReference: "RR-AAAAAAAA",
        sessionID: session.id,
        runID: candidateRun.id,
        scenarioID: scenario.id,
        scenarioRevision: scenario.revision,
        expected: scenario.expectedBehavior,
        actual: candidateRun.output.headline,
        issueSummary: "Candidate output reproduced for review.",
        snapshotHash: snapshotHash,
        outputHash: outputHash,
        envelope: candidateEnvelope,
        traceID: candidateRun.traceID,
        canonicalRevision: 42,
        reproduced: true,
        screenshotState: "redacted_surface_snapshot",
        redactionApplied: true,
        status: .recorded,
        createdAt: "2026-09-03T09:04:00.000Z"
    )

    static let evalCase = LabEvalCase(
        id: "00000000-0000-4000-8000-000000000006",
        caseReference: "LAB-AAAAAAAA",
        version: 1,
        sourceReceiptID: receipt.id,
        scenarioID: scenario.id,
        scenarioRevision: scenario.revision,
        snapshotHash: snapshotHash,
        expectedBehavior: scenario.expectedBehavior,
        observedRegression: receipt.issueSummary,
        partition: "dev",
        lifecycle: "active",
        adjudication: "human_gold",
        releaseGate: "candidate_blocking",
        reviewerNote: "Human reviewer explicitly promoted this receipt.",
        promotedByUserID: "00000000-0000-4000-8000-000000000007",
        createdAt: "2026-09-03T09:05:00.000Z"
    )

    static func manifest(
        enabled: Bool,
        active: Bool,
        canonicalWriteAccess: Bool = false
    ) -> LabManifest {
        LabManifest(
            contractVersion: TalentSignalAPIContract.version,
            capability: LabCapability(
                enabled: enabled,
                reason: enabled
                    ? nil
                    : "Internal Lab is disabled for this backend build.",
                internalBuildRequired: true,
                syntheticEvidenceOnly: true,
                productionDataAccess: false,
                canonicalWriteAccess: canonicalWriteAccess,
                externalEffectAccess: false
            ),
            environment: "FAT",
            scenarios: enabled ? [scenario] : [],
            activeSession: active ? session : nil,
            latestRun: nil,
            evalCases: []
        )
    }
}
