import { describe, expect, it, vi } from "vitest";
import { CONTRACT_VERSION, type LabJob, type LabRegressionExport } from "@talent-signal/contracts";
import { contentDigestMatches, digestCanonicalJson } from "@talent-signal/evaluation";
import { consumeLabRegression } from "./labRegression.js";
import { labReadbackURL, readLabRegressionFromBackend } from "./labRegressionReadback.js";

const now = "2026-09-04T10:00:00.000Z", hash = (value: unknown) => digestCanonicalJson(value).slice(7);
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const input = { objective: "Synthetic question", context_blocks: [], allowed_citation_ids: ["source-1"] };
  const sample = { id: "synthetic-conflict", title: "Synthetic conflict", revision: "1", partition: "held_out" as const,
    input_json: JSON.stringify(input), input_hash: hash(input), expected: "Original expectation." };
  const definition: LabJob["definition"] = { task: "relationship_text", cases: [sample],
    configurations: [{ model: "fixture-model", prompt_preset: "baseline", prompt_revision: "prompt-1" }, { model: "fixture-model", prompt_preset: "concise", prompt_revision: "prompt-2" }],
    comparison: "prompt", repetitions: 1, call_limit: 2, max_output_tokens_per_call: 1600, reference_time: now,
    backend_revision: "fixture-backend-revision", instrument_revision: "lab-relationship-answer-job/1", tool_access: [], business_write_count: 0, cost_status: "unavailable" };
  const attempts: LabJob["attempts"] = [0, 1].map((i) => ({ id: uuid(i + 20), ordinal: i, case_id: sample.id, configuration_index: i, repetition: 1,
    status: "completed", started_at: now, finished_at: now, requested_model: "fixture-model", actual_model: "fixture-model",
    prompt_revision: `prompt-${i + 1}`, actual_prompt_revision: `prompt-${i + 1}`, provider_request_id: `fixture-${i}`, duration_ms: 10,
    input_tokens: 20, output_tokens: 5, title: "Synthetic result", answer: "Model output marker; inspect the evidence.", citation_ids: ["source-1"], error_code: null,
    checks: [{ id: "output_contract", verdict: "pass", summary: "Fixture output shape" }] }));
  const snapshot: LabRegressionExport["snapshot"] = { schema_version: "lab-regression.v1", data_class: "registered_synthetic",
    source_job_id: uuid(1), source_definition_hash: hash(definition), source_attempt: { ...attempts[0]!, id: uuid(10) }, case: sample,
    configurations: definition.configurations, reference_time: now, backend_revision: definition.backend_revision, instrument_revision: definition.instrument_revision,
    failure_categories: ["missed_uncertainty"], expected_behavior: "Expected behavior marker", review_note: "Private review marker", reviewer_id: uuid(3), reviewed_at: now };
  const bundle: LabRegressionExport = { schema_version: "lab-regression-bundle.v1", execution_authority: "none", id: uuid(2), content_hash: hash(snapshot),
    snapshot, created_at: now, expires_at: "2026-12-01T10:00:00.000Z" };
  definition.regression_source = { id: bundle.id, content_hash: bundle.content_hash };
  const job: LabJob = { id: uuid(4), definition_hash: hash(definition), definition, status: "completed", attempts, calls_reserved: 2,
    created_at: now, expires_at: "2026-09-11T10:00:00.000Z", cancel_requested_at: null, review: "b", failure_categories: [], quality: "needs_review" };
  return { bundle: structuredClone(bundle), job: structuredClone(job) };
}
function consume(records = fixture()) {
  return consumeLabRegression({ ...records, now, runner: { git_sha: "consumer-only-revision", source_digest: digestCanonicalJson({ fixture: true }) }, transport: "reviewed_local_files" });
}
describe("Lab regression consumption", () => {
  it("reuses atomic gates, exports no content, and never promotes preference or reviewed held-out failures", () => {
    const report = consume();
    expect(contentDigestMatches(report)).toBe(true);
    expect(report.backend_revision).toBe("fixture-backend-revision");
    expect(report.runner.git_sha).toBe("consumer-only-revision");
    expect(report.evaluation_partition).toBe("dev"); expect(report.source_partition).toBe("held_out");
    expect(report.release_authority).toBe("none"); expect(report.ci_verification).toBe("not_verified"); expect(report.new_model_calls).toBe(0);
    expect(report.results.map((value) => value.gate.status)).toEqual(["needs_review", "needs_review"]);
    expect(report.results.every((value) => value.gate.capabilities.find((gate) => gate.capability === "integrity")?.status === "pass")).toBe(true);
    for (const secret of ["Private review marker", "Expected behavior marker", "Model output marker", "Synthetic question"]) expect(JSON.stringify(report)).not.toContain(secret);
  });
  it("rejects tampered snapshots and a different run's source binding", () => {
    const records = fixture(); records.bundle.snapshot.review_note = "changed";
    expect(() => consume(records)).toThrow("LAB_RECORD_HASH_MISMATCH");
    const other = fixture(); other.job.definition.regression_source!.id = uuid(100); other.job.definition_hash = hash(other.job.definition);
    expect(() => consume(other)).toThrow("LAB_RUN_LINEAGE_MISMATCH");
  });
  it("rejects changed frozen inputs and clocks even after the new run is rehashed", () => {
    for (const change of ["input", "clock"]) {
      const records = structuredClone(fixture());
      if (change === "input") records.job.definition.cases[0]!.input_json = "{}";
      else records.job.definition.reference_time = "2026-09-05T10:00:00.000Z";
      records.job.definition_hash = hash(records.job.definition);
      expect(() => consume(records)).toThrow("LAB_FROZEN_CASE_CHANGED");
    }
  });
  it("requires a complete, unique matrix of attempts", () => {
    const records = fixture(); records.job.attempts[1] = records.job.attempts[0]!;
    expect(() => consume(records)).toThrow("LAB_DUPLICATE_ATTEMPT");
    records.job.attempts.pop(); expect(() => consume(records)).toThrow("LAB_ATTEMPT_COUNT_INVALID");
  });
  it("fails hard checks for an unapproved citation or actual configuration despite recorded preference", () => {
    const records = fixture(); records.job.attempts[0]!.citation_ids = ["unauthorized"];
    records.job.attempts[1]!.actual_prompt_revision = "silent-fallback";
    expect(consume(records).results.map((value) => value.gate.status)).toEqual(["fail", "fail"]);
  });
  it("does not convert an unknown attempt or missing output into a passing run", () => {
    const records = fixture(); records.job.status = "partial"; records.job.attempts[0]!.status = "unknown"; records.job.attempts[1]!.answer = null;
    expect(consume(records).results.map((value) => value.gate.status)).toEqual(["not_run", "fail"]);
  });
  it("rejects expired or still running records", () => {
    const records = fixture(); records.job.status = "running"; expect(() => consume(records)).toThrow("LAB_RUN_NOT_TERMINAL");
    records.job.status = "completed"; records.bundle.expires_at = now; expect(() => consume(records)).toThrow("LAB_RECORD_EXPIRED");
  });
});

