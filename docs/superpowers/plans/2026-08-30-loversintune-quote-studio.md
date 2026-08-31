# Lovers in Tune Quote Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web app (GitHub Pages) where dropping aesthetic images yields couple-quote posters sized for TikTok and Instagram, with per-platform captions, quotes written by Claude from the image itself.

**Architecture:** Vite + React + TypeScript single-page app, no backend. Pure modules (`layout`, `schema`, `prompt`, `queue`, `download`, `settings`, `state/cards`) are unit-tested with Vitest; `imagePrep` and `render` use Canvas and are verified in Chrome via a fixture mode; `claude.ts` is the only module that touches the Anthropic SDK (browser mode, user's own key in localStorage).

**Tech Stack:** Node 22, Vite 8, React 19, TypeScript ~6.0, Vitest 4, `@anthropic-ai/sdk` ^0.122 with `zod` ^4, `jszip` ^3.10, Google Fonts, GitHub Actions → GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-30-loversintune-quote-studio-design.md`

## Global Constraints

- Model id is exactly `claude-opus-5`; refusal fallbacks on by default via `betas: ['server-side-fallback-2026-07-01']` + `fallbacks: 'default'`; `max_tokens: 16000`; effort from settings (`low`/`medium`/`high`, default `high`).
- The API key lives only in `localStorage["lit.settings.v1"]`; it must never appear in the repo, the build, or a URL.
- Output sizes are exact: `tiktok` 1080×1920, `ig-portrait` 1080×1350, `square` 1080×1080. TikTok safe insets top 300 / bottom 420 / sides 130; the other two 80 all around.
- Quote text on posters never contains emojis or quotation marks (enforced in `normalizeResult`).
- Vite `base` is `/loversintune/`; the site deploys to `https://kiransilwal10.github.io/loversintune/` (GitHub user `kiransilwal10`).
- Every commit message ends with the line `Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc`.
- Run `npm test` (Vitest) and `npm run build` (tsc + vite) before every commit; both must pass.
- Tests import from `../src/...`; test files live in `test/` and are named `*.test.ts`.

## File Structure

```
loversintune/
  package.json  tsconfig.json  vite.config.ts  index.html  README.md
  .github/workflows/deploy.yml
  src/
    main.tsx                 React entry
    App.tsx                  state wiring, processing pipeline, layout
    styles.css               all styling
    lib/
      layout.ts              presets, safe zones, crop, zone scoring, text fitting, contrast/tone (pure)
      schema.ts              Zod schema for Claude's JSON + normalizeResult (pure)
      prompt.ts              SYSTEM_PROMPT, exemplar quotes, buildUserPrompt (pure)
      settings.ts            Settings type, defaults, load/save (pure; storage injected)
      usage.ts               UsageSummary, addUsage, estimateCostUsd (pure)
      queue.ts               concurrency-limited job runner with cancel (pure)
      download.ts            slugify, filenames, captions markdown, zip, saveBlob
      labels.ts              UI labels for moods/styles/zones
      fonts.ts               font presets, cssFont, ensureFontsLoaded
      imagePrep.ts           File → PreparedImage (bitmap, API base64, luma grid)
      render.ts              renderPoster → canvas; canvasToBlob
      claude.ts              generateForImage via @anthropic-ai/sdk; mapError
      exporters.ts           renderForCard, downloadPoster, zips (glue over render/download)
    state/cards.ts           Card type, reducer, newCards, selectedVariant (pure)
    hooks/usePosterCanvas.ts renders the preview canvas into a container
    components/              Dropzone, PosterCard, VariantChips, PlatformTabs, StyleControls,
                             CaptionBox, SettingsDrawer, BatchBar, Toast
  test/                      Vitest specs + fixtures/sample-result.json
```

---

### Task 1: Project scaffold (Vite + React + TS + Vitest)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `test/smoke.test.ts`

**Interfaces:**
- Produces: `npm run dev`, `npm test`, `npm run build` scripts; `App` component export.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "loversintune",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit -p tsconfig.json && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.122.0",
    "jszip": "^3.10.1",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "zod": "^4.5.4"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.4",
    "@vitejs/plugin-react": "^6.1.0",
    "typescript": "~6.0.2",
    "vite": "^8.2.2",
    "vitest": "^4.1.11"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

- [ ] **Step 3: Write vite.config.ts, index.html, main.tsx, App.tsx, styles.css**

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/loversintune/',
  plugins: [react()],
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lovers in Tune · Quote Studio</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💌</text></svg>" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Cormorant+Garamond:wght@500&family=Courier+Prime&family=Manrope:wght@400;500&family=Playfair+Display:ital,wght@1,500&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx` (placeholder, replaced in Task 14):
```tsx
export function App() {
  return (
    <main className="app">
      <h1>Lovers in Tune · Quote Studio</h1>
    </main>
  );
}
```

`src/styles.css` (placeholder, replaced in Task 14):
```css
:root { --bg: #fbf7f3; --ink: #1e1b18; }
body { background: var(--bg); color: var(--ink); font-family: system-ui, sans-serif; margin: 0; }
```

- [ ] **Step 4: Write the smoke test**

`test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Install and verify**

Run: `npm install && npm test && npm run build`
Expected: install succeeds; Vitest reports `1 passed`; `vite build` writes `dist/index.html` and `dist/assets/*.js`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src test
git commit -m "chore: scaffold Vite + React + TypeScript + Vitest

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 2: Layout core — presets, safe zones, crop, zone scoring

**Files:**
- Create: `src/lib/layout.ts`
- Test: `test/layout.test.ts`

**Interfaces:**
- Produces (used by render, schema, settings, state, components):
  - `type PresetId = 'tiktok' | 'ig-portrait' | 'square'`, `interface PlatformPreset { id; label; hint; width; height; safe: Insets; baseFontPx; minFontPx }`, `PRESETS: Record<PresetId, PlatformPreset>`, `PRESET_ORDER: PresetId[]`
  - `interface Rect { x; y; w; h }`, `interface Point { x; y }`, `DEFAULT_FOCAL: Point`
  - `ZONES = ['top','center','bottom'] as const`, `type Zone`, `type Tone = 'light'|'dark'`, `type ScrimAdjust = 'auto'|'lighter'|'stronger'`
  - `interface LumaGrid { w: number; h: number; data: Float32Array }`
  - `clamp(v, lo, hi)`, `computeCropRect(srcW, srcH, dstW, dstH, focal?) → Rect` (source pixels), `safeRect(preset) → Rect`, `zoneBand(preset, zone) → Rect`, `outputRectToSource(rect, crop, dstW, dstH) → Rect`, `sourcePointToOutput(focal, crop, srcW, srcH, dstW, dstH) → Point`, `pointInRect(p, r)`, `regionStats(grid, regionInSourcePx, srcW, srcH) → { mean; busyness }`, `scoreZones({ grid, srcW, srcH, crop, preset, focal }) → Record<Zone, number>`, `chooseZone(scores, suggested) → Zone`

- [ ] **Step 1: Write the failing tests**

`test/layout.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  PRESETS, computeCropRect, safeRect, zoneBand, regionStats, scoreZones, chooseZone,
  outputRectToSource, type LumaGrid,
} from '../src/lib/layout';

const grid = (w: number, h: number, fn: (x: number, y: number) => number): LumaGrid => {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = fn(x, y);
  return { w, h, data };
};

describe('PRESETS', () => {
  it('have exact platform sizes', () => {
    expect([PRESETS.tiktok.width, PRESETS.tiktok.height]).toEqual([1080, 1920]);
    expect([PRESETS['ig-portrait'].width, PRESETS['ig-portrait'].height]).toEqual([1080, 1350]);
    expect([PRESETS.square.width, PRESETS.square.height]).toEqual([1080, 1080]);
  });
  it('tiktok safe zone clears header, icon column and caption area', () => {
    const s = safeRect(PRESETS.tiktok);
    expect(s.y).toBe(300);
    expect(s.y + s.h).toBe(1500);
    expect(s.x).toBe(130);
    expect(s.x + s.w).toBe(950);
  });
});

describe('computeCropRect', () => {
  it('center-crops a landscape source into 9:16 keeping full height', () => {
    const r = computeCropRect(3000, 2000, 1080, 1920);
    expect(r.h).toBe(2000);
    expect(r.w).toBeCloseTo(1125, 0);
    expect(r.x).toBeCloseTo(937.5, 0);
    expect(r.y).toBe(0);
  });
  it('follows the focal point and clamps at the edges', () => {
    expect(computeCropRect(3000, 2000, 1080, 1920, { x: 0.02, y: 0.5 }).x).toBe(0);
    const r = computeCropRect(3000, 2000, 1080, 1920, { x: 0.98, y: 0.5 });
    expect(r.x + r.w).toBeCloseTo(3000, 5);
  });
  it('biases upward by default on portrait targets', () => {
    const r = computeCropRect(1000, 3000, 1080, 1350);
    expect(r.y).toBeCloseTo(0.42 * 3000 - r.h / 2, 5);
  });
});

describe('zoneBand', () => {
  it('keeps every band inside the safe rect', () => {
    for (const p of Object.values(PRESETS)) {
      const s = safeRect(p);
      for (const z of ['top', 'center', 'bottom'] as const) {
        const b = zoneBand(p, z);
        expect(b.y).toBeGreaterThanOrEqual(s.y);
        expect(b.y + b.h).toBeLessThanOrEqual(s.y + s.h);
        expect(b.x).toBe(s.x);
        expect(b.w).toBe(s.w);
      }
    }
  });
  it('bottom band ends at the bottom of the safe rect', () => {
    const b = zoneBand(PRESETS.tiktok, 'bottom');
    expect(b.y + b.h).toBe(1500);
  });
});

describe('regionStats', () => {
  it('is calm and mid-grey on a flat region', () => {
    const s = regionStats(grid(8, 8, () => 0.5), { x: 0, y: 0, w: 100, h: 100 }, 100, 100);
    expect(s.mean).toBeCloseTo(0.5);
    expect(s.busyness).toBe(0);
  });
  it('is maximally busy on a checkerboard', () => {
    const s = regionStats(grid(8, 8, (x, y) => (x + y) % 2), { x: 0, y: 0, w: 100, h: 100 }, 100, 100);
    expect(s.busyness).toBe(1);
  });
  it('only looks at the requested region', () => {
    const g = grid(8, 8, (_x, y) => (y < 4 ? 0.1 : 0.9));
    expect(regionStats(g, { x: 0, y: 0, w: 100, h: 50 }, 100, 100).mean).toBeCloseTo(0.1);
    expect(regionStats(g, { x: 0, y: 50, w: 100, h: 50 }, 100, 100).mean).toBeCloseTo(0.9);
  });
});

describe('scoreZones / chooseZone', () => {
  it('scores a busy top band highest and penalises the band holding the focal point', () => {
    const g = grid(48, 48, (x, y) => (y < 16 ? (x + y) % 2 : 0.5));
    const crop = { x: 0, y: 0, w: 1000, h: 1000 };
    const scores = scoreZones({ grid: g, srcW: 1000, srcH: 1000, crop, preset: PRESETS.square, focal: { x: 0.5, y: 0.5 } });
    expect(scores.top).toBeGreaterThan(0.5);
    expect(scores.center).toBeCloseTo(0.2);
    expect(scores.bottom).toBe(0);
    expect(chooseZone(scores, 'top')).toBe('bottom');
  });
  it('keeps the suggested zone unless it is clearly busier', () => {
    expect(chooseZone({ top: 0.3, center: 0.2, bottom: 0.25 }, 'top')).toBe('top');
    expect(chooseZone({ top: 0.5, center: 0.2, bottom: 0.25 }, 'top')).toBe('center');
  });
});

describe('outputRectToSource', () => {
  it('maps the full output rect onto the crop rect', () => {
    const crop = { x: 100, y: 0, w: 1125, h: 2000 };
    expect(outputRectToSource({ x: 0, y: 0, w: 1080, h: 1920 }, crop, 1080, 1920)).toEqual(crop);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/layout.test.ts`
Expected: FAIL — cannot resolve `../src/lib/layout`.

- [ ] **Step 3: Implement `src/lib/layout.ts`**

```ts
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
  return { x: crop.x + rect.x * sx, y: crop.y + rect.y * sy, w: rect.w * sx, h: rect.h * sy };
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/layout.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout.ts test/layout.test.ts
git commit -m "feat(layout): platform presets, safe zones, smart crop and zone scoring

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 3: Layout text fitting, contrast and tone selection

**Files:**
- Modify: `src/lib/layout.ts` (append)
- Test: `test/layout-text.test.ts`

**Interfaces:**
- Consumes: `clamp`, `Tone`, `ScrimAdjust` from Task 2.
- Produces: `type Measure = (text: string, px: number) => number`, `wrapWords(text, px, maxWidth, measure) → string[]`, `interface FitArgs { lines; quote; maxWidth; maxHeight; basePx; minPx; lineHeight; maxLines; measure }`, `fitText(args) → { fontPx: number; lines: string[] }`, `contrastRatio(l1, l2)`, `blendLuma(bg, overlay, alpha)`, `scrimOpacityFor({ zoneLuma, textLuma, scrimLuma, start, step?, cap?, target? }) → number`, `TONES: Record<Tone, { text: string; textLuma: number; scrim: string; scrimLuma: number; shadow: boolean }>`, `baseScrimOpacity(busyness, adjust)`, `chooseTone({ zoneLuma, busyness, suggested, adjust }) → { tone: Tone; opacity: number }`

Fitting rule (this refines spec §5.5): Claude's `lines` are honored while the font can stay at or above 78 % of the base size; below that, the quote is re-wrapped by words from the base size down, so a long line costs a re-break, not a tiny font.

- [ ] **Step 1: Write the failing tests**

`test/layout-text.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/layout-text.test.ts`
Expected: FAIL — `wrapWords` (and the others) are not exported.

- [ ] **Step 3: Append to `src/lib/layout.ts`**

```ts
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
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: PASS — layout, layout-text and smoke.

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout.ts test/layout-text.test.ts
git commit -m "feat(layout): text fitting, contrast-driven scrim opacity and tone choice

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 4: Response schema, normalization and the sample fixture

**Files:**
- Create: `src/lib/schema.ts`, `test/fixtures/sample-result.json`
- Test: `test/schema.test.ts`

**Interfaces:**
- Consumes: `ZONES` from `layout.ts`.
- Produces: `MOODS`, `type Mood`, `STYLE_PRESETS`, `type StylePreset`, `AnalysisSchema`, `VariantSchema`, `GenerationSchema`, `type Analysis`, `type Variant`, `type GenerationResult`, `cleanQuote(s) → string`, `normalizeResult(raw: unknown) → GenerationResult` (throws on unusable input; always returns ids `v1..vN`, cleaned quotes, clamped scores/focal point, a valid `best_variant_id`).

- [ ] **Step 1: Write the fixture `test/fixtures/sample-result.json`**

```json
{
  "analysis": {
    "subject": "a couple sharing one umbrella on a rain-soaked city street at night, seen from behind",
    "setting": "downtown street at night in heavy rain, neon and headlights reflecting on wet asphalt",
    "mood_words": ["tender", "cinematic", "quiet", "nostalgic", "close"],
    "palette": { "dominant_hex": ["#0f1a2b", "#3a4b6e", "#d98a5a", "#f2e6d8"], "is_dark": true },
    "focal_point": { "x": 0.5, "y": 0.55 },
    "text_zone": "top",
    "text_tone": "light",
    "vibe_summary": "Two people building a small dry world for each other while the whole city drips around them."
  },
  "variants": [
    {
      "id": "v1", "mood": "soft",
      "quote": "one umbrella and suddenly the whole city is dry enough",
      "lines": ["one umbrella", "and suddenly the whole city", "is dry enough"],
      "fit_score": 9,
      "why_it_fits": "The shared umbrella is the literal subject; the line turns it into shelter.",
      "style_preset": "editorial",
      "caption_tiktok": "the rain wasn't the point. who you walked through it with was.\nsend this to your umbrella person\n#couplegoals #softlove #rainydays #couplesaesthetic",
      "caption_instagram": "we never made it to the restaurant. we didn't need to.\n\nsome nights the walk is the whole date. tell me: rain date or stay-in date?\n\nsend this to the one who always holds the umbrella over you.\n\n#couplegoals #relationshipquotes #lovequotes #softlove #lovenotes #rainydays #couplesaesthetic #pinterestcouple #datenight #cityatnight #loveletters #quietlove"
    },
    {
      "id": "v2", "mood": "longing",
      "quote": "i still walk on the left so there's room for you",
      "lines": ["i still walk on the left", "so there's room for you"],
      "fit_score": 8,
      "why_it_fits": "Two figures side by side make the empty-space idea land.",
      "style_preset": "serif",
      "caption_tiktok": "habits outlast people. this one refuses to leave.\ntag someone who knows\n#longdistancelove #missingyou #relationshipquotes #couplesaesthetic",
      "caption_instagram": "some habits are just love with nowhere to go.\n\nwhat's the one thing you still do like they're beside you?\n\ntag the person who should be under this umbrella.\n\n#longdistancelove #missingyou #relationshipquotes #lovequotes #softlove #lovenotes #couplesaesthetic #pinterestcouple #rainydays #quietlove #loveletters #distance"
    },
    {
      "id": "v3", "mood": "sad",
      "quote": "the streetlights still come on for two",
      "lines": ["the streetlights", "still come on", "for two"],
      "fit_score": 8,
      "why_it_fits": "Picks the lights off the wet street and gives them the ache.",
      "style_preset": "typewriter",
      "caption_tiktok": "the city didn't get the memo.\nsend this to someone who's walking home alone tonight\n#heartbreak #sadquotes #rainydays #relationshipquotes",
      "caption_instagram": "everything kept its routine except us.\n\ndo you take the long way home too?\n\nsend this to the one who needs a text tonight.\n\n#sadquotes #heartbreak #relationshipquotes #lovequotes #rainydays #cityatnight #lovenotes #softlove #quietlove #missingyou #loveletters #couplesaesthetic"
    },
    {
      "id": "v4", "mood": "flirty",
      "quote": "walk closer. the umbrella's small and i'm not sorry",
      "lines": ["walk closer.", "the umbrella's small", "and i'm not sorry"],
      "fit_score": 7,
      "why_it_fits": "Uses the one umbrella as the excuse; playful and specific.",
      "style_preset": "handwritten",
      "caption_tiktok": "the umbrella is small on purpose.\ntag your favourite excuse\n#flirty #couplegoals #rainydays #couplesaesthetic",
      "caption_instagram": "i've owned bigger umbrellas. i chose this one.\n\nwhat's your favourite excuse to get closer?\n\ntag the person you'd share a too-small umbrella with.\n\n#flirty #couplegoals #relationshipquotes #lovequotes #couplesaesthetic #pinterestcouple #rainydays #datenight #softlove #lovenotes #cutecouple #loveletters"
    },
    {
      "id": "v5", "mood": "devoted",
      "quote": "any weather, same side of the street",
      "lines": ["any weather,", "same side", "of the street"],
      "fit_score": 7,
      "why_it_fits": "The rain becomes every kind of weather; commitment without saying forever.",
      "style_preset": "minimal",
      "caption_tiktok": "not a promise. a habit.\ntag your same-side-of-the-street person\n#couplegoals #relationshipquotes #devotion #couplesaesthetic",
      "caption_instagram": "we don't do grand promises. we do this, every day.\n\nwhat's your small every-day promise?\n\nsend this to the one who always ends up beside you.\n\n#couplegoals #relationshipquotes #lovequotes #devotion #softlove #lovenotes #couplesaesthetic #pinterestcouple #rainydays #quietlove #loveletters #foreverkindoflove"
    },
    {
      "id": "v6", "mood": "spicy",
      "quote": "we're soaked anyway. lose the umbrella",
      "lines": ["we're soaked anyway.", "lose the umbrella"],
      "fit_score": 6,
      "why_it_fits": "Turns the rain into a dare; suggestive without saying anything explicit.",
      "style_preset": "minimal",
      "caption_tiktok": "practical decision. definitely practical.\ntag the person who'd say yes\n#flirty #rainydays #couplegoals #couplesaesthetic",
      "caption_instagram": "there's dry, and there's this.\n\nwould you lose the umbrella?\n\nsend this to the one who'd say yes without asking why.\n\n#flirty #couplegoals #relationshipquotes #lovequotes #rainydays #couplesaesthetic #pinterestcouple #datenight #softlove #cutecouple #loveletters #lovenotes"
    }
  ],
  "best_variant_id": "v1",
  "alt_text": "A couple walks away from the camera under one umbrella on a rainy city street at night, with orange and blue lights reflecting off the wet road."
}
```

- [ ] **Step 2: Write the failing tests**

`test/schema.test.ts`:
```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/schema.test.ts`
Expected: FAIL — cannot resolve `../src/lib/schema`.

- [ ] **Step 4: Implement `src/lib/schema.ts`**

Zod keeps the schema free of `min`/`max` constraints: Anthropic's structured-output JSON-schema subset does not accept `minItems`/`maximum`-style keywords, so counts and ranges are described in `.describe()` text and enforced in `normalizeResult`.

```ts
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
  return s.replace(/["“”„«»]/g, '').replace(/\s+/g, ' ').trim();
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
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schema.ts test/schema.test.ts test/fixtures/sample-result.json
git commit -m "feat(schema): Zod schema for Claude output, normalizeResult, sample fixture

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 5: Settings persistence and usage/cost helpers

**Files:**
- Create: `src/lib/settings.ts`, `src/lib/usage.ts`
- Test: `test/settings.test.ts`, `test/usage.test.ts`

**Interfaces:**
- Consumes: `PresetId` from `layout.ts`.
- Produces (`settings.ts`): `type CtaStyle = 'none'|'soft'|'brand'`, `type MoodEmphasis = 'balanced'|'sad'|'flirty'`, `type Effort = 'low'|'medium'|'high'`, `type ExportFormat = 'image/jpeg'|'image/png'`, `interface Settings { apiKey; handle; appName; ctaStyle; moodEmphasis; effort; platforms: PresetId[]; exportFormat; attribution: boolean }`, `DEFAULT_SETTINGS`, `SETTINGS_KEY = 'lit.settings.v1'`, `type StorageLike`, `loadSettings(storage?) → Settings`, `saveSettings(settings, storage?)`.
- Produces (`usage.ts`): `interface UsageSummary { input; output; cacheRead; cacheWrite }`, `EMPTY_USAGE`, `addUsage(a, b)`, `estimateCostUsd(usage) → number` (Opus 5 rates: $5 / $25 / $0.50 / $6.25 per 1M).

- [ ] **Step 1: Write the failing tests**

`test/settings.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, SETTINGS_KEY, type StorageLike } from '../src/lib/settings';

const memory = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};

describe('settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings(memory())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it('round-trips through storage', () => {
    const s = memory();
    saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'sk-ant-test', handle: '@me', platforms: ['square'] }, s);
    expect(s.map.get(SETTINGS_KEY)).toContain('sk-ant-test');
    expect(loadSettings(s)).toMatchObject({ apiKey: 'sk-ant-test', handle: '@me', platforms: ['square'] });
  });
  it('tolerates junk and fills missing or invalid fields with defaults', () => {
    const s = memory();
    s.setItem(SETTINGS_KEY, '{not json');
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    s.setItem(SETTINGS_KEY, JSON.stringify({ apiKey: 42, ctaStyle: 'loud', effort: 'max', platforms: ['bogus'], attribution: 'yes' }));
    const loaded = loadSettings(s);
    expect(loaded.apiKey).toBe('');
    expect(loaded.ctaStyle).toBe(DEFAULT_SETTINGS.ctaStyle);
    expect(loaded.effort).toBe(DEFAULT_SETTINGS.effort);
    expect(loaded.platforms).toEqual(DEFAULT_SETTINGS.platforms);
    expect(loaded.attribution).toBe(true);
  });
  it('defaults to Best quality, TikTok + IG portrait, JPG, soft CTA', () => {
    expect(DEFAULT_SETTINGS.effort).toBe('high');
    expect(DEFAULT_SETTINGS.platforms).toEqual(['tiktok', 'ig-portrait']);
    expect(DEFAULT_SETTINGS.exportFormat).toBe('image/jpeg');
    expect(DEFAULT_SETTINGS.ctaStyle).toBe('soft');
  });
});
```

`test/usage.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/settings.test.ts test/usage.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/lib/settings.ts`**

```ts
import type { PresetId } from './layout';

export type CtaStyle = 'none' | 'soft' | 'brand';
export type MoodEmphasis = 'balanced' | 'sad' | 'flirty';
export type Effort = 'low' | 'medium' | 'high';
export type ExportFormat = 'image/jpeg' | 'image/png';

export interface Settings {
  apiKey: string;
  handle: string;
  appName: string;
  ctaStyle: CtaStyle;
  moodEmphasis: MoodEmphasis;
  effort: Effort;
  platforms: PresetId[];
  exportFormat: ExportFormat;
  attribution: boolean;
}

export const SETTINGS_KEY = 'lit.settings.v1';
export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  handle: '@loversintune',
  appName: 'Lovers in Tune',
  ctaStyle: 'soft',
  moodEmphasis: 'balanced',
  effort: 'high',
  platforms: ['tiktok', 'ig-portrait'],
  exportFormat: 'image/jpeg',
  attribution: true,
};

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const CTA_STYLES: readonly CtaStyle[] = ['none', 'soft', 'brand'];
const MOOD_EMPHASES: readonly MoodEmphasis[] = ['balanced', 'sad', 'flirty'];
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high'];
const PRESET_IDS: readonly PresetId[] = ['tiktok', 'ig-portrait', 'square'];
const FORMATS: readonly ExportFormat[] = ['image/jpeg', 'image/png'];

function pick<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;
}

function defaultStorage(): StorageLike | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function loadSettings(storage: StorageLike | null = defaultStorage()): Settings {
  if (!storage) return { ...DEFAULT_SETTINGS, platforms: [...DEFAULT_SETTINGS.platforms] };
  let raw: unknown = null;
  try { const s = storage.getItem(SETTINGS_KEY); raw = s ? JSON.parse(s) : null; } catch { raw = null; }
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS, platforms: [...DEFAULT_SETTINGS.platforms] };
  const r = raw as Record<string, unknown>;
  const platforms = Array.isArray(r.platforms)
    ? (r.platforms as unknown[]).filter((p): p is PresetId => (PRESET_IDS as readonly unknown[]).includes(p))
    : [];
  return {
    apiKey: typeof r.apiKey === 'string' ? r.apiKey : '',
    handle: typeof r.handle === 'string' ? r.handle : DEFAULT_SETTINGS.handle,
    appName: typeof r.appName === 'string' ? r.appName : DEFAULT_SETTINGS.appName,
    ctaStyle: pick(r.ctaStyle, CTA_STYLES, DEFAULT_SETTINGS.ctaStyle),
    moodEmphasis: pick(r.moodEmphasis, MOOD_EMPHASES, DEFAULT_SETTINGS.moodEmphasis),
    effort: pick(r.effort, EFFORTS, DEFAULT_SETTINGS.effort),
    platforms: platforms.length ? platforms : [...DEFAULT_SETTINGS.platforms],
    exportFormat: pick(r.exportFormat, FORMATS, DEFAULT_SETTINGS.exportFormat),
    attribution: typeof r.attribution === 'boolean' ? r.attribution : DEFAULT_SETTINGS.attribution,
  };
}

export function saveSettings(settings: Settings, storage: StorageLike | null = defaultStorage()): void {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage blocked or full: settings live for this session only */ }
}
```

- [ ] **Step 4: Implement `src/lib/usage.ts`**

```ts
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
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings.ts src/lib/usage.ts test/settings.test.ts test/usage.test.ts
git commit -m "feat: settings persistence and usage cost estimate

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 6: Prompt — system prompt, exemplar quotes, user prompt builder

