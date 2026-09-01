import type { Settings, CtaStyle, MoodEmphasis, Effort, ExportFormat } from '../lib/settings';
import { PRESETS, PRESET_ORDER, type PresetId } from '../lib/layout';

export function SettingsDrawer({ open, settings, onChange, onClose }: { open: boolean; settings: Settings; onChange: (s: Settings) => void; onClose: () => void }) {
  if (!open) return null;
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });
  const togglePlatform = (id: PresetId) => {
    const next = settings.platforms.includes(id) ? settings.platforms.filter((p) => p !== id) : [...settings.platforms, id];
    if (next.length) set('platforms', next);
  };
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head"><h2>Settings</h2><button className="btn ghost" onClick={onClose}>Close</button></header>

        <label>Anthropic API key
          <input type="password" value={settings.apiKey} placeholder="sk-ant-…" autoComplete="off" spellCheck={false} onChange={(e) => set('apiKey', e.target.value.trim())} />
        </label>
        <p className="hint">Stored only in this browser and sent straight to Anthropic. Don't enter it on a shared computer. <button className="link" onClick={() => set('apiKey', '')}>Forget key</button></p>

        <label>Your handle (drawn under quotes)<input value={settings.handle} placeholder="@yourhandle — optional" onChange={(e) => set('handle', e.target.value)} /></label>
        <p className="hint">Each poster card also has its own "Line under the quote" box to override this.</p>
        <label>App or brand name<input value={settings.appName} placeholder="Optional — only used by the Brand CTA" onChange={(e) => set('appName', e.target.value)} /></label>
        <label>Caption CTA
          <select value={settings.ctaStyle} onChange={(e) => set('ctaStyle', e.target.value as CtaStyle)}>
            <option value="none">None</option>
            <option value="soft">Soft — share / tag someone</option>
            <option value="brand">Brand — mention the app</option>
          </select>
        </label>
        {settings.ctaStyle === 'brand' && !settings.appName.trim() && (
          <p className="hint">Add an app or brand name above, or captions will fall back to the soft nudge.</p>
        )}
        <label>Mood emphasis
          <select value={settings.moodEmphasis} onChange={(e) => set('moodEmphasis', e.target.value as MoodEmphasis)}>
            <option value="balanced">Balanced</option>
            <option value="sad">More sad & longing</option>
            <option value="flirty">More flirty & playful</option>
          </select>
        </label>
        <label>Quality
          <select value={settings.effort} onChange={(e) => set('effort', e.target.value as Effort)}>
            <option value="low">Fast</option>
            <option value="medium">Balanced</option>
            <option value="high">Best (slower)</option>
          </select>
        </label>
        <fieldset>
          <legend>Platforms</legend>
          {PRESET_ORDER.map((id) => (
            <label key={id} className="check">
              <input type="checkbox" checked={settings.platforms.includes(id)} onChange={() => togglePlatform(id)} /> {PRESETS[id].label} <span className="hint">{PRESETS[id].hint}</span>
            </label>
          ))}
        </fieldset>
        <label>Export format
          <select value={settings.exportFormat} onChange={(e) => set('exportFormat', e.target.value as ExportFormat)}>
            <option value="image/jpeg">JPG (recommended)</option>
            <option value="image/png">PNG</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={settings.attribution} onChange={(e) => set('attribution', e.target.checked)} /> Draw a line under the quote (your handle, or each card's own line)</label>
      </aside>
    </div>
  );
}
