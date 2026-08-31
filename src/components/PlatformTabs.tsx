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
