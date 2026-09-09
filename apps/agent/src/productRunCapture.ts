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

/** Diagnostic copies never duplicate original image bytes or provider error prose. */
function diagnosticContent(value: unknown): unknown {
  if (value === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(value, function(key, item) {
    const original = this?.[key];
    if (original instanceof ArrayBuffer || ArrayBuffer.isView(original)
      || item && typeof item === "object" && item.type === "Buffer" && Array.isArray(item.data)
      || ["data_base64", "image_base64", "base64"].includes(key)
      || key === "data" && this?.type === "base64"
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
  execute: () => Promise<T>, metadata: Record<string, unknown> = {}): Promise<T> {
  const sink = capture.getStore();
  if (!sink) return execute();
  const id = randomUUID(), started_at = new Date().toISOString();
  const frozen = captureObservationContent(diagnosticContent(input), 2_000_000);
  let output: T | undefined, error: unknown;
  try {
    output = await capture.run({ ...sink, parentID: id }, execute);
    return output;
  } catch (caught) { error = caught; throw caught; }
  finally {
    await sink.append({ id, parent_id: sink.parentID ?? null, name, kind, started_at,
      finished_at: new Date().toISOString(), status: error ? "failed" : "completed",
      input: frozen, output: captureObservationContent(diagnosticContent(output), 2_000_000), metadata,
      error: error ? "Operation failed" : null });
  }
}
