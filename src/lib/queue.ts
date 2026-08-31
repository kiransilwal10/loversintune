export interface QueuedTask<T> { promise: Promise<T>; cancel: () => void }
export interface Queue {
  add<T>(job: (signal: AbortSignal) => Promise<T>): QueuedTask<T>;
  readonly active: number;
  readonly pending: number;
}

interface Entry { controller: AbortController; start: () => void }

export function createQueue(limit: number): Queue {
  const waiting: Entry[] = [];
  let active = 0;

  const pump = () => {
    while (active < limit && waiting.length) {
      const next = waiting.shift()!;
      active++;
      next.start();
    }
  };

  return {
    add<T>(job: (signal: AbortSignal) => Promise<T>): QueuedTask<T> {
      const controller = new AbortController();
      let started = false;
      let rejectQueued: (e: unknown) => void = () => {};
      const promise = new Promise<T>((resolve, reject) => {
        rejectQueued = reject;
        waiting.push({
          controller,
          start: () => {
            started = true;
            job(controller.signal)
              .finally(() => { active--; pump(); })
              .then(resolve, reject);
          },
        });
      });
      pump();
      const cancel = () => {
        if (started) { controller.abort(); return; }
        const i = waiting.findIndex((e) => e.controller === controller);
        if (i >= 0) waiting.splice(i, 1);
        rejectQueued(new DOMException('Cancelled before start', 'AbortError'));
      };
      return { promise, cancel };
    },
    get active() { return active; },
    get pending() { return waiting.length; },
  };
}
