import { describe, expect, it } from "vitest";

import {
  createRealityReceiptInputSchema,
  isLabId,
  labJobInputSchema,
  labJobReviewInputSchema,
  labRegressionInputSchema,
  promoteRealityReceiptInputSchema,
  startLabSessionInputSchema,
} from "./labInput";

describe("Talent Signal Lab mutation input", () => {
  it("accepts a named scenario without accepting arbitrary controls", () => {
    expect(
      startLabSessionInputSchema.safeParse({
        scenario_id: "ambiguous-identity",
        idempotency_key: "start-once",
      }).success,
    ).toBe(true);
    expect(
      startLabSessionInputSchema.safeParse({
        scenario_id: "ambiguous-identity",
        feature_flags: ["unsafe-auto-merge"],
        idempotency_key: "start-once",
      }).success,
    ).toBe(false);
  });

  it("requires a structured receipt tied to a valid run", () => {
    expect(
      createRealityReceiptInputSchema.safeParse({
        run_id: "510754c7-2ef6-4aee-b748-fcaf7e79022b",
        idempotency_key: "receipt-once",
      }).success,
    ).toBe(true);
    expect(
      createRealityReceiptInputSchema.safeParse({
        run_id: "not-a-run",
        idempotency_key: "receipt-once",
      }).success,
    ).toBe(false);
  });

  it("requires an explicit human promotion decision without free-form content", () => {
    expect(
      promoteRealityReceiptInputSchema.safeParse({
        decision: "promote",
        idempotency_key: "promote-once",
      }).success,
    ).toBe(true);
    expect(
      promoteRealityReceiptInputSchema.safeParse({
        decision: "promote",
        reviewer_note: "candidate data must not enter the synthetic-only Lab boundary",
        idempotency_key: "promote-once",
      }).success,
    ).toBe(false);
  });

  it("accepts only UUID-shaped Lab resources", () => {
    expect(isLabId("510754c7-2ef6-4aee-b748-fcaf7e79022b")).toBe(true);
    expect(isLabId("../../people/real-candidate")).toBe(false);
  });

  it("accepts only a bounded two-configuration batch", () => {
    const request = {
      catalog_revision: "a".repeat(64),
      id: "510754c7-2ef6-4aee-b748-fcaf7e79022b",
      case_ids: ["ambiguous-identity", "stale-evidence"],
      configurations: [
        { model: "glm-5.3", prompt_preset: "baseline" },
        { model: "glm-5.3", prompt_preset: "evidence_first" },
      ],
      repetitions: 2,
      call_limit: 8,
    };
    expect(labJobInputSchema.safeParse(request).success).toBe(true);
    expect(
      labJobInputSchema.safeParse({
        ...request,
        case_ids: ["ambiguous-identity", "ambiguous-identity"],
      }).success,
    ).toBe(false);
    expect(
      labJobInputSchema.safeParse({ ...request, provider_api_key: "secret" })
        .success,
    ).toBe(false);
  });

  it("keeps review and regression promotion explicit and synthetic-only", () => {
    expect(
      labJobReviewInputSchema.safeParse({
        review: "inconclusive",
        failure_categories: ["missed_uncertainty"],
      }).success,
    ).toBe(true);
    const regression = {
      id: "510754c7-2ef6-4aee-b748-fcaf7e79022b",
      source_job_id: "1c12a326-3816-45bb-86ce-7aa73e3050a7",
      source_attempt_id: "3e587f91-f70c-46c1-918f-d8be2e05e797",
      source_definition_hash: "b".repeat(64),
      failure_categories: ["wrong_identity"],
      expected_behavior: "Keep ambiguous identity unresolved.",
      review_note: "Synthetic case only.",
    };
    expect(labRegressionInputSchema.safeParse(regression).success).toBe(true);
    expect(
      labRegressionInputSchema.safeParse({
        ...regression,
        failure_categories: [],
      }).success,
    ).toBe(false);
  });
});
