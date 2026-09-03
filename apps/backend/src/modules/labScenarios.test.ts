import {
  LabScenarioOutputSchema,
  LabScenarioSummarySchema,
} from "@talent-signal/contracts";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { beforeAll, describe, expect, it } from "vitest";

import {
  compareLabScenarioOutputs,
  getLabScenario,
  labScenarioOutput,
  listLabScenarios,
} from "./labScenarios.js";

beforeAll(() => {
  if (!FormatRegistry.Has("date-time")) {
    FormatRegistry.Set("date-time", (value) => Number.isFinite(Date.parse(value)));
  }
});

describe("Talent Signal Lab scenarios", () => {
  it("publishes exactly five versioned, synthetic, isolated V0 worlds", () => {
    const scenarios = listLabScenarios();

    expect(scenarios).toHaveLength(5);
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(5);
    expect(new Set(scenarios.map((scenario) => scenario.snapshot_hash)).size).toBe(5);
    for (const scenario of scenarios) {
      expect(Value.Check(LabScenarioSummarySchema, scenario)).toBe(true);
      expect(scenario.baseline.fixture_version).toBe(
        scenario.candidate.fixture_version,
      );
      expect(scenario.baseline.agent_version).not.toBe(
        scenario.candidate.agent_version,
      );
    }
  });

  it("keeps every replay proposal-only with no canonical or external effects", () => {
    for (const scenario of listLabScenarios()) {
      for (const variant of ["baseline", "candidate"] as const) {
        const output = labScenarioOutput(scenario.id, variant);
        expect(output).not.toBeNull();
        expect(
          [...Value.Errors(LabScenarioOutputSchema, output)].map((error) => ({
            message: error.message,
            path: error.path,
          })),
        ).toEqual([]);
        expect(output?.canonical_mutation_count).toBe(0);
        expect(output?.external_effect_count).toBe(0);
      }
    }
  });

  it("abstains and asks one bounded question for ambiguous identity", () => {
    const output = labScenarioOutput("ambiguous-identity", "candidate");

    expect(output).toMatchObject({
      lifecycle: "abstained",
      requires_human_confirmation: true,
      confirmation_count: 1,
    });
    expect(output?.required_question).toContain("绑定");
    expect(output?.interpretation).toContain("停止自动绑定");
  });

  it("retracts current interpretation after source authorization is revoked", () => {
    const output = labScenarioOutput(
      "source-authorization-revoked",
      "candidate",
    );

    expect(output).toMatchObject({
      lifecycle: "unavailable",
      requires_human_confirmation: false,
      confirmation_count: 0,
    });
    expect(output?.evidence_summary.unavailable).toBe(1);
    expect(output?.interpretation).toContain("撤回");
  });

  it("compares baseline and candidate from one frozen snapshot in user terms", () => {
    const scenario = getLabScenario("action-awaiting-confirmation");
    const baseline = labScenarioOutput(
      "action-awaiting-confirmation",
      "baseline",
    );
    const candidate = labScenarioOutput(
      "action-awaiting-confirmation",
      "candidate",
    );
    expect(scenario).not.toBeNull();
    expect(baseline).not.toBeNull();
    expect(candidate).not.toBeNull();

    const differences = compareLabScenarioOutputs(
      scenario!,
      baseline!,
      candidate!,
    );

    expect(differences.map((item) => item.kind)).toEqual([
      "insight",
      "explanation",
      "caution",
      "question",
      "confirmation_effort",
    ]);
    expect(differences.every((item) => item.impact !== "regressed")).toBe(true);
    expect(differences.find((item) => item.kind === "question")).toMatchObject({
      baseline: "不提问",
      impact: "improved",
    });
  });

  it("returns fresh output objects so a replay cannot mutate its fixture", () => {
    const first = labScenarioOutput("forming-relationship", "candidate");
    const second = labScenarioOutput("forming-relationship", "candidate");
    expect(first).not.toBe(second);
    first!.headline = "mutated by test";
    expect(second?.headline).toBe("可能正在形成持续协作关系");
  });
});
