export type SaveDrainContext = {
  readonly force: boolean;
  readonly isCurrent: () => boolean;
};

export type SaveDrainTask = (context: SaveDrainContext) => Promise<void>;

/**
 * Coalesces draft persistence into one active request plus one latest-state
 * follow-up. A late response cannot settle state after invalidate().
 */
export class SessionSaveDrain {
  private active: Promise<void> | null = null;
  private generation = 0;
  private queued: { force: boolean; task: SaveDrainTask } | null = null;
  private scheduled = 0;
  private idleWaiters = new Set<() => void>();

  /** Wait for active requests and every coalesced follow-up, including the
   * microtask between them. This is a completion barrier, not a write lock.
   * Callers must also prevent new saves while starting their next operation.
   */
  whenIdle(): Promise<void> {
    if (!this.active && !this.queued && this.scheduled === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  private resolveIdle(): void {
    if (this.active || this.queued || this.scheduled !== 0) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }

  run(task: SaveDrainTask, force = false): Promise<void> {
    if (this.active) {
      this.queued = {
        force: force || (this.queued?.force ?? false),
        task,
      };
      return this.active;
    }

    const generation = ++this.generation;
    const pending = task({
      force,
      isCurrent: () => this.generation === generation,
    });
    this.active = pending;
    const settled = () => {
      if (this.active !== pending) return;
      this.active = null;
      const queued = this.queued;
      this.queued = null;
      if (queued) {
        const queuedGeneration = this.generation;
        this.scheduled += 1;
        queueMicrotask(() => {
          this.scheduled -= 1;
          if (this.generation === queuedGeneration) {
            void this.run(queued.task, queued.force);
          }
          this.resolveIdle();
        });
      }
      this.resolveIdle();
    };
    void pending.then(settled, settled);
    return pending;
  }

  invalidate(): void {
    this.generation += 1;
    this.queued = null;
    this.resolveIdle();
  }
}
