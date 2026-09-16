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
        queueMicrotask(() => {
          if (this.generation !== queuedGeneration) return;
          void this.run(queued.task, queued.force);
        });
      }
    };
    void pending.then(settled, settled);
    return pending;
  }

  invalidate(): void {
    this.generation += 1;
    this.queued = null;
  }
}
