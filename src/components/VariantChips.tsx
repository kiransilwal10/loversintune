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
