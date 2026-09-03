import { describe, expect, it } from "vitest";
import {
  candidateMomentumFixtures,
  getActionOwnerLabel,
  getActionTypeLabel,
  getSpeakerLabel,
  isCandidateMomentumDataset,
  localizeGeneratedCopy,
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

  it("localizes generated workflow copy while leaving evidence untouched", () => {
    expect(getSpeakerLabel("candidate")).toBe("候选人");
    expect(getActionTypeLabel("prepare_question")).toBe("准备问题");
    expect(getActionOwnerLabel("recruiter")).toBe("招聘顾问");
    expect(localizeGeneratedCopy("client remote-work policy")).toBe(
      "客户的远程办公政策",
    );
    expect(
      localizeGeneratedCopy(
        "Resolve the work-mode dependency before the decision deadline.",
      ),
    ).toBe("在候选人作出决定前，先澄清远程办公这个关键依赖。");
    expect(
      localizeGeneratedCopy(
        "I have another offer and need to decide Wednesday.",
      ),
    ).toBe("I have another offer and need to decide Wednesday.");
  });
});
