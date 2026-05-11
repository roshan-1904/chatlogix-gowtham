/**
 * Tiny in-process semaphore for bounded-concurrency page extraction.
 * Plain FIFO — no priority, no weighted tickets. Keeps it under 30 lines and
 * dependency-free.
 */
export class Semaphore {
  private available: number;
  private waiters: Array<() => void> = [];

  constructor(limit: number) {
    if (limit < 1) throw new Error('Semaphore limit must be >= 1');
    this.available = limit;
  }

  private acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.available += 1;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

export function allWithLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<Array<PromiseSettledResult<T>>> {
  const sem = new Semaphore(limit);
  return Promise.allSettled(tasks.map((t) => sem.run(t)));
}
