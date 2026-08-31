import { STYLE_PRESETS, type StylePreset } from '../lib/schema';
import { ZONES, type Zone, type ScrimAdjust } from '../lib/layout';
import { STYLE_LABELS, ZONE_LABELS } from '../lib/labels';
import type { SizeChoice } from '../state/cards';

export interface StyleValues { style: StylePreset | 'auto'; zone: Zone | 'auto'; size: SizeChoice; scrim: ScrimAdjust }

export function StyleControls({ values, autoStyle, onChange }: { values: StyleValues; autoStyle: StylePreset; onChange: (patch: Partial<StyleValues>) => void }) {
  return (
    <div className="controls">
      <label>Font
        <select value={values.style} onChange={(e) => onChange({ style: e.target.value as StyleValues['style'] })}>
          <option value="auto">Auto ({STYLE_LABELS[autoStyle]})</option>
          {STYLE_PRESETS.map((s) => <option key={s} value={s}>{STYLE_LABELS[s]}</option>)}
        </select>
      </label>
      <label>Position
        <select value={values.zone} onChange={(e) => onChange({ zone: e.target.value as StyleValues['zone'] })}>
          <option value="auto">Auto</option>
          {ZONES.map((z) => <option key={z} value={z}>{ZONE_LABELS[z]}</option>)}
        </select>
      </label>
      <label>Size
        <select value={values.size} onChange={(e) => onChange({ size: e.target.value as SizeChoice })}>
          <option value="S">Small</option><option value="M">Medium</option><option value="L">Large</option>
        </select>
      </label>
      <label>Backdrop
        <select value={values.scrim} onChange={(e) => onChange({ scrim: e.target.value as ScrimAdjust })}>
          <option value="auto">Auto</option><option value="lighter">Lighter</option><option value="stronger">Stronger</option>
        </select>
      </label>
    </div>
  );
}
