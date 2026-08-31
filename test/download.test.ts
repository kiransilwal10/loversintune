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
