import { z } from 'zod';
import { ZONES } from './layout';

export const MOODS = ['sad', 'longing', 'flirty', 'soft', 'playful', 'devoted', 'spicy'] as const;
export type Mood = (typeof MOODS)[number];
export const STYLE_PRESETS = ['editorial', 'serif', 'typewriter', 'handwritten', 'minimal'] as const;
export type StylePreset = (typeof STYLE_PRESETS)[number];

export const AnalysisSchema = z.object({
  subject: z.string().describe('What is literally in the frame, one specific phrase'),
  setting: z.string().describe('Where and when'),
  mood_words: z.array(z.string()).describe('3 to 6 words'),
  palette: z.object({
    dominant_hex: z.array(z.string()).describe('2 to 5 hex colors like #1a1a2e'),
    is_dark: z.boolean(),
  }),
  focal_point: z.object({
    x: z.number().describe('0 to 1, fraction of width from the left'),
    y: z.number().describe('0 to 1, fraction of height from the top'),
  }),
  text_zone: z.enum(ZONES).describe('Band with the least detail where a quote sits naturally'),
  text_tone: z.enum(['light', 'dark']),
  vibe_summary: z.string(),
});

export const VariantSchema = z.object({
  id: z.string().describe('v1 to v6'),
  mood: z.enum(MOODS),
  quote: z.string().describe('At most 16 words, original, no emojis, no quotation marks'),
  lines: z.array(z.string()).describe('The quote split into 2 to 4 poster lines, every word kept in order'),
  fit_score: z.number().describe('1 to 10, how well the quote fits this exact photo'),
  why_it_fits: z.string(),
  style_preset: z.enum(STYLE_PRESETS),
  caption_tiktok: z.string(),
  caption_instagram: z.string(),
});

export const GenerationSchema = z.object({
  analysis: AnalysisSchema,
  variants: z.array(VariantSchema).describe('Exactly 6 variants'),
  best_variant_id: z.string(),
  alt_text: z.string(),
});

export type Analysis = z.infer<typeof AnalysisSchema>;
export type Variant = z.infer<typeof VariantSchema>;
export type GenerationResult = z.infer<typeof GenerationSchema>;

const MAX_VARIANTS = 6;
const MIN_VARIANTS = 3;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function cleanQuote(s: string): string {
  return s.replace(/["""„«»]/g, '').replace(/\s+/g, ' ').trim();
}

/** Validate Claude's JSON and repair the fuzzy bits. Throws if the result is unusable. */
export function normalizeResult(raw: unknown): GenerationResult {
  const r = GenerationSchema.parse(raw);
  const source = r.variants.filter((v) => cleanQuote(v.quote).length > 0).slice(0, MAX_VARIANTS);
  if (source.length < MIN_VARIANTS) throw new Error(`Expected 6 variants, got ${source.length}`);
  const variants: Variant[] = source.map((v, i) => {
    const quote = cleanQuote(v.quote);
    const lines = v.lines.map(cleanQuote).filter(Boolean);
    return { ...v, id: `v${i + 1}`, quote, lines: lines.length ? lines : [quote], fit_score: Math.min(10, Math.max(1, Math.round(v.fit_score))) };
  });
  const bestIdx = source.findIndex((v) => v.id === r.best_variant_id);
  const best = bestIdx >= 0 ? variants[bestIdx] : [...variants].sort((a, b) => b.fit_score - a.fit_score)[0];
  return {
    ...r,
    analysis: { ...r.analysis, focal_point: { x: clamp01(r.analysis.focal_point.x), y: clamp01(r.analysis.focal_point.y) } },
    variants,
    best_variant_id: best.id,
  };
}
