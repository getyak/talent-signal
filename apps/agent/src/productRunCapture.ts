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
  const frozen = captureObservationContent(input, 30_000_000);
  let output: T | undefined, error: unknown;
  try {
    output = await capture.run({ ...sink, parentID: id }, execute);
    return output;
  } catch (caught) { error = caught; throw caught; }
  finally {
    await sink.append({ id, parent_id: sink.parentID ?? null, name, kind, started_at,
      finished_at: new Date().toISOString(), status: error ? "failed" : "completed",
      input: frozen, output: captureObservationContent(output, 30_000_000), metadata,
      error: error instanceof Error ? String(captureObservationContent(error.message, 2000).value ?? error.name) : error ? "Operation failed" : null });
  }
}
