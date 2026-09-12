import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { captureObservationContent, type RuntimeObservationContent } from "./runtimeObservation.js";

export interface ProductRunSpan {
  id: string; parent_id: string | null; name: string; kind: "llm" | "tool" | "context";
  started_at: string; finished_at: string; status: "completed" | "failed";
  input: RuntimeObservationContent; output: RuntimeObservationContent;
  metadata: Record<string, unknown>; error: string | null;
}
type Capture = { append(span: ProductRunSpan): Promise<void>; parentID?: string };
const capture = new AsyncLocalStorage<Capture>();

/** Explicit observation window for callers that already saw the event. */
export interface ProductRunEventOptions {
  failed?: boolean;
  /** Overrides the request-local parent; pass null for an explicit root. */
  parentID?: string | null;
  startedAt?: string;
  finishedAt?: string;
  /** Host-known credential values removed from any retained string. */
  secrets?: readonly string[];
}

/** Diagnostic copies never duplicate original image bytes or provider error prose. */
function diagnosticContent(value: unknown): unknown {
  if (value === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(value, function(key, item) {
    const original = this?.[key];
    if (original instanceof ArrayBuffer || ArrayBuffer.isView(original)
      || item && typeof item === "object" && item.type === "Buffer" && Array.isArray(item.data)
      || ["data_base64", "dataBase64", "image_base64", "imageBase64", "base64"].includes(key)
      || key === "data" && ["base64", "image"].includes(this?.type)
      || typeof item === "string" && /^data:[^,]*;base64,/iu.test(item)) {
      return "[original media retained only by its product source]";
    }
    return item;
  })); } catch { return undefined; }
}

// A request-local sink keeps concurrent accounts and background continuations separate.
// https://nodejs.org/api/async_context.html#asynclocalstoragerunstore-callback-args
export function withProductRunCapture<T>(sink: Capture, execute: () => T): T {
  return capture.run(sink, execute);
}

export async function captureProductStep<T>(name: string, kind: ProductRunSpan["kind"], input: unknown,
  execute: () => Promise<T>, metadata: Record<string, unknown> = {}, secrets: readonly string[] = []): Promise<T> {
  const sink = capture.getStore();
  if (!sink) return execute();
  const id = randomUUID(), started_at = new Date().toISOString();
  const frozen = captureObservationContent(diagnosticContent(input), 2_000_000, secrets);
  let output: T | undefined, error: unknown;
  try {
    output = await capture.run({ ...sink, parentID: id }, execute);
    return output;
  } catch (caught) { error = caught; throw caught; }
  finally {
    await sink.append({ id, parent_id: sink.parentID ?? null, name, kind, started_at,
      finished_at: new Date().toISOString(), status: error ? "failed" : "completed",
      input: frozen, output: captureObservationContent(diagnosticContent(output), 2_000_000, secrets), metadata,
      error: error ? "Operation failed" : null });
  }
}

/** Append an event the caller already observed (for example an SDK frame).
 * Diagnostic capture is best-effort: no sink is a no-op and a failing sink
 * never changes execution, unlike `captureProductStep` which owns the call.
 */
export async function recordProductEvent(name: string, kind: ProductRunSpan["kind"], input: unknown,
  output: unknown, metadata: Record<string, unknown> = {}, options: ProductRunEventOptions = {}): Promise<string | null> {
  const sink = capture.getStore();
  if (!sink) return null;
  const id = randomUUID();
  const started = options.startedAt ?? new Date().toISOString();
  const finished = options.finishedAt ?? started;
  try {
    await sink.append({ id, parent_id: options.parentID !== undefined ? options.parentID : sink.parentID ?? null,
      name, kind, started_at: started, finished_at: finished, status: options.failed ? "failed" : "completed",
      input: captureObservationContent(diagnosticContent(input), 2_000_000, options.secrets ?? []),
      output: captureObservationContent(diagnosticContent(output), 2_000_000, options.secrets ?? []),
      metadata, error: options.failed ? "Operation failed" : null });
    return id;
  } catch { return null; }
}
