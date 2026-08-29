import type {
  AppendTelemetryBatchRequest,
  CreateTelemetryTraceRequest,
  TelemetryContext,
  TelemetryMutationResponse,
} from "@talent-signal/contracts";

const SESSION_STORAGE_KEY = "talent-signal:telemetry-session:v1";
const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function browserSessionId(): string {
  try {
    const current = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (current && /^[0-9a-f-]{36}$/i.test(current)) return current;
    const next = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function fileKind(file: File): "image" | "audio" | "document" | "other" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (
    file.type === "application/pdf" ||
    file.type.includes("document") ||
    file.type.startsWith("text/")
  ) {
    return "document";
  }
  return "other";
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export type WebTraceHandle = TelemetryContext & {
  root_span_id: string;
  started_at: string;
  artifact_ids: string[];
};

export async function beginWebTrace(input: {
  name: string;
  route: string;
  text?: string;
  files?: File[];
  dataClassification: "synthetic" | "private_relationship" | "operational";
  authorizationScope: string;
  attributes?: Record<string, string | number | boolean | null>;
}): Promise<WebTraceHandle> {
  const traceId = randomHex(16);
  const rootSpanId = randomHex(8);
  const interactionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const parts: CreateTelemetryTraceRequest["content_parts"] = [];
  if (input.text !== undefined) {
    const bytes = new TextEncoder().encode(input.text);
    parts.push({
      id: crypto.randomUUID(),
      ordinal: parts.length,
      kind: "text",
      mime_type: "text/plain; charset=utf-8",
      byte_size: bytes.byteLength,
      content_hash: await hashBytes(bytes),
      capture_status: "governed_full",
      purpose: "user_authorized_agent_interaction_trace",
      authorization_scope: input.authorizationScope,
      retention_days: 30,
      content_text: input.text,
    });
  }
  for (const file of input.files ?? []) {
    if (file.size > MAX_ARTIFACT_BYTES) {
      throw new Error(`${file.name || "附件"} 超过 5 MB 的追踪限制。`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    parts.push({
      id: crypto.randomUUID(),
      ordinal: parts.length,
      kind: fileKind(file),
      mime_type: file.type || "application/octet-stream",
      byte_size: bytes.byteLength,
      content_hash: await hashBytes(bytes),
      capture_status: "governed_full",
      purpose: "user_authorized_agent_interaction_trace",
      authorization_scope: input.authorizationScope,
      retention_days: 30,
      content_base64: toBase64(bytes),
    });
  }
  const body: CreateTelemetryTraceRequest = {
    trace_id: traceId,
    root_span_id: rootSpanId,
    interaction_id: interactionId,
    browser_session_id: browserSessionId(),
    name: input.name,
    surface: "web",
    route: input.route,
    started_at: startedAt,
    data_classification: input.dataClassification,
    attributes: input.attributes ?? {},
    content_parts: parts,
  };
  const response = await fetch("/api/telemetry/traces", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as TelemetryMutationResponse | { code?: string };
  if (!response.ok || !("trace_id" in payload)) {
    throw new Error("无法启动受治理追踪；智能助理请求未发送。")
  }
  return {
    trace_id: traceId,
    parent_span_id: rootSpanId,
    root_span_id: rootSpanId,
    interaction_id: interactionId,
    started_at: startedAt,
    artifact_ids: payload.artifact_ids,
  };
}

export async function appendWebTrace(
  trace: WebTraceHandle,
  batch: AppendTelemetryBatchRequest,
): Promise<void> {
  const response = await fetch(`/api/telemetry/traces/${trace.trace_id}/batch`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });
  if (!response.ok) throw new Error("无法记录追踪事件批次。")
}

export async function completeWebTrace(
  trace: WebTraceHandle,
  input: {
    status: "ok" | "error" | "cancelled";
    errorCode?: string;
    attributes?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  const response = await fetch(
    `/api/telemetry/traces/${trace.trace_id}/completion`,
    {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: input.status,
        ended_at: new Date().toISOString(),
        error_code: input.errorCode ?? null,
        attributes: input.attributes ?? {},
      }),
    },
  );
  if (!response.ok) throw new Error("无法记录追踪终止回执。")
}

export function traceSpanId(trace: WebTraceHandle, key: string): string {
  // Browser-created child IDs are random; the semantic key is kept in attributes.
  void trace;
  void key;
  return randomHex(8);
}
