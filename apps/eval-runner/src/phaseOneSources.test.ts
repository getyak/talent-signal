import { describe, expect, it, vi } from "vitest";
import type { LabRegressionExport } from "@talent-signal/contracts";
import { digestCanonicalJson, type PhaseOneCase } from "@talent-signal/evaluation";
import { feedbackBindingFromBundle, optimizationInputFromFeedback } from "./optimization/feedbackSource.js";
import { assertPhaseOnePrivateSources, isPhaseOneSourceInvalidated } from "./phaseOneSources.js";

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (value: unknown) => digestCanonicalJson(value).slice(7);
function fixture(identity = 0, sessionId = uuid(8)) {
  const caseId = identity ? `private-case-${identity}` : "private-case";
  const time = "2026-09-07T00:00:00.000Z", input = { objective: `Private fixture question ${identity}`, mode: "relationship", reference_time: time,
    context_blocks: [], allowed_citation_ids: [] };
  const snapshot: LabRegressionExport["snapshot"] = { schema_version: "lab-regression.v1", data_class: "private_business", task: "relationship_text",
    feedback_source: { feedback_id: uuid(1 + identity), feedback_revision: 1, execution_id: uuid(2 + identity), session_id: sessionId, original_task_id: uuid(3 + identity), original_output_hash: hash("output"),
      expectation_authority: "proposal", execution_authority: "none" }, source_job_id: uuid(4), source_definition_hash: hash("definition"),
    source_attempt: { id: uuid(5), ordinal: 0, case_id: "private-case", configuration_index: 0, repetition: 1, status: "completed",
      started_at: time, finished_at: time, requested_model: "glm-4.5", actual_model: "glm-4.5", prompt_revision: "1", actual_prompt_revision: "1",
      provider_request_id: null, duration_ms: 1, input_tokens: 1, output_tokens: 1, title: "Fixture", answer: "Fixture result", citation_ids: [], error_code: null, checks: [] },
    case: { id: "private-case", title: "Fixture", revision: "1", partition: "development", input_json: JSON.stringify(input), input_hash: hash(input), expected: "Ask what is missing" },
    configurations: [{ model: "glm-4.5", prompt_preset: "baseline", prompt_revision: "1" }], reference_time: time, backend_revision: "revision", instrument_revision: "feedback.v1",
    failure_categories: ["missed_uncertainty"], expected_behavior: "Ask what is missing", review_note: "", reviewer_id: uuid(6), reviewed_at: time };
  const bundle: LabRegressionExport = { schema_version: "lab-regression-bundle.v1", execution_authority: "none", id: uuid(7 + identity), content_hash: hash(snapshot), snapshot,
    created_at: time, expires_at: "2099-01-01T00:00:00.000Z" };
  const binding = feedbackBindingFromBundle(bundle, caseId);
  const item: PhaseOneCase = { caseId, sourceIds: [`feedback:${binding.feedbackId}`, `execution:${binding.executionId}`, `session:${binding.sessionId}`], sourcePartition: "held_out",
    purpose: "final_verification", referenceTime: time, modelInput: optimizationInputFromFeedback(bundle) as unknown as PhaseOneCase["modelInput"],
    oracle: { expectationAuthority: "proposal", expectedBehaviorProposal: snapshot.expected_behavior }, slices: {} };
  const fetcher = vi.fn(async () => new Response(JSON.stringify(bundle)));
  const inputArgs = { cases: [item], examples: [], bindings: [binding], baseURL: "http://127.0.0.1:3001", token: "fixture-token" };
  return { bundle, binding, item, fetcher, inputArgs };
}

