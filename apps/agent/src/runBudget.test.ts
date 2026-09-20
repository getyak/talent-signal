import { describe, expect, it } from "vitest";

import { AGENT_BUDGET_CEILING } from "./runtimePolicy.js";
import {
  agentUsage,
  assertAgentBudget,
  exceededBudget,
  type AgentBudgetViolationDetail,
} from "./runBudget.js";
import { AgentConfigurationError, runBoundedAgent } from "./runner.js";
import { AgentPublicResearchPolicyError } from "./publicResearchPolicy.js";
import { runPublicResearchAgent } from "./publicResearchRunner.js";
import { AgentPersonResearchPolicyError } from "./personResearchPolicy.js";
import { runPersonResearchAgent } from "./personResearchRunner.js";
import type {
  AgentBudget,
  AgentPersonResearchRunRequest,
  AgentProviderResult,
  AgentPublicResearchRunRequest,
  AgentRunRequest,
  AgentUsage,
} from "./types.js";

const budget: AgentBudget = { ...AGENT_BUDGET_CEILING };

function providerResult(
  overrides: Partial<AgentProviderResult> = {},
): AgentProviderResult {
  return {
    structuredOutput: {},
    inputTokens: 100,
    outputTokens: 50,
    estimatedUsd: 0.25,
    turns: 2,
    permissionDenials: [],
    ...overrides,
  };
}

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

describe("assertAgentBudget", () => {
  it("accepts a budget at the ceiling", () => {
    const violations: AgentBudgetViolationDetail[] = [];
    assertAgentBudget(budget, (detail) => {
      violations.push(detail);
      return undefined as never;
    });
    expect(violations).toEqual([]);
  });

  it("reports each non-positive field as a positive violation", () => {
    for (const field of Object.keys(budget) as Array<keyof AgentBudget>) {
      const violations: AgentBudgetViolationDetail[] = [];
      expect(() =>
        assertAgentBudget({ ...budget, [field]: 0 }, (detail) => {
          violations.push(detail);
          throw new Error("stop");
        }),
      ).toThrow("stop");
      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatchObject({ field, violation: "positive" });
    }
  });

  it("reports non-finite values as a positive violation", () => {
    const violations: AgentBudgetViolationDetail[] = [];
    expect(() =>
      assertAgentBudget({ ...budget, maxEstimatedUsd: Number.NaN }, (detail) => {
        violations.push(detail);
        throw new Error("stop");
      }),
    ).toThrow("stop");
    expect(violations[0]).toMatchObject({
      field: "maxEstimatedUsd",
      violation: "positive",
    });
  });

  it("reports ceiling violations for values above the shared ceiling", () => {
    const violations: AgentBudgetViolationDetail[] = [];
    expect(() =>
      assertAgentBudget(
        { ...budget, maxTurns: AGENT_BUDGET_CEILING.maxTurns + 1 },
        (detail) => {
          violations.push(detail);
          throw new Error("stop");
        },
      ),
    ).toThrow("stop");
    expect(violations[0]).toMatchObject({
      field: "maxTurns",
      violation: "ceiling",
    });
  });

  it("stops at the first violation in field order", () => {
    const seen: AgentBudgetViolationDetail[] = [];
    expect(() =>
      assertAgentBudget(
        {
          ...budget,
          maxTurns: 0,
          maxToolCalls: AGENT_BUDGET_CEILING.maxToolCalls + 1,
        },
        (detail) => {
          seen.push(detail);
          throw new Error("stop");
        },
      ),
    ).toThrow("stop");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.field).toBe("maxTurns");
  });
});

describe("agentUsage", () => {
  it("sums tokens and measures duration from the run clock", () => {
    expect(agentUsage(1_000, 4, providerResult(), 3_500)).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedUsd: 0.25,
      turns: 2,
      toolCalls: 4,
      durationMs: 2_500,
    });
  });

  it("keeps provider metrics null when no provider result exists", () => {
    expect(agentUsage(1_000, 0, null, 1_000)).toEqual({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedUsd: null,
      turns: null,
      toolCalls: 0,
      durationMs: 0,
    });
  });

  it("never reports a negative duration when the clock moves backwards", () => {
    expect(agentUsage(5_000, 0, null, 1_000).durationMs).toBe(0);
  });
});

