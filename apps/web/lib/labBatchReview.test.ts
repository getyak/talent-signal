import type { LabJob, LabRegression } from "@talent-signal/contracts";
import { describe, expect, it } from "vitest";

import {
  attemptRunLabel,
  compareJobCases,
  isTerminalLabJob,
  jobProgress,
  regressionEligibleAttempts,
  releaseEvidence,
} from "./labBatchReview";

const job: LabJob = {
  id: "510754c7-2ef6-4aee-b748-fcaf7e79022b",
  definition_hash: "a".repeat(64),
  definition: {
    task: "relationship_text",
    cases: [
      {
        id: "ambiguous-identity",
        title: "Ambiguous identity",
        revision: "r1",
        partition: "development",
        input_json: "{}",
        input_hash: "b".repeat(64),
        expected: "Ask for clarification.",
      },
    ],
    configurations: [
      { model: "model-a", prompt_preset: "baseline", prompt_revision: "p1" },
      { model: "model-b", prompt_preset: "evidence_first", prompt_revision: "p2" },
    ],
    comparison: "combined",
    repetitions: 1,
    call_limit: 2,
    max_output_tokens_per_call: 1600,
    reference_time: "2026-09-05T00:00:00.000Z",
    backend_revision: "test",
    instrument_revision: "v1",
    tool_access: [],
    business_write_count: 0,
    cost_status: "unavailable",
  },
  status: "completed",
  attempts: [
    {
      id: "1c12a326-3816-45bb-86ce-7aa73e3050a7",
      ordinal: 0,
      case_id: "ambiguous-identity",
      configuration_index: 0,
      repetition: 1,
      status: "completed",
      started_at: "2026-09-05T00:00:00.000Z",
      finished_at: "2026-09-05T00:00:01.000Z",
      requested_model: "model-a",
      actual_model: "model-a",
      prompt_revision: "p1",
      actual_prompt_revision: "p1",
      provider_request_id: "request-a",
      duration_ms: 1000,
      input_tokens: 10,
      output_tokens: 20,
      title: "Needs review",
      answer: "Merged the two people.",
      citation_ids: [],
      error_code: null,
      checks: [
        { id: "identity", verdict: "fail", summary: "Identity was merged." },
      ],
    },
    {
      id: "3e587f91-f70c-46c1-918f-d8be2e05e797",
      ordinal: 1,
      case_id: "ambiguous-identity",
      configuration_index: 1,
      repetition: 1,
      status: "unknown",
      started_at: "2026-09-05T00:00:01.000Z",
      finished_at: "2026-09-05T00:00:02.000Z",
      requested_model: "model-b",
      actual_model: null,
      prompt_revision: "p2",
      actual_prompt_revision: null,
      provider_request_id: null,
      duration_ms: null,
      input_tokens: null,
      output_tokens: null,
      title: null,
      answer: null,
      citation_ids: [],
      error_code: "WORKER_LOST_AFTER_RESERVATION",
      checks: [],
    },
  ],
  calls_reserved: 2,
  created_at: "2026-09-05T00:00:00.000Z",
  expires_at: "2026-09-12T00:00:00.000Z",
  cancel_requested_at: null,
  review: "unreviewed",
  failure_categories: [],
  quality: "blocked",
};

describe("Lab batch review projection", () => {
  it("shows the backend's one-based repetition without shifting it", () => {
    expect(attemptRunLabel(job.attempts[0])).toBe("第 1 次");
  });

  it("keeps hard failures and unknown outcomes visible per frozen case", () => {
    expect(jobProgress(job)).toEqual({
      planned: 2,
      issued: 2,
      completed: 1,
      failed: 0,
      unknown: 1,
      hardFailures: 1,
    });
    expect(compareJobCases(job)[0]).toMatchObject({
      hardFailures: 1,
      unknownOutcomes: 1,
      a: [{ requested_model: "model-a" }],
      b: [{ requested_model: "model-b" }],
    });
  });

  it("does not count an unissued cancelled attempt as a model call", () => {
    const cancelled = {
      ...job,
      status: "cancelled" as const,
      attempts: [
        job.attempts[0],
        {
          ...job.attempts[1],
          status: "cancelled" as const,
          started_at: null,
          finished_at: "2026-09-05T00:00:01.500Z",
          error_code: "CANCELLED_BEFORE_DISPATCH",
        },
      ],
    };
    expect(jobProgress(cancelled).issued).toBe(1);
  });

  it("allows only issued failures from a terminal job to become regressions", () => {
    expect(isTerminalLabJob(job.status)).toBe(true);
    expect(regressionEligibleAttempts(job).map((attempt) => attempt.id)).toEqual([
      "1c12a326-3816-45bb-86ce-7aa73e3050a7",
      "3e587f91-f70c-46c1-918f-d8be2e05e797",
    ]);
    expect(regressionEligibleAttempts({ ...job, status: "running" })).toEqual([]);
  });

  it("does not confuse a saved regression with hosted CI enforcement", () => {
    const regression = {
      release_check: "not_connected",
    } as LabRegression;
    expect(releaseEvidence(regression)).toEqual({
      label: "尚未纳入发布检查",
      tone: "unverified",
      detail: "保存为回归案例不等于发布门禁已执行。",
    });
  });
});
