import { describe, it, expect } from 'vitest';
import { wrapWords, fitText, contrastRatio, scrimOpacityFor, chooseTone } from '../src/lib/layout';

// Fake measurer: every glyph is half an em wide.
const measure = (text: string, px: number) => text.length * px * 0.5;
const base = { maxWidth: 400, maxHeight: 600, basePx: 60, minPx: 40, lineHeight: 1.3, maxLines: 6, measure };

describe('wrapWords', () => {
  it('wraps at the max width', () => {
    expect(wrapWords('a bb ccc dddd', 10, 30, measure)).toEqual(['a bb', 'ccc', 'dddd']);
  });
  it('never drops a word that is too long on its own', () => {
    expect(wrapWords('supercalifragilistic', 10, 30, measure)).toEqual(['supercalifragilistic']);
  });
});

describe('fitText', () => {
  it('keeps the suggested lines when they fit at the base size', () => {
    const r = fitText({ ...base, lines: ['one umbrella', 'and the city'], quote: 'one umbrella and the city' });
    expect(r).toEqual({ fontPx: 60, lines: ['one umbrella', 'and the city'] });
  });
  it('shrinks a little to keep the suggested breaks', () => {
    const r = fitText({ ...base, lines: ['one umbrella and', 'the whole city'], quote: 'one umbrella and the whole city' });
    expect(r).toEqual({ fontPx: 50, lines: ['one umbrella and', 'the whole city'] });
  });
  it('re-wraps by words at full size instead of forcing a tiny font', () => {
    const quote = 'a very long single line of text';
    const r = fitText({ ...base, minPx: 20, lines: [quote], quote });
    expect(r).toEqual({ fontPx: 60, lines: ['a very long', 'single line', 'of text'] });
  });
  it('shrinks until the wrapped text respects maxLines', () => {
    const quote = 'aa bb cc dd ee ff gg hh';
    const r = fitText({ ...base, maxWidth: 100, lines: [], quote });
    expect(r.fontPx).toBe(40);
    expect(r.lines).toHaveLength(4);
  });
  it('falls back to the minimum size with word wrapping when nothing fits', () => {
    const quote = 'aa bb cc dd ee ff gg hh';
    const r = fitText({ ...base, maxWidth: 50, lines: [], quote });
    expect(r.fontPx).toBe(40);
    expect(r.lines).toHaveLength(8);
  });
});

describe('contrast helpers', () => {
  it('contrastRatio is symmetric and 21 for black on white', () => {
    expect(contrastRatio(1, 0)).toBeCloseTo(21);
    expect(contrastRatio(0, 1)).toBeCloseTo(21);
  });
  it('returns the start opacity when contrast is already fine', () => {
    expect(scrimOpacityFor({ zoneLuma: 0.05, textLuma: 0.93, scrimLuma: 0, start: 0.18 })).toBe(0.18);
  });
  it('raises opacity in 0.05 steps until 4.5:1', () => {
    expect(scrimOpacityFor({ zoneLuma: 0.3, textLuma: 0.93, scrimLuma: 0, start: 0.18 })).toBeCloseTo(0.48, 2);
  });
  it('caps at 0.75 when the target is unreachable', () => {
    expect(scrimOpacityFor({ zoneLuma: 0.9, textLuma: 0.93, scrimLuma: 0, start: 0.18 })).toBe(0.75);
  });
});

describe('chooseTone', () => {
  it('keeps the suggested tone when it works', () => {
    const r = chooseTone({ zoneLuma: 0.1, busyness: 0.2, suggested: 'light', adjust: 'auto' });
    expect(r.tone).toBe('light');
    expect(r.opacity).toBeCloseTo(0.28, 2);
  });
  it('flips to dark text on a bright photo where light text cannot reach contrast', () => {
    expect(chooseTone({ zoneLuma: 0.85, busyness: 0.1, suggested: 'light', adjust: 'auto' }).tone).toBe('dark');
  });
  it('"stronger" raises the starting opacity by 0.15', () => {
    expect(chooseTone({ zoneLuma: 0.1, busyness: 0.2, suggested: 'light', adjust: 'stronger' }).opacity).toBeCloseTo(0.43, 2);
  });
});