describe("runner budget validation through the shared mechanics", () => {
  // Budget validation runs before any provider or journal interaction, so the
  // request body only needs the budget for these contract assertions.
  const bareRequest = { budget: { ...budget } };

  it("keeps the Pursuit Agent error class and exact messages", async () => {
    await expect(
      runBoundedAgent(
        {
          ...bareRequest,
          budget: { ...budget, maxTurns: 0 },
        } as unknown as AgentRunRequest,
      ),
    ).rejects.toThrow(new AgentConfigurationError("maxTurns must be positive."));
    await expect(
      runBoundedAgent(
        {
          ...bareRequest,
          budget: { ...budget, maxTurns: budget.maxTurns + 1 },
        } as unknown as AgentRunRequest,
      ),
    ).rejects.toThrow(
      new AgentConfigurationError("maxTurns exceeds the V1 ceiling."),
    );
  });

  it("keeps the public-research error class and exact messages", async () => {
    await expect(
      runPublicResearchAgent(
        {
          ...bareRequest,
          budget: { ...budget, maxToolCalls: 0 },
        } as unknown as AgentPublicResearchRunRequest,
      ),
    ).rejects.toMatchObject({
      code: "AGENT_BUDGET_INVALID",
      message: "maxToolCalls must be positive.",
    });
    await expect(
      runPublicResearchAgent(
        {
          ...bareRequest,
          budget: { ...budget, maxToolCalls: budget.maxToolCalls + 1 },
        } as unknown as AgentPublicResearchRunRequest,
      ),
    ).rejects.toThrow(
      new AgentPublicResearchPolicyError(
        "AGENT_BUDGET_INVALID",
        "maxToolCalls exceeds the Agent ceiling.",
      ),
    );
  });

  it("keeps the person-research error class and exact message", async () => {
    await expect(
      runPersonResearchAgent(
        {
          ...bareRequest,
          budget: { ...budget, maxDurationMs: 0 },
        } as unknown as AgentPersonResearchRunRequest,
      ),
    ).rejects.toThrow(
      new AgentPersonResearchPolicyError(
        "AGENT_BUDGET_INVALID",
        "maxDurationMs must be positive and no greater than the Agent ceiling.",
      ),
    );
    await expect(
      runPersonResearchAgent(
        {
          ...bareRequest,
          budget: { ...budget, maxEstimatedUsd: budget.maxEstimatedUsd + 1 },
        } as unknown as AgentPersonResearchRunRequest,
      ),
    ).rejects.toThrow(
      new AgentPersonResearchPolicyError(
        "AGENT_BUDGET_INVALID",
        "maxEstimatedUsd must be positive and no greater than the Agent ceiling.",
      ),
    );
  });
});

  it("returns null when usage is within budget", () => {
    expect(exceededBudget(usage(), budget)).toBeNull();
  });

  it("applies the documented reason-code ordering", () => {
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

  it("treats the ceiling itself as within budget", () => {
    expect(
      exceededBudget(
        usage({
          turns: budget.maxTurns,
          toolCalls: budget.maxToolCalls,
          totalTokens: budget.maxTaskTokens,
          estimatedUsd: budget.maxEstimatedUsd,
          durationMs: budget.maxDurationMs,
        }),
        budget,
      ),
    ).toBeNull();
  });

  it("cannot trigger a provider metric reason when that metric is null", () => {
    expect(
      exceededBudget(
        usage({
          turns: null,
          totalTokens: null,
          estimatedUsd: null,
          toolCalls: budget.maxToolCalls + 1,
        }),
        budget,
      ),
    ).toBe("MAX_TOOL_CALLS_EXCEEDED");
    expect(
      exceededBudget(
        usage({ turns: null, totalTokens: null, estimatedUsd: null }),
        budget,
      ),
    ).toBeNull();
  });
});
