import type { AgentBudget } from "./types.js";

export const AGENT_BUDGET_CEILING: Readonly<AgentBudget> = Object.freeze({
  maxTurns: 6,
  maxToolCalls: 12,
  maxDurationMs: 60_000,
  maxTaskTokens: 32_000,
  maxEstimatedUsd: 1,
});

export class AgentCapabilityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentCapabilityError";
  }
}
