import { describe, expect, it } from "vitest";

import { AgentPersonResearchPolicyError } from "./personResearchPolicy.js";
import { AgentPublicResearchPolicyError } from "./publicResearchPolicy.js";
import { AGENT_BUDGET_CEILING } from "./runtimePolicy.js";
import {
  agentUsage,
  assertAgentBudget,
  exceededBudget,
  type AgentBudgetViolationDetail,
} from "./runBudget.js";
import { AgentConfigurationError } from "./runner.js";
import type { AgentBudget, AgentUsage } from "./types.js";

const budget: AgentBudget = { ...AGENT_BUDGET_CEILING };

function usage(overrides: Partial<AgentUsage> = {}): AgentUsage {
  return {
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    estimatedUsd: 0.25,
    turns: 2,
    toolCalls: 3,
    durationMs: 1_000,
    ...overrides,
  };
}

function capturedError(work: () => void): Error {
  try {
    work();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("Expected the work to throw an Error.");
}

describe("Agent run budget", () => {
  it("accepts the ceiling and reports the first invalid field", () => {
    assertAgentBudget(budget, () => {
      throw new Error("unexpected violation");
    });

    const violations: AgentBudgetViolationDetail[] = [];
    expect(() =>
      assertAgentBudget(
        { ...budget, maxTurns: 0, maxToolCalls: budget.maxToolCalls + 1 },
        (detail) => {
          violations.push(detail);
          throw new Error("stop");
        },
      ),
    ).toThrow("stop");
    expect(violations).toEqual([{ field: "maxTurns", violation: "positive" }]);
  });

  it("supports each runner's governed error contract", () => {
    const pursuitError = capturedError(() =>
      assertAgentBudget({ ...budget, maxTurns: 0 }, ({ field, violation }) => {
        throw new AgentConfigurationError(
          violation === "positive"
            ? `${field} must be positive.`
          : `${field} exceeds the V1 ceiling.`,
        );
      }),
    );
    expect(pursuitError).toBeInstanceOf(AgentConfigurationError);
    expect(pursuitError.message).toBe("maxTurns must be positive.");

    const publicResearchError = capturedError(() =>
      assertAgentBudget(
        { ...budget, maxToolCalls: budget.maxToolCalls + 1 },
        ({ field, violation }) => {
          throw new AgentPublicResearchPolicyError(
            "AGENT_BUDGET_INVALID",
            violation === "positive"
              ? `${field} must be positive.`
              : `${field} exceeds the Agent ceiling.`,
          );
        },
      ),
    );
    expect(publicResearchError).toBeInstanceOf(AgentPublicResearchPolicyError);
    expect(publicResearchError).toMatchObject({
      code: "AGENT_BUDGET_INVALID",
      message: "maxToolCalls exceeds the Agent ceiling.",
    });

    const personResearchError = capturedError(() =>
      assertAgentBudget({ ...budget, maxDurationMs: 0 }, ({ field }) => {
        throw new AgentPersonResearchPolicyError(
          "AGENT_BUDGET_INVALID",
          `${field} must be positive and no greater than the Agent ceiling.`,
        );
      }),
    );
    expect(personResearchError).toBeInstanceOf(AgentPersonResearchPolicyError);
    expect(personResearchError).toMatchObject({
      code: "AGENT_BUDGET_INVALID",
      message: "maxDurationMs must be positive and no greater than the Agent ceiling.",
    });
  });

  it("accounts conservatively when provider usage is unavailable", () => {
    expect(agentUsage(5_000, 2, null, 1_000)).toEqual({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedUsd: null,
      turns: null,
      toolCalls: 2,
      durationMs: 0,
    });
    expect(
      agentUsage(
        1_000,
        4,
        {
          structuredOutput: {},
          inputTokens: 100,
          outputTokens: 50,
          estimatedUsd: 0.25,
          turns: 2,
          permissionDenials: [],
        },
        3_500,
      ),
    ).toMatchObject({ totalTokens: 150, toolCalls: 4, durationMs: 2_500 });
  });

  it("keeps the terminal reason-code ordering", () => {
    const exceededAll = usage({
      turns: budget.maxTurns + 1,
      toolCalls: budget.maxToolCalls + 1,
      totalTokens: budget.maxTaskTokens + 1,
      estimatedUsd: budget.maxEstimatedUsd + 1,
      durationMs: budget.maxDurationMs + 1,
    });
    expect(exceededBudget(exceededAll, budget)).toBe("MAX_TURNS_EXCEEDED");
    expect(
      exceededBudget({ ...exceededAll, turns: budget.maxTurns }, budget),
    ).toBe("MAX_TOOL_CALLS_EXCEEDED");
    expect(
      exceededBudget(
        { ...exceededAll, turns: budget.maxTurns, toolCalls: budget.maxToolCalls },
        budget,
      ),
    ).toBe("MAX_TASK_TOKENS_EXCEEDED");
    expect(
      exceededBudget(
        {
          ...exceededAll,
          turns: budget.maxTurns,
          toolCalls: budget.maxToolCalls,
          totalTokens: budget.maxTaskTokens,
        },
        budget,
      ),
    ).toBe("MAX_COST_EXCEEDED");
    expect(
      exceededBudget(
        {
          ...exceededAll,
          turns: budget.maxTurns,
          toolCalls: budget.maxToolCalls,
          totalTokens: budget.maxTaskTokens,
          estimatedUsd: budget.maxEstimatedUsd,
        },
        budget,
      ),
    ).toBe("MAX_DURATION_EXCEEDED");
  });

  it("does not exceed a ceiling or an unavailable provider metric", () => {
    expect(
      exceededBudget(
        usage({
          turns: null,
          totalTokens: null,
          estimatedUsd: null,
          toolCalls: budget.maxToolCalls,
          durationMs: budget.maxDurationMs,
        }),
        budget,
      ),
    ).toBeNull();
  });
});