**Files:**
- Create: `src/lib/prompt.ts`
- Test: `test/prompt.test.ts`

**Interfaces:**
- Consumes: `Mood` from `schema.ts`; `CtaStyle`, `MoodEmphasis` from `settings.ts`.
- Produces: `EXEMPLARS: Record<Mood, string[]>`, `SYSTEM_PROMPT: string` (constant, byte-stable — no dates, no randomness, so prompt caching works across a batch), `interface PromptContext { handle: string; appName: string; ctaStyle: CtaStyle; moodEmphasis: MoodEmphasis; avoid?: string[] }`, `buildUserPrompt(ctx) → string`.

- [ ] **Step 1: Write the failing tests**

`test/prompt.test.ts`:
```ts
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
        expect(q).not.toMatch(/["“”]/);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/prompt.ts`**

```ts
import type { Mood } from './schema';
import type { CtaStyle, MoodEmphasis } from './settings';

export interface PromptContext {
  handle: string;
  appName: string;
  ctaStyle: CtaStyle;
  moodEmphasis: MoodEmphasis;
  avoid?: string[];
}

/** Original style anchors. Never song lyrics or attributed quotes. */
export const EXEMPLARS: Record<Mood, string[]> = {
  sad: [
    "you were my favorite place and i still don't know how to leave",
    'some nights i still set the table for two',
    'the rain still sounds like your name',
    'i loved you in a way that left me nothing to keep',
  ],
  longing: [
    'come home. the bed is too big without your cold feet',
    'i miss you most in the small hours when nothing is open but my heart',
    'i want the boring parts too. the grocery runs, the sunday laundry, you',
    "text me when you land. text me when you don't",
  ],
  flirty: [
    "stop looking at me like that. or don't. actually, don't",
    "i'd say you're trouble but i already packed a bag",
    "you're not my type. you're the whole alphabet",
    "kiss me like the parking meter's about to run out",
  ],
  soft: [
    'with you even the quiet has a heartbeat',
    'you make ordinary tuesdays feel like somewhere we drove to',
    'somewhere between your hello and my goodnight, i learned what home means',
    "i don't need forever. i need the next five minutes with you, again and again",
  ],
  playful: [
    'you steal the blanket. i steal you back. fair trade',
    "we're not a couple, we're a two-person cult with snacks",
    "i love you more than coffee. don't make me prove it before 9am",
  ],
  devoted: [
    "choose me on the good days. i'll choose you on the rest",
    "i'd learn the map of you again in every life",
    "we're not perfect. we're just never leaving",
  ],
  spicy: [
    'the way you say my name should come with a warning label',
    "come here. i wasn't done arguing with your mouth",
    "you're the reason i'm late and the reason i don't care",
  ],
};

const anchors = (Object.keys(EXEMPLARS) as Mood[])
  .map((mood) => `${mood}:\n${EXEMPLARS[mood].map((q) => `- ${q}`).join('\n')}`)
  .join('\n\n');

export const SYSTEM_PROMPT = `You write the words for couple-aesthetic posters: a short quote placed over a photo, posted on TikTok and Instagram by an account for couples. For each request you receive one photo and some brand context. Study the photo first, then write for that photo and no other.

