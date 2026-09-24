/**
 * One shared refresh coordinator per surface (ADR 0018 synchronization).
 *
 * People and Session history refresh together on foreground/focus/online and
 * on a bounded active interval while visible. In-flight work is coalesced,
 * background polling pauses, and every async completion is guarded by the
 * scope generation captured when it was scheduled: after an account or
 * endpoint switch, late responses are dropped instead of painting the old
 * account's data.
 */

export type RefreshReason = "foreground" | "focus" | "online" | "interval" | "manual";

export interface WorkspaceRefreshCoordinator {
  start(): void;
  stop(): void;
  /** Schedule a coalesced refresh; returns the generation to verify later. */
  schedule(reason: RefreshReason): number;
  /** True while the generation is still the active scope. */
  isCurrent(generation: number): boolean;
  /** Advance the scope generation (account/endpoint switch, sign-out). */
  nextScope(): number;
  scope(): number;
}

export interface WorkspaceRefreshOptions {
  refresh: (reason: RefreshReason, generation: number) => void;
  intervalMs?: number;
  coalesceMs?: number;
  isHidden?: () => boolean;
  /** Test seam: returns an unsubscribe function. */
  listen?: (event: "visibilitychange" | "focus" | "online", handler: () => void) => () => void;
  timers?: {
    setTimeout: (callback: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
}

// 10s interval + 1s coalesce: the first fetch of a visible surface begins
// well inside the 15s propagation target even before network time.
export const WORKSPACE_REFRESH_INTERVAL_MS = 10_000;
export const WORKSPACE_REFRESH_COALESCE_MS = 1_000;

export function createWorkspaceRefreshCoordinator(
  options: WorkspaceRefreshOptions,
): WorkspaceRefreshCoordinator {
  const intervalMs = options.intervalMs ?? WORKSPACE_REFRESH_INTERVAL_MS;
  const coalesceMs = options.coalesceMs ?? WORKSPACE_REFRESH_COALESCE_MS;
  const isHidden = options.isHidden ?? (() => typeof document !== "undefined" && document.hidden);
  // Bound wrappers keep the injectable seam without ever invoking a host
  // function with an object receiver (browser "Illegal invocation").
  const timers = options.timers ?? {
    setTimeout: (callback: () => void, ms: number) => globalThis.setTimeout(callback, ms),
    clearTimeout: (handle: unknown) =>
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const listen =
    options.listen ??
    ((event, handler) => {
      // Non-DOM hosts (tests, server rendering) arm no event listeners; the
      // bounded timer and generation guards remain available.
      if (typeof window === "undefined") return () => undefined;
      window.addEventListener(event, handler);
      return () => window.removeEventListener(event, handler);
    });

  let generation = 0;
  let started = false;
  let pending: unknown = null;
  let pendingReason: RefreshReason = "manual";
  let timer: unknown = null;
  let unsubscribers: Array<() => void> = [];

  function run(reason: RefreshReason) {
    const current = generation;
    options.refresh(reason, current);
  }

  function schedule(reason: RefreshReason): number {
    pendingReason = reason;
    if (pending) {
      timers.clearTimeout(pending);
    }
    pending = timers.setTimeout(() => {
      pending = null;
      run(reason);
    }, coalesceMs);
    return generation;
  }

  function onWake() {
    if (isHidden()) return;
    schedule(pendingReason === "interval" ? "interval" : "foreground");
  }

  function start() {
    if (started) return;
    started = true;
    unsubscribers = [
      listen("visibilitychange", onWake),
      listen("focus", () => {
        if (isHidden()) return;
        schedule("focus");
      }),
      listen("online", () => {
        if (isHidden()) return;
        schedule("online");
      }),
    ];
    if (intervalMs > 0) {
      const tick = () => {
        timer = timers.setTimeout(() => {
          if (!isHidden()) schedule("interval");
          tick();
        }, intervalMs);
      };
      tick();
    }
  }

  function stop() {
    if (!started) return;
    started = false;
    for (const unsubscribe of unsubscribers) unsubscribe();
    unsubscribers = [];
    if (pending) {
      timers.clearTimeout(pending);
      pending = null;
    }
    if (timer) {
      timers.clearTimeout(timer);
      timer = null;
    }
  }

  return {
    start,
    stop,
    schedule,
    isCurrent: (candidate: number) => candidate === generation,
    nextScope: () => (generation += 1),
    scope: () => generation,
  };
}

type SharedRefreshEntry = {
  coordinator: WorkspaceRefreshCoordinator;
  subscribers: Set<(reason: RefreshReason, generation: number) => void>;
};

const sharedRefresh = new Map<string, SharedRefreshEntry>();

/**
 * One shared coordinator per workspace binding: every surface that renders the
 * directory shares the same triggers and bounded timer instead of arming its
 * own. The last unsubscriber stops the timer entirely.
 */
export function subscribeWorkspaceRefresh(
  binding: string,
  callback: (reason: RefreshReason, generation: number) => void,
): () => void {
  let entry = sharedRefresh.get(binding);
  if (!entry) {
    const subscribers = new Set<(reason: RefreshReason, generation: number) => void>();
    const coordinator = createWorkspaceRefreshCoordinator({
      refresh: (reason, generation) => {
        for (const subscriber of subscribers) subscriber(reason, generation);
      },
    });
    entry = { coordinator, subscribers };
    sharedRefresh.set(binding, entry);
    coordinator.start();
  }
  entry.subscribers.add(callback);
  return () => {
    const current = sharedRefresh.get(binding);
    if (!current) return;
    current.subscribers.delete(callback);
    if (current.subscribers.size === 0) {
      current.coordinator.stop();
      sharedRefresh.delete(binding);
    }
  };
}

export function workspaceRefreshGeneration(binding: string): number {
  return sharedRefresh.get(binding)?.coordinator.scope() ?? -1;
}

/** Stale-generation guard for scheduled refresh completions. */
export function coordinatorScopeIsCurrent(binding: string, generation: number): boolean {
  const entry = sharedRefresh.get(binding);
  return !entry || entry.coordinator.isCurrent(generation);
}

/**
 * Explicit refresh request from a relevant mutation (or a test): runs the
 * shared subscribers now with the current scope generation. Event-driven
 * triggers stay coalesced; this direct request is immediate.
 */
export function requestWorkspaceRefresh(binding: string, reason: RefreshReason = "manual"): void {
  const entry = sharedRefresh.get(binding);
  if (!entry) return;
  const generation = entry.coordinator.scope();
  for (const subscriber of [...entry.subscribers]) subscriber(reason, generation);
}
