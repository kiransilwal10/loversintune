import { describe, it, expect } from 'vitest';
import { estimateCostUsd, addUsage, EMPTY_USAGE } from '../src/lib/usage';

describe('usage', () => {
  it('estimateCostUsd uses Claude Opus 5 rates', () => {
    expect(estimateCostUsd({ input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 })).toBe(5);
    expect(estimateCostUsd({ input: 0, output: 1_000_000, cacheRead: 0, cacheWrite: 0 })).toBe(25);
    expect(estimateCostUsd({ input: 1000, output: 2000, cacheRead: 3000, cacheWrite: 0 })).toBeCloseTo(0.0565, 4);
    expect(estimateCostUsd({ input: 0, output: 0, cacheRead: 0, cacheWrite: 1_000_000 })).toBe(6.25);
  });
  it('addUsage sums every field', () => {
    expect(addUsage(EMPTY_USAGE, { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })).toEqual({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 });
    expect(addUsage({ input: 1, output: 1, cacheRead: 1, cacheWrite: 1 }, { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })).toEqual({ input: 2, output: 3, cacheRead: 4, cacheWrite: 5 });
  });
});
