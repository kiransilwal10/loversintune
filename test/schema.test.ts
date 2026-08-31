import { describe, it, expect } from 'vitest';
import fixture from './fixtures/sample-result.json';
import { normalizeResult, cleanQuote, MOODS } from '../src/lib/schema';

describe('normalizeResult', () => {
  it('accepts the fixture as-is', () => {
    const r = normalizeResult(fixture);
    expect(r.variants).toHaveLength(6);
    expect(r.best_variant_id).toBe('v1');
    expect(r.variants.every((v) => MOODS.includes(v.mood))).toBe(true);
  });
  it('reassigns ids v1..v6 and keeps best pointing at the same variant', () => {
    const raw = { ...fixture, variants: fixture.variants.map((v) => ({ ...v, id: 'x' })), best_variant_id: 'x' };
    const r = normalizeResult(raw);
    expect(r.variants.map((v) => v.id)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6']);
    expect(r.best_variant_id).toBe('v1');
  });
  it('falls back to the highest fit score when best_variant_id is unknown', () => {
    const raw = { ...fixture, best_variant_id: 'nope', variants: fixture.variants.map((v, i) => ({ ...v, fit_score: i === 3 ? 10 : 5 })) };
    expect(normalizeResult(raw).best_variant_id).toBe('v4');
  });
  it('strips quotation marks from quotes and lines', () => {
    const raw = { ...fixture, variants: fixture.variants.map((v) => ({ ...v, quote: `"${v.quote}"`, lines: v.lines.map((l) => `“${l}”`) })) };
    const r = normalizeResult(raw);
    expect(r.variants[0].quote).toBe(fixture.variants[0].quote);
    expect(r.variants[0].lines).toEqual(fixture.variants[0].lines);
  });
  it('clamps focal point and fit score', () => {
    const raw = { ...fixture, analysis: { ...fixture.analysis, focal_point: { x: 1.7, y: -0.2 } }, variants: fixture.variants.map((v) => ({ ...v, fit_score: 14 })) };
    const r = normalizeResult(raw);
    expect(r.analysis.focal_point).toEqual({ x: 1, y: 0 });
    expect(r.variants[0].fit_score).toBe(10);
  });
  it('uses the quote as a single line when lines are empty', () => {
    const raw = { ...fixture, variants: fixture.variants.map((v) => ({ ...v, lines: [] })) };
    expect(normalizeResult(raw).variants[0].lines).toEqual([fixture.variants[0].quote]);
  });
  it('rejects a wrong shape and too few variants', () => {
    expect(() => normalizeResult({ hello: 1 })).toThrow();
    expect(() => normalizeResult({ ...fixture, variants: fixture.variants.slice(0, 2) })).toThrow(/variants/);
  });
});

describe('cleanQuote', () => {
  it('removes quotation marks and collapses whitespace', () => {
    expect(cleanQuote('  “hello   there” ')).toBe('hello there');
  });
});
