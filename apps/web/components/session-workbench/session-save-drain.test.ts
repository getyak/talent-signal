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
  it("keeps a send marker behind the queued force save, not just the active request", async () => {
    const drain = new SessionSaveDrain();
    const first = deferred();
    const second = deferred();
    let marker: string | null = "draft";
    const active = drain.run(async () => { await first.promise; });
    const queued = vi.fn(async ({ force }: SaveDrainContext) => {
      expect(force).toBe(true);
      await second.promise;
      marker = null;
    });
    const send = (async () => {
      await drain.run(queued, true);
      await drain.whenIdle();
      marker = "same-request-send";
    })();
    first.resolve();
    await active;
    await flushMicrotasks();
    expect(queued).toHaveBeenCalledOnce();
    expect(marker).toBe("draft");
    second.resolve();
    await send;
    await drain.whenIdle();
    expect(marker).toBe("same-request-send");
  });

  it("settles all idle waiters after a failed save without hiding its rejection", async () => {
    const drain = new SessionSaveDrain();
    const gate = deferred();
    const failure = new Error("save unavailable");
    const active = drain.run(async () => { await gate.promise; throw failure; });
    const rejected = expect(active).rejects.toBe(failure);
    const first = drain.whenIdle();
    const second = drain.whenIdle();
    gate.resolve();
    await rejected;
    await Promise.all([first, second]);
    await drain.whenIdle();
  });

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

      let idle = false;
      const barrier = drain.whenIdle().then(() => { idle = true; });
      await flushMicrotasks();
      expect(idle).toBe(false);

      drain.invalidate();
      scheduled[0]!();
      await barrier;
      expect(idle).toBe(true);
      expect(task).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
