import { digestCanonicalJson, phaseOneAssert, type PhaseOneCase } from "@talent-signal/evaluation";
import type { OptimizationDevExample } from "./optimization/productTask.js";
import { assertFeedbackBindingCurrent, optimizationInputFromFeedback, readOptimizationFeedbackSource,
  validateOptimizationFeedbackBinding, type OptimizationFeedbackBinding } from "./optimization/feedbackSource.js";

/** Final inputs are controller copies of purpose-bound product sources, never an independent retention authority. */
export async function assertPhaseOnePrivateSources(input: {
  cases: readonly PhaseOneCase[];
  examples: readonly OptimizationDevExample[];
  bindings: readonly OptimizationFeedbackBinding[];
  baseURL: string | null;
  token: string | undefined;
  currentCaseId?: string;
  cleanupOnly?: boolean;
}, fetcher?: typeof fetch): Promise<void> {
  phaseOneAssert(Array.isArray(input.bindings) && input.bindings.length <= 600, "PHASE_ONE_SOURCE_BINDINGS_INVALID");
  // A known local expiry wins even for a pre-Session binding. Stricter new
  // admission metadata must not become a new retention authority for old data.
  if (input.bindings.some(binding => binding && typeof binding.expiresAt === "string"
    && Date.parse(binding.expiresAt) <= Date.now())) throw new Error("OPTIMIZATION_FEEDBACK_SOURCE_UNAVAILABLE");
  const privateCases = input.cases.filter(item => (item.modelInput as { dataClass?: string }).dataClass === "private_business");
  const privateExamples = input.examples.filter(item => item.dataClass === "private_business");
  const required = [...privateCases.map(item => `case:${item.caseId}`), ...privateExamples.map(item => `example:${item.exampleId}`)];
  const actual = input.bindings.map(item => { validateOptimizationFeedbackBinding(item, input.cleanupOnly ? "cleanup" : "admission"); return `${item.target}:${item.targetId}`; });
  phaseOneAssert(new Set(actual).size === actual.length && required.length === actual.length && required.every(key => actual.includes(key)), "PHASE_ONE_PRIVATE_SOURCE_BINDING_REQUIRED");
  // Different turns and executions still belong to one real Session. Check all
  // frozen bindings even when the provider only needs the current case readback.
  const sessionPartitions = new Map<string, string>();
  for (const binding of input.cleanupOnly ? [] : input.bindings) {
    const partition = binding.target === "example" ? "dev" : privateCases.find(item => item.caseId === binding.targetId)!.sourcePartition;
    phaseOneAssert(!sessionPartitions.has(binding.sessionId) || sessionPartitions.get(binding.sessionId) === partition,
      "PHASE_ONE_SOURCE_PARTITION_CONTAMINATION");
    sessionPartitions.set(binding.sessionId, partition);
  }
  for (const binding of input.cleanupOnly ? [] : input.bindings.filter(item => item.target === "example")) {
    phaseOneAssert(!input.cases.some(item => item.sourcePartition !== "dev" && (item.sourceIds.includes(`feedback:${binding.feedbackId}`)
      || item.sourceIds.includes(`execution:${binding.executionId}`) || item.sourceIds.includes(`session:${binding.sessionId}`))),
      "PHASE_ONE_SOURCE_PARTITION_CONTAMINATION");
  }
  if (required.length === 0) return;
  phaseOneAssert(input.baseURL && input.token, "PHASE_ONE_PRIVATE_SOURCE_READBACK_UNCONFIGURED");
  const baseURL = input.baseURL, token = input.token;
  const errors: unknown[] = [];
  const sources = input.bindings.filter(binding => !input.currentCaseId || binding.target !== "case" || binding.targetId === input.currentCaseId);
  for (let offset = 0; offset < sources.length; offset += 8) {
    const results = await Promise.allSettled(sources.slice(offset, offset + 8).map(async binding => {
    const bundle = await readOptimizationFeedbackSource({ baseURL, token, regressionId: binding.regressionId }, fetcher);
    assertFeedbackBindingCurrent(binding, bundle);
    if (binding.target === "case") {
      const item = privateCases.find(item => item.caseId === binding.targetId)!;
      phaseOneAssert(digestCanonicalJson(item.modelInput) === digestCanonicalJson(optimizationInputFromFeedback(bundle))
        && item.referenceTime === bundle.snapshot.reference_time, "PHASE_ONE_PRIVATE_SOURCE_INPUT_CHANGED");
      phaseOneAssert(item.sourceIds.includes(`feedback:${binding.feedbackId}`) && item.sourceIds.includes(`execution:${binding.executionId}`)
        && item.sourceIds.includes(`session:${binding.sessionId}`), "PHASE_ONE_PRIVATE_SOURCE_GROUP_REQUIRED");
      if (item.purpose === "final_verification") {
        const oracle = item.oracle as { expectedBehaviorProposal?: string; expectationAuthority?: string };
        phaseOneAssert(oracle.expectationAuthority === "proposal" && oracle.expectedBehaviorProposal === bundle.snapshot.expected_behavior,
          "PHASE_ONE_PRIVATE_EXPECTATION_MUST_REMAIN_PROPOSAL");
      }
    } else {
      // Examples imported from real feedback are the exact input+proposal representation, with provenance retained.
      const example = privateExamples.find(item => item.exampleId === binding.targetId)!;
      const expected = JSON.stringify({ input: optimizationInputFromFeedback(bundle), expectedBehaviorProposal: bundle.snapshot.expected_behavior, expectationAuthority: "proposal" });
      phaseOneAssert(example.demonstration === expected && example.contentDigest === digestCanonicalJson(expected), "PHASE_ONE_PRIVATE_SOURCE_INPUT_CHANGED");
    }
    }));
    errors.push(...results.flatMap(result => result.status === "rejected" ? [result.reason] : []));
  }
  const invalidation = errors.find(isPhaseOneSourceInvalidated);
  if (invalidation) throw invalidation;
  if (errors.length) throw errors[0];
}

export function isPhaseOneSourceInvalidated(error: unknown): boolean {
  return error instanceof Error && /^(?:OPTIMIZATION_FEEDBACK_(?:READBACK_(?:404|410)|SOURCE_(?:UNAVAILABLE|CHANGED)|INPUT_DIGEST_MISMATCH)|PHASE_ONE_PRIVATE_SOURCE_INPUT_CHANGED)$/.test(error.message);
}
