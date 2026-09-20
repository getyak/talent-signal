import { afterEach, describe, expect, it, vi } from "vitest";
import { TalentSignalClient } from "@talent-signal/contracts";

import {
  AuthRequestTimeoutError,
  withAuthRequestTimeout,
} from "./auth-request-timeout";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("auth request timeout", () => {
  it("aborts the underlying request when the deadline passes", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const pending = withAuthRequestTimeout(
      (signal) => {
        observedSignal = signal;
        return new Promise<never>(() => {});
      },
      { timeoutMs: 250 },
    );
    const assertion = expect(pending).rejects.toBeInstanceOf(
      AuthRequestTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
    expect(observedSignal?.aborted).toBe(true);
  });

  it("cancels the actual session fetch when OAuth readback times out", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | null | undefined;
    let networkCancelled = false;
    vi.stubGlobal("fetch", vi.fn((_url: unknown, init?: RequestInit) => {
      observedSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener("abort", () => {
          networkCancelled = true;
          reject(observedSignal?.reason);
        }, { once: true });
      });
    }));
    const client = new TalentSignalClient("https://backend.example.test", "synthetic-token");
    const pending = withAuthRequestTimeout(signal => client.currentSession(signal), { timeoutMs: 5_000 });
    const assertion = expect(pending).rejects.toBeInstanceOf(AuthRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(observedSignal?.aborted).toBe(true);
    expect(networkCancelled).toBe(true);
  });

  it("returns the work result without waiting for the deadline", async () => {
    vi.useFakeTimers();
    const pending = withAuthRequestTimeout(
      async () => "session",
      { timeoutMs: 5_000 },
    );
    await expect(pending).resolves.toBe("session");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates an explicit cancellation before the deadline", async () => {
    const controller = new AbortController();
    const pending = withAuthRequestTimeout(
      () => new Promise<never>(() => {}),
      { timeoutMs: 10_000, signal: controller.signal },
    );
    controller.abort(new DOMException("cancelled", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("surfaces the work failure unchanged", async () => {
    const failure = new Error("credentials rejected");
    await expect(
      withAuthRequestTimeout(
        async () => {
          throw failure;
        },
        { timeoutMs: 5_000 },
      ),
    ).rejects.toBe(failure);
  });
});
