import { describe, expect, it } from "vitest";

import {
  McpBodyError,
  readBoundedRequestBody,
} from "./mcpBoundedBody";

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe("bounded incoming request body", () => {
  it("returns null for an absent body and reads a small body", async () => {
    const signal = new AbortController().signal;
    expect(await readBoundedRequestBody({ body: null, signal }, 1024)).toBeNull();
    expect(
      await readBoundedRequestBody(
        { body: streamOf(new TextEncoder().encode("hello")), signal },
        1024,
      ),
    ).toBe("hello");
  });

  it("reports an oversized body as too_large", async () => {
    const promise = readBoundedRequestBody(
      {
        body: streamOf(new Uint8Array(2_000)),
        signal: new AbortController().signal,
      },
      1_024,
    );
    await expect(promise).rejects.toMatchObject({ failure: "too_large" });
    await expect(promise).rejects.toBeInstanceOf(McpBodyError);
  });

  it("times out a stalled body instead of hanging", async () => {
    const stalled = new ReadableStream<Uint8Array>({ start() {} });
    const promise = readBoundedRequestBody(
      { body: stalled, signal: new AbortController().signal },
      1_024,
      20,
    );
    await expect(promise).rejects.toMatchObject({ failure: "timeout" });
  });

  it("cancels and reports a client abort", async () => {
    const stalled = new ReadableStream<Uint8Array>({ start() {} });
    const controller = new AbortController();
    const promise = readBoundedRequestBody(
      { body: stalled, signal: controller.signal },
      1_024,
      5_000,
    );
    controller.abort();
    await expect(promise).rejects.toMatchObject({ failure: "aborted" });
  });
});
