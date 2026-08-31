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
