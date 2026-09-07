import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonicalJson.js";
import { digestCanonicalJson as digest, withContentDigest } from "./digest.js";
import { freezePhaseOneDataset } from "./phaseOneDataset.js";
import { freezePhaseOneComparison, runPhaseOnePairedEvaluation, type PhaseOneReport } from "./phaseOneEvaluation.js";
import { signPhaseOneVerificationReport, verifyPhaseOneVerificationReport, type PhaseOneVerificationEnvelope } from "./phaseOneRelease.js";

const keys = generateKeyPairSync("ed25519");
const signer = { keyId: "compatibility-key", executorId: "independent-executor",
  privateKeyPem: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
const trusted = [{ keyId: signer.keyId, executorId: signer.executorId,
  publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString() }];

async function executedReport() {
  const cases = [{ caseId: "case-1", sourceIds: ["source-1"], sourcePartition: "held_out" as const,
    purpose: "final_verification" as const, referenceTime: "2026-09-07T00:00:00Z", modelInput: {}, oracle: {}, slices: {} }];
  const dataset = freezePhaseOneDataset({ datasetId: "compatibility", cases, exposures: [] });
  const configuration = { model: "synthetic", promptRevision: "v1", promptContentDigest: digest("prompt"),
    runtimePolicyDigest: digest("policy"), parameters: {} };
  const comparison = freezePhaseOneComparison({ runId: "compatibility", generatorActorId: "generator", datasetDigest: dataset.contentDigest,
    rubricDigest: digest("rubric"), environmentDigest: digest("environment"), baseline: { ...configuration, configurationId: "baseline" },
    candidate: { ...configuration, configurationId: "candidate" }, repetitions: 2, seed: 1,
    criteria: [{ criterionId: "citation-boundary", category: "deterministic_boundary", evaluatorId: "boundary", evaluatorKind: "deterministic", critical: true }] });
  return runPhaseOnePairedEvaluation({ comparison, dataset, cases, exposures: [], mode: "independent_verification",
    createdAt: "2026-09-07T00:00:00Z", judgmentContextDigest: digest("context"), judgeAssurances: [],
    executor: { executorId: signer.executorId, async execute(request) {
      return { status: "completed", output: {}, loadedConfigurationDigest: request.configurationDigest,
        adapterId: "synthetic", receiptId: request.idempotencyKey, providerKind: "deterministic_fake",
        inputTokens: 1, outputTokens: 2, costUsd: 0, durationMs: 0 };
    } }, evaluator: { async evaluate() { return [{ criterionId: "citation-boundary", status: "pass", evidenceRefs: ["fixture:boundary"] }]; } } });
}

function signPersistedPayload(report: Record<string, unknown>): PhaseOneVerificationEnvelope {
  const { contentDigest: _oldDigest, ...content } = report;
  const payload = { schemaVersion: "phase-one-verification-envelope.v1" as const, keyId: signer.keyId,
    executorId: signer.executorId, report: withContentDigest(content) as unknown as PhaseOneReport };
  return { ...payload, signature: sign(null, Buffer.from(canonicalJson(payload)), signer.privateKeyPem).toString("base64") };
}

describe("persisted report metric compatibility", () => {
  it("accepts current executed metrics after independent signature readback", async () => {
    const report = await executedReport();
    expect(verifyPhaseOneVerificationReport(signPhaseOneVerificationReport(report, signer), trusted)).toEqual(report);
  });

  it.each(["legacy", "missing-criterion", "incorrect-denominator", "unknown-usage-as-zero"])("rejects a signed %s report", async mode => {
    const report = structuredClone(await executedReport());
    const payload = report as unknown as Record<string, unknown>;
    if (mode === "legacy") delete payload.metrics;
    else if (mode === "missing-criterion") report.metrics.criteria.pop();
    else if (mode === "incorrect-denominator") report.metrics.criteria[0]!.candidate.denominator += 1;
    else { report.metrics.usage.candidate.costUsd.unknown = 1; report.metrics.usage.candidate.costUsd.value = 0; }
    // This is a valid trusted signature and matching digest; schema and atomic
    // counts still have to meet the current release contract.
    expect(() => verifyPhaseOneVerificationReport(signPersistedPayload(payload), trusted))
      .toThrow("PHASE_ONE_REPORT_METRICS_INVALID");
  });
});
