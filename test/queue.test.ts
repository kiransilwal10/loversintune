import { describe, it, expect } from 'vitest';
import { createQueue } from '../src/lib/queue';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createQueue', () => {
  it('runs at most `limit` jobs at once and starts the next when one finishes', async () => {
    const q = createQueue(2);
    const started: number[] = [];
    const ds = [deferred<number>(), deferred<number>(), deferred<number>()];
    const tasks = ds.map((d, i) => q.add(async () => { started.push(i); return d.promise; }));
    expect(started).toEqual([0, 1]);
    expect(q.active).toBe(2);
    expect(q.pending).toBe(1);
    ds[0].resolve(0);
    await tasks[0].promise;
    await tick();
    expect(started).toEqual([0, 1, 2]);
    ds[1].resolve(1);
    ds[2].resolve(2);
    await expect(Promise.all(tasks.map((t) => t.promise))).resolves.toEqual([0, 1, 2]);
    expect(q.active).toBe(0);
  });
  it('cancelling a queued job rejects it and never starts it', async () => {
    const q = createQueue(1);
    const d = deferred<void>();
    let ran = false;
    q.add(() => d.promise);
    const t = q.add(async () => { ran = true; });
    t.cancel();
    await expect(t.promise).rejects.toMatchObject({ name: 'AbortError' });
    d.resolve();
    await tick();
    expect(ran).toBe(false);
    expect(q.pending).toBe(0);
  });
  it('cancelling a running job aborts its signal', async () => {
    const q = createQueue(1);
    let sig: AbortSignal | undefined;
    const t = q.add((signal) => {
      sig = signal;
      return new Promise<void>((_, rej) => signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))));
    });
    t.cancel();
    expect(sig?.aborted).toBe(true);
    await expect(t.promise).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('keeps going after a job fails', async () => {
    const q = createQueue(1);
    const failing = q.add(async () => { throw new Error('nope'); });
    const ok = q.add(async () => 'fine');
    await expect(failing.promise).rejects.toThrow('nope');
    await expect(ok.promise).resolves.toBe('fine');
  });
});
