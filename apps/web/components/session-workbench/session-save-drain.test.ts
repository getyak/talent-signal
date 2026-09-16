import { describe, expect, it, vi } from "vitest";

import { SessionSaveDrain, type SaveDrainContext } from "./session-save-drain";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("SessionSaveDrain", () => {
  it("serializes a newer draft behind the active request", async () => {
    const drain = new SessionSaveDrain();
    const first = deferred();
    const second = deferred();
    const observed: string[] = [];
    let draft = "A";
    const task = vi.fn(async () => {
      const captured = draft;
      observed.push(captured);
      await (captured === "A" ? first.promise : second.promise);
    });

    const active = drain.run(task);
    draft = "B";
    expect(drain.run(task)).toBe(active);
    expect(observed).toEqual(["A"]);

    first.resolve();
    await active;
    await flushMicrotasks();
    expect(observed).toEqual(["A", "B"]);

    second.resolve();
    await flushMicrotasks();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("fences a late response and drops queued work after invalidation", async () => {
    const drain = new SessionSaveDrain();
    const first = deferred();
    let isCurrent: SaveDrainContext["isCurrent"] | undefined;
    const task = vi.fn(async (value: SaveDrainContext) => {
      isCurrent = value.isCurrent;
      await first.promise;
    });

    const active = drain.run(task);
    void drain.run(task, true);
    expect(isCurrent?.()).toBe(true);

    drain.invalidate();
    expect(isCurrent?.()).toBe(false);
    first.resolve();
    await active;
    await flushMicrotasks();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("cancels a queued microtask when invalidated after the active request settles", async () => {
    const scheduled: Array<() => void> = [];
    vi.stubGlobal("queueMicrotask", (callback: () => void) => {
      scheduled.push(callback);
    });
    try {
      const drain = new SessionSaveDrain();
      const first = deferred();
      const task = vi.fn(async () => {
        await first.promise;
      });

      const active = drain.run(task);
      void drain.run(task);
      first.resolve();
      await active;
      expect(scheduled).toHaveLength(1);

      drain.invalidate();
      scheduled[0]!();
      await flushMicrotasks();
      expect(task).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
