import { describe, expect, it } from "vitest";

import {
  createRealityReceiptInputSchema,
  isLabId,
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
});
