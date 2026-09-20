import { AGENT_BUDGET_CEILING } from "./runtimePolicy.js";
import type { AgentBudget, AgentProviderResult, AgentUsage } from "./types.js";

/**
 * The single internal implementation of budget validation mechanics, usage
 * accounting, and post-run budget-exceeded evaluation shared by the governed
 * Agent runners. The runners keep their own public error classes and exact
 * messages; this module only supplies the mechanics.
 */

export type AgentBudgetField = keyof AgentBudget;

/** `positive` when the value is not finite or not greater than zero. */
export type AgentBudgetViolation = "positive" | "ceiling";

export interface AgentBudgetViolationDetail {
  field: AgentBudgetField;
  value: number;
  violation: AgentBudgetViolation;
}

/**
 * Validates every budget field against the shared positivity rule and the V1
 * ceiling, reporting the first violation in declaration order to `onViolation`.
 * The callback lets each runner raise its own governed error class and exact
 * message without duplicating the traversal or threshold arithmetic.
 */
export function assertAgentBudget(
  budget: AgentBudget,
  onViolation: (detail: AgentBudgetViolationDetail) => never,
): void {
  for (const [name, value] of Object.entries(budget) as Array<
    [AgentBudgetField, number]
  >) {
    if (!Number.isFinite(value) || value <= 0) {
      onViolation({ field: name, value, violation: "positive" });
    }
    if (value > AGENT_BUDGET_CEILING[name]) {
      onViolation({ field: name, value, violation: "ceiling" });
    }
  }
}

/**
 * Builds the terminal usage receipt from the run clock, the observed tool-call
 * count, and the optional provider result. Token totals stay null unless the
 * provider reported both sides, matching the conservative accounting rule.
 */
export function agentUsage(
  startedAtMs: number,
  toolCalls: number,
  provider: AgentProviderResult | null,
  nowMs: number,
): AgentUsage {
  const inputTokens = provider?.inputTokens ?? null;
  const outputTokens = provider?.outputTokens ?? null;
  return {
    inputTokens,
    outputTokens,
    totalTokens:
      inputTokens === null || outputTokens === null
        ? null
        : inputTokens + outputTokens,
    estimatedUsd: provider?.estimatedUsd ?? null,
    turns: provider?.turns ?? null,
    toolCalls,
    durationMs: Math.max(0, nowMs - startedAtMs),
  };
}

/**
 * Evaluates a completed usage receipt against the pinned budget. The ordering
 * is part of the contract: the first exceeded dimension wins, and a null
 * provider metric can never trigger its corresponding reason code.
 */
export function exceededBudget(
  value: AgentUsage,
  budget: AgentBudget,
): string | null {
  if (value.turns !== null && value.turns > budget.maxTurns) {
    return "MAX_TURNS_EXCEEDED";
  }
  if (value.toolCalls > budget.maxToolCalls) {
    return "MAX_TOOL_CALLS_EXCEEDED";
  }
  if (value.totalTokens !== null && value.totalTokens > budget.maxTaskTokens) {
    return "MAX_TASK_TOKENS_EXCEEDED";
  }
  if (
    value.estimatedUsd !== null &&
    value.estimatedUsd > budget.maxEstimatedUsd
  ) {
    return "MAX_COST_EXCEEDED";
  }
  if (value.durationMs > budget.maxDurationMs) {
    return "MAX_DURATION_EXCEEDED";
  }
  return null;
}
