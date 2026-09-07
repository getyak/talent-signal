import { bundledPrompt, promptRevision, type PromptSnapshot, type RuntimeObserver, type RuntimeObservationContext, relationshipTaskConfiguration as optimizationConfiguration,
  optimizationPrompt, validateOptimizationCandidate, PRODUCT_TASK_POLICY, type OptimizationCandidate, type OptimizationDevExample } from "@talent-signal/agent";
export { relationshipTaskConfiguration as optimizationConfiguration, optimizationPrompt, validateOptimizationCandidate,
  PRODUCT_TASK_POLICY, BASELINE_OPTIMIZATION_CANDIDATE, type OptimizationCandidate, type OptimizationDevExample } from "@talent-signal/agent";
import { configuredChatRequestPrompt, ZhipuChatAnswerProvider,
  type RemoteChatAnswerRequest } from "@talent-signal/agent/chat-answer-provider";
import { digestCanonicalJson, type JsonValue, type PhaseOneConfiguration, type PhaseOneProductExecutor,
  type PhaseOneProductRequest, type PhaseOneProductReceipt } from "@talent-signal/evaluation";
import type { FileOptimizationBudgetLedger, OptimizationBudgetRunInput } from "./budget.js";

export const OPTIMIZER_VERSION = "bounded-coordinate-search.v1";
function exact(value: unknown, keys: readonly string[], optional: readonly string[], code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key) && !optional.includes(key))
    || keys.some(key => !Object.hasOwn(value, key))) throw new Error(code);
  return value as Record<string, unknown>;
}
function boundedString(value: unknown, maximum: number, code: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(code);
  return value;
}
export interface OptimizationRelationshipInput {
  schemaVersion: "optimization-relationship-input.v1";
  dataClass: "synthetic" | "private_business";
  objective: string;
  context_blocks: RemoteChatAnswerRequest["context_blocks"];
  allowed_citation_ids: string[];
  conversation_history?: RemoteChatAnswerRequest["conversation_history"];
  permits_unconfirmed_session_context_answer?: boolean;
}
export function validateOptimizationRelationshipInput(value: unknown): OptimizationRelationshipInput {
  const input = exact(value, ["schemaVersion", "dataClass", "objective", "context_blocks", "allowed_citation_ids"],
    ["conversation_history", "permits_unconfirmed_session_context_answer"], "OPTIMIZER_TASK_INPUT_INVALID");
  if (input.schemaVersion !== "optimization-relationship-input.v1" || !["synthetic", "private_business"].includes(input.dataClass as string)
    || !Array.isArray(input.context_blocks) || !Array.isArray(input.allowed_citation_ids)
    || input.context_blocks.length > 100 || input.allowed_citation_ids.length > 500) throw new Error("OPTIMIZER_TASK_INPUT_INVALID");
  boundedString(input.objective, 8000, "OPTIMIZER_TASK_INPUT_INVALID");
  const cited = new Set<string>();
  for (const raw of input.context_blocks) {
    const block = exact(raw, ["block_id", "block_key", "type", "status", "headline", "summary", "items", "evidence_fragment_ids"], [], "OPTIMIZER_TASK_INPUT_INVALID");
    for (const key of ["block_id", "block_key", "type", "status"]) boundedString(block[key], 300, "OPTIMIZER_TASK_INPUT_INVALID");
    for (const key of ["headline", "summary"]) if (typeof block[key] !== "string" || (block[key] as string).length > 8000) throw new Error("OPTIMIZER_TASK_INPUT_INVALID");
    for (const key of ["items", "evidence_fragment_ids"]) if (!Array.isArray(block[key]) || (block[key] as unknown[]).some(item => typeof item !== "string")) throw new Error("OPTIMIZER_TASK_INPUT_INVALID");
    for (const id of block.evidence_fragment_ids as string[]) cited.add(id);
  }
  if (input.allowed_citation_ids.some(id => typeof id !== "string" || !cited.has(id))
    || new Set(input.allowed_citation_ids).size !== input.allowed_citation_ids.length) throw new Error("OPTIMIZER_CITATION_SCOPE_INVALID");
  if (input.conversation_history !== undefined) {
    if (!Array.isArray(input.conversation_history) || input.conversation_history.length > 12) throw new Error("OPTIMIZER_TASK_INPUT_INVALID");
    for (const raw of input.conversation_history) {
      const message = exact(raw, ["message_id", "role", "text"], [], "OPTIMIZER_TASK_INPUT_INVALID");
      boundedString(message.message_id, 300, "OPTIMIZER_TASK_INPUT_INVALID");
      boundedString(message.text, 2000, "OPTIMIZER_TASK_INPUT_INVALID");
      if (!["user", "assistant"].includes(message.role as string)) throw new Error("OPTIMIZER_TASK_INPUT_INVALID");
    }
  }
  if (input.permits_unconfirmed_session_context_answer !== undefined && typeof input.permits_unconfirmed_session_context_answer !== "boolean") throw new Error("OPTIMIZER_TASK_INPUT_INVALID");
  if (JSON.stringify(input).length > 48000) throw new Error("OPTIMIZER_TASK_INPUT_TOO_LARGE");
  return structuredClone(input) as unknown as OptimizationRelationshipInput;
}
export interface ProductTaskRecording {
  schemaVersion: "optimization-product-recording.v1";
  requestDigest: `sha256:${string}`;
  actualPromptDigest: `sha256:${string}`;
  receipt: PhaseOneProductReceipt;
  recordingDigest: `sha256:${string}`;
}
export function replayOptimizationProductTask(recording: ProductTaskRecording, request: PhaseOneProductRequest): PhaseOneProductReceipt {
  const { recordingDigest, ...payload } = recording;
  if (recording.schemaVersion !== "optimization-product-recording.v1" || digestCanonicalJson(payload) !== recordingDigest
    || digestCanonicalJson(request) !== recording.requestDigest) throw new Error("OPTIMIZER_RECORDING_MISMATCH");
  return structuredClone(recording.receipt);
}
interface PaidAdapterOptions {
  providerKind: "real_model";
  apiKey: string;
  budget: { ledger: FileOptimizationBudgetLedger; run: OptimizationBudgetRunInput; phase: "search" | "final_validation";
    pricing: { currency: string; inputMicrosPerMillionTokens: number; outputMicrosPerMillionTokens: number } };
}
interface FakeAdapterOptions {
  providerKind: "deterministic_fake";
  /** An injected offline transport still exercises the exact production serializer and parser. */
  fetcher: typeof fetch;
}
export function createOptimizationProductTaskAdapter(options: (PaidAdapterOptions | FakeAdapterOptions) & {
  model: string; examples?: readonly OptimizationDevExample[]; signal?: AbortSignal;
  observer?: RuntimeObserver | null;
  observation?: RuntimeObservationContext;
  beforeDispatch?: () => Promise<void>;
  onRecording?: (recording: ProductTaskRecording) => void | Promise<void>;
}): PhaseOneProductExecutor {
  const examples = structuredClone(options.examples ?? []);
  return { executorId: PRODUCT_TASK_POLICY.adapterId, async execute(rawRequest) {
    const request = structuredClone(rawRequest);
    if (options.signal?.aborted) throw new Error("OPTIMIZER_CANCELLED");
    const input = validateOptimizationRelationshipInput(request.modelInput);
    const candidate = validateOptimizationCandidate(request.configuration.parameters, examples);
    const expected = optimizationConfiguration(options.model, candidate, examples);
    if (digestCanonicalJson(request.configuration) !== request.configurationDigest || digestCanonicalJson(expected) !== request.configurationDigest
      || !Number.isFinite(Date.parse(request.referenceTime))) throw new Error("OPTIMIZER_CONFIGURATION_MISMATCH");
    const snapshot: PromptSnapshot = { ...bundledPrompt("assistant/relationship"), text: optimizationPrompt(candidate, examples),
      revision: promptRevision(optimizationPrompt(candidate, examples)) };
    const { schemaVersion: _schema, dataClass: _data, conversation_history, ...frozenInput } = input;
    const answerRequest: RemoteChatAnswerRequest = { ...frozenInput, mode: "relationship", prompt_snapshot: snapshot,
      reference_time: request.referenceTime,
      ...(options.observation ? { observation: options.observation } : {}),
      ...(conversation_history === undefined ? {} : { conversation_history }) };
    const loaded = configuredChatRequestPrompt(answerRequest, snapshot);
    let costUsd: number | null = options.providerKind === "deterministic_fake" ? 0 : null;
    let requestCount = 0;
    let dispatchStarted = false;
    const fetcher: typeof fetch = async (url, init) => {
      if (options.signal?.aborted) throw new Error("OPTIMIZER_CANCELLED");
      await options.beforeDispatch?.();
      const payload = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ content: string }>; max_tokens: number; temperature: number; tools?: unknown };
      if (++requestCount !== 1 || payload.model !== options.model || payload.messages[0]?.content !== loaded.text
        || payload.max_tokens !== 1600 || payload.temperature !== 0 || payload.tools !== undefined) throw new Error("OPTIMIZER_LOADED_CONFIGURATION_MISMATCH");
      if (options.providerKind === "deterministic_fake") {
        dispatchStarted = true;
        return options.fetcher(url, { ...init, signal: AbortSignal.any([...(options.signal ? [options.signal] : []), ...(init?.signal ? [init.signal] : [])]) });
      }
      const { ledger, run, phase, pricing } = options.budget;
      if (!run.permit || run.permit.currency !== pricing.currency || ![pricing.inputMicrosPerMillionTokens, pricing.outputMicrosPerMillionTokens]
        .every(rate => Number.isSafeInteger(rate) && rate > 0)) throw new Error("OPTIMIZER_PRICING_NOT_ADMITTED");
      const inputBound = Buffer.byteLength(String(init?.body), "utf8");
      const maximumCost = Math.ceil((inputBound * pricing.inputMicrosPerMillionTokens + 1600 * pricing.outputMicrosPerMillionTokens) / 1_000_000);
      const execution = await ledger.executePaid({ ...run, operationId: `subject:${request.idempotencyKey}`, kind: phase === "final_validation" ? "final_validation" : "subject", phase,
        upperBound: { calls: 1, tokens: inputBound + 1600, elapsedMs: PRODUCT_TASK_POLICY.maxDurationMs, candidateCount: 0, amountMicros: maximumCost },
        invoke: async signal => {
          const start = Date.now();
          dispatchStarted = true;
          const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.any([signal, ...(options.signal ? [options.signal] : []), ...(init?.signal ? [init.signal] : [])]) });
          const reader = response.body?.getReader();
          if (!reader) throw new Error("OPTIMIZER_PROVIDER_EMPTY_RESPONSE");
          const chunks: Uint8Array[] = []; let bytes = 0;
          try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength;
            if (bytes > 1_000_000) throw new Error("OPTIMIZER_PROVIDER_RESPONSE_TOO_LARGE"); chunks.push(part.value); }
          } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
          const body = Buffer.concat(chunks).toString("utf8");
          // Unknown/missing provider usage retains the full reservation, never zero spend.
          const usage = (() => { try { return (JSON.parse(body) as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage; } catch { return undefined; } })();
          const known = Number.isSafeInteger(usage?.prompt_tokens) && usage!.prompt_tokens! >= 0 && Number.isSafeInteger(usage?.completion_tokens) && usage!.completion_tokens! >= 0;
          const amountMicros = known ? Math.ceil((usage!.prompt_tokens! * pricing.inputMicrosPerMillionTokens + usage!.completion_tokens! * pricing.outputMicrosPerMillionTokens) / 1_000_000) : maximumCost;
          if (known && pricing.currency === "USD") costUsd = amountMicros / 1_000_000;
          return { value: new Response(body, { status: response.status, headers: response.headers }), ...(known ? { actual: { calls: 1,
            tokens: usage!.prompt_tokens! + usage!.completion_tokens!, elapsedMs: Date.now() - start, candidateCount: 0, amountMicros } } : {}) };
        } });
      return execution.value;
    };
    const start = performance.now();
    let receipt: PhaseOneProductReceipt;
    try {
      const provider = new ZhipuChatAnswerProvider({ apiKey: options.providerKind === "real_model" ? options.apiKey : "deterministic-fixture-no-network",
        ...(options.observer ? { observer: options.observer } : {}),
        model: options.model, fetcher, timeoutMs: PRODUCT_TASK_POLICY.maxDurationMs });
      const result = await provider.answer(answerRequest);
      if (result.model !== options.model || result.prompt_revision !== loaded.revision || requestCount !== 1) throw new Error("OPTIMIZER_ACTUAL_CONFIGURATION_MISMATCH");
      receipt = { status: "completed", output: result as unknown as JsonValue, loadedConfigurationDigest: request.configurationDigest,
        adapterId: PRODUCT_TASK_POLICY.adapterId, receiptId: `product-${digestCanonicalJson({ request, result }).slice(7, 39)}`,
        providerKind: options.providerKind, inputTokens: result.usage_reported ? result.input_tokens : null,
        outputTokens: result.usage_reported ? result.output_tokens : null, costUsd,
        durationMs: options.providerKind === "deterministic_fake" ? 0 : Math.round(performance.now() - start) };
    } catch (error) {
      // Admission failures did not execute the product. They cannot overwrite
      // an already issued operation's durable receipt as a fake failed attempt.
      if (!dispatchStarted) throw error;
      receipt = { status: "failed", output: null, loadedConfigurationDigest: request.configurationDigest,
        adapterId: PRODUCT_TASK_POLICY.adapterId, receiptId: `product-failed-${digestCanonicalJson(request).slice(7, 39)}`,
        providerKind: options.providerKind, inputTokens: null, outputTokens: null, costUsd: null,
        durationMs: options.providerKind === "deterministic_fake" ? 0 : Math.round(performance.now() - start) };
    }
    const payload = { schemaVersion: "optimization-product-recording.v1" as const, requestDigest: digestCanonicalJson(request),
      actualPromptDigest: `sha256:${promptRevision(loaded.text)}` as const, receipt };
    await options.onRecording?.({ ...payload, recordingDigest: digestCanonicalJson(payload) });
    return receipt;
  } };
}
