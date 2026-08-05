import { describe, expect, it } from "vitest";
import {
  candidateMomentumFixtures,
  isCandidateMomentumDataset,
} from "./candidateMomentum";

describe("candidate momentum fixtures", () => {
  it("preserves all eight frozen case ids", () => {
    expect(candidateMomentumFixtures.cases.map((item) => item.id)).toEqual([
      "TS-CORE-01",
      "TS-CORE-02",
      "TS-CORE-03",
      "TS-CORE-04",
      "TS-ID-01",
      "TS-ID-03",
      "TS-ACT-01",
      "TS-BOUND-01",
    ]);
  });

  it("keeps action proposals singular and evidence linked", () => {
    for (const fixtureCase of candidateMomentumFixtures.cases) {
      const action = fixtureCase.expected.action;
      if (!action) {
        continue;
      }

      expect(action.type).toBe("prepare_question");
      expect(action.evidence_message_ids.length).toBeGreaterThan(0);
      expect(
        action.evidence_message_ids.every((id) =>
          fixtureCase.messages.some((message) => message.id === id),
        ),
      ).toBe(true);
    }
  });

  it("accepts only an explicitly labeled complete dataset", () => {
    expect(isCandidateMomentumDataset(candidateMomentumFixtures)).toBe(true);
    expect(
      isCandidateMomentumDataset({
        ...candidateMomentumFixtures,
        data_mode: undefined,
      }),
    ).toBe(false);
    expect(
      isCandidateMomentumDataset({
        ...candidateMomentumFixtures,
        cases: candidateMomentumFixtures.cases.slice(1),
      }),
    ).toBe(false);
    expect(
      isCandidateMomentumDataset({
        ...candidateMomentumFixtures,
        cases: candidateMomentumFixtures.cases.map((item) =>
          item.id === "TS-CORE-01"
            ? {
                ...item,
                expected: {
                  ...item.expected,
                  disposition: "no_action",
                },
              }
            : item,
        ),
      }),
    ).toBe(false);
  });
});
