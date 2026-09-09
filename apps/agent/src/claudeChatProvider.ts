import { z } from "zod";
import { responsePreferenceTool } from "./responsePreference.js";
import { calendarDraftCapability } from "./calendarDraft.js";
import { ClaudeHarnessFailure, ClaudeHarnessInterruption, runClaudeHarness, type ClaudeHarnessResult, type HarnessTool } from "./claudeHarness.js";
import { claudeHarnessConfiguration, type ClaudeHarnessConfiguration } from "./claudeHarnessConfiguration.js";
import { boundedConversationHistory, type RemoteChatAnswerProviding, type RemoteChatAnswerRequest, type RemoteChatAnswerResult } from "./chatAnswerProvider.js";
import { AGENT_TOOL_CATALOG } from "./toolCatalog.js";
import { AGENT_BUDGET_CEILING as DEFAULT_AGENT_BUDGET } from "./runtimePolicy.js";
import { JSON_OUTPUT_PROTOCOL as CONVERSATION_JSON_PROTOCOL } from "./prompts/assistant-conversation.js";
import { JSON_OUTPUT_PROTOCOL as RELATIONSHIP_JSON_PROTOCOL } from "./prompts/assistant-relationship.js";
import { applyChatPreset } from "./relationshipTaskConfiguration.js";
import type { AgentRunConfigurationEvidence, ChatPromptPreset } from "./chatAnswerProvider.js";
import { createHash } from "node:crypto";
import { resolveProductPrompt } from "./promptRegistry.js";
import type { AgentProvider, AgentProviderRequest, AgentProviderResult, AgentToolResult } from "./types.js";

export const CLAUDE_NATURAL_OUTPUT_GUIDANCE = "For this SDK execution, respond with natural prose, not a JSON object or a code fence. Structured data is supplied only through product tools. Never claim a contact, memory or calendar write without a successful tool receipt. Use only tools supplied in this Run. If contact_workspace is supplied and the user asks about a named contact, first search that name from the current message; a name is sufficient for a read-only lookup, even though it is not sufficient to create a contact. Read a uniquely grounded match so the product can continue in its relationship scope. A successful read completes this routing step: briefly acknowledge the found contact and stop; the product obtains relationship evidence in the scoped continuation. Do not infer missing records from the directory header or keep searching for an unavailable Memory tool. Ask for another identity clue only after the lookup is empty or ambiguous. Missing relationship Memory in an unscoped conversation is not a reason to skip this directory lookup or claim no contact access. If read_relationship_memory is supplied, it retrieves the current governed product snapshot independently of past Session dialogue. Preserve each block's status and source provenance. Cite relationship evidence through cite_evidence before answering factual relationship questions. Complete the source reads and citation selection before composing the final answer; essential conclusions must appear in that final answer, not only in tool prefaces. When asked to recall an existing fact, state it with its source status and stop; do not turn recall into unsolicited planning or offer unavailable write capabilities. For recollection, lead with what the record says, explicitly attributed to that record rather than asserted as a confirmed event. An unconfirmed source report can still answer what was recorded: do not lead with the absence of confirmed facts, repeat that caveat, expose internal status labels such as proposed, or suggest verifying the record unless a material ambiguity prevents answering. Source IDs do not belong in the prose.";

export function configuredClaudeChatPrompt(text: string, preset: ChatPromptPreset = "baseline") {
  // Remove only the formal legacy transport clause; preserve all task/source policy.
  const natural = text.replace(CONVERSATION_JSON_PROTOCOL, "").replace(RELATIONSHIP_JSON_PROTOCOL, "");
  return applyChatPreset(`${natural}\n\n${CLAUDE_NATURAL_OUTPUT_GUIDANCE}`, preset);
}

/** Adapts natural SDK output to the existing cross-client product response. */
export class ClaudeChatProvider implements RemoteChatAnswerProviding, AgentProvider {
  readonly providerId = "claude-agent-sdk" as const;
  readonly id = "claude-agent-sdk";
  readonly sdkVersion = "0.3.260";
  readonly supportsPromptPresets = true;
  readonly effectivePrompt = configuredClaudeChatPrompt;
  matchesReportedModel(reported: string | null): boolean {
    return reported === this.model || (this.configuration.baseUrl === "https://api.hao.ai/anthropic"
      && this.model.startsWith("anthropic/") && reported === this.model.slice("anthropic/".length));
  }
  readonly supportsImageInput: boolean;
  readonly inputCapabilities;
  readonly model: string;
  get imageModel() { return this.supportsImageInput ? this.model : null; }
  constructor(private readonly configuration: ClaudeHarnessConfiguration,
    private readonly execute: typeof runClaudeHarness = runClaudeHarness,
    imageInputEnabled = false,
  ) {
    this.model = configuration.model;
    this.supportsImageInput = imageInputEnabled;
    this.inputCapabilities = { text: true, image: imageInputEnabled, imageUnderstanding: imageInputEnabled };
  }

