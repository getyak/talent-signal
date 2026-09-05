import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyInstance, FastifyRequest } from "fastify";

export const LAB_DIAGNOSTIC_REQUEST = "x-talent-signal-lab-request";
export const LAB_DIAGNOSTIC_RESPONSE = "x-talent-signal-lab-trace";
const requestIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limitMilliseconds = 600_000;
export type LabServerStage = "context" | "model_adapter" | "database_connection" | "database_commit" | "tool" | "validation";
type Outcome = "completed" | "failed" | "unfinished";
interface Span { kind: LabServerStage; offset_ms: number; duration_ms: number | null; outcome: Outcome }
interface Capture {
  requestID: string; started: number; spans: Span[]; dropped: number;
  closed: boolean; origin: "backend" | "synthetic_fixture";
}
const active = new AsyncLocalStorage<Capture | undefined>();
const elapsed = (start: number) => Math.min(limitMilliseconds, Math.max(0, performance.now() - start));
const rounded = (value: number) => Math.round(value * 100) / 100;

// Only closed labels and numbers are retained. Errors, arguments, SQL and output
// have no field in this request-local capture; no database or log is involved.
export function beginLabServerStage(kind: LabServerStage): (outcome?: Outcome) => void {
  const capture = active.getStore();
  if (!capture || capture.closed || elapsed(capture.started) >= limitMilliseconds) return () => {};
  if (capture.spans.length >= 16) { capture.dropped++; return () => {}; }
  const started = performance.now();
  const span: Span = { kind, offset_ms: rounded(elapsed(capture.started)), duration_ms: null, outcome: "unfinished" };
  capture.spans.push(span);
  return (outcome = "completed") => {
    if (capture.closed || span.duration_ms !== null) return;
    span.duration_ms = rounded(elapsed(started)); span.outcome = outcome;
  };
}
export async function measureLabServerStage<T>(kind: LabServerStage, body: () => Promise<T>): Promise<T> {
  const finish = beginLabServerStage(kind);
  try { const result = await body(); finish(); return result; }
  catch (error) { finish("failed"); throw error; }
}

export function measureLabServerStageSync<T>(kind: LabServerStage, body: () => T): T {
  const finish = beginLabServerStage(kind);
  try { const result = body(); finish(); return result; }
  catch (error) { finish("failed"); throw error; }
}

export function registerLabDiagnostics(app: FastifyInstance, enabled: boolean,
  origin: Capture["origin"] = "backend"): void {
  if (!enabled) return;
  const captures = new WeakMap<FastifyRequest, Capture>();
  app.addHook("onRequest", (request, _reply, done) => {
    const id = request.headers[LAB_DIAGNOSTIC_REQUEST];
    if (typeof id === "string" && requestIDPattern.test(id)) {
      captures.set(request, { requestID: id.toLowerCase(), started: performance.now(), spans: [], dropped: 0, closed: false, origin });
    }
    done();
  });
  // Establish context after body parsing; body stream callbacks must not become
  // the carrier of another request's context. Async descendants inherit it.
  app.addHook("preHandler", (request, _reply, done) => {
    const capture = captures.get(request);
    active.run(capture, done);
  });
  app.addHook("onSend", (request, reply, payload, done) => {
    const capture = captures.get(request);
    if (capture) {
      capture.closed = true;
      const health = request.method === "GET" && ["/health/live", "/health/ready"].includes(request.routeOptions.url ?? "");
      if (request.auth?.accountId || health) {
        const value = {
          version: 1, request_id: capture.requestID, origin: capture.origin,
          duration_ms: rounded(elapsed(capture.started)), spans: capture.spans,
          dropped_spans: Math.min(capture.dropped, 1_000_000),
        };
        const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
        if (encoded.length <= 4096) reply.header(LAB_DIAGNOSTIC_RESPONSE, encoded);
      }
    }
    done(null, payload);
  });
  app.addHook("onResponse", (request, _reply, done) => {
    const capture = captures.get(request); if (capture) capture.closed = true;
    captures.delete(request); done();
  });
}
