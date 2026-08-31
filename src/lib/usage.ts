export interface UsageSummary { input: number; output: number; cacheRead: number; cacheWrite: number }

export const EMPTY_USAGE: UsageSummary = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** USD per 1M tokens for claude-opus-5 (input, output, cache read, cache write). */
const RATES = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 };

export function addUsage(a: UsageSummary, b: UsageSummary): UsageSummary {
  return { input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite };
}

export function estimateCostUsd(u: UsageSummary): number {
  return (u.input * RATES.input + u.output * RATES.output + u.cacheRead * RATES.cacheRead + u.cacheWrite * RATES.cacheWrite) / 1_000_000;
}