# Output
Return one JSON object that matches the provided schema. Nothing else.

# Step 1 - read the photo (analysis)
- subject: what is literally in the frame, one specific phrase ("two hands holding one coffee cup on a car dashboard at night").
- setting: where and when.
- mood_words: 3 to 6 words.
- palette: 2 to 5 dominant hex colors, and is_dark (true when the photo is mostly dark).
- focal_point: where the main subject sits, as fractions of width and height measured from the top-left corner (0 to 1). No clear subject: use x 0.5, y 0.45.
- text_zone: the band of the photo with the least detail where a quote would sit naturally: "top", "center" or "bottom". Never the band that holds faces or hands.
- text_tone: "light" if the photo is mostly dark or richly colored, "dark" if it is pale and airy.
- vibe_summary: one sentence about the feeling of the image.

# Step 2 - write six quote variants
Each variant is an original quote of at most 16 words, written for THIS photo.
- Moods: include at least one "sad", one "longing" and one "flirty". Fill the remaining three from soft, playful, devoted and spicy according to what the photo can carry and the mood emphasis in the brand context. Never use the same mood more than twice.
- At least four of the six must name something visible in the photo: the rain, the car, the light, the sheets, the coffee, the city, the hands, the distance between them.
- Voice: intimate and specific. First person, spoken to or about one person ("you", "me", "us"). Lowercase unless a capital letter earns its place. Short lines that breathe. Concrete images over abstractions. A little surprising: the last three words should land.
- lines: the quote split into 2 to 4 lines the way it should break on the poster. Break where a person would pause. Every word of the quote appears in the lines, in order.
- fit_score (1 to 10): how well this quote matches this exact photo, not how good the line is in general. best_variant_id is the id with the highest fit_score.
- style_preset per variant: editorial (romantic magazine italic), serif (classic, poetic), typewriter (diary, melancholy), handwritten (a note left on the mirror, flirty), minimal (clean uppercase). Match it to the mood and the photo.
- ids are v1 to v6.
- "spicy" means suggestive and playful, never explicit. It must be safe for TikTok and Instagram.

Never:
- song lyrics, lines from films or books, or quotes attributed to real people. Original text only.
- emojis, hashtags or quotation marks inside the quote.
- cliches: "love is patient", "you complete me", "my other half", "my person", "soulmate", "home is wherever you are".
- possessiveness, jealousy, control or ultimatums framed as romance.
- the brand name or app name inside the quote.

