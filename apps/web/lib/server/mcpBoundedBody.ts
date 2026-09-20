import "server-only";

export const MCP_INCOMING_BODY_TIMEOUT_MS = 10_000;

export type McpBodyFailure = "aborted" | "timeout" | "too_large";

export class McpBodyError extends Error {
  readonly failure: McpBodyFailure;

  constructor(failure: McpBodyFailure) {
    super(failure);
    this.name = "McpBodyError";
    this.failure = failure;
  }
}

/**
 * Reads an incoming request body under a bounded deadline and byte cap.
 *
 * A client that opens a stream and stalls is canceled without hanging, so the
 * route can answer 408 instead of waiting forever. Size overflow is reported
 * separately as 413. A client abort is treated as a timeout outcome.
 */
export async function readBoundedRequestBody(
  request: { body: ReadableStream<Uint8Array> | null; signal?: AbortSignal },
  maxBytes: number,
  timeoutMs = MCP_INCOMING_BODY_TIMEOUT_MS,
): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  let timedOut = false;
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    cancel();
  }, timeoutMs);
  const onAbort = () => {
    cancel();
  };
  request.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > maxBytes) {
        cancel();
        throw new McpBodyError("too_large");
      }
      chunks.push(item.value);
    }
    if (timedOut) throw new McpBodyError("timeout");
    if (request.signal?.aborted) throw new McpBodyError("aborted");
    return size ? Buffer.concat(chunks).toString("utf8") : null;
  } catch (error) {
    if (error instanceof McpBodyError) throw error;
    if (timedOut) throw new McpBodyError("timeout");
    if (request.signal?.aborted) throw new McpBodyError("aborted");
    throw error;
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", onAbort);
  }
}
