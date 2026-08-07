import { describe, expect, it } from "vitest";

import { extractConservativeResourceClaims } from "./resourceClaims.js";

describe("conservative resource claim extraction", () => {
  it("extracts explicit bilingual recruiter-relevant fields with exact quotes", () => {
    const claims = extractConservativeResourceClaims(
      [
        "Current role: VP Product at Northstar Labs",
        "所在地：上海",
        "Notice period: 30 days",
        "Availability: 2026-09-15",
      ].join("\n"),
    );

    expect(claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "current_role",
          value: "VP Product",
          evidenceQuote:
            "Current role: VP Product at Northstar Labs",
        }),
        expect.objectContaining({
          field: "current_employer",
          value: "Northstar Labs",
          evidenceQuote:
            "Current role: VP Product at Northstar Labs",
        }),
        expect.objectContaining({
          field: "location",
          value: "上海",
          evidenceQuote: "所在地：上海",
        }),
        expect.objectContaining({
          field: "notice_period",
          value: "30 days",
        }),
        expect.objectContaining({
          field: "availability",
          value: "2026-09-15",
        }),
      ]),
    );
  });

  it("keeps dated history addressable without collapsing multiple roles", () => {
    const claims = extractConservativeResourceClaims(
      "2021–2024 Example Co — Product Director\n2018-2021 Earlier Co — PM",
    );
    expect(claims).toHaveLength(2);
    expect(claims[0]?.field).toMatch(/^professional_history\.[a-f0-9]{12}$/);
    expect(claims[1]?.field).toMatch(/^professional_history\.[a-f0-9]{12}$/);
    expect(claims[0]?.field).not.toBe(claims[1]?.field);
  });

  it("does not create prohibited person judgments", () => {
    const claims = extractConservativeResourceClaims(
      "Culture fit: strong\nPersonality: assertive\nCurrent role: CTO",
    );
    expect(claims).toEqual([
      expect.objectContaining({
        field: "current_role",
        value: "CTO",
      }),
    ]);
  });
});
