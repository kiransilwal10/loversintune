import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, EXEMPLARS, buildUserPrompt } from '../src/lib/prompt';
import { MOODS } from '../src/lib/schema';

const ctx = { handle: '@loversintune', appName: 'Lovers in Tune', ctaStyle: 'soft' as const, moodEmphasis: 'balanced' as const };

describe('SYSTEM_PROMPT', () => {
  it('is long, stable and free of volatile content', () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(3000);
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(SYSTEM_PROMPT).toContain('at most 16 words');
    expect(SYSTEM_PROMPT).toContain('best_variant_id');
  });
  it('includes every exemplar as a style anchor', () => {
    for (const list of Object.values(EXEMPLARS)) for (const q of list) expect(SYSTEM_PROMPT).toContain(q);
  });
});

describe('EXEMPLARS', () => {
  it('cover every mood with short, emoji-free, quote-free lines', () => {
    for (const mood of MOODS) {
      expect(EXEMPLARS[mood].length).toBeGreaterThanOrEqual(3);
      for (const q of EXEMPLARS[mood]) {
        expect(q.split(/\s+/).length).toBeLessThanOrEqual(16);
        expect(q).not.toMatch(/["""“”]/);
        expect(q).not.toMatch(/\p{Extended_Pictographic}/u);
      }
    }
  });
});

describe('buildUserPrompt', () => {
  it('carries the brand context and emphasis', () => {
    const p = buildUserPrompt({ ...ctx, handle: '@x', appName: 'X App', ctaStyle: 'brand', moodEmphasis: 'sad' });
    expect(p).toContain('@x');
    expect(p).toContain('X App');
    expect(p).toContain('sad and longing');
    expect(p).toMatch(/CTA style: brand/);
  });
  it('lists quotes to avoid on regenerate, and omits the section otherwise', () => {
    expect(buildUserPrompt(ctx)).not.toContain('Do not reuse');
    const p = buildUserPrompt({ ...ctx, avoid: ['the rain still sounds like your name'] });
    expect(p).toContain('Do not reuse');
    expect(p).toContain('- the rain still sounds like your name');
  });
});
