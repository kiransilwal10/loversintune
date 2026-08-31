import { describe, it, expect } from 'vitest';
import { FONT_PRESETS, ATTRIBUTION_FONT, cssFont } from '../src/lib/fonts';
import { STYLE_PRESETS } from '../src/lib/schema';

describe('fonts', () => {
  it('formats a canvas font string', () => {
    expect(cssFont(FONT_PRESETS.editorial, 62)).toBe('italic 500 62px "Playfair Display"');
    expect(cssFont(ATTRIBUTION_FONT, 24)).toBe('normal 500 24px "Manrope"');
  });
  it('defines every style preset with sane metrics', () => {
    for (const id of STYLE_PRESETS) {
      const f = FONT_PRESETS[id];
      expect(f.scale).toBeGreaterThan(0.5);
      expect(f.lineHeight).toBeGreaterThanOrEqual(1.1);
      expect(f.family.length).toBeGreaterThan(0);
    }
    expect(FONT_PRESETS.minimal.uppercase).toBe(true);
    expect(FONT_PRESETS.serif.quoteMark).toBe(true);
  });
});
