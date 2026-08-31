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