describe("Authenticated Lab readback", () => {
  it("uses only the selected origin, never follows redirects, and rechecks deletion after run readback", async () => {
    const records = fixture(); const requests: Array<{ url: string; options: RequestInit | undefined }> = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      requests.push({ url: String(url), options });
      return Response.json(requests.length === 2 ? { contract_version: CONTRACT_VERSION, job: records.job } : records.bundle);
    });
    const result = await readLabRegressionFromBackend({ baseURL: "https://test.example", token: "scoped-token", regressionID: records.bundle.id, runID: records.job.id }, fetcher);
    expect(result).toEqual(records); expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.url.startsWith("https://test.example/v1/") && request.options?.redirect === "error")).toBe(true);
    const deleted = vi.fn().mockResolvedValueOnce(Response.json(records.bundle))
      .mockResolvedValueOnce(Response.json({ contract_version: CONTRACT_VERSION, job: records.job })).mockResolvedValueOnce(new Response(null, { status: 410 }));
    await expect(readLabRegressionFromBackend({ baseURL: "http://127.0.0.1:4329", token: "scoped-token", regressionID: records.bundle.id, runID: records.job.id }, deleted)).rejects.toThrow("LAB_READBACK_HTTP_410");
  });
  it("rejects credentialed URLs, non-TLS remote origins, oversized bodies and swapped identities", async () => {
    for (const value of ["http://test.example", "https://user:pass@test.example", "https://test.example/path", "https://test.example?token=hidden"]) expect(() => labReadbackURL(value)).toThrow();
    const records = fixture(), input = { baseURL: "https://test.example", token: "scoped-token", regressionID: records.bundle.id, runID: records.job.id };
    await expect(readLabRegressionFromBackend(input, vi.fn().mockResolvedValue(new Response("x".repeat(512_001))))).rejects.toThrow("LAB_READBACK_TOO_LARGE");
    const wrong = { ...records.bundle, id: uuid(100) };
    await expect(readLabRegressionFromBackend(input, vi.fn().mockResolvedValueOnce(Response.json(wrong))
      .mockResolvedValueOnce(Response.json({ contract_version: CONTRACT_VERSION, job: records.job })))).rejects.toThrow("LAB_READBACK_BINDING_MISMATCH");
  });
});
