import type { StylePreset } from './schema';

export interface FontSpec {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** Multiplier on the preset's base font size. */
  scale: number;
  uppercase: boolean;
  letterSpacingEm: number;
  lineHeight: number;
  /** Draw a large decorative open quote above the block. */
  quoteMark: boolean;
}

// Families must match the Google Fonts <link> in index.html.
export const FONT_PRESETS: Record<StylePreset, FontSpec> = {
  editorial: { family: 'Playfair Display', weight: 500, style: 'italic', scale: 1, uppercase: false, letterSpacingEm: 0, lineHeight: 1.3, quoteMark: false },
  serif: { family: 'Cormorant Garamond', weight: 500, style: 'normal', scale: 1.12, uppercase: false, letterSpacingEm: 0, lineHeight: 1.25, quoteMark: true },
  typewriter: { family: 'Courier Prime', weight: 400, style: 'normal', scale: 0.86, uppercase: false, letterSpacingEm: 0, lineHeight: 1.4, quoteMark: false },
  handwritten: { family: 'Caveat', weight: 600, style: 'normal', scale: 1.22, uppercase: false, letterSpacingEm: 0, lineHeight: 1.2, quoteMark: false },
  minimal: { family: 'Manrope', weight: 400, style: 'normal', scale: 0.72, uppercase: true, letterSpacingEm: 0.12, lineHeight: 1.45, quoteMark: false },
};

export const ATTRIBUTION_FONT: FontSpec = { family: 'Manrope', weight: 500, style: 'normal', scale: 1, uppercase: true, letterSpacingEm: 0.18, lineHeight: 1, quoteMark: false };

export function cssFont(spec: FontSpec, px: number): string {
  return `${spec.style} ${spec.weight} ${px}px "${spec.family}"`;
}

/** Canvas silently falls back to a system font unless the face is loaded first. */
export async function ensureFontsLoaded(specs: FontSpec[]): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await document.fonts.ready;
  await Promise.all(
    specs.map((s) =>
      document.fonts.load(cssFont(s, 40)).catch(() => {
        console.warn(`Font failed to load, falling back: ${s.family}`);
      }),
    ),
  );
}
