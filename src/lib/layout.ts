export type PresetId = 'tiktok' | 'ig-portrait' | 'square';
export interface Insets { top: number; bottom: number; left: number; right: number }
export interface PlatformPreset {
  id: PresetId; label: string; hint: string; width: number; height: number;
  safe: Insets; baseFontPx: number; minFontPx: number;
}
export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }
export const ZONES = ['top', 'center', 'bottom'] as const;
export type Zone = (typeof ZONES)[number];
export type Tone = 'light' | 'dark';
export type ScrimAdjust = 'auto' | 'lighter' | 'stronger';
export interface LumaGrid { w: number; h: number; data: Float32Array }

export const PRESETS: Record<PresetId, PlatformPreset> = {
  tiktok: {
    id: 'tiktok', label: 'TikTok / Reels 9:16', hint: 'TikTok, Instagram Reels & Stories',
    width: 1080, height: 1920, safe: { top: 300, bottom: 420, left: 130, right: 130 }, baseFontPx: 62, minFontPx: 40,
  },
  'ig-portrait': {
    id: 'ig-portrait', label: 'Instagram 4:5', hint: 'Instagram feed',
    width: 1080, height: 1350, safe: { top: 80, bottom: 80, left: 80, right: 80 }, baseFontPx: 56, minFontPx: 38,
  },
  square: {
    id: 'square', label: 'Square 1:1', hint: 'Instagram feed / carousel, Pinterest',
    width: 1080, height: 1080, safe: { top: 80, bottom: 80, left: 80, right: 80 }, baseFontPx: 52, minFontPx: 36,
  },
};
export const PRESET_ORDER: PresetId[] = ['tiktok', 'ig-portrait', 'square'];
export const DEFAULT_FOCAL: Point = { x: 0.5, y: 0.42 };
export const BAND_FRACTION = 0.38;
const BUSYNESS_GAIN = 6;
const FOCAL_PENALTY = 0.2;
const SUGGESTION_TOLERANCE = 0.15;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Cover-fit crop window (in source pixels) centred on the focal point, clamped to the image. */
export function computeCropRect(srcW: number, srcH: number, dstW: number, dstH: number, focal: Point = DEFAULT_FOCAL): Rect {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const w = dstW / scale;
  const h = dstH / scale;
  return {
    x: clamp(focal.x * srcW - w / 2, 0, srcW - w),
    y: clamp(focal.y * srcH - h / 2, 0, srcH - h),
    w, h,
  };
}

export function safeRect(p: PlatformPreset): Rect {
  return { x: p.safe.left, y: p.safe.top, w: p.width - p.safe.left - p.safe.right, h: p.height - p.safe.top - p.safe.bottom };
}

export function zoneBand(p: PlatformPreset, zone: Zone): Rect {
  const s = safeRect(p);
  const h = Math.round(s.h * BAND_FRACTION);
  const y = zone === 'top' ? s.y : zone === 'bottom' ? s.y + s.h - h : s.y + Math.round((s.h - h) / 2);
  return { x: s.x, y, w: s.w, h };
}

/** Output-canvas rect → the source-pixel rect it shows, given the crop window. */
export function outputRectToSource(rect: Rect, crop: Rect, dstW: number, dstH: number): Rect {
  const sx = crop.w / dstW;
  const sy = crop.h / dstH;
  const round = (v: number) => Math.round(v * 1e12) / 1e12;
  return { x: round(crop.x + rect.x * sx), y: round(crop.y + rect.y * sy), w: round(rect.w * sx), h: round(rect.h * sy) };
}

export function sourcePointToOutput(focal: Point, crop: Rect, srcW: number, srcH: number, dstW: number, dstH: number): Point {
  return { x: ((focal.x * srcW - crop.x) / crop.w) * dstW, y: ((focal.y * srcH - crop.y) / crop.h) * dstH };
}

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Mean luminance and "busyness" (mean |Δ| between neighbouring cells, ×6, clamped 0–1) of a source region. */
export function regionStats(grid: LumaGrid, region: Rect, srcW: number, srcH: number): { mean: number; busyness: number } {
  const x0 = clamp(Math.floor((region.x / srcW) * grid.w), 0, grid.w - 1);
  const y0 = clamp(Math.floor((region.y / srcH) * grid.h), 0, grid.h - 1);
  const x1 = clamp(Math.ceil(((region.x + region.w) / srcW) * grid.w), x0 + 1, grid.w);
  const y1 = clamp(Math.ceil(((region.y + region.h) / srcH) * grid.h), y0 + 1, grid.h);
  let sum = 0, n = 0, diff = 0, pairs = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = grid.data[y * grid.w + x];
      sum += v; n++;
      if (x + 1 < x1) { diff += Math.abs(v - grid.data[y * grid.w + x + 1]); pairs++; }
      if (y + 1 < y1) { diff += Math.abs(v - grid.data[(y + 1) * grid.w + x]); pairs++; }
    }
  }
  const mean = n ? sum / n : 0;
  const busyness = pairs ? clamp((diff / pairs) * BUSYNESS_GAIN, 0, 1) : 0;
  return { mean, busyness };
}

