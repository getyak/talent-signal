/** Server-owned configuration. Never accept these fields from a product request. */
export interface ClaudeHarnessConfiguration {
  model: string;
  baseUrl: string;
  credential: { name: "ANTHROPIC_API_KEY" | "ANTHROPIC_AUTH_TOKEN"; value: string };
  taskBudgetEnabled: boolean;
}

export function claudeHarnessConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): ClaudeHarnessConfiguration {
  const model = environment.TALENT_SIGNAL_AGENT_MODEL?.trim();
  if (!model) throw new Error("CLAUDE_HARNESS_MODEL_REQUIRED");
  let endpoint: URL;
  try { endpoint = new URL(environment.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com"); }
  catch { throw new Error("CLAUDE_HARNESS_ENDPOINT_INVALID"); }
  // These are deployment endpoints, not model-supplied web destinations.
  const endpoints = new Set([
    "https://api.anthropic.com/", "https://api.hao.ai/anthropic",
    "https://litellm.aws.ailoha.net/",
  ]);
  const canonical = endpoint.href.replace(/\/$/u, "");
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      ![...endpoints].some((entry) => entry.replace(/\/$/u, "") === canonical)) {
    throw new Error("CLAUDE_HARNESS_ENDPOINT_NOT_ADMITTED");
  }
  // A different gateway's ambient Anthropic credential must never be sent to Hao.
  const hao = endpoint.hostname === "api.hao.ai";
  const key = (hao ? environment.HAO_ANTHROPIC_API_KEY : environment.ANTHROPIC_API_KEY)?.trim();
  const token = hao ? undefined : environment.ANTHROPIC_AUTH_TOKEN?.trim();
  if ((!key && !token) || (key && token)) throw new Error("CLAUDE_HARNESS_CREDENTIAL_AMBIGUOUS_OR_MISSING");
  const taskBudget = environment.TALENT_SIGNAL_CLAUDE_TASK_BUDGET_ENABLED?.trim();
  if (taskBudget && taskBudget !== "true" && taskBudget !== "false") {
    throw new Error("CLAUDE_HARNESS_TASK_BUDGET_INVALID");
  }
  return Object.freeze({
    model, baseUrl: canonical,
    credential: Object.freeze(key ? { name: "ANTHROPIC_API_KEY" as const, value: key } : { name: "ANTHROPIC_AUTH_TOKEN" as const, value: token! }),
    taskBudgetEnabled: taskBudget ? taskBudget === "true" : endpoint.hostname === "api.anthropic.com",
  });
}

/** Metadata-only diagnostic; credentials must never be serialized. */
export function claudeHarnessConfigurationReceipt(configuration: ClaudeHarnessConfiguration) {
  return { runtime: "claude-agent-sdk", model: configuration.model, endpoint: configuration.baseUrl,
    credentialSource: configuration.baseUrl === "https://api.hao.ai/anthropic" ? "HAO_ANTHROPIC_API_KEY" : configuration.credential.name,
    credentialConfigured: true, automaticFallback: false, taskBudgetEnabled: configuration.taskBudgetEnabled };
}
