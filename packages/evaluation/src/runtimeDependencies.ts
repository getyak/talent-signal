import { randomUUID } from "node:crypto";

export interface EvaluationClock {
  nowMs(): number;
  nowIso(): string;
}

export interface EvaluationIdGenerator {
  nextId(namespace?: string): string;
}

export type EvaluationTimerToken = string;

export interface EvaluationTimer {
  schedule(delayMs: number, callback: () => void | Promise<void>): EvaluationTimerToken;
  cancel(token: EvaluationTimerToken): boolean;
  sleep(delayMs: number): Promise<void>;
}

export interface EvaluationRuntimeDependencies {
  clock: EvaluationClock;
  ids: EvaluationIdGenerator;
  timer: EvaluationTimer;
}

export class SystemEvaluationClock implements EvaluationClock {
  public nowMs(): number {
    return Date.now();
  }

  public nowIso(): string {
    return new Date(this.nowMs()).toISOString();
  }
}

export class FixedEvaluationClock implements EvaluationClock {
  #currentMs: number;

  public constructor(startMs: number) {
    if (!Number.isFinite(startMs)) throw new Error("FixedEvaluationClock start must be finite");
    this.#currentMs = startMs;
  }

  public nowMs(): number {
    return this.#currentMs;
  }

  public nowIso(): string {
    return new Date(this.#currentMs).toISOString();
  }

  public advanceBy(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error("Clock duration must be finite and non-negative");
    this.#currentMs += durationMs;
  }

  public advanceTo(timestampMs: number): void {
    if (!Number.isFinite(timestampMs) || timestampMs < this.#currentMs) {
      throw new Error("Clock cannot move backwards");
    }
    this.#currentMs = timestampMs;
  }
}

export class SystemEvaluationIdGenerator implements EvaluationIdGenerator {
  public nextId(namespace = "id"): string {
    return `${namespace}_${randomUUID()}`;
  }
}

export class SequenceEvaluationIdGenerator implements EvaluationIdGenerator {
  #nextValue: number;

  public constructor(startAt = 1) {
    if (!Number.isInteger(startAt) || startAt < 0) throw new Error("ID sequence start must be a non-negative integer");
    this.#nextValue = startAt;
  }

  public nextId(namespace = "id"): string {
    const value = this.#nextValue;
    this.#nextValue += 1;
    return `${namespace}_${value.toString().padStart(8, "0")}`;
  }
}

export class SystemEvaluationTimer implements EvaluationTimer {
  readonly #ids: EvaluationIdGenerator;
  readonly #handles = new Map<EvaluationTimerToken, ReturnType<typeof setTimeout>>();

  public constructor(ids: EvaluationIdGenerator = new SystemEvaluationIdGenerator()) {
    this.#ids = ids;
  }

  public schedule(delayMs: number, callback: () => void | Promise<void>): EvaluationTimerToken {
    ensureDelay(delayMs);
    const token = this.#ids.nextId("timer");
    const handle = setTimeout(() => {
      this.#handles.delete(token);
      void callback();
    }, delayMs);
    this.#handles.set(token, handle);
    return token;
  }

  public cancel(token: EvaluationTimerToken): boolean {
    const handle = this.#handles.get(token);
    if (handle === undefined) return false;
    clearTimeout(handle);
    this.#handles.delete(token);
    return true;
  }

  public sleep(delayMs: number): Promise<void> {
    ensureDelay(delayMs);
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}

interface ScheduledCallback {
  token: EvaluationTimerToken;
  dueAtMs: number;
  ordinal: number;
  callback: () => void | Promise<void>;
}

export class ControlledEvaluationTimer implements EvaluationTimer {
  readonly #clock: FixedEvaluationClock;
  readonly #ids: EvaluationIdGenerator;
  readonly #scheduled = new Map<EvaluationTimerToken, ScheduledCallback>();
  #ordinal = 0;

  public constructor(clock: FixedEvaluationClock, ids: EvaluationIdGenerator = new SequenceEvaluationIdGenerator()) {
    this.#clock = clock;
    this.#ids = ids;
  }

  public schedule(delayMs: number, callback: () => void | Promise<void>): EvaluationTimerToken {
    ensureDelay(delayMs);
    const token = this.#ids.nextId("timer");
    this.#scheduled.set(token, {
      token,
      dueAtMs: this.#clock.nowMs() + delayMs,
      ordinal: this.#ordinal,
      callback,
    });
    this.#ordinal += 1;
    return token;
  }

  public cancel(token: EvaluationTimerToken): boolean {
    return this.#scheduled.delete(token);
  }

  public sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      this.schedule(delayMs, resolve);
    });
  }

  public pendingCount(): number {
    return this.#scheduled.size;
  }

  public async advanceBy(durationMs: number): Promise<void> {
    ensureDelay(durationMs);
    const target = this.#clock.nowMs() + durationMs;
    while (true) {
      const next = [...this.#scheduled.values()]
        .filter((item) => item.dueAtMs <= target)
        .sort((left, right) => left.dueAtMs - right.dueAtMs || left.ordinal - right.ordinal)[0];
      if (next === undefined) break;
      this.#clock.advanceTo(next.dueAtMs);
      this.#scheduled.delete(next.token);
      await next.callback();
    }
    this.#clock.advanceTo(target);
  }
}

function ensureDelay(delayMs: number): void {
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("Timer delay must be finite and non-negative");
  }
}

export function createSystemRuntimeDependencies(): EvaluationRuntimeDependencies {
  const ids = new SystemEvaluationIdGenerator();
  return {
    clock: new SystemEvaluationClock(),
    ids,
    timer: new SystemEvaluationTimer(ids),
  };
}

export interface DeterministicRuntimeDependencies extends EvaluationRuntimeDependencies {
  clock: FixedEvaluationClock;
  ids: SequenceEvaluationIdGenerator;
  timer: ControlledEvaluationTimer;
}

export function createDeterministicRuntimeDependencies(
  startMs: number,
  firstId = 1,
): DeterministicRuntimeDependencies {
  const clock = new FixedEvaluationClock(startMs);
  const ids = new SequenceEvaluationIdGenerator(firstId);
  const timer = new ControlledEvaluationTimer(clock, ids);
  return { clock, ids, timer };
}