  async answer(request: RemoteChatAnswerRequest): Promise<RemoteChatAnswerResult> {
    if (!request.objective.trim()) throw new Error("CLAUDE_CHAT_OBJECTIVE_REQUIRED");
    if (request.reference_time !== undefined && !Number.isFinite(Date.parse(request.reference_time))) throw new Error("CLAUDE_CHAT_REFERENCE_TIME_INVALID");
    if (request.mode === "unscoped_conversation" && (request.context_blocks.length || request.allowed_citation_ids.length || request.images?.length)) {
      throw new Error("CLAUDE_CHAT_UNSCOPED_CONTEXT_DENIED");
    }
    if (request.images?.length && !this.supportsImageInput) throw new Error("CLAUDE_CHAT_IMAGE_NOT_ADMITTED");
    const snapshot = request.prompt_snapshot ?? await resolveProductPrompt(request.mode === "unscoped_conversation" ? "assistant/conversation" : "assistant/relationship");
    const prompt = configuredClaudeChatPrompt(snapshot.text, request.prompt_preset);
    const allowed = new Set(request.allowed_citation_ids);
    let citations: string[] = [];
    const tools: HarnessTool[] = allowed.size ? [{
      name: "cite_evidence", description: "Select exact allowed source IDs supporting the answer. Does not modify records.",
      schema: z.strictObject({ source_ids: z.array(z.string()).min(1).max(20) }), readOnly: true, alwaysLoad: true,
      execute: async (input) => {
        const ids = input.source_ids as string[];
        if (ids.some((id) => !allowed.has(id))) return { content: [{ type: "text", text: "CITATION_OUTSIDE_CURRENT_SCOPE: use only the supplied allowed source IDs." }], isError: true };
        citations = [...new Set(ids)];
        return { content: [{ type: "text", text: JSON.stringify({ cited_source_ids: citations }) }] };
      },
    }] : [];
    if (request.mode !== "unscoped_conversation" && request.context_blocks.length) tools.push({
      name: "read_relationship_memory",
      description: "Read the current authorized relationship Memory from the product database snapshot. Filter by block type, or omit the filter to read all available blocks. Returns source IDs and confirmed/unconfirmed status; does not write or use earlier Session transcripts. For simple recollection, answer what the record says and stop. Preserve imprecise dates and unspecified details as recorded; resolving them or contacting the person is needed only if the user asks to schedule or act, not merely to remember. Attribution to the record is enough to distinguish an unconfirmed report without an unsolicited verification task.",
      schema: z.strictObject({ block_types: z.array(z.string().min(1).max(80)).max(20).optional() }),
      readOnly: true, alwaysLoad: true,
      execute: async input => {
        const types = input.block_types as string[] | undefined;
        const blocks = request.context_blocks.filter(block => !types?.length || types.includes(block.type));
        return { content: [{ type: "text", text: JSON.stringify({ authority: "governed_relationship_snapshot_not_execution_permission",
          blocks, available_block_types: [...new Set(request.context_blocks.map(block => block.type))] }) }] };
      },
    });
    tools.push(...responsePreferenceTool(request.responsePreference));
    const calendar = calendarDraftCapability(request.calendarContext, request.objective);
    tools.push(...calendar.tools);
    const images = (request.images ?? []).map((image, index) => ({ kind: "image" as const,
      artifactID: `image-${index}`, mimeType: image.media_type, byteSize: image.data.byteLength,
      contentHash: createHash("sha256").update(image.data).digest("hex"), dataBase64: Buffer.from(image.data).toString("base64") }));
    const result = await this.execute(this.configuration, {
      ...(request.observation ? { observation: request.observation } : {}),
      ...(request.continuation ? { continuation: request.continuation } : {}),
      objective: request.objective, systemPrompt: prompt.text, tools, images,
      context: JSON.stringify({ reference_time: request.reference_time, conversation: boundedConversationHistory(request.conversation_history),
        memory_inventory: request.context_blocks.map(block => ({ type: block.type, status: block.status })),
        allowed_citation_ids: request.allowed_citation_ids, response_preference_available: Boolean(request.responsePreference) }),
      effort: "medium", budget: { ...DEFAULT_AGENT_BUDGET, maxDurationMs: 60_000 }, assertCurrent: request.assertCurrent ?? (async () => {}),
    }, new AbortController().signal);
    const body = result.text.trim();
    if (!body || body.length > 16_000) throw new Error("CLAUDE_CHAT_ANSWER_INVALID");
    // No citation receipt means the host cannot label prose as a grounded answer.
    const kind = request.mode !== "unscoped_conversation" && allowed.size > 0 && !citations.length ? "clarification" : "answer";
    return { kind, title: /\p{Script=Han}/u.test(request.objective) ? "回复" : "Reply", body,
      ...(calendar.draft() ? { calendarDraft: calendar.draft()! } : {}),
      citation_ids: citations, provider_id: this.providerId, model: this.model, provider_request_id: result.sessionID,
      input_tokens: result.inputTokens, output_tokens: result.outputTokens, usage_reported: true,
      reported_model: result.reportedModels.length === 1 ? result.reportedModels[0]! : null, remote_requests_started: null,
      prompt_revision: prompt.revision, prompt_snapshot: snapshot };
  }

