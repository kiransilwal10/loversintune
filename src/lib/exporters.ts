import { PRESETS, PRESET_ORDER, type PresetId } from './layout';
import { renderPoster, canvasToBlob } from './render';
import { buildZip, captionsMarkdown, posterFilename, saveBlob, type CaptionEntry, type ZipEntry } from './download';
import { selectedVariant, resolveAttribution, SIZE_SCALE, type Card } from '../state/cards';
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
      attribution: resolveAttribution(card, settings),
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