describe("private final source provenance", () => {
  it("checks authenticated native lineage and exact input/reference/proposal before use", async () => {
    const state = fixture();
    await assertPhaseOnePrivateSources(state.inputArgs, state.fetcher);
    expect(state.fetcher).toHaveBeenCalledTimes(1);
    state.item.referenceTime = "2026-09-08T00:00:00.000Z";
    await expect(assertPhaseOnePrivateSources(state.inputArgs, state.fetcher)).rejects.toThrow("PHASE_ONE_PRIVATE_SOURCE_INPUT_CHANGED");
  });
  it("requires the Session group from the authenticated bundle, not a caller-supplied group", async () => {
    const state = fixture();
    state.item.sourceIds = state.item.sourceIds.filter(id => !id.startsWith("session:"));
    await expect(assertPhaseOnePrivateSources(state.inputArgs, state.fetcher)).rejects.toThrow("PHASE_ONE_PRIVATE_SOURCE_GROUP_REQUIRED");
    state.item.sourceIds.push(`session:${uuid(99)}`);
    await expect(assertPhaseOnePrivateSources(state.inputArgs, state.fetcher)).rejects.toThrow("PHASE_ONE_PRIVATE_SOURCE_GROUP_REQUIRED");
    state.binding.sessionId = uuid(99);
    await expect(assertPhaseOnePrivateSources(state.inputArgs, state.fetcher)).rejects.toThrow("OPTIMIZATION_FEEDBACK_SOURCE_CHANGED");
  });
  it("does not admit legacy snapshots missing a trusted Session even if the caller adds one", async () => {
    const state = fixture();
    delete state.bundle.snapshot.feedback_source!.session_id;
    state.bundle.content_hash = hash(state.bundle.snapshot);
    state.binding.contentHash = state.bundle.content_hash;
    await expect(assertPhaseOnePrivateSources(state.inputArgs, state.fetcher)).rejects.toThrow("OPTIMIZATION_FEEDBACK_SOURCE_UNAVAILABLE");
  });
  it("rejects distinct executions and inputs from the same Session across dev and held-out", async () => {
    const development = fixture(), heldout = fixture(10);
    development.item.sourcePartition = "dev"; development.item.purpose = "development";
    expect(development.binding.executionId).not.toBe(heldout.binding.executionId);
    expect(development.binding.feedbackId).not.toBe(heldout.binding.feedbackId);
    expect(digestCanonicalJson(development.item.modelInput)).not.toBe(digestCanonicalJson(heldout.item.modelInput));
    const args = { ...heldout.inputArgs, cases: [development.item, heldout.item], bindings: [development.binding, heldout.binding] };
    for (const currentCaseId of [undefined, heldout.item.caseId]) {
      await expect(assertPhaseOnePrivateSources({ ...args, ...(currentCaseId ? { currentCaseId } : {}) }, heldout.fetcher)).rejects.toThrow("PHASE_ONE_SOURCE_PARTITION_CONTAMINATION");
    }
    expect(heldout.fetcher).not.toHaveBeenCalled();
  });
  it("keeps unrelated real Sessions eligible for separate partitions", async () => {
    const development = fixture(), heldout = fixture(10, uuid(90));
    development.item.sourcePartition = "dev"; development.item.purpose = "development";
    const fetcher = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(
      String(url).includes(development.bundle.id) ? development.bundle : heldout.bundle)));
    await assertPhaseOnePrivateSources({ ...heldout.inputArgs, cases: [development.item, heldout.item], bindings: [development.binding, heldout.binding] }, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects a development example sharing only its Session with a different held-out execution", async () => {
    const heldout = fixture(), development = fixture(10);
    const demonstration = JSON.stringify({ input: optimizationInputFromFeedback(development.bundle), expectedBehaviorProposal: development.bundle.snapshot.expected_behavior, expectationAuthority: "proposal" });
    await expect(assertPhaseOnePrivateSources({ ...heldout.inputArgs,
      examples: [{ exampleId: "example-1", partition: "dev", dataClass: "private_business", demonstration, contentDigest: digestCanonicalJson(demonstration) }],
      bindings: [heldout.binding, feedbackBindingFromBundle(development.bundle, "example-1", "example")] }, heldout.fetcher))
      .rejects.toThrow("PHASE_ONE_SOURCE_PARTITION_CONTAMINATION");
    expect(heldout.fetcher).not.toHaveBeenCalled();
  });
  it("distinguishes source deletion from transient unavailability and rejects missing lineage", async () => {
    const state = fixture();
    await expect(assertPhaseOnePrivateSources({ ...state.inputArgs, bindings: [] }, state.fetcher)).rejects.toThrow("PHASE_ONE_PRIVATE_SOURCE_BINDING_REQUIRED");
    await expect(assertPhaseOnePrivateSources(state.inputArgs, async () => new Response(null, { status: 410 }))).rejects.toThrow("OPTIMIZATION_FEEDBACK_READBACK_410");
    expect(isPhaseOneSourceInvalidated(new Error("OPTIMIZATION_FEEDBACK_READBACK_410"))).toBe(true);
    expect(isPhaseOneSourceInvalidated(new Error("OPTIMIZATION_FEEDBACK_READBACK_503"))).toBe(false);
  });
  it("does not let a private demonstration's source reappear as independent holdout", async () => {
    const state = fixture(), demonstration = JSON.stringify({ input: optimizationInputFromFeedback(state.bundle), expectedBehaviorProposal: state.bundle.snapshot.expected_behavior, expectationAuthority: "proposal" });
    await expect(assertPhaseOnePrivateSources({ ...state.inputArgs,
      examples: [{ exampleId: "example-1", partition: "dev", dataClass: "private_business", demonstration, contentDigest: digestCanonicalJson(demonstration) }],
      bindings: [state.binding, { ...state.binding, target: "example", targetId: "example-1" }] }, state.fetcher)).rejects.toThrow("PHASE_ONE_SOURCE_PARTITION_CONTAMINATION");
    expect(state.fetcher).not.toHaveBeenCalled();
    await expect(assertPhaseOnePrivateSources({ ...state.inputArgs,
      examples: [{ exampleId: "example-1", partition: "dev", dataClass: "private_business", demonstration, contentDigest: digestCanonicalJson(demonstration) }],
      bindings: [state.binding, { ...state.binding, target: "example", targetId: "example-1", feedbackId: uuid(99) }] }, state.fetcher))
      .rejects.toThrow("PHASE_ONE_SOURCE_PARTITION_CONTAMINATION");
  });
  it("cleans up known expiry before credentials or any failing network source can mask it", async () => {
    const state = fixture(), other = { ...state.item, caseId: "other-case" };
    const expired = { ...state.binding, targetId: "other-case", expiresAt: "2020-01-01T00:00:00Z" };
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    await expect(assertPhaseOnePrivateSources({ ...state.inputArgs, cases: [state.item, other], bindings: [state.binding, expired], token: undefined }, fetcher))
      .rejects.toThrow("OPTIMIZATION_FEEDBACK_SOURCE_UNAVAILABLE");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("lets known expiry remove a legacy binding before strict Session admission validation", async () => {
    const state = fixture();
    const { sessionId: _sessionId, ...old } = { ...state.binding, expiresAt: "2020-01-01T00:00:00Z" };
    await expect(assertPhaseOnePrivateSources({ ...state.inputArgs, bindings: [old as typeof state.binding], token: undefined }, state.fetcher))
      .rejects.toThrow("OPTIMIZATION_FEEDBACK_SOURCE_UNAVAILABLE");
    expect(state.fetcher).not.toHaveBeenCalled();
  });
  it("only permits legacy metadata for cleanup readback, never Session admission", async () => {
    const state = fixture(), { sessionId: _sessionId, ...old } = state.binding;
    const args = { ...state.inputArgs, bindings: [old as typeof state.binding] };
    await expect(assertPhaseOnePrivateSources(args, state.fetcher)).rejects.toThrow("OPTIMIZATION_FEEDBACK_BINDING_INVALID");
    expect(state.fetcher).not.toHaveBeenCalled();
    await expect(assertPhaseOnePrivateSources({ ...args, cleanupOnly: true }, state.fetcher)).rejects.toThrow("OPTIMIZATION_FEEDBACK_SOURCE_CHANGED");
    delete state.bundle.snapshot.feedback_source!.session_id;
    state.bundle.content_hash = hash(state.bundle.snapshot);
    await expect(assertPhaseOnePrivateSources({ ...args, cleanupOnly: true }, state.fetcher)).rejects.toThrow("OPTIMIZATION_FEEDBACK_SOURCE_UNAVAILABLE");
    expect(state.fetcher).toHaveBeenCalledTimes(2);
  });
  it("prioritizes a confirmed second-source deletion over a first-source outage", async () => {
    const state = fixture(), second = { ...state.binding, targetId: "other-case", regressionId: uuid(88) };
    const fetcher = vi.fn(async (url: string | URL | Request) => new Response(null, { status: String(url).includes(uuid(88)) ? 410 : 503 }));
    await expect(assertPhaseOnePrivateSources({ ...state.inputArgs, cases: [state.item, { ...state.item, caseId: "other-case" }], bindings: [state.binding, second] }, fetcher))
      .rejects.toThrow("OPTIMIZATION_FEEDBACK_READBACK_410");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