  async run(request: AgentProviderRequest, invokeTool: (name: string, input: unknown, executionSignal?: AbortSignal) => Promise<AgentToolResult>, signal: AbortSignal): Promise<AgentProviderResult> {
    return this.runInternal(request, invokeTool, signal, "baseline");
  }

  async runWithPromptPreset(request: AgentProviderRequest, invokeTool: Parameters<AgentProvider["run"]>[1],
    signal: AbortSignal, preset: ChatPromptPreset, observed: (evidence: AgentRunConfigurationEvidence) => void): Promise<AgentProviderResult> {
    const prompt = configuredClaudeChatPrompt(request.systemPrompt, preset);
    let receipt: Omit<ClaudeHarnessResult, "text" | "structuredOutput"> | ClaudeHarnessInterruption["receipt"] | undefined;
    try {
      return await this.runInternal(request, invokeTool, signal, preset, value => { receipt = value; });
    } catch (error) {
      if (error instanceof ClaudeHarnessFailure || error instanceof ClaudeHarnessInterruption) receipt = error.receipt;
      throw error;
    } finally {
      observed({ actual_model: receipt?.reportedModels.length === 1 ? receipt.reportedModels[0]! : null,
        prompt_revision: prompt.revision, actual_prompt_revision: receipt ? prompt.revision : null,
        requests_started: null, responses_received: receipt?.modelResponses ?? 0,
        input_tokens: receipt && !("usageComplete" in receipt && receipt.usageComplete === false) ? receipt.inputTokens : null,
        output_tokens: receipt && !("usageComplete" in receipt && receipt.usageComplete === false) ? receipt.outputTokens : null,
        provider_request_id: receipt?.sessionID ?? null });
    }
  }

  private async runInternal(request: AgentProviderRequest, invokeTool: Parameters<AgentProvider["run"]>[1], signal: AbortSignal,
    preset: ChatPromptPreset, observed?: (receipt: ClaudeHarnessResult) => void): Promise<AgentProviderResult> {
    if (request.scopeSummary.kind !== "workspace_conversation") throw new Error("CLAUDE_CHAT_SCOPE_UNSUPPORTED");
    let receipt: Record<string, unknown> | null = null;
    const calendar = calendarDraftCapability(request.calendarContext, request.objective);
    let searched = false;
    const tools: HarnessTool[] = request.toolManifest.map((name) => {
      const definition = AGENT_TOOL_CATALOG[name];
      return { name, description: definition.description, schema: definition.schema, readOnly: definition.readOnly, alwaysLoad: true,
        execute: async (input, executionSignal) => {
          executionSignal.throwIfAborted();
          const result = await invokeTool(name, input, executionSignal);
          if (result.ok) {
            const data = result.data as Record<string, any> | undefined;
            if (data?.operation === "search") searched = true;
            if (data?.operation === "read" && data.person?.id && data.relationship_context?.id) receipt = {
              outcome: "use_contact", person_id: data.person.id, relationship_context_id: data.relationship_context.id,
            };
            if (result.candidateFingerprint) receipt = { outcome: "contact_change_proposal", candidate_fingerprint: result.candidateFingerprint };
          }
          return { content: [{ type: "text", text: JSON.stringify(result) }], isError: !result.ok };
        } };
    });
    tools.push(...responsePreferenceTool(request.responsePreference), ...calendar.tools);
    const supplied = request.observation;
    const trusted = supplied?.run_id === request.runID && supplied.workspace_id === request.scopeSummary.workspaceID
      && supplied.authorization_scope === "workspace_conversation" ? supplied : undefined;
    const outcome = await this.execute(this.configuration, { ...(request.continuation ? { continuation: request.continuation } : {}), ...(trusted ? { observation: trusted } : {}), objective: request.objective,
      systemPrompt: configuredClaudeChatPrompt(request.systemPrompt, preset).text, tools,
      context: JSON.stringify({ scope: request.scopeSummary, conversation: boundedConversationHistory(request.conversationHistory),
        response_preference_available: Boolean(request.responsePreference) }),
      effort: "medium", budget: request.budget, assertCurrent: async () => { signal.throwIfAborted(); await request.assertCurrent?.(); },
    }, signal);
    observed?.(outcome);
    if (!receipt && !outcome.text.trim()) throw new Error("CLAUDE_CHAT_ANSWER_INVALID");
    return { ...(calendar.draft() ? { calendarDraft: calendar.draft()! } : {}), structuredOutput: receipt ?? { outcome: searched ? "clarification" : "reply",
      title: /\p{Script=Han}/u.test(request.objective) ? "回复" : "Reply", body: outcome.text.trim() },
      inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens, estimatedUsd: outcome.estimatedUsd,
      turns: outcome.turns, permissionDenials: outcome.permissionDenials, sessionID: outcome.sessionID, terminalReason: outcome.terminalReason };
  }
}

export function configuredClaudeChatProvider(environment: NodeJS.ProcessEnv) {
  return new ClaudeChatProvider(claudeHarnessConfiguration(environment), runClaudeHarness,
    environment.TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING === "true");
}
