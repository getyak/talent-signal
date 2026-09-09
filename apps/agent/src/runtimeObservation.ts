import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

const Identifier = z.string().min(1).max(200);
const NullableCount = z.number().int().nonnegative().nullable();
export const RuntimeObservationSourceRefsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("synthetic") }).strict(),
  z.object({ kind: z.literal("product"), capture_ids: z.array(z.string().uuid()).max(500),
    fragment_ids: z.array(z.string().uuid()).max(500), media_ids: z.array(z.string().uuid()).max(100),
    person_ids: z.array(z.string().uuid()).max(500), relationship_context_ids: z.array(z.string().uuid()).max(500),
    expires_at: z.string().datetime(),
  }).strict(),
]);
export type RuntimeObservationSourceRefs = z.infer<typeof RuntimeObservationSourceRefsSchema>;
export const RuntimeObservationPolicySchema = z.object({
  version: z.literal("private_full_content.v1"),
  mode: z.literal("private_full_content"),
  endpoint: z.string().url(),
  workspace: Identifier,
  project: Identifier,
  source_workspace_ids: z.array(Identifier).min(1),
  authorization_scopes: z.array(Identifier).min(1),
  retention_days: z.number().int().min(1).max(90),
  max_content_bytes: z.number().int().min(1024).max(30_000_000),
}).strict().superRefine((policy, context) => {
  const url = new URL(policy.endpoint);
  // Admit private literals plus Docker Desktop's fixed host gateway. Arbitrary
  // DNS names and any fallback to Opik Cloud remain outside this policy.
  const host = url.hostname;
  const parts = host.split(".").map(Number);
  const privateIPv4 = parts.length === 4 && parts.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
    && (parts[0] === 127 || parts[0] === 10 || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31));
  if (!((host === "localhost" || host === "[::1]" || host === "host.docker.internal" || privateIPv4)
    && ["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.search || url.hash
    || url.pathname.replace(/\/$/u, "") !== "/api") {
    context.addIssue({ code: "custom", message: "RUNTIME_OBSERVATION_PRIVATE_ENDPOINT_REQUIRED" });
  }
});
export type RuntimeObservationPolicy = z.infer<typeof RuntimeObservationPolicySchema>;
export const RuntimeObservationContentSchema = z.object({
  status: z.enum(["complete", "truncated", "unavailable", "redacted"]),
  original_bytes: z.number().int().nonnegative(),
  retained_bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  value: z.unknown().optional(),
}).strict().superRefine((content, context) => {
  if (["complete", "redacted"].includes(content.status) && (content.value === undefined || content.sha256 === null)) {
    context.addIssue({ code: "custom", message: "Retained content requires a body and digest." });
  }
  if (["truncated", "unavailable"].includes(content.status) && (content.value !== undefined || content.retained_bytes !== 0)) {
    context.addIssue({ code: "custom", message: "Unavailable or omitted content cannot claim retained bytes." });
  }
});
export const RuntimeObservationSpanSchema = z.object({
  id: z.string().uuid(), parent_span_id: z.string().uuid().nullable(),
  name: Identifier, kind: z.enum(["general", "llm", "tool"]),
  operation_id: Identifier, attempt: z.number().int().min(1), retry_of: z.string().uuid().nullable(),
  started_at: z.string().datetime(), ended_at: z.string().datetime(),
  status: z.enum(["ok", "error"]), error_code: Identifier.nullable(),
  model: Identifier.nullable(), provider: Identifier.nullable(), prompt_revision: Identifier.nullable(),
  input: RuntimeObservationContentSchema, output: RuntimeObservationContentSchema,
  usage: z.object({ input_tokens: NullableCount, output_tokens: NullableCount,
    source: z.enum(["provider", "unavailable"]), cost_usd: z.number().nonnegative().nullable(),
    cost_source: z.enum(["provider", "configured_price", "unavailable"]),
    accounting: z.enum(["leaf", "none"]),
  }).strict(),
}).strict().superRefine((span, context) => {
  if (Date.parse(span.ended_at) < Date.parse(span.started_at)) context.addIssue({ code: "custom", message: "Span timing is invalid." });
  if (span.kind !== "llm" && span.usage.accounting !== "none") context.addIssue({ code: "custom", message: "Only model leaf spans own usage." });
  if ((span.usage.source === "unavailable" && (span.usage.input_tokens !== null || span.usage.output_tokens !== null))
    || (span.usage.source === "provider" && (span.usage.input_tokens === null || span.usage.output_tokens === null))) {
    context.addIssue({ code: "custom", message: "Usage source must agree with reported values." });
  }
  if ((span.usage.cost_source === "unavailable") !== (span.usage.cost_usd === null)) context.addIssue({ code: "custom", message: "Unknown cost is null." });
});
export const RuntimeObservationSchema = z.object({
  schema_version: z.literal("runtime-observation.v1"),
  id: z.string().uuid(), run_id: Identifier, attempt_id: z.string().uuid(),
  source_workspace_id: Identifier, authorization_scope: Identifier,
  source_session_id: Identifier.nullable().default(null),
  source_lab_job_id: z.string().uuid().nullable().default(null),
  source_regression_id: z.string().uuid().nullable().default(null),
  source_regression_ids: z.array(z.string().uuid()).max(100).default([]),
  source_refs: RuntimeObservationSourceRefsSchema,
  policy: RuntimeObservationPolicySchema,
  created_at: z.string().datetime(), retention_expires_at: z.string().datetime(),
  native_trace_id: z.string().regex(/^[a-f0-9]{32}$/u).nullable(),
  spans: z.array(RuntimeObservationSpanSchema).min(1).max(500),
}).strict().superRefine((observation, context) => {
  const ids = new Set(observation.spans.map((span) => span.id));
  if (ids.size !== observation.spans.length || observation.spans.some((span) => span.parent_span_id !== null && !ids.has(span.parent_span_id))) {
    context.addIssue({ code: "custom", message: "Span ancestry must name unique spans in the observation." });
  }
  if (!observation.policy.source_workspace_ids.includes(observation.source_workspace_id)
    || !observation.policy.authorization_scopes.includes(observation.authorization_scope)) context.addIssue({ code: "custom", message: "Observation scope is outside policy." });
  if (observation.id !== observationID(`${observation.source_workspace_id}:${observation.run_id}`)) {
    context.addIssue({ code: "custom", message: "Observation identity must match its source run." });
  }
  const expiry = Date.parse(observation.retention_expires_at), created = Date.parse(observation.created_at);
  if (expiry <= created || expiry > created + observation.policy.retention_days * 86_400_000) {
    context.addIssue({ code: "custom", message: "Observation retention must stay within policy." });
  }
  if (observation.source_refs.kind === "product" && (expiry > Date.parse(observation.source_refs.expires_at)
    || (!observation.source_session_id && !observation.source_regression_id && !observation.source_regression_ids.length && ![observation.source_refs.capture_ids, observation.source_refs.fragment_ids,
      observation.source_refs.media_ids, observation.source_refs.person_ids, observation.source_refs.relationship_context_ids].some((ids) => ids.length)))) {
    context.addIssue({ code: "custom", message: "Product observation requires bounded source lineage." });
  }
});
export type RuntimeObservation = z.infer<typeof RuntimeObservationSchema>;
export type RuntimeObservationSpan = z.infer<typeof RuntimeObservationSpanSchema>;
export type RuntimeObservationContent = z.infer<typeof RuntimeObservationContentSchema>;
export interface RuntimeObservationContext {
  run_id: string;
  workspace_id: string;
  authorization_scope: string;
  source_session_id?: string | null;
  source_lab_job_id?: string | null;
  source_regression_id?: string | null;
  source_regression_ids?: string[];
  source_refs?: RuntimeObservationSourceRefs;
  native_trace_id?: string;
}
export function observationHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function observationID(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex");
  // Opik 2.2.x requires the v7 variant for supplied IDs. Identity stays derived
  // from the source run; actual event clocks are explicit started_at fields.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const secretKey = /^(?:authorization|proxy.authorization|cookie|set.cookie|(?:x.?)?api.?key|access.?token|refresh.?token|password|secret|client.?secret|private.?key)$/iu;
export function captureObservationContent(value: unknown, limit: number, secrets: readonly string[] = []): RuntimeObservationContent {
  if (value === undefined) return { status: "unavailable", original_bytes: 0, retained_bytes: 0, sha256: null };
  let redacted = false;
  let raw: string; let originalBytes = 0;
  try {
    originalBytes = Buffer.byteLength(JSON.stringify(value));
    raw = JSON.stringify(value, (key, item: unknown) => {
      if (secretKey.test(key)) { redacted = true; return "[credential removed]"; }
      if (typeof item === "string") {
        let safe = item.replace(/\bBearer\s+[a-zA-Z0-9._~+\/-]+=*/gu, "[credential removed]");
        for (const secret of secrets) if (secret.length >= 4) safe = safe.split(secret).join("[credential removed]");
        redacted ||= safe !== item;
        return safe;
      }
      return item;
    });
  } catch { return { status: "unavailable", original_bytes: 0, retained_bytes: 0, sha256: null }; }
  const bytes = Buffer.byteLength(raw);
  if (bytes > limit) {
    // Do not publish broken media or syntactically invalid partial JSON as full content.
    return { status: "truncated", original_bytes: originalBytes, retained_bytes: 0, sha256: observationHash(raw) };
  }
  return { status: redacted ? "redacted" : "complete", original_bytes: originalBytes, retained_bytes: bytes,
    sha256: observationHash(raw), value: JSON.parse(raw) as unknown };
}
export const unavailableObservationUsage: RuntimeObservationSpan["usage"] = {
  input_tokens: null, output_tokens: null, source: "unavailable", cost_usd: null, cost_source: "unavailable", accounting: "none",
};
export interface RuntimeObservationSink { enqueue(value: RuntimeObservation): Promise<void>; }
export class RuntimeObservationSession {
  readonly id: string;
  readonly attemptID = randomUUID();
  private readonly startedAt = new Date().toISOString();
  private readonly spans: RuntimeObservationSpan[] = [];
  private ordinal = 0;
  private lastModelSpan: string | null = null;
  private readonly operations = new Map<string, { id: string; attempts: number; failed: boolean }>();
  private readonly input: RuntimeObservationContent;
  constructor(readonly policy: RuntimeObservationPolicy, readonly context: RuntimeObservationContext,
    input: unknown, private readonly sink: RuntimeObservationSink, private readonly secrets: readonly string[] = []) {
    if (!policy.source_workspace_ids.includes(context.workspace_id)
      || !policy.authorization_scopes.includes(context.authorization_scope)) throw new Error("RUNTIME_OBSERVATION_SCOPE_DENIED");
    if (!context.source_refs) throw new Error("RUNTIME_OBSERVATION_SOURCE_LINEAGE_REQUIRED");
    const refs = RuntimeObservationSourceRefsSchema.parse(context.source_refs);
    if (refs.kind === "product" && (Date.parse(refs.expires_at) <= Date.now()
      || (!context.source_session_id && !context.source_regression_id && !context.source_regression_ids?.length && ![refs.capture_ids, refs.fragment_ids, refs.media_ids, refs.person_ids, refs.relationship_context_ids].some((ids) => ids.length)))) {
      throw new Error("RUNTIME_OBSERVATION_SOURCE_LINEAGE_REQUIRED");
    }
    this.id = observationID(`${context.workspace_id}:${context.run_id}`);
    this.input = this.capture(input);
  }
  private capture(value: unknown) { return captureObservationContent(value, this.policy.max_content_bytes, this.secrets); }
  /** SDK response receipt time only: the SDK does not expose transport start/retry clocks.
   * Upsert by message ID so repeated complete-message frames never double-count usage.
   * Inputs remain unavailable at this leaf; the authorized Run input is on the root.
   */
  recordSDKAssistant(message: { id: string; model: string; usage: { input_tokens: number; output_tokens: number;
    cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } }, output: unknown,
    promptRevision: string): void {
    const id = observationID(`${this.id}:${this.attemptID}:sdk:${message.id}`);
    const now = new Date().toISOString();
    const span: RuntimeObservationSpan = { id, parent_span_id: null, name: "sdk.assistant.observed", kind: "llm",
      operation_id: `sdk:${message.id}`.slice(0, 200), attempt: 1, retry_of: null,
      started_at: now, ended_at: now, status: "ok", error_code: null, model: message.model,
      provider: "claude-agent-sdk", prompt_revision: promptRevision, input: this.capture(undefined), output: this.capture(output),
      usage: { input_tokens: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0),
        output_tokens: message.usage.output_tokens, source: "provider", cost_usd: null, cost_source: "unavailable", accounting: "leaf" } };
    const previous = this.spans.findIndex(entry => entry.id === id);
    if (previous >= 0) this.spans[previous] = span; else this.spans.push(span);
    this.lastModelSpan = id;
  }
  async step<T>(name: string, kind: "llm" | "tool", input: unknown, execute: () => Promise<T>,
    config: { model?: string; provider?: string; prompt_revision?: string; operation_id?: string } = {},
    usage?: (result: T) => RuntimeObservationSpan["usage"]): Promise<T> {
    const capturedInput = this.capture(input); // Snapshot before the model loop mutates messages.
    const operation = config.operation_id ?? `${kind}:${name}:${capturedInput.sha256 ?? "unavailable"}`;
    const previous = this.operations.get(operation);
    const id = observationID(`${this.id}:${this.attemptID}:${++this.ordinal}`);
    const parent = kind === "tool" ? this.lastModelSpan : null;
    this.operations.set(operation, { id, attempts: (previous?.attempts ?? 0) + 1, failed: false });
    if (kind === "llm") this.lastModelSpan = id;
    const start = new Date().toISOString();
    let result: T | undefined; let succeeded = false;
    try { result = await execute(); succeeded = true; return result; }
    finally {
      const denied = kind === "tool" && result !== null && typeof result === "object" && (("ok" in result && result.ok === false) || ("isError" in result && result.isError === true));
      const failed = !succeeded || denied;
      this.operations.get(operation)!.failed = failed;
      this.spans.push({ id, parent_span_id: parent, name, kind, operation_id: operation.slice(0, 200),
        attempt: (previous?.attempts ?? 0) + 1, retry_of: previous?.failed ? previous.id : null,
        started_at: start, ended_at: new Date().toISOString(), status: failed ? "error" : "ok",
        error_code: failed ? denied ? "RUNTIME_TOOL_REJECTED" : "RUNTIME_OPERATION_FAILED" : null, model: config.model ?? null,
        provider: config.provider ?? null, prompt_revision: config.prompt_revision ?? null,
        input: capturedInput, output: this.capture(result),
        usage: succeeded && result !== undefined && usage ? usage(result) : { ...unavailableObservationUsage },
      });
    }
  }
  async complete(output: unknown, status: "ok" | "error"): Promise<void> {
    const endedAt = new Date().toISOString();
    const rootID = observationID(`${this.id}:${this.attemptID}:root`);
    const spans = this.spans.map((span) => ({ ...span, parent_span_id: span.parent_span_id ?? rootID }));
    await this.sink.enqueue(RuntimeObservationSchema.parse({ schema_version: "runtime-observation.v1", id: this.id,
      run_id: this.context.run_id, attempt_id: this.attemptID, source_workspace_id: this.context.workspace_id,
      source_session_id: this.context.source_session_id ?? null,
      source_lab_job_id: this.context.source_lab_job_id ?? null,
      source_regression_id: this.context.source_regression_id ?? null,
      source_regression_ids: this.context.source_regression_ids ?? [],
      source_refs: this.context.source_refs,
      authorization_scope: this.context.authorization_scope, policy: this.policy, created_at: this.startedAt,
      retention_expires_at: new Date(Math.min(Date.parse(this.startedAt) + this.policy.retention_days * 86_400_000,
        this.context.source_refs?.kind === "product" ? Date.parse(this.context.source_refs.expires_at) : Infinity)).toISOString(),
      native_trace_id: this.context.native_trace_id ?? null,
      spans: [{ id: rootID, parent_span_id: null, name: "runtime", kind: "general", operation_id: this.context.run_id,
        attempt: 1, retry_of: null, started_at: this.startedAt, ended_at: endedAt, status,
        error_code: status === "ok" ? null : "RUNTIME_FAILED", model: null, provider: null, prompt_revision: null,
        input: this.input, output: this.capture(output), usage: { ...unavailableObservationUsage } }, ...spans],
    }));
  }
}
