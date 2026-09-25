import { describe, expect, it, vi } from "vitest";

import {
  createWorkspaceRefreshCoordinator,
  subscribeWorkspaceRefresh,
  workspaceRefreshGeneration,
  type RefreshReason,
} from "./workspace-refresh";

type Listener = () => void;

function fixture() {
  const handlers = new Map<string, Listener>();
  const refreshes: Array<{ reason: RefreshReason; generation: number }> = [];
  let hidden = false;
  let now = 0;
  const timers: Array<{ at: number; run: () => void; cancelled: boolean }> = [];
  const coordinator = createWorkspaceRefreshCoordinator({
    refresh: (reason, generation) => refreshes.push({ reason, generation }),
    intervalMs: 15_000,
    coalesceMs: 1_000,
    isHidden: () => hidden,
    listen: (event, handler) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    },
    timers: {
      setTimeout: (run: () => void, ms: number) => {
        const task = { at: now + ms, run, cancelled: false };
        timers.push(task);
        return task;
      },
      clearTimeout: (task: unknown) => {
        (task as { cancelled: boolean }).cancelled = true;
      },
    },
  });
  return {
    coordinator,
    refreshes,
    handlers,
    timers,
    setHidden(value: boolean) {
      hidden = value;
    },
    advance(ms: number) {
      now += ms;
      for (const task of [...timers]) {
        if (!task.cancelled && task.at <= now) {
          task.cancelled = true;
          task.run();
        }
      }
    },
  };
}

describe("workspace refresh coordinator", () => {
  it("refreshes on foreground, focus and network recovery while visible", () => {
    const test = fixture();
    test.coordinator.start();
    test.handlers.get("visibilitychange")?.();
    test.advance(1_000);
    test.handlers.get("focus")?.();
    test.advance(1_000);
    test.handlers.get("online")?.();
    test.advance(1_000);
    expect(test.refreshes.map((entry) => entry.reason)).toEqual([
      "foreground",
      "focus",
      "online",
    ]);
    test.coordinator.stop();
  });

  it("coalesces bursts and pauses background polling while hidden", () => {
    const test = fixture();
    test.coordinator.start();
    test.coordinator.schedule("manual");
    test.coordinator.schedule("manual");
    test.advance(1_000);
    expect(test.refreshes).toHaveLength(1);
    // Hidden surfaces never receive interval or wake refreshes.
    test.setHidden(true);
    test.advance(15_000);
    test.handlers.get("visibilitychange")?.();
    test.advance(1_000);
    expect(test.refreshes).toHaveLength(1);
    // Visible again: bounded active interval resumes.
    test.setHidden(false);
    test.advance(15_000);
    test.advance(1_000);
    expect(test.refreshes.map((entry) => entry.reason)).toEqual(["manual", "interval"]);
    test.coordinator.stop();
  });

  it("drops late completions after the scope generation advances", () => {
    const test = fixture();
    test.coordinator.start();
    const scheduled = test.coordinator.schedule("manual");
    expect(test.coordinator.isCurrent(scheduled)).toBe(true);
    // Account or endpoint switch: the old generation can never publish.
    test.coordinator.nextScope();
    expect(test.coordinator.isCurrent(scheduled)).toBe(false);
    expect(test.coordinator.isCurrent(test.coordinator.scope())).toBe(true);
    test.coordinator.stop();
  });

  it("shares one coordinator per binding and stops with the last subscriber", () => {
    const seen: string[] = [];
    const unsubscribeA = subscribeWorkspaceRefresh("account-a", () => seen.push("a"));
    const unsubscribeB = subscribeWorkspaceRefresh("account-a", () => seen.push("b"));
    const unsubscribeOther = subscribeWorkspaceRefresh("account-b", () => seen.push("other"));
    expect(workspaceRefreshGeneration("account-a")).toBe(0);
    unsubscribeA();
    unsubscribeB();
    unsubscribeOther();
    expect(workspaceRefreshGeneration("account-a")).toBe(-1);
  });
});

describe("production default timer seam", () => {
  it("invokes host timer functions without an object receiver", async () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    try {
      const refreshes: string[] = [];
      // No injected seam: the production defaults must be browser-safe.
      const coordinator = createWorkspaceRefreshCoordinator({
        refresh: (reason) => refreshes.push(reason),
        intervalMs: 0,
        coalesceMs: 0,
      });
      coordinator.schedule("manual");
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(refreshes).toEqual(["manual"]);
      // WebIDL-style hosts throw "Illegal invocation" when a host function is
      // invoked with an object receiver; the wrapper must call it plainly.
      for (const call of timeoutSpy.mock.instances) {
        expect(call === undefined || call === (globalThis as unknown)).toBe(true);
      }
      for (const call of clearSpy.mock.instances) {
        expect(call === undefined || call === (globalThis as unknown)).toBe(true);
      }
    } finally {
      timeoutSpy.mockRestore();
      clearSpy.mockRestore();
    }
  });
});

describe("production default deadlines", () => {
  it("schedules the first visible fetch inside the propagation target without injected overrides", async () => {
    const scheduler = new (class {
      items: Array<{ delay: number; run: () => void; cancelled: boolean }> = [];
      clock = {
        now: () => new Date(),
        setTimeout: (run: () => void, delay: number) => {
          const item = { delay, run, cancelled: false };
          this.items.push(item);
          return item;
        },
        clearTimeout: (handle: unknown) => {
          (handle as { cancelled: boolean }).cancelled = true;
        },
      };
    })();
    const seen: Array<{ reason: string; delay: number }> = [];
    // NO interval/coalesce overrides: the production defaults must fit the
    // 15s propagation target with margin before any network time.
    const coordinator = createWorkspaceRefreshCoordinator({
      refresh: (reason) => {
        const scheduled = scheduler.items.find((item) => !item.cancelled);
        seen.push({ reason, delay: scheduled?.delay ?? -1 });
      },
      isHidden: () => false,
      listen: () => () => undefined,
      timers: scheduler.clock,
    });
    coordinator.start();
    // The bounded interval uses the default and must be the one observed.
    const intervalItem = scheduler.items[0];
    expect(intervalItem?.delay).toBeLessThanOrEqual(10_000);
    intervalItem?.run();
    const coalesce = scheduler.items.filter((item) => !item.cancelled).sort((a, b) => a.delay - b.delay)[0];
    expect(coalesce?.delay).toBeLessThanOrEqual(1_000);
    coalesce?.run();
    // First fetch deadline: interval + coalesce, inside the 15s target.
    const deadline = (intervalItem?.delay ?? 0) + (coalesce?.delay ?? 0);
    expect(deadline).toBeGreaterThan(0);
    expect(deadline).toBeLessThanOrEqual(11_000);
    expect(seen[0]?.reason).toBe("interval");
  });
});
