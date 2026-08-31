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
