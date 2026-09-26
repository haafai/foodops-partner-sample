export interface Scheduler {
  /** Run `fn` after `ms`. Returns a cancel function. */
  schedule(ms: number, fn: () => void): () => void;
}

/** Nothing fires until a test calls runNext(), so autopilot tests are deterministic. */
export class ManualScheduler implements Scheduler {
  readonly pending: Array<{ ms: number; fn: () => void; cancelled: boolean }> = [];

  schedule(ms: number, fn: () => void): () => void {
    const entry = { ms, fn, cancelled: false };
    this.pending.push(entry);
    return () => { entry.cancelled = true; };
  }

  /** Runs the oldest live callback. False when nothing is pending. */
  runNext(): boolean {
    while (this.pending.length > 0) {
      const entry = this.pending.shift()!;
      if (!entry.cancelled) {
        entry.fn();
        return true;
      }
    }
    return false;
  }
}
