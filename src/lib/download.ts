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
