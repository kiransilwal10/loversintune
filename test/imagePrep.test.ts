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
