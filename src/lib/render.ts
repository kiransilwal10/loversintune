import {
  ZONES, DEFAULT_FOCAL, TONES, computeCropRect, safeRect, zoneBand, scoreZones, chooseZone,
  outputRectToSource, regionStats, chooseTone, fitText,
  type PlatformPreset, type Zone, type Rect, type ScrimAdjust,
} from './layout';
import { FONT_PRESETS, ATTRIBUTION_FONT, cssFont, ensureFontsLoaded } from './fonts';
import type { PreparedImage } from './imagePrep';
import type { Analysis, StylePreset } from './schema';

export interface RenderOptions {
  preset: PlatformPreset;
  style: StylePreset;
  zone: Zone | 'auto';
  sizeScale: number;
  scrimAdjust: ScrimAdjust;
  attribution: string | null;
  guides?: boolean;
}
export interface RenderInput {
  image: PreparedImage;
  analysis: Analysis | null;
  lines: string[];
  quote: string;
}

export const MAX_LINES = 6;
const VIGNETTE_ALPHA = 0.08;
const SCRIM_BLEED = 0.5;       // gradient extends this × block height above and below the text
const MIN_FONT_FACTOR = 0.9;   // style scale applies to the minimum size too, slightly relaxed

export async function renderPoster(input: RenderInput, opts: RenderOptions): Promise<HTMLCanvasElement> {
  const { preset } = opts;
  const { width: W, height: H } = preset;
  const spec = FONT_PRESETS[opts.style];
  await ensureFontsLoaded([spec, ATTRIBUTION_FONT]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = input.image;
  const focal = input.analysis?.focal_point ?? DEFAULT_FOCAL;

  // 1. photo, cover-cropped around the focal point
  const crop = computeCropRect(img.width, img.height, W, H, focal);
  ctx.drawImage(img.bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);

  // 2. soft vignette for cohesion
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,0,${VIGNETTE_ALPHA})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // 3. where the text goes
  const scores = scoreZones({ grid: img.luma, srcW: img.width, srcH: img.height, crop, preset, focal });
  const zone: Zone = opts.zone === 'auto' ? chooseZone(scores, input.analysis?.text_zone ?? 'center') : opts.zone;
  const band = zoneBand(preset, zone);
  const safe = safeRect(preset);

  // 4. fit the text
  const transform = (s: string) => (spec.uppercase ? s.toUpperCase() : s);
  const measure = (text: string, px: number) => {
    ctx.font = cssFont(spec, px);
    setLetterSpacing(ctx, spec.letterSpacingEm, px);
    return ctx.measureText(transform(text)).width;
  };
  const fit = fitText({
    lines: input.lines, quote: input.quote, maxWidth: safe.w, maxHeight: band.h,
    basePx: Math.round(preset.baseFontPx * spec.scale * opts.sizeScale),
    minPx: Math.round(preset.minFontPx * spec.scale * MIN_FONT_FACTOR),
    lineHeight: spec.lineHeight, maxLines: MAX_LINES, measure,
  });
  const px = fit.fontPx;
  const lh = px * spec.lineHeight;
  const blockH = fit.lines.length * lh;
  const attribPx = opts.attribution ? Math.max(20, Math.round(px * 0.36)) : 0;
  const attribH = opts.attribution ? attribPx * 2.2 : 0;
  const totalH = blockH + attribH;
  const blockTop = zone === 'top' ? band.y : zone === 'bottom' ? band.y + band.h - totalH : band.y + (band.h - totalH) / 2;
  const block: Rect = { x: safe.x, y: blockTop, w: safe.w, h: totalH };

  // 5. tone + scrim strength from the actual pixels under the block
  const stats = regionStats(img.luma, outputRectToSource(padY(block, px), crop, W, H), img.width, img.height);
  const { tone, opacity } = chooseTone({ zoneLuma: stats.mean, busyness: stats.busyness, suggested: input.analysis?.text_tone ?? 'light', adjust: opts.scrimAdjust });
  const T = TONES[tone];
  const gTop = block.y - blockH * SCRIM_BLEED;
  const gBot = block.y + block.h + blockH * SCRIM_BLEED;
  const rgb = hexToRgb(T.scrim);
  const sg = ctx.createLinearGradient(0, gTop, 0, gBot);
  sg.addColorStop(0, `rgba(${rgb},0)`);
  sg.addColorStop(0.3, `rgba(${rgb},${opacity})`);
  sg.addColorStop(0.7, `rgba(${rgb},${opacity})`);
  sg.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = sg;
  ctx.fillRect(0, gTop, W, gBot - gTop);

  // 6. text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = T.text;
  if (T.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 2; }
  const cx = W / 2;
  if (spec.quoteMark) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.font = cssFont(spec, px * 1.8);
    ctx.fillText('"', cx, block.y + px * 0.1);
    ctx.restore();
  }
  ctx.font = cssFont(spec, px);
  setLetterSpacing(ctx, spec.letterSpacingEm, px);
  let baseline = block.y + px * 0.8;
  for (const line of fit.lines) {
    ctx.fillText(transform(line), cx, baseline);
    baseline += lh;
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // 7. attribution line
  if (opts.attribution) {
    ctx.font = cssFont(ATTRIBUTION_FONT, attribPx);
    setLetterSpacing(ctx, ATTRIBUTION_FONT.letterSpacingEm, attribPx);
    ctx.globalAlpha = 0.75;
    ctx.fillText(opts.attribution.toUpperCase(), cx, block.y + blockH + attribPx * 1.6);
    ctx.globalAlpha = 1;
  }

  if (opts.guides) drawGuides(ctx, preset, zone, block, scores);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/jpeg' | 'image/png', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), type, quality);
  });
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, em: number, px: number): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${(em * px).toFixed(2)}px`;
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function padY(r: Rect, p: number): Rect {
  return { x: r.x, y: r.y - p, w: r.w, h: r.h + 2 * p };
}

function drawGuides(ctx: CanvasRenderingContext2D, preset: PlatformPreset, zone: Zone, block: Rect, scores: Record<Zone, number>): void {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 10]);
  const s = safeRect(preset);
  ctx.strokeStyle = 'rgba(0,255,180,0.9)';
  ctx.strokeRect(s.x, s.y, s.w, s.h);
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const z of ZONES) {
    const b = zoneBand(preset, z);
    ctx.strokeStyle = z === zone ? 'rgba(255,80,120,0.95)' : 'rgba(255,255,255,0.55)';
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(`${z} ${scores[z].toFixed(2)}`, b.x + 8, b.y + 26);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,220,0,0.9)';
  ctx.strokeRect(block.x, block.y, block.w, block.h);
  ctx.restore();
}
