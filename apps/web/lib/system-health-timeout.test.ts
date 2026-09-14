import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SystemHealthTimeoutError,
  withSystemHealthTimeout,
} from "./system-health-timeout";

afterEach(() => vi.useRealTimers());

describe("system health timeout", () => {
  it("settles an observation even when the underlying request never resolves", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const pending = withSystemHealthTimeout(
      (signal) => {
        observedSignal = signal;
        return new Promise<never>(() => {});
      },
      { timeoutMs: 250 },
    );
    const assertion = expect(pending).rejects.toBeInstanceOf(
      SystemHealthTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
    expect(observedSignal?.aborted).toBe(true);
  });

  it("propagates caller cancellation without waiting for the timeout", async () => {
    const controller = new AbortController();
    const pending = withSystemHealthTimeout(
      () => new Promise<never>(() => {}),
      { timeoutMs: 10_000, signal: controller.signal },
    );
    controller.abort(new DOMException("cancelled", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
