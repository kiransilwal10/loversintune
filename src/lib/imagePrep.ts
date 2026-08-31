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
