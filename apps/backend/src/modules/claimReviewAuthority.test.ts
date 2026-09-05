import { describe, expect, it } from "vitest";
import { isCompleteReviewDate, requiresCalendarDate } from "./claimReviewAuthority.js";
import { extractConservativeResourceClaims, resourceFragmentClaimAuthority } from "./resourceClaims.js";

describe("screenshot review dependencies", () => {
  it("blocks unknown, proposed and other-speaker candidate facts", () => {
    for (const actor of ["candidate", "unknown", "recruiter", "client"] as const) {
      for (const status of ["confirmed", "proposed", "unknown"] as const) {
        expect(resourceFragmentClaimAuthority({ resource_kind: "conversation_screenshot",
          attributed_actor: actor, attribution_status: status }).allowed).toBe(actor === "candidate" && status === "confirmed");
      }
    }
  });
  it("requires an explicit valid calendar date instead of import-time inference", () => {
    for (const value of ["next Friday", "下周五", "2026-02-30", "2026-13-01", "2026-9-5", "2025-02-29"]) {
      expect(isCompleteReviewDate(value)).toBe(false);
    }
    expect(isCompleteReviewDate("2028-02-29")).toBe(true);
    expect(requiresCalendarDate("availability", "明天")).toBe(true);
    expect(requiresCalendarDate("notice_period", "30 days")).toBe(false);
    expect(extractConservativeResourceClaims("Work mode: Hybrid\nDeadline: next Friday")).toEqual([
      expect.objectContaining({ field: "work_mode_preference", certainty: "proposed" }),
      expect.objectContaining({ field: "decision_deadline", certainty: "ambiguous", evidenceQuote: "Deadline: next Friday" }),
    ]);
  });
});