export function scoreZones(a: { grid: LumaGrid; srcW: number; srcH: number; crop: Rect; preset: PlatformPreset; focal: Point }): Record<Zone, number> {
  const focalOut = sourcePointToOutput(a.focal, a.crop, a.srcW, a.srcH, a.preset.width, a.preset.height);
  const out = { top: 0, center: 0, bottom: 0 };
  for (const z of ZONES) {
    const band = zoneBand(a.preset, z);
    const stats = regionStats(a.grid, outputRectToSource(band, a.crop, a.preset.width, a.preset.height), a.srcW, a.srcH);
    out[z] = stats.busyness + (pointInRect(focalOut, band) ? FOCAL_PENALTY : 0);
  }
  return out;
}

/** Lowest score wins, unless Claude's suggestion is within tolerance of it. */
export function chooseZone(scores: Record<Zone, number>, suggested: Zone): Zone {
  const best = ZONES.reduce((a, b) => (scores[b] < scores[a] ? b : a));
  return scores[suggested] - scores[best] > SUGGESTION_TOLERANCE ? best : suggested;
}

// ---------- text fitting ----------
export type Measure = (text: string, px: number) => number;
export interface FitArgs {
  lines: string[]; quote: string; maxWidth: number; maxHeight: number;
  basePx: number; minPx: number; lineHeight: number; maxLines: number; measure: Measure;
}
const SUGGESTED_FLOOR = 0.78;
const FIT_STEP = 2;

export function wrapWords(text: string, px: number, maxWidth: number, measure: Measure): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (!cur || measure(candidate, px) <= maxWidth) cur = candidate;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function fitText(a: FitArgs): { fontPx: number; lines: string[] } {
  const fits = (lines: string[], px: number) =>
    lines.length > 0 && lines.length <= a.maxLines &&
    lines.every((l) => a.measure(l, px) <= a.maxWidth) &&
    lines.length * px * a.lineHeight <= a.maxHeight;
  const floor = Math.max(a.minPx, Math.round(a.basePx * SUGGESTED_FLOOR));
  for (let px = a.basePx; px >= floor; px -= FIT_STEP) {
    if (fits(a.lines, px)) return { fontPx: px, lines: a.lines };
  }
  for (let px = a.basePx; px >= a.minPx; px -= FIT_STEP) {
    const lines = wrapWords(a.quote, px, a.maxWidth, a.measure);
    if (fits(lines, px)) return { fontPx: px, lines };
  }
  return { fontPx: a.minPx, lines: wrapWords(a.quote, a.minPx, a.maxWidth, a.measure) };
}

// ---------- contrast & tone ----------
export const TONES: Record<Tone, { text: string; textLuma: number; scrim: string; scrimLuma: number; shadow: boolean }> = {
  light: { text: '#FAF7F2', textLuma: 0.93, scrim: '#000000', scrimLuma: 0, shadow: true },
  dark: { text: '#1E1B18', textLuma: 0.012, scrim: '#F5EEE6', scrimLuma: 0.86, shadow: false },
};
const CONTRAST_TARGET = 4.5;
const LIGHTER_TARGET = 3.5;
const OPACITY_STEP = 0.05;
const OPACITY_CAP = 0.75;
const FLIP_IF_ABOVE = 0.6;
const FLIP_IF_OTHER_BELOW = 0.4;

const round2 = (v: number) => Math.round(v * 100) / 100;

export function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function blendLuma(bg: number, overlay: number, alpha: number): number {
  return bg * (1 - alpha) + overlay * alpha;
}

/** Smallest opacity ≥ start (in `step`s) at which text reaches `target` contrast over the scrimmed zone; `cap` if never. */
export function scrimOpacityFor(a: { zoneLuma: number; textLuma: number; scrimLuma: number; start: number; step?: number; cap?: number; target?: number }): number {
  const step = a.step ?? OPACITY_STEP, cap = a.cap ?? OPACITY_CAP, target = a.target ?? CONTRAST_TARGET;
  for (let o = a.start; o <= cap + 1e-9; o += step) {
    if (contrastRatio(blendLuma(a.zoneLuma, a.scrimLuma, o), a.textLuma) >= target) return round2(o);
  }
  return cap;
}

export function baseScrimOpacity(busyness: number, adjust: ScrimAdjust): number {
  const delta = adjust === 'lighter' ? -0.12 : adjust === 'stronger' ? 0.15 : 0;
  return round2(clamp(0.18 + busyness * 0.5 + delta, 0.06, OPACITY_CAP));
}

export function chooseTone(a: { zoneLuma: number; busyness: number; suggested: Tone; adjust: ScrimAdjust }): { tone: Tone; opacity: number } {
  const start = baseScrimOpacity(a.busyness, a.adjust);
  const target = a.adjust === 'lighter' ? LIGHTER_TARGET : CONTRAST_TARGET;
  const need = (t: Tone) => scrimOpacityFor({ zoneLuma: a.zoneLuma, textLuma: TONES[t].textLuma, scrimLuma: TONES[t].scrimLuma, start, target });
  const other: Tone = a.suggested === 'light' ? 'dark' : 'light';
  const s = need(a.suggested);
  const o = need(other);
  return s > FLIP_IF_ABOVE && o <= FLIP_IF_OTHER_BELOW ? { tone: other, opacity: o } : { tone: a.suggested, opacity: s };
}