# Step 3 - captions for each variant
Write as a real person posting, not a brand.
- caption_tiktok: one scroll-stopping hook line that adds to the quote instead of repeating it, optionally one more short line, then the CTA, then 3 to 5 hashtags on the last line. Under 300 characters in total.
- caption_instagram: a hook in the first 125 characters, a blank line, one to three lines of feeling or a question that invites comments, a blank line, the CTA, a blank line, then 10 to 15 hashtags mixing broad tags (#couplegoals #relationshipquotes #lovequotes) with niche ones (#softlove #lovenotes #longdistancelove #couplesaesthetic #pinterestcouple).
- CTA by style. none: no call to action at all. soft: a gentle nudge to share ("send this to them", "tag the person you would say this to"), no app mention. brand: mention the app naturally and in different words each time ("we built @handle for exactly this", "this is the kind of thing our app asks you at 11pm - link in bio"), never salesy, one sentence at most.
- At most two emojis per caption. Hashtags lowercase, no spaces inside a tag.
- alt_text: one plain sentence describing the photo for screen readers.

# Style anchors
Original lines in the voice we want. Do not reuse or lightly rephrase them; write new ones for the photo.

${anchors}`;

const EMPHASIS_TEXT: Record<MoodEmphasis, string> = {
  balanced: 'balanced - let the photo decide the three free mood slots',
  sad: 'lean the three free mood slots toward sad and longing',
  flirty: 'lean the three free mood slots toward flirty and playful',
};

export function buildUserPrompt(c: PromptContext): string {
  const cta: Record<CtaStyle, string> = {
    none: 'none - no call to action in any caption',
    soft: 'soft - a gentle nudge to share or tag someone, no app mention',
    brand: `brand - mention the app "${c.appName}" (${c.handle}) naturally, in different words each time, one sentence at most`,
  };
  const lines = [
    'Brand context:',
    `- account handle: ${c.handle}`,
    `- app name: ${c.appName}`,
    `- CTA style: ${cta[c.ctaStyle]}`,
    `- mood emphasis: ${EMPHASIS_TEXT[c.moodEmphasis]}`,
  ];
  if (c.avoid?.length) {
    lines.push('', 'Do not reuse or lightly rephrase these quotes already written for this photo:');
    for (const q of c.avoid) lines.push(`- ${q}`);
  }
  lines.push('', 'Study the photo, then return the analysis, six variants and captions as JSON.');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompt.ts test/prompt.test.ts
git commit -m "feat(prompt): system prompt with style anchors and brand-context user prompt

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 7: Fonts, image preparation and UI labels

**Files:**
- Create: `src/lib/fonts.ts`, `src/lib/imagePrep.ts`, `src/lib/labels.ts`
- Test: `test/fonts.test.ts`, `test/imagePrep.test.ts`

**Interfaces:**
- Consumes: `StylePreset`, `Mood` from `schema.ts`; `LumaGrid`, `Zone` from `layout.ts`.
- Produces (`fonts.ts`): `interface FontSpec { family; weight; style: 'normal'|'italic'; scale; uppercase; letterSpacingEm; lineHeight; quoteMark }`, `FONT_PRESETS: Record<StylePreset, FontSpec>`, `ATTRIBUTION_FONT: FontSpec`, `cssFont(spec, px) → string`, `ensureFontsLoaded(specs) → Promise<void>`.
- Produces (`imagePrep.ts`): `ACCEPTED_TYPES`, `API_MAX_EDGE = 1024`, `GRID_SIZE = 48`, `LOW_RES_WIDTH = 900`, `interface PreparedImage { bitmap: ImageBitmap; width; height; apiBase64; apiMediaType: 'image/jpeg'; luma: LumaGrid; lowRes: boolean }`, `isSupportedFile(file)`, `srgbToLinear(c)`, `relativeLuminance(r, g, b)`, `lumaGridFromRGBA(data, w, h) → LumaGrid`, `dataUrlToBase64(url)`, `fitWithin(w, h, maxEdge) → { w; h }`, `prepareImage(file) → Promise<PreparedImage>`.
- Produces (`labels.ts`): `MOOD_LABELS`, `STYLE_LABELS`, `ZONE_LABELS`.

- [ ] **Step 1: Write the failing tests**

`test/fonts.test.ts`:
```ts
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
```

`test/imagePrep.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { relativeLuminance, lumaGridFromRGBA, dataUrlToBase64, fitWithin, isSupportedFile } from '../src/lib/imagePrep';

describe('imagePrep helpers', () => {
  it('computes WCAG relative luminance', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(relativeLuminance(255, 0, 0)).toBeCloseTo(0.2126, 4);
  });
  it('builds a luma grid from RGBA pixels', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const g = lumaGridFromRGBA(data, 2, 1);
    expect(g.w).toBe(2);
    expect(g.h).toBe(1);
    expect(g.data[0]).toBeCloseTo(1, 5);
    expect(g.data[1]).toBe(0);
  });
  it('strips the data-URL prefix', () => {
    expect(dataUrlToBase64('data:image/jpeg;base64,abc123')).toBe('abc123');
    expect(dataUrlToBase64('abc123')).toBe('abc123');
  });
  it('downsizes only when the longest edge exceeds the limit', () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ w: 1024, h: 768 });
    expect(fitWithin(800, 600, 1024)).toEqual({ w: 800, h: 600 });
    expect(fitWithin(600, 2400, 1024)).toEqual({ w: 256, h: 1024 });
  });
  it('accepts jpg/png/webp only', () => {
    expect(isSupportedFile(new File([''], 'a.jpg', { type: 'image/jpeg' }))).toBe(true);
    expect(isSupportedFile(new File([''], 'a.webp', { type: 'image/webp' }))).toBe(true);
    expect(isSupportedFile(new File([''], 'a.heic', { type: 'image/heic' }))).toBe(false);
    expect(isSupportedFile(new File([''], 'a.txt', { type: 'text/plain' }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/fonts.test.ts test/imagePrep.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/lib/fonts.ts`**

```ts
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
```

- [ ] **Step 4: Implement `src/lib/imagePrep.ts`**

```ts
import type { LumaGrid } from './layout';

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const API_MAX_EDGE = 1024;
export const GRID_SIZE = 48;
export const LOW_RES_WIDTH = 900;
const API_JPEG_QUALITY = 0.85;

export interface PreparedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  apiBase64: string;
  apiMediaType: 'image/jpeg';
  luma: LumaGrid;
  lowRes: boolean;
}

export function isSupportedFile(file: File): boolean {
  return (ACCEPTED_TYPES as readonly string[]).includes(file.type);
}

export function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function lumaGridFromRGBA(data: Uint8ClampedArray, w: number, h: number): LumaGrid {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = relativeLuminance(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  return { w, h, data: out };
}

export function dataUrlToBase64(url: string): string {
  const i = url.indexOf(',');
  return i >= 0 ? url.slice(i + 1) : url;
}

export function fitWithin(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Decode once (EXIF-corrected), make the small JPEG for Claude, and a 48×48 luminance grid for layout. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = bitmap;

  const small = fitWithin(width, height, API_MAX_EDGE);
  const c = document.createElement('canvas');
  c.width = small.w;
  c.height = small.h;
  c.getContext('2d')!.drawImage(bitmap, 0, 0, small.w, small.h);
  const apiBase64 = dataUrlToBase64(c.toDataURL('image/jpeg', API_JPEG_QUALITY));

  const g = document.createElement('canvas');
  g.width = GRID_SIZE;
  g.height = GRID_SIZE;
  const gctx = g.getContext('2d', { willReadFrequently: true })!;
  gctx.drawImage(bitmap, 0, 0, GRID_SIZE, GRID_SIZE);
  const luma = lumaGridFromRGBA(gctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data, GRID_SIZE, GRID_SIZE);

  return { bitmap, width, height, apiBase64, apiMediaType: 'image/jpeg', luma, lowRes: width < LOW_RES_WIDTH };
}
```

- [ ] **Step 5: Implement `src/lib/labels.ts`**

```ts
import type { Mood, StylePreset } from './schema';
import type { Zone } from './layout';

export const MOOD_LABELS: Record<Mood, string> = {
  sad: 'Sad', longing: 'Longing', flirty: 'Flirty', soft: 'Soft', playful: 'Playful', devoted: 'Devoted', spicy: 'Spicy',
};
export const STYLE_LABELS: Record<StylePreset, string> = {
  editorial: 'Editorial italic', serif: 'Classic serif', typewriter: 'Typewriter', handwritten: 'Handwritten', minimal: 'Minimal caps',
};
export const ZONE_LABELS: Record<Zone, string> = { top: 'Top', center: 'Center', bottom: 'Bottom' };
```

- [ ] **Step 6: Run all tests and the type check**

Run: `npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: PASS; tsc prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/fonts.ts src/lib/imagePrep.ts src/lib/labels.ts test/fonts.test.ts test/imagePrep.test.ts
git commit -m "feat: font presets, image preparation (API copy + luma grid) and labels

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 8: Poster renderer

**Files:**
- Create: `src/lib/render.ts`

**Interfaces:**
- Consumes: `layout.ts` (crop, bands, stats, zones, fitText, chooseTone, TONES), `fonts.ts`, `PreparedImage`, `Analysis`.
- Produces: `interface RenderOptions { preset: PlatformPreset; style: StylePreset; zone: Zone | 'auto'; sizeScale: number; scrimAdjust: ScrimAdjust; attribution: string | null; guides?: boolean }`, `interface RenderInput { image: PreparedImage; analysis: Analysis | null; lines: string[]; quote: string }`, `MAX_LINES = 6`, `renderPoster(input, opts) → Promise<HTMLCanvasElement>` (always full output size), `canvasToBlob(canvas, type, quality?) → Promise<Blob>`.

No unit test: this module is Canvas-only and is verified visually in Task 15 through fixture mode. The type check must pass.

- [ ] **Step 1: Implement `src/lib/render.ts`**

```ts
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
    ctx.fillText('“', cx, block.y + px * 0.1);
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/lib/render.ts
git commit -m "feat(render): compose quote posters with smart crop, zone choice, scrim and typography

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 9: Claude client — generateForImage and error mapping

**Files:**
- Create: `src/lib/claude.ts`
- Test: `test/claude.test.ts`

**Interfaces:**
- Consumes: `GenerationSchema`, `normalizeResult`, `GenerationResult` from `schema.ts`; `SYSTEM_PROMPT`, `buildUserPrompt`, `PromptContext` from `prompt.ts`; `Effort` from `settings.ts`; `UsageSummary`, `EMPTY_USAGE`, `addUsage` from `usage.ts`.
- Produces: `MODEL = 'claude-opus-5'`, `type FailureKind = 'auth'|'rate_limit'|'bad_request'|'network'|'refusal'|'invalid_output'|'aborted'|'unknown'`, `type GenerateOutcome = { ok: true; result; usage } | { ok: false; kind; message; usage? }`, `interface GenerateArgs { apiKey; effort; image: { base64; mediaType: 'image/jpeg'|'image/png'|'image/webp' }; context: PromptContext; signal? }`, `generateForImage(args) → Promise<GenerateOutcome>`, `mapError(err) → { kind; message }`.

SDK facts (verified against `@anthropic-ai/sdk@0.122.0`): `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })` sets the `anthropic-dangerous-direct-browser-access` header; `client.beta.messages.parse(params, { signal })` returns a message with `parsed_output`; beta params accept `fallbacks: 'default'` and `output_config: { effort, format }`; `stop_details` is `BetaRefusalStopDetails | null`; usage fields are plain numbers.

- [ ] **Step 1: Write the failing tests**

`test/claude.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { mapError, MODEL } from '../src/lib/claude';

describe('claude', () => {
  it('targets claude-opus-5', () => {
    expect(MODEL).toBe('claude-opus-5');
  });
  it('maps SDK errors to user-facing kinds', () => {
    const h = new Headers();
    expect(mapError(Anthropic.APIError.generate(401, { message: 'bad key' }, undefined, h)).kind).toBe('auth');
    expect(mapError(Anthropic.APIError.generate(429, { message: 'slow down' }, undefined, h)).kind).toBe('rate_limit');
    expect(mapError(Anthropic.APIError.generate(400, { message: 'nope' }, undefined, h))).toMatchObject({ kind: 'bad_request', message: expect.stringContaining('nope') });
    expect(mapError(Anthropic.APIError.generate(500, { message: 'boom' }, undefined, h)).kind).toBe('unknown');
    expect(mapError(new Anthropic.APIConnectionError({ message: 'offline' })).kind).toBe('network');
    expect(mapError(new Anthropic.APIUserAbortError()).kind).toBe('aborted');
    expect(mapError(new Error('weird'))).toEqual({ kind: 'unknown', message: 'weird' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/claude.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/claude.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { GenerationSchema, normalizeResult, type GenerationResult } from './schema';
import { SYSTEM_PROMPT, buildUserPrompt, type PromptContext } from './prompt';
import type { Effort } from './settings';
import { EMPTY_USAGE, addUsage, type UsageSummary } from './usage';

export const MODEL = 'claude-opus-5';
const MAX_TOKENS = 16000;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const OUTPUT_FORMAT = zodOutputFormat(GenerationSchema);

export type FailureKind = 'auth' | 'rate_limit' | 'bad_request' | 'network' | 'refusal' | 'invalid_output' | 'aborted' | 'unknown';
export type GenerateOutcome =
  | { ok: true; result: GenerationResult; usage: UsageSummary }
  | { ok: false; kind: FailureKind; message: string; usage?: UsageSummary };

export interface GenerateArgs {
  apiKey: string;
  effort: Effort;
  image: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };
  context: PromptContext;
  signal?: AbortSignal;
}

export function mapError(err: unknown): { kind: FailureKind; message: string } {
  if (err instanceof Anthropic.APIUserAbortError) return { kind: 'aborted', message: 'Cancelled' };
  if (err instanceof Anthropic.AuthenticationError) return { kind: 'auth', message: 'Anthropic rejected the API key. Check it in Settings.' };
  if (err instanceof Anthropic.RateLimitError) return { kind: 'rate_limit', message: 'Rate limited by Anthropic. Wait a moment and retry.' };
  if (err instanceof Anthropic.BadRequestError) return { kind: 'bad_request', message: `Request rejected: ${err.message}` };
  if (err instanceof Anthropic.APIConnectionError) return { kind: 'network', message: 'Network error reaching Anthropic. Check your connection and retry.' };
  if (err instanceof Anthropic.APIError) return { kind: 'unknown', message: `Anthropic error ${err.status ?? ''}: ${err.message}`.replace('  ', ' ') };
  return { kind: 'unknown', message: err instanceof Error ? err.message : String(err) };
}

/** One image in, analysis + six variants + captions out. Retries once on malformed JSON. */
export async function generateForImage(a: GenerateArgs): Promise<GenerateOutcome> {
  const client = new Anthropic({ apiKey: a.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const userPrompt = buildUserPrompt(a.context);
  let usage = EMPTY_USAGE;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await client.beta.messages.parse(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: a.image.mediaType, data: a.image.base64 } },
                { type: 'text', text: userPrompt },
              ],
            },
          ],
          output_config: { effort: a.effort, format: OUTPUT_FORMAT },
        },
        { signal: a.signal },
      );
      usage = addUsage(usage, {
        input: res.usage.input_tokens,
        output: res.usage.output_tokens,
        cacheRead: res.usage.cache_read_input_tokens,
        cacheWrite: res.usage.cache_creation_input_tokens,
      });
      if (res.stop_reason === 'refusal') {
        return { ok: false, kind: 'refusal', message: res.stop_details?.explanation ?? 'Claude declined to write for this image.', usage };
      }
      try {
        if (res.parsed_output) return { ok: true, result: normalizeResult(res.parsed_output), usage };
      } catch (e) {
        if (attempt === 1) return { ok: false, kind: 'invalid_output', message: `Claude's answer did not match the expected shape: ${e instanceof Error ? e.message : String(e)}`, usage };
      }
    }
    return { ok: false, kind: 'invalid_output', message: 'Claude returned an unexpected format twice. Retry.', usage };
  } catch (err) {
    return { ok: false, ...mapError(err), usage };
  }
}
```

- [ ] **Step 4: Run the tests and type check**

Run: `npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: PASS; tsc clean. If tsc rejects `fallbacks` or `output_config.format` on `beta.messages.parse`, the spec's fallback plan applies: switch to `client.messages.parse` without `betas`/`fallbacks` and keep everything else — note the change in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude.ts test/claude.test.ts
git commit -m "feat(claude): image → quotes via claude-opus-5 with structured output and refusal fallbacks

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 10: Concurrency-limited job queue

**Files:**
- Create: `src/lib/queue.ts`
- Test: `test/queue.test.ts`

**Interfaces:**
- Produces: `interface QueuedTask<T> { promise: Promise<T>; cancel: () => void }`, `interface Queue { add<T>(job: (signal: AbortSignal) => Promise<T>): QueuedTask<T>; readonly active: number; readonly pending: number }`, `createQueue(limit) → Queue`. Cancelling a queued job rejects its promise with an `AbortError` `DOMException` and never runs it; cancelling a running job aborts its signal.

- [ ] **Step 1: Write the failing tests**

`test/queue.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createQueue } from '../src/lib/queue';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createQueue', () => {
  it('runs at most `limit` jobs at once and starts the next when one finishes', async () => {
    const q = createQueue(2);
    const started: number[] = [];
    const ds = [deferred<number>(), deferred<number>(), deferred<number>()];
    const tasks = ds.map((d, i) => q.add(async () => { started.push(i); return d.promise; }));
    expect(started).toEqual([0, 1]);
    expect(q.active).toBe(2);
    expect(q.pending).toBe(1);
    ds[0].resolve(0);
    await tasks[0].promise;
    await tick();
    expect(started).toEqual([0, 1, 2]);
    ds[1].resolve(1);
    ds[2].resolve(2);
    await expect(Promise.all(tasks.map((t) => t.promise))).resolves.toEqual([0, 1, 2]);
    expect(q.active).toBe(0);
  });
  it('cancelling a queued job rejects it and never starts it', async () => {
    const q = createQueue(1);
    const d = deferred<void>();
    let ran = false;
    q.add(() => d.promise);
    const t = q.add(async () => { ran = true; });
    t.cancel();
    await expect(t.promise).rejects.toMatchObject({ name: 'AbortError' });
    d.resolve();
    await tick();
    expect(ran).toBe(false);
    expect(q.pending).toBe(0);
  });
  it('cancelling a running job aborts its signal', async () => {
    const q = createQueue(1);
    let sig: AbortSignal | undefined;
    const t = q.add((signal) => {
      sig = signal;
      return new Promise<void>((_, rej) => signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))));
    });
    t.cancel();
    expect(sig?.aborted).toBe(true);
    await expect(t.promise).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('keeps going after a job fails', async () => {
    const q = createQueue(1);
    const failing = q.add(async () => { throw new Error('nope'); });
    const ok = q.add(async () => 'fine');
    await expect(failing.promise).rejects.toThrow('nope');
    await expect(ok.promise).resolves.toBe('fine');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/queue.ts`**

```ts
export interface QueuedTask<T> { promise: Promise<T>; cancel: () => void }
export interface Queue {
  add<T>(job: (signal: AbortSignal) => Promise<T>): QueuedTask<T>;
  readonly active: number;
  readonly pending: number;
}

interface Entry { controller: AbortController; start: () => void }

export function createQueue(limit: number): Queue {
  const waiting: Entry[] = [];
  let active = 0;

  const pump = () => {
    while (active < limit && waiting.length) {
      const next = waiting.shift()!;
      active++;
      next.start();
    }
  };

  return {
    add<T>(job: (signal: AbortSignal) => Promise<T>): QueuedTask<T> {
      const controller = new AbortController();
      let started = false;
      let rejectQueued: (e: unknown) => void = () => {};
      const promise = new Promise<T>((resolve, reject) => {
        rejectQueued = reject;
        waiting.push({
          controller,
          start: () => {
            started = true;
            job(controller.signal)
              .finally(() => { active--; pump(); })
              .then(resolve, reject);
          },
        });
      });
      pump();
      const cancel = () => {
        if (started) { controller.abort(); return; }
        const i = waiting.findIndex((e) => e.controller === controller);
        if (i >= 0) waiting.splice(i, 1);
        rejectQueued(new DOMException('Cancelled before start', 'AbortError'));
      };
      return { promise, cancel };
    },
    get active() { return active; },
    get pending() { return waiting.length; },
  };
}
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue.ts test/queue.test.ts
git commit -m "feat(queue): concurrency-limited job runner with cancellation

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 11: Downloads — filenames, captions markdown, zip

**Files:**
- Create: `src/lib/download.ts`
- Test: `test/download.test.ts`

**Interfaces:**
- Produces: `saveBlob(blob, filename)`, `slugify(name) → string` (extension stripped, ascii, ≤ 40 chars, never empty), `posterFilename(stem, mood, presetId, format) → string`, `interface CaptionEntry { stem; mood; quote; captionTiktok; captionInstagram; altText }`, `captionsMarkdown(entries) → string`, `type ZipEntry = { path: string; data: string | Uint8Array | ArrayBuffer }`, `buildZip(entries, 'blob' | 'uint8array')`.

- [ ] **Step 1: Write the failing tests**

`test/download.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { slugify, posterFilename, captionsMarkdown, buildZip } from '../src/lib/download';

describe('download helpers', () => {
  it('slugify makes safe, short stems', () => {
    expect(slugify('My Pinterest Pic (1).JPG')).toBe('my-pinterest-pic-1');
    expect(slugify('ünïcode café.png')).toBe('unicode-cafe');
    expect(slugify('.jpg')).toBe('image');
    expect(slugify('x'.repeat(80) + '.png')).toHaveLength(40);
  });
  it('posterFilename combines stem, mood, preset and extension', () => {
    expect(posterFilename('pic', 'sad', 'tiktok', 'image/jpeg')).toBe('pic-sad-tiktok.jpg');
    expect(posterFilename('pic', 'flirty', 'square', 'image/png')).toBe('pic-flirty-square.png');
  });
  it('captionsMarkdown lists each entry with both captions', () => {
    const md = captionsMarkdown([
      { stem: 'pic', mood: 'sad', quote: 'the rain', captionTiktok: 'tt caption', captionInstagram: 'ig caption', altText: 'alt here' },
    ]);
    expect(md).toContain('## pic');
    expect(md).toContain('the rain');
    expect(md).toContain('tt caption');
    expect(md).toContain('ig caption');
    expect(md).toContain('alt here');
    expect(md).toMatch(/sad/i);
  });
  it('buildZip packs files that JSZip can read back', async () => {
    const bytes = await buildZip([{ path: 'a/x.txt', data: 'hi' }, { path: 'b.bin', data: new Uint8Array([1, 2, 3]) }], 'uint8array');
    const z = await JSZip.loadAsync(bytes);
    expect(Object.keys(z.files).filter((k) => !z.files[k].dir).sort()).toEqual(['a/x.txt', 'b.bin']);
    expect(await z.file('a/x.txt')!.async('string')).toBe('hi');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/download.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/download.ts`**

```ts
import JSZip from 'jszip';

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(name: string): string {
  const stem = name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return stem || 'image';
}

export function posterFilename(stem: string, mood: string, presetId: string, format: 'image/jpeg' | 'image/png'): string {
  return `${stem}-${mood}-${presetId}.${format === 'image/png' ? 'png' : 'jpg'}`;
}

export interface CaptionEntry {
  stem: string;
  mood: string;
  quote: string;
  captionTiktok: string;
  captionInstagram: string;
  altText: string;
}

export function captionsMarkdown(entries: CaptionEntry[]): string {
  const blocks = entries.map((e) =>
    [
      `## ${e.stem}`,
      '',
      `**Quote (${e.mood}):** ${e.quote}`,
      '',
      '### TikTok',
      '',
      e.captionTiktok,
      '',
      '### Instagram',
      '',
      e.captionInstagram,
      '',
      `**Alt text:** ${e.altText}`,
    ].join('\n'),
  );
  return `# Captions\n\n${blocks.join('\n\n---\n\n')}\n`;
}

export type ZipEntry = { path: string; data: string | Uint8Array | ArrayBuffer };

export async function buildZip<T extends 'blob' | 'uint8array'>(entries: ZipEntry[], type: T): Promise<T extends 'blob' ? Blob : Uint8Array> {
  const zip = new JSZip();
  for (const e of entries) zip.file(e.path, e.data);
  // Posters are JPEG/PNG already; STORE keeps zipping instant.
  return zip.generateAsync({ type, compression: 'STORE' }) as Promise<T extends 'blob' ? Blob : Uint8Array>;
}
```

- [ ] **Step 4: Run all tests and the type check**

Run: `npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/download.ts test/download.test.ts
git commit -m "feat(download): filenames, captions markdown and zip packaging

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 12: Card state, exporters and the preview hook

**Files:**
- Create: `src/state/cards.ts`, `src/lib/exporters.ts`, `src/hooks/usePosterCanvas.ts`
- Test: `test/cards.test.ts`

**Interfaces:**
- Consumes: `PreparedImage`, `GenerationResult`/`Variant`/`StylePreset`, `Zone`/`ScrimAdjust`/`PresetId`/`PRESETS`/`PRESET_ORDER`, `UsageSummary`/`addUsage`/`EMPTY_USAGE`, `slugify`, `renderPoster`/`canvasToBlob`, `buildZip`/`captionsMarkdown`/`posterFilename`/`saveBlob`, `Settings`.
- Produces (`state/cards.ts`): `type CardStatus = 'queued'|'preparing'|'waiting_key'|'generating'|'ready'|'error'|'declined'`, `type SizeChoice = 'S'|'M'|'L'`, `SIZE_SCALE`, `interface Card { id; file; stem; status; prepared?; result?; usage; selectedVariantId?; style: StylePreset|'auto'; zone: Zone|'auto'; size; scrim: ScrimAdjust; error? }`, `type CardAction`, `uniqueStem(base, taken)`, `newCards(files, takenStems) → Card[]`, `selectedVariant(card) → Variant | undefined`, `cardsReducer(state, action) → Card[]`.
- Produces (`exporters.ts`): `renderForCard(card, presetId, settings, guides?) → Promise<HTMLCanvasElement>`, `captionEntry(card) → CaptionEntry | null`, `downloadPoster(card, presetId, settings)`, `cardZipEntries(card, settings) → Promise<ZipEntry[]>`, `downloadCardZip(card, settings)`, `downloadBatchZip(cards, settings)`.
- Produces (`hooks/usePosterCanvas.ts`): `usePosterCanvas(containerRef, card, presetId, settings, guides)`.

- [ ] **Step 1: Write the failing tests**

`test/cards.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import fixture from './fixtures/sample-result.json';
import { newCards, uniqueStem, cardsReducer, selectedVariant, SIZE_SCALE } from '../src/state/cards';
import { normalizeResult } from '../src/lib/schema';

const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' });
const usage = { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 };

describe('cards state', () => {
  it('newCards gives unique stems and queued status', () => {
    const cards = newCards([file('a.jpg'), file('a.jpg'), file('b.png')], ['b']);
    expect(cards.map((c) => c.stem)).toEqual(['a', 'a-2', 'b-2']);
    expect(cards.every((c) => c.status === 'queued' && c.style === 'auto' && c.zone === 'auto' && c.size === 'M' && c.scrim === 'auto')).toBe(true);
    expect(new Set(cards.map((c) => c.id)).size).toBe(3);
    expect(uniqueStem('x', ['x', 'x-2'])).toBe('x-3');
  });
  it('add prepends newest first', () => {
    const [a] = newCards([file('a.jpg')], []);
    const [b] = newCards([file('b.jpg')], ['a']);
    const state = cardsReducer(cardsReducer([], { type: 'add', cards: [a] }), { type: 'add', cards: [b] });
    expect(state.map((c) => c.stem)).toEqual(['b', 'a']);
  });
  it('result marks the card ready, selects the best variant and accumulates usage', () => {
    const [c] = newCards([file('a.jpg')], []);
    let state = cardsReducer([c], { type: 'result', id: c.id, result: normalizeResult(fixture), usage });
    expect(state[0].status).toBe('ready');
    expect(state[0].selectedVariantId).toBe('v1');
    expect(selectedVariant(state[0])?.id).toBe('v1');
    state = cardsReducer(state, { type: 'result', id: c.id, result: normalizeResult(fixture), usage });
    expect(state[0].usage).toEqual({ input: 20, output: 40, cacheRead: 0, cacheWrite: 0 });
  });
  it('error keeps usage and supports a declined status', () => {
    const [c] = newCards([file('a.jpg')], []);
    const state = cardsReducer([c], { type: 'error', id: c.id, message: 'no', status: 'declined', usage });
    expect(state[0]).toMatchObject({ status: 'declined', error: 'no', usage });
  });
  it('status clears a previous error; options and variant selection patch the card; remove drops it', () => {
    const [c] = newCards([file('a.jpg')], []);
    let state = cardsReducer([c], { type: 'error', id: c.id, message: 'x' });
    state = cardsReducer(state, { type: 'status', id: c.id, status: 'generating' });
    expect(state[0].error).toBeUndefined();
    state = cardsReducer(state, { type: 'set_option', id: c.id, patch: { size: 'L', zone: 'top' } });
    expect(state[0]).toMatchObject({ size: 'L', zone: 'top' });
    state = cardsReducer(state, { type: 'select_variant', id: c.id, variantId: 'v3' });
    expect(state[0].selectedVariantId).toBe('v3');
    expect(cardsReducer(state, { type: 'remove', id: c.id })).toEqual([]);
  });
  it('exposes size multipliers', () => {
    expect(SIZE_SCALE).toEqual({ S: 0.85, M: 1, L: 1.15 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/cards.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/state/cards.ts`**

```ts
import type { PreparedImage } from '../lib/imagePrep';
import type { GenerationResult, Variant, StylePreset } from '../lib/schema';
import type { Zone, ScrimAdjust } from '../lib/layout';
import { EMPTY_USAGE, addUsage, type UsageSummary } from '../lib/usage';
import { slugify } from '../lib/download';

export type CardStatus = 'queued' | 'preparing' | 'waiting_key' | 'generating' | 'ready' | 'error' | 'declined';
export type SizeChoice = 'S' | 'M' | 'L';
export const SIZE_SCALE: Record<SizeChoice, number> = { S: 0.85, M: 1, L: 1.15 };

export interface Card {
  id: string;
  file: File;
  stem: string;
  status: CardStatus;
  prepared?: PreparedImage;
  result?: GenerationResult;
  usage: UsageSummary;
  selectedVariantId?: string;
  style: StylePreset | 'auto';
  zone: Zone | 'auto';
  size: SizeChoice;
  scrim: ScrimAdjust;
  error?: string;
}

export type CardAction =
  | { type: 'add'; cards: Card[] }
  | { type: 'status'; id: string; status: CardStatus }
  | { type: 'prepared'; id: string; prepared: PreparedImage }
  | { type: 'result'; id: string; result: GenerationResult; usage: UsageSummary }
  | { type: 'error'; id: string; message: string; status?: 'error' | 'declined'; usage?: UsageSummary }
  | { type: 'select_variant'; id: string; variantId: string }
  | { type: 'set_option'; id: string; patch: Partial<Pick<Card, 'style' | 'zone' | 'size' | 'scrim'>> }
  | { type: 'remove'; id: string };

export function uniqueStem(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function newCards(files: File[], takenStems: Iterable<string>): Card[] {
  const taken = new Set(takenStems);
  return files.map((file) => {
    const stem = uniqueStem(slugify(file.name), taken);
    taken.add(stem);
    return { id: crypto.randomUUID(), file, stem, status: 'queued', usage: EMPTY_USAGE, style: 'auto', zone: 'auto', size: 'M', scrim: 'auto' };
  });
}

export function selectedVariant(card: Card): Variant | undefined {
  return card.result?.variants.find((v) => v.id === card.selectedVariantId) ?? card.result?.variants[0];
}

const patchCard = (state: Card[], id: string, fn: (c: Card) => Card): Card[] => state.map((c) => (c.id === id ? fn(c) : c));

export function cardsReducer(state: Card[], a: CardAction): Card[] {
  switch (a.type) {
    case 'add': return [...a.cards, ...state];
    case 'status': return patchCard(state, a.id, (c) => ({ ...c, status: a.status, error: undefined }));
    case 'prepared': return patchCard(state, a.id, (c) => ({ ...c, prepared: a.prepared }));
    case 'result': return patchCard(state, a.id, (c) => ({ ...c, result: a.result, usage: addUsage(c.usage, a.usage), selectedVariantId: a.result.best_variant_id, status: 'ready', error: undefined }));
    case 'error': return patchCard(state, a.id, (c) => ({ ...c, status: a.status ?? 'error', error: a.message, usage: a.usage ? addUsage(c.usage, a.usage) : c.usage }));
    case 'select_variant': return patchCard(state, a.id, (c) => ({ ...c, selectedVariantId: a.variantId }));
    case 'set_option': return patchCard(state, a.id, (c) => ({ ...c, ...a.patch }));
    case 'remove': return state.filter((c) => c.id !== a.id);
  }
}
```

- [ ] **Step 4: Implement `src/lib/exporters.ts`**

```ts
import { PRESETS, PRESET_ORDER, type PresetId } from './layout';
import { renderPoster, canvasToBlob } from './render';
import { buildZip, captionsMarkdown, posterFilename, saveBlob, type CaptionEntry, type ZipEntry } from './download';
import { selectedVariant, SIZE_SCALE, type Card } from '../state/cards';
import type { Settings } from './settings';

export async function renderForCard(card: Card, presetId: PresetId, settings: Settings, guides = false): Promise<HTMLCanvasElement> {
  const variant = selectedVariant(card);
  if (!card.prepared || !card.result || !variant) throw new Error('Card is not ready to render');
  return renderPoster(
    { image: card.prepared, analysis: card.result.analysis, lines: variant.lines, quote: variant.quote },
    {
      preset: PRESETS[presetId],
      style: card.style === 'auto' ? variant.style_preset : card.style,
      zone: card.zone,
      sizeScale: SIZE_SCALE[card.size],
      scrimAdjust: card.scrim,
      attribution: settings.attribution && settings.handle.trim() ? settings.handle.trim() : null,
      guides,
    },
  );
}

export function captionEntry(card: Card): CaptionEntry | null {
  const v = selectedVariant(card);
  if (!v || !card.result) return null;
  return { stem: card.stem, mood: v.mood, quote: v.quote, captionTiktok: v.caption_tiktok, captionInstagram: v.caption_instagram, altText: card.result.alt_text };
}

export async function downloadPoster(card: Card, presetId: PresetId, settings: Settings): Promise<void> {
  const v = selectedVariant(card);
  if (!v) return;
  const blob = await canvasToBlob(await renderForCard(card, presetId, settings), settings.exportFormat);
  saveBlob(blob, posterFilename(card.stem, v.mood, presetId, settings.exportFormat));
}

export async function cardZipEntries(card: Card, settings: Settings): Promise<ZipEntry[]> {
  const v = selectedVariant(card);
  const entry = captionEntry(card);
  if (!v || !entry) return [];
  const out: ZipEntry[] = [];
  for (const id of PRESET_ORDER.filter((p) => settings.platforms.includes(p))) {
    const blob = await canvasToBlob(await renderForCard(card, id, settings), settings.exportFormat);
    out.push({ path: `${card.stem}/${posterFilename(card.stem, v.mood, id, settings.exportFormat)}`, data: await blob.arrayBuffer() });
  }
  out.push({ path: `${card.stem}/captions.md`, data: captionsMarkdown([entry]) });
  return out;
}

export async function downloadCardZip(card: Card, settings: Settings): Promise<void> {
  const entries = await cardZipEntries(card, settings);
  if (!entries.length) return;
  saveBlob(await buildZip(entries, 'blob'), `${card.stem}-posters.zip`);
}

export async function downloadBatchZip(cards: Card[], settings: Settings): Promise<void> {
  const ready = cards.filter((c) => c.status === 'ready');
  if (!ready.length) return;
  const entries: ZipEntry[] = [];
  const captions: CaptionEntry[] = [];
  for (const card of ready) {
    entries.push(...(await cardZipEntries(card, settings)));
    const e = captionEntry(card);
    if (e) captions.push(e);
  }
  entries.push({ path: 'captions.md', data: captionsMarkdown(captions) });
  saveBlob(await buildZip(entries, 'blob'), `loversintune-${timestamp()}.zip`);
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
```

- [ ] **Step 5: Implement `src/hooks/usePosterCanvas.ts`**

```ts
import { useEffect, type RefObject } from 'react';
import type { Card } from '../state/cards';
import type { PresetId } from '../lib/layout';
import type { Settings } from '../lib/settings';
import { renderForCard } from '../lib/exporters';

/** Renders the card's selected variant into `container` whenever anything that affects the poster changes. */
export function usePosterCanvas(container: RefObject<HTMLDivElement | null>, card: Card, presetId: PresetId, settings: Settings, guides: boolean): void {
  const ready = card.status === 'ready' && !!card.prepared && !!card.result;
  useEffect(() => {
    const el = container.current;
    if (!ready || !el) return;
    let cancelled = false;
    renderForCard(card, presetId, settings, guides)
      .then((canvas) => { if (!cancelled) el.replaceChildren(canvas); })
      .catch((err) => console.error('Poster render failed', err));
    return () => { cancelled = true; };
    // The effect reads `card` and `settings`, but only these fields change the poster.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, card.result, card.selectedVariantId, card.style, card.zone, card.size, card.scrim, presetId, settings.attribution, settings.handle, guides]);
}
```

- [ ] **Step 6: Run all tests and the type check**

Run: `npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: PASS; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/state/cards.ts src/lib/exporters.ts src/hooks/usePosterCanvas.ts test/cards.test.ts
git commit -m "feat: card state reducer, poster exporters and preview hook

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 13: UI components

**Files:**
- Create: `src/components/Dropzone.tsx`, `src/components/PlatformTabs.tsx`, `src/components/VariantChips.tsx`, `src/components/StyleControls.tsx`, `src/components/CaptionBox.tsx`, `src/components/PosterCard.tsx`, `src/components/SettingsDrawer.tsx`, `src/components/BatchBar.tsx`, `src/components/Toast.tsx`

**Interfaces:**
- Consumes: everything from Task 12 plus `PRESETS`, `PRESET_ORDER`, `ZONES`, `STYLE_PRESETS`, labels.
- Produces: the components below with the props shown. Verified by the type check here and in the browser in Tasks 14–15.

- [ ] **Step 1: `src/components/Dropzone.tsx`**

```tsx
import { useRef, useState } from 'react';

export function Dropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const handle = (list: FileList | null) => { if (list?.length) onFiles(Array.from(list)); };
  return (
    <div
      className={`dropzone${over ? ' over' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
    >
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { handle(e.target.files); e.target.value = ''; }} />
      <p className="dz-title">Drop your aesthetic images here</p>
      <p className="dz-sub">or click to choose · or paste from the clipboard · JPG, PNG, WebP · as many as you like</p>
    </div>
  );
}
```

- [ ] **Step 2: `src/components/PlatformTabs.tsx`, `VariantChips.tsx`, `StyleControls.tsx`, `CaptionBox.tsx`**

`PlatformTabs.tsx`:
```tsx
import { PRESETS, type PresetId } from '../lib/layout';

export function PlatformTabs({ ids, active, onChange }: { ids: PresetId[]; active: PresetId; onChange: (id: PresetId) => void }) {
  return (
    <div className="tabs" role="tablist">
      {ids.map((id) => (
        <button key={id} role="tab" aria-selected={id === active} className={`tab${id === active ? ' active' : ''}`} title={PRESETS[id].hint} onClick={() => onChange(id)}>
          {PRESETS[id].label}
        </button>
      ))}
    </div>
  );
}
```

`VariantChips.tsx`:
```tsx
import type { Variant } from '../lib/schema';
import { MOOD_LABELS } from '../lib/labels';

export function VariantChips({ variants, selectedId, onSelect }: { variants: Variant[]; selectedId?: string; onSelect: (id: string) => void }) {
  const sorted = [...variants].sort((a, b) => b.fit_score - a.fit_score);
  return (
    <div className="chips" role="listbox" aria-label="Quote variants">
      {sorted.map((v) => (
        <button key={v.id} role="option" aria-selected={v.id === selectedId} className={`chip mood-${v.mood}${v.id === selectedId ? ' active' : ''}`} title={v.why_it_fits} onClick={() => onSelect(v.id)}>
          <span className="chip-mood">{MOOD_LABELS[v.mood]}</span>
          <span className="chip-score">{v.fit_score}/10</span>
        </button>
      ))}
    </div>
  );
}
```

`StyleControls.tsx`:
```tsx
import { STYLE_PRESETS, type StylePreset } from '../lib/schema';
import { ZONES, type Zone, type ScrimAdjust } from '../lib/layout';
import { STYLE_LABELS, ZONE_LABELS } from '../lib/labels';
import type { SizeChoice } from '../state/cards';

export interface StyleValues { style: StylePreset | 'auto'; zone: Zone | 'auto'; size: SizeChoice; scrim: ScrimAdjust }

export function StyleControls({ values, autoStyle, onChange }: { values: StyleValues; autoStyle: StylePreset; onChange: (patch: Partial<StyleValues>) => void }) {
  return (
    <div className="controls">
      <label>Font
        <select value={values.style} onChange={(e) => onChange({ style: e.target.value as StyleValues['style'] })}>
          <option value="auto">Auto ({STYLE_LABELS[autoStyle]})</option>
          {STYLE_PRESETS.map((s) => <option key={s} value={s}>{STYLE_LABELS[s]}</option>)}
        </select>
      </label>
      <label>Position
        <select value={values.zone} onChange={(e) => onChange({ zone: e.target.value as StyleValues['zone'] })}>
          <option value="auto">Auto</option>
          {ZONES.map((z) => <option key={z} value={z}>{ZONE_LABELS[z]}</option>)}
        </select>
      </label>
      <label>Size
        <select value={values.size} onChange={(e) => onChange({ size: e.target.value as SizeChoice })}>
          <option value="S">Small</option><option value="M">Medium</option><option value="L">Large</option>
        </select>
      </label>
      <label>Backdrop
        <select value={values.scrim} onChange={(e) => onChange({ scrim: e.target.value as ScrimAdjust })}>
          <option value="auto">Auto</option><option value="lighter">Lighter</option><option value="stronger">Stronger</option>
        </select>
      </label>
    </div>
  );
}
```

`CaptionBox.tsx` (no `window.prompt`/`alert` fallbacks — dialogs block automation):
```tsx
import { useRef, useState } from 'react';

export function CaptionBox({ label, text }: { label: string; text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'select'>('idle');
  const pre = useRef<HTMLPreElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      const sel = window.getSelection();
      if (pre.current && sel) { sel.removeAllRanges(); const r = document.createRange(); r.selectNodeContents(pre.current); sel.addRange(r); }
      setState('select');
    }
    setTimeout(() => setState('idle'), 1600);
  };
  return (
    <div className="caption">
      <div className="caption-head">
        <span>{label}</span>
        <button className="btn small" onClick={copy}>{state === 'copied' ? 'Copied' : state === 'select' ? 'Press ⌘C' : 'Copy'}</button>
      </div>
      <pre ref={pre} className="caption-text">{text}</pre>
    </div>
  );
}
```

- [ ] **Step 3: `src/components/PosterCard.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { PRESETS, PRESET_ORDER, type PresetId } from '../lib/layout';
import type { Settings } from '../lib/settings';
import { MOOD_LABELS } from '../lib/labels';
import { selectedVariant, type Card, type CardStatus } from '../state/cards';
import { usePosterCanvas } from '../hooks/usePosterCanvas';
import { PlatformTabs } from './PlatformTabs';
import { VariantChips } from './VariantChips';
import { StyleControls, type StyleValues } from './StyleControls';
import { CaptionBox } from './CaptionBox';

interface Props {
  card: Card;
  settings: Settings;
  guides: boolean;
  onSelectVariant: (id: string) => void;
  onOption: (patch: Partial<StyleValues>) => void;
  onRetry: () => void;
  onRegenerate: () => void;
  onRemove: () => void;
  onDownload: (preset: PresetId) => Promise<void>;
  onDownloadZip: () => Promise<void>;
}

const STATUS_TEXT: Record<CardStatus, string> = {
  queued: 'Queued', preparing: 'Reading image…', waiting_key: 'Waiting for API key', generating: 'Claude is writing…',
  ready: 'Ready', error: 'Error', declined: 'Declined',
};

function useObjectUrl(file: File): string {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return url;
}

export function PosterCard(p: Props) {
  const enabled = PRESET_ORDER.filter((id) => p.settings.platforms.includes(id));
  const enabledKey = enabled.join(',');
  const [preset, setPreset] = useState<PresetId>(enabled[0] ?? 'tiktok');
  useEffect(() => { if (!enabled.includes(preset)) setPreset(enabled[0] ?? 'tiktok'); }, [enabledKey, enabled, preset]);
  const [busy, setBusy] = useState<'download' | 'zip' | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const thumb = useObjectUrl(p.card.file);
  usePosterCanvas(previewRef, p.card, preset, p.settings, p.guides);

  const variant = selectedVariant(p.card);
  const ready = p.card.status === 'ready' && !!variant && !!p.card.result;
  const run = async (what: 'download' | 'zip', fn: () => Promise<void>) => {
    setBusy(what);
    try { await fn(); } finally { setBusy(null); }
  };

  return (
    <article className={`card status-${p.card.status}`}>
      <div className="card-preview" data-preset={preset}>
        {ready ? (
          <div ref={previewRef} className="poster" />
        ) : (
          <div className="poster placeholder">
            <img src={thumb} alt="" />
            <span className="placeholder-text">{p.card.status === 'generating' && <span className="spinner" />}{STATUS_TEXT[p.card.status]}</span>
          </div>
        )}
      </div>
      <div className="card-body">
        <header className="card-head">
          <strong className="card-name" title={p.card.file.name}>{p.card.file.name}</strong>
          {p.card.prepared?.lowRes && <span className="badge warn" title="Source is narrower than 900px; the poster may look soft">low-res</span>}
          <span className={`badge ${p.card.status}`}>{STATUS_TEXT[p.card.status]}</span>
          <button className="btn ghost small" onClick={p.onRemove}>Remove</button>
        </header>
        {p.card.status === 'waiting_key' && <p className="hint">Add your Anthropic API key in Settings — this image will start automatically.</p>}
        {p.card.error && (
          <p className="error">{p.card.error} {p.card.status === 'error' && <button className="btn small" onClick={p.onRetry}>Retry</button>}</p>
        )}
        {ready && variant && p.card.result && (
          <>
            <PlatformTabs ids={enabled} active={preset} onChange={setPreset} />
            <VariantChips variants={p.card.result.variants} selectedId={p.card.selectedVariantId} onSelect={p.onSelectVariant} />
            <blockquote className="quote-text">
              {variant.quote}
              <footer>{MOOD_LABELS[variant.mood]} · {variant.why_it_fits}</footer>
            </blockquote>
            <StyleControls values={{ style: p.card.style, zone: p.card.zone, size: p.card.size, scrim: p.card.scrim }} autoStyle={variant.style_preset} onChange={p.onOption} />
            <div className="actions">
              <button className="btn primary" disabled={!!busy} onClick={() => run('download', () => p.onDownload(preset))}>
                {busy === 'download' ? 'Rendering…' : `Download ${PRESETS[preset].label}`}
              </button>
              <button className="btn" disabled={!!busy} onClick={() => run('zip', p.onDownloadZip)}>
                {busy === 'zip' ? 'Zipping…' : 'All sizes + captions (zip)'}
              </button>
              <button className="btn ghost" onClick={p.onRegenerate}>Regenerate quotes</button>
            </div>
            <CaptionBox label="TikTok caption" text={variant.caption_tiktok} />
            <CaptionBox label="Instagram caption" text={variant.caption_instagram} />
          </>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: `src/components/SettingsDrawer.tsx`, `BatchBar.tsx`, `Toast.tsx`**

`SettingsDrawer.tsx`:
```tsx
import type { Settings, CtaStyle, MoodEmphasis, Effort, ExportFormat } from '../lib/settings';
import { PRESETS, PRESET_ORDER, type PresetId } from '../lib/layout';

export function SettingsDrawer({ open, settings, onChange, onClose }: { open: boolean; settings: Settings; onChange: (s: Settings) => void; onClose: () => void }) {
  if (!open) return null;
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });
  const togglePlatform = (id: PresetId) => {
    const next = settings.platforms.includes(id) ? settings.platforms.filter((p) => p !== id) : [...settings.platforms, id];
    if (next.length) set('platforms', next);
  };
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head"><h2>Settings</h2><button className="btn ghost" onClick={onClose}>Close</button></header>

        <label>Anthropic API key
          <input type="password" value={settings.apiKey} placeholder="sk-ant-…" autoComplete="off" spellCheck={false} onChange={(e) => set('apiKey', e.target.value.trim())} />
        </label>
        <p className="hint">Stored only in this browser and sent straight to Anthropic. Don't enter it on a shared computer. <button className="link" onClick={() => set('apiKey', '')}>Forget key</button></p>

        <label>Brand handle<input value={settings.handle} onChange={(e) => set('handle', e.target.value)} /></label>
        <label>App name<input value={settings.appName} onChange={(e) => set('appName', e.target.value)} /></label>
        <label>Caption CTA
          <select value={settings.ctaStyle} onChange={(e) => set('ctaStyle', e.target.value as CtaStyle)}>
            <option value="none">None</option>
            <option value="soft">Soft — share / tag someone</option>
            <option value="brand">Brand — mention the app</option>
          </select>
        </label>
        <label>Mood emphasis
          <select value={settings.moodEmphasis} onChange={(e) => set('moodEmphasis', e.target.value as MoodEmphasis)}>
            <option value="balanced">Balanced</option>
            <option value="sad">More sad & longing</option>
            <option value="flirty">More flirty & playful</option>
          </select>
        </label>
        <label>Quality
          <select value={settings.effort} onChange={(e) => set('effort', e.target.value as Effort)}>
            <option value="low">Fast</option>
            <option value="medium">Balanced</option>
            <option value="high">Best (slower)</option>
          </select>
        </label>
        <fieldset>
          <legend>Platforms</legend>
          {PRESET_ORDER.map((id) => (
            <label key={id} className="check">
              <input type="checkbox" checked={settings.platforms.includes(id)} onChange={() => togglePlatform(id)} /> {PRESETS[id].label} <span className="hint">{PRESETS[id].hint}</span>
            </label>
          ))}
        </fieldset>
        <label>Export format
          <select value={settings.exportFormat} onChange={(e) => set('exportFormat', e.target.value as ExportFormat)}>
            <option value="image/jpeg">JPG (recommended)</option>
            <option value="image/png">PNG</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={settings.attribution} onChange={(e) => set('attribution', e.target.checked)} /> Add my handle under the quote</label>
      </aside>
    </div>
  );
}
```

`BatchBar.tsx`:
```tsx
export function BatchBar({ total, ready, costUsd, busy, onDownloadAll }: { total: number; ready: number; costUsd: number; busy: boolean; onDownloadAll: () => void }) {
  if (!total) return null;
  return (
    <div className="batchbar">
      <span>{ready} of {total} ready</span>
      <span className="cost" title="Estimated from token usage at Claude Opus 5 rates">≈ ${costUsd.toFixed(2)} this session</span>
      <button className="btn primary" disabled={!ready || busy} onClick={onDownloadAll}>{busy ? 'Zipping…' : `Download all (${ready})`}</button>
    </div>
  );
}
```

`Toast.tsx`:
```tsx
export function Toast({ message }: { message: string | null }) {
  return message ? <div className="toast" role="status">{message}</div> : null;
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean (components are not yet mounted; App still the placeholder).

- [ ] **Step 6: Commit**

```bash
git add src/components
git commit -m "feat(ui): dropzone, poster card, controls, captions, settings drawer, batch bar

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 14: App wiring — processing pipeline, fixture mode, styles

**Files:**
- Modify: `src/App.tsx` (replace placeholder), `src/styles.css` (replace placeholder)

**Interfaces:**
- Consumes: everything above. URL flags: `?fixture=1` skips the API and uses `test/fixtures/sample-result.json`; `&guides=1` overlays safe zones/bands on previews.
- Produces: the running app.

- [ ] **Step 1: Replace `src/App.tsx`**

```tsx
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import fixture from '../test/fixtures/sample-result.json';
import { loadSettings, saveSettings, type Settings, type MoodEmphasis } from './lib/settings';
import { prepareImage, isSupportedFile, type PreparedImage } from './lib/imagePrep';
import { generateForImage, type GenerateOutcome } from './lib/claude';
import { normalizeResult } from './lib/schema';
import { createQueue, type QueuedTask } from './lib/queue';
import { estimateCostUsd } from './lib/usage';
import { downloadPoster, downloadCardZip, downloadBatchZip } from './lib/exporters';
import { cardsReducer, newCards, type Card } from './state/cards';
import { Dropzone } from './components/Dropzone';
import { PosterCard } from './components/PosterCard';
import { SettingsDrawer } from './components/SettingsDrawer';
import { BatchBar } from './components/BatchBar';
import { Toast } from './components/Toast';

const params = new URLSearchParams(window.location.search);
const FIXTURE_MODE = params.get('fixture') === '1';
const GUIDES = params.get('guides') === '1';
const queue = createQueue(2);

async function fixtureOutcome(signal: AbortSignal): Promise<GenerateOutcome> {
  await new Promise((r) => setTimeout(r, 400));
  if (signal.aborted) return { ok: false, kind: 'aborted', message: 'Cancelled' };
  return { ok: true, result: normalizeResult(fixture), usage: { input: 1500, output: 1800, cacheRead: 0, cacheWrite: 0 } };
}

export function App() {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  const settingsRef = useRef(settings);
  const [cards, dispatch] = useReducer(cardsReducer, []);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const tasks = useRef(new Map<string, QueuedTask<GenerateOutcome>>());

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const updateSettings = (next: Settings) => {
    settingsRef.current = next;
    setSettingsState(next);
    saveSettings(next);
  };

  const generate = useCallback(async (id: string, prepared: PreparedImage, avoid: string[] = []) => {
    if (tasks.current.has(id)) return; // already in flight (StrictMode double effects, double clicks)
    const s = settingsRef.current;
    if (!s.apiKey && !FIXTURE_MODE) { dispatch({ type: 'status', id, status: 'waiting_key' }); return; }
    dispatch({ type: 'status', id, status: 'generating' });
    const task = queue.add<GenerateOutcome>((signal) =>
      FIXTURE_MODE
        ? fixtureOutcome(signal)
        : generateForImage({
            apiKey: s.apiKey, effort: s.effort,
            image: { base64: prepared.apiBase64, mediaType: prepared.apiMediaType },
            context: { handle: s.handle, appName: s.appName, ctaStyle: s.ctaStyle, moodEmphasis: s.moodEmphasis, avoid },
            signal,
          }),
    );
    tasks.current.set(id, task);
    try {
      const outcome = await task.promise;
      if (outcome.ok) dispatch({ type: 'result', id, result: outcome.result, usage: outcome.usage });
      else if (outcome.kind !== 'aborted') dispatch({ type: 'error', id, message: outcome.message, status: outcome.kind === 'refusal' ? 'declined' : 'error', usage: outcome.usage });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) dispatch({ type: 'error', id, message: e instanceof Error ? e.message : String(e) });
    } finally {
      tasks.current.delete(id);
    }
  }, []);

  const startCard = useCallback(async (card: Card) => {
    dispatch({ type: 'status', id: card.id, status: 'preparing' });
    let prepared: PreparedImage;
    try { prepared = await prepareImage(card.file); }
    catch { dispatch({ type: 'error', id: card.id, message: 'Could not read this image file.' }); return; }
    dispatch({ type: 'prepared', id: card.id, prepared });
    await generate(card.id, prepared);
  }, [generate]);

  const addFiles = useCallback((files: File[]) => {
    const ok = files.filter(isSupportedFile);
    const skipped = files.length - ok.length;
    if (skipped) showToast(`${skipped} file${skipped > 1 ? 's' : ''} skipped — use JPG, PNG or WebP`);
    if (!ok.length) return;
    const fresh = newCards(ok, cardsRef.current.map((c) => c.stem));
    dispatch({ type: 'add', cards: fresh });
    fresh.forEach((c) => { void startCard(c); });
  }, [startCard, showToast]);

  // Cards that were waiting for a key start as soon as one is saved.
  useEffect(() => {
    if (!settings.apiKey) return;
    for (const c of cardsRef.current) if (c.status === 'waiting_key' && c.prepared) void generate(c.id, c.prepared);
  }, [settings.apiKey, generate]);

  // Paste an image from the clipboard (Pinterest → copy image → ⌘V here).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const retry = (card: Card) => { if (card.prepared) void generate(card.id, card.prepared); else void startCard(card); };
  const regenerate = (card: Card) => { if (card.prepared) void generate(card.id, card.prepared, card.result?.variants.map((v) => v.quote) ?? []); };
  const remove = (card: Card) => { tasks.current.get(card.id)?.cancel(); dispatch({ type: 'remove', id: card.id }); };
  const downloadAll = async () => {
    setZipping(true);
    try { await downloadBatchZip(cardsRef.current, settingsRef.current); }
    catch (e) { console.error(e); showToast('Could not build the zip — download posters individually.'); }
    finally { setZipping(false); }
  };
  const guard = (fn: () => Promise<void>) => fn().catch((e) => { console.error(e); showToast('Download failed. Try again.'); });

  const readyCount = cards.filter((c) => c.status === 'ready').length;
  const cost = cards.reduce((sum, c) => sum + estimateCostUsd(c.usage), 0);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">💌</span>
          <div><h1>Lovers in Tune</h1><p>Quote Studio</p></div>
        </div>
        <div className="topbar-actions">
          <label className="inline">Mood
            <select value={settings.moodEmphasis} onChange={(e) => updateSettings({ ...settings, moodEmphasis: e.target.value as MoodEmphasis })}>
              <option value="balanced">Balanced</option>
              <option value="sad">More sad & longing</option>
              <option value="flirty">More flirty & playful</option>
            </select>
          </label>
          <button className={`btn${settings.apiKey || FIXTURE_MODE ? '' : ' attention'}`} onClick={() => setSettingsOpen(true)}>
            {settings.apiKey || FIXTURE_MODE ? 'Settings' : 'Settings · add API key'}
          </button>
        </div>
      </header>

      {!settings.apiKey && !FIXTURE_MODE && (
        <div className="banner">Paste your Anthropic API key in <button className="link" onClick={() => setSettingsOpen(true)}>Settings</button> to start generating. It stays in this browser and only goes to Anthropic.</div>
      )}
      {FIXTURE_MODE && <div className="banner">Fixture mode: using a sample result instead of calling Claude.{GUIDES ? ' Safe-zone guides on.' : ''}</div>}

      <Dropzone onFiles={addFiles} />
      <BatchBar total={cards.length} ready={readyCount} costUsd={cost} busy={zipping} onDownloadAll={() => void downloadAll()} />

      <section className="cards">
        {cards.map((card) => (
          <PosterCard
            key={card.id}
            card={card}
            settings={settings}
            guides={GUIDES}
            onSelectVariant={(variantId) => dispatch({ type: 'select_variant', id: card.id, variantId })}
            onOption={(patch) => dispatch({ type: 'set_option', id: card.id, patch })}
            onRetry={() => retry(card)}
            onRegenerate={() => regenerate(card)}
            onRemove={() => remove(card)}
            onDownload={(preset) => guard(() => downloadPoster(card, preset, settingsRef.current))}
            onDownloadZip={() => guard(() => downloadCardZip(card, settingsRef.current))}
          />
        ))}
      </section>

      <SettingsDrawer open={settingsOpen} settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
      <Toast message={toast} />
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/styles.css`**

```css
:root {
  --bg: #fbf7f3; --card: #ffffff; --ink: #1e1b18; --muted: #8a817a; --line: #ece4dc;
  --accent: #c4566b; --accent-ink: #ffffff; --warn: #b8860b; --ok: #3c8c5a; --err: #c0392b;
  --radius: 16px; --shadow: 0 10px 30px rgba(30, 27, 24, 0.08);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.45; }
button, input, select { font: inherit; }
h1, h2, p { margin: 0; }
.app { max-width: 1180px; margin: 0 auto; padding: 20px clamp(12px, 3vw, 32px) 80px; }

.topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 8px 0 20px; }
.brand { display: flex; align-items: center; gap: 12px; }
.logo { font-size: 32px; }
.brand h1 { font-size: 20px; letter-spacing: -0.01em; }
.brand p { color: var(--muted); font-size: 13px; }
.topbar-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.inline { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 14px; }

.btn { border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 999px; padding: 9px 16px; cursor: pointer; transition: transform .08s ease, box-shadow .15s ease; }
.btn:hover:not(:disabled) { box-shadow: var(--shadow); transform: translateY(-1px); }
.btn:disabled { opacity: .55; cursor: default; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.btn.ghost { background: transparent; }
.btn.small { padding: 5px 11px; font-size: 13px; }
.btn.attention { border-color: var(--accent); color: var(--accent); }
.link { background: none; border: none; color: var(--accent); text-decoration: underline; cursor: pointer; padding: 0; }

.banner { background: #fff3e8; border: 1px solid #f3d9c2; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; font-size: 14px; }

.dropzone { border: 2px dashed #d9cfc5; border-radius: var(--radius); background: var(--card); padding: 40px 20px; text-align: center; cursor: pointer; transition: border-color .15s, background .15s; }
.dropzone.over, .dropzone:hover { border-color: var(--accent); background: #fff8f5; }
.dz-title { font-size: 18px; font-weight: 600; }
.dz-sub { color: var(--muted); font-size: 13px; margin-top: 6px; }

.batchbar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 14px 0; color: var(--muted); font-size: 14px; }
.batchbar .cost { margin-left: auto; }

.cards { display: grid; gap: 20px; }
.card { display: grid; grid-template-columns: minmax(220px, 34%) 1fr; gap: 20px; background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow); padding: 18px; }
@media (max-width: 720px) { .card { grid-template-columns: 1fr; } }

.card-preview { align-self: start; }
.poster { border-radius: 12px; overflow: hidden; background: #eee6de; aspect-ratio: 9 / 16; }
.card-preview[data-preset="ig-portrait"] .poster { aspect-ratio: 4 / 5; }
.card-preview[data-preset="square"] .poster { aspect-ratio: 1 / 1; }
.poster canvas { display: block; width: 100%; height: auto; }
.poster.placeholder { position: relative; display: grid; place-items: center; }
.poster.placeholder img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .35; filter: blur(2px); }
.placeholder-text { position: relative; display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.85); padding: 8px 14px; border-radius: 999px; font-size: 13px; }
.spinner { width: 12px; height: 12px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.card-body { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.card-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.card-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46%; }
.card-head .btn { margin-left: auto; }
.badge { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; padding: 3px 8px; border-radius: 999px; background: #f2ece6; color: var(--muted); }
.badge.ready { background: #e6f4ea; color: var(--ok); }
.badge.error, .badge.declined { background: #fbe9e7; color: var(--err); }
.badge.warn { background: #fff5d6; color: var(--warn); }
.hint { color: var(--muted); font-size: 13px; }
.error { color: var(--err); font-size: 14px; }

.tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.tab { border: 1px solid var(--line); background: transparent; border-radius: 999px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
.tab.active { background: var(--ink); color: #fff; border-color: var(--ink); }

.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { display: inline-flex; align-items: baseline; gap: 6px; border: 1px solid var(--line); background: #faf6f2; border-radius: 10px; padding: 6px 10px; cursor: pointer; font-size: 13px; }
.chip.active { border-color: var(--accent); background: #fff0f3; }
.chip-score { color: var(--muted); font-size: 11px; }
.chip.mood-sad .chip-mood { color: #4a5a8a; } .chip.mood-longing .chip-mood { color: #6b5b95; } .chip.mood-flirty .chip-mood { color: #c4566b; }
.chip.mood-soft .chip-mood { color: #b07a4f; } .chip.mood-playful .chip-mood { color: #2f8f7a; } .chip.mood-devoted .chip-mood { color: #8a6d2f; } .chip.mood-spicy .chip-mood { color: #b3261e; }

.quote-text { margin: 0; padding: 12px 14px; border-left: 3px solid var(--accent); background: #fdf9f6; font-size: 17px; font-style: italic; }
.quote-text footer { font-style: normal; font-size: 12px; color: var(--muted); margin-top: 6px; }

.controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.controls label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
.controls select, .drawer input, .drawer select { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; background: #fff; color: var(--ink); }

.actions { display: flex; gap: 8px; flex-wrap: wrap; }

.caption { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.caption-head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #faf6f2; font-size: 13px; font-weight: 600; }
.caption-text { margin: 0; padding: 12px; white-space: pre-wrap; word-break: break-word; font: 14px/1.5 inherit; font-family: inherit; }

.drawer-backdrop { position: fixed; inset: 0; background: rgba(30,27,24,.35); display: flex; justify-content: flex-end; z-index: 20; }
.drawer { width: min(420px, 100%); height: 100%; overflow-y: auto; background: var(--card); padding: 22px; display: flex; flex-direction: column; gap: 14px; box-shadow: -10px 0 40px rgba(0,0,0,.15); }
.drawer-head { display: flex; justify-content: space-between; align-items: center; }
.drawer label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
.drawer label.check { flex-direction: row; align-items: center; font-weight: 400; }
.drawer fieldset { border: 1px solid var(--line); border-radius: 12px; display: flex; flex-direction: column; gap: 8px; }
.drawer legend { font-size: 13px; font-weight: 600; padding: 0 6px; }

.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--ink); color: #fff; padding: 10px 16px; border-radius: 999px; font-size: 14px; box-shadow: var(--shadow); z-index: 30; }
```

- [ ] **Step 3: Build, test, smoke in the browser**

Run: `npm test && npm run build`
Expected: all tests pass; build succeeds.

Run: `npm run dev` (background), then open `http://localhost:5173/loversintune/?fixture=1` in Chrome, drop any JPG. Expected: a card appears, shows "Reading image…" then "Claude is writing…", then a rendered poster with six mood chips, controls, two captions with Copy buttons, and no console errors. Open Settings, toggle a platform, confirm the tabs update. Open the plain URL (no `fixture`), confirm the "add API key" banner shows and a dropped image parks at "Waiting for API key".

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "feat(app): processing pipeline, fixture mode, settings, batch download and styling

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

---

### Task 15: Render verification in Chrome (fixture mode)

**Files:**
- Modify (only if the checks fail): `src/lib/render.ts`, `src/lib/layout.ts`, `src/lib/fonts.ts`
- Scratch: test images under the scratchpad directory (never committed)

**Interfaces:** none new. This task exists because the renderer's correctness is visual; it may loop (fix → re-check) until every item below passes.

- [ ] **Step 1: Get test images (real photos, several shapes)**

```bash
S=/private/tmp/claude-501/-Users-kiransilwal-Desktop-loversintune/b6045a5f-b45b-4b3e-b6e3-b7a11937cb58/scratchpad/test-images
mkdir -p "$S" && cd "$S"
curl -sL -o portrait.jpg  "https://picsum.photos/seed/lovers1/1200/1600"
curl -sL -o landscape.jpg "https://picsum.photos/seed/lovers2/1800/1200"
curl -sL -o square.jpg    "https://picsum.photos/seed/lovers3/1400/1400"
curl -sL -o grainy.jpg    "https://picsum.photos/seed/lovers4/1200/1500?grayscale"
curl -sL -o small.jpg     "https://picsum.photos/seed/lovers5/600/800"
ls -la
```
Expected: five JPEGs of a few hundred KB each.

- [ ] **Step 2: Open the app with guides and drop every image**

`npm run dev` (background). In Chrome (claude-in-chrome tools): navigate to `http://localhost:5173/loversintune/?fixture=1&guides=1`, upload each file through the dropzone's file input, wait for "Ready".

- [ ] **Step 3: Check every item, on every preset tab, for every image**

- [ ] Quote block (yellow box) lies fully inside the dashed safe rect; on 9:16 it stays clear of the bottom 420px and the sides.
- [ ] The chosen band (pink) is the calmest one unless it would cover the focal point; overriding Position to top/center/bottom moves the block accordingly.
- [ ] Text is legible on every image: scrim visible but not muddy; light text on dark photos, dark text on the pale/grey one.
- [ ] All five fonts render as web fonts (Playfair italic, Cormorant, Courier Prime, Caveat, Manrope caps) — switch the Font control through each; none looks like Times/Helvetica.
- [ ] Size S/M/L changes the font size; Backdrop lighter/stronger visibly changes the scrim.
- [ ] Attribution line "@LOVERSINTUNE" sits under the quote, small and letter-spaced; unticking it in Settings removes it.
- [ ] `small.jpg` shows the `low-res` badge.
- [ ] The Network panel shows no request to `api.anthropic.com` in fixture mode.

- [ ] **Step 4: Check downloads**

Download the TikTok, Instagram 4:5 and Square posters for one image, then:
```bash
cd ~/Downloads && for f in portrait-soft-*.jpg; do sips -g pixelWidth -g pixelHeight "$f" | tail -2; done
```
Expected: 1080×1920, 1080×1350, 1080×1080. Open one in Preview: crisp text, no guides (guides are for previews only — confirm `guides` is `false` in `downloadPoster`, which calls `renderForCard(card, presetId, settings)` without the flag).

Download the card zip; `unzip -l ~/Downloads/portrait-posters.zip` lists the enabled posters and `captions.md`.

- [ ] **Step 5: Turn guides off and judge the aesthetics**

Reload without `&guides=1`. Take a screenshot of each preset for two images. If the text feels too big/small or the scrim too heavy, adjust the constants (`baseFontPx`, `BAND_FRACTION`, `baseScrimOpacity`) and re-run the unit tests — they pin the arithmetic, so update the expected numbers deliberately if a constant changes.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A src test
git commit -m "fix(render): tune layout after visual verification

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```
(Skip the commit if nothing changed.)

---

### Task 16: README, GitHub Actions deploy, repo creation and live check

**Files:**
- Create: `README.md`, `.github/workflows/deploy.yml`

**Interfaces:** none new. Produces the public repo `kiransilwal10/loversintune` and the live site.

- [ ] **Step 1: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write `README.md`**

```markdown
# Lovers in Tune · Quote Studio

Drop aesthetic (Pinterest-style) images → get couple-quote posters sized for TikTok and Instagram, plus captions for both platforms. Runs entirely in your browser; the quotes are written by Claude from the image itself, using your own API key.

**Live:** https://kiransilwal10.github.io/loversintune/

## How to use it

1. Open the site → **Settings** → paste your Anthropic API key (create one at https://console.anthropic.com → API keys). It is stored only in your browser's localStorage and sent straight to Anthropic — never to this site's servers (there are none).
2. Set your handle, app name, caption CTA style and quality.
3. Drop images (or paste one from the clipboard). Each image gets six quote variants across moods (sad, longing, flirty, soft, playful, devoted, spicy), ranked by fit, with a TikTok and an Instagram caption each.
4. Pick a variant, switch the platform tab, tweak font / position / size / backdrop, and download — or **Download all** for a zip with every poster and a `captions.md`.

Output sizes: TikTok / Reels / Stories 1080×1920, Instagram feed 1080×1350, Square 1080×1080. Text is kept inside each platform's safe zone.

## Cost

About $0.03–0.06 per image on `claude-opus-5` (the app shows a running estimate). "Fast" quality is cheaper and quicker; "Best" gives the strongest quotes.

## Privacy

Your API key and settings live in this browser only. Images never leave your machine except as a downscaled copy sent to Anthropic's API for the quote generation. Don't enter your key on a shared computer; use **Forget key** in Settings when done.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173/loversintune/
npm test             # Vitest unit tests
npm run build        # type-check + production build to dist/
```

Handy URLs while developing: `?fixture=1` uses a bundled sample result instead of calling Claude; add `&guides=1` to overlay safe zones and text bands on previews.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/` to GitHub Pages.
```

- [ ] **Step 3: Verify the build one more time and commit**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add README.md .github/workflows/deploy.yml
git commit -m "docs: README and GitHub Pages deploy workflow

Claude-Session: https://claude.ai/code/session_01XRHRLTUWYLpTWmbXQi2Nnc"
```

- [ ] **Step 4: Create the public repo, enable Pages (Actions source), push**

```bash
gh repo create loversintune --public --source=. --remote=origin --description "Couple-quote poster studio for TikTok & Instagram"
gh api -X POST repos/kiransilwal10/loversintune/pages -f build_type=workflow
git push -u origin main
```
Expected: repo URL printed; the Pages call returns JSON with `"build_type": "workflow"` (a 409 means it already exists — fine); push succeeds and triggers the workflow.

- [ ] **Step 5: Watch the deploy and check the live site**

```bash
gh run list --limit 1
gh run watch --exit-status
curl -sI https://kiransilwal10.github.io/loversintune/ | head -1
```
Expected: the run completes with `succeeded`; curl returns `HTTP/2 200`. Then open the live URL in Chrome: the app loads (fonts, dropzone, Settings) with no console errors, and `https://kiransilwal10.github.io/loversintune/?fixture=1` renders a poster from a dropped image.

- [ ] **Step 6: Confirm the key is nowhere in the repo**

```bash
git grep -n "sk-ant" -- . ':!README.md' ':!docs' || echo "no keys in repo"
```
Expected: `no keys in repo` (the README only contains the placeholder text "sk-ant-…" in the UI, which lives in `src/components/SettingsDrawer.tsx` as a placeholder attribute — that match is acceptable; anything else is not).

---

## Self-review notes

- Spec coverage: §2 flow → Tasks 12–14; §4 Claude integration → Tasks 4, 6, 9; §5 rendering → Tasks 2, 3, 7, 8, 15; §6 UI → Tasks 13–14; §7 downloads → Tasks 11–12; §8 settings → Task 5; §9 errors → Tasks 9, 12, 14; §10 testing → every task's tests + Task 15; §11 deployment → Task 16.
- Spec §5.5 fitting rule is refined in Task 3 (suggested breaks honored down to 78 % of base size, then word re-wrap) — the spec's intent (never a tiny font to keep a break) is preserved.
- Spec §5.7: previews render at full size and are CSS-scaled (spec already updated).
