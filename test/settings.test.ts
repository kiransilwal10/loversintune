import { describe, it, expect } from 'vitest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, SETTINGS_KEY, type StorageLike } from '../src/lib/settings';

const memory = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};

describe('settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings(memory())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it('round-trips through storage', () => {
    const s = memory();
    saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'sk-ant-test', handle: '@me', platforms: ['square'] }, s);
    expect(s.map.get(SETTINGS_KEY)).toContain('sk-ant-test');
    expect(loadSettings(s)).toMatchObject({ apiKey: 'sk-ant-test', handle: '@me', platforms: ['square'] });
  });
  it('tolerates junk and fills missing or invalid fields with defaults', () => {
    const s = memory();
    s.setItem(SETTINGS_KEY, '{not json');
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    s.setItem(SETTINGS_KEY, JSON.stringify({ apiKey: 42, ctaStyle: 'loud', effort: 'max', platforms: ['bogus'], attribution: 'yes' }));
    const loaded = loadSettings(s);
    expect(loaded.apiKey).toBe('');
    expect(loaded.ctaStyle).toBe(DEFAULT_SETTINGS.ctaStyle);
    expect(loaded.effort).toBe(DEFAULT_SETTINGS.effort);
    expect(loaded.platforms).toEqual(DEFAULT_SETTINGS.platforms);
    expect(loaded.attribution).toBe(true);
  });
  it('defaults to Best quality, TikTok + IG portrait, JPG, soft CTA', () => {
    expect(DEFAULT_SETTINGS.effort).toBe('high');
    expect(DEFAULT_SETTINGS.platforms).toEqual(['tiktok', 'ig-portrait']);
    expect(DEFAULT_SETTINGS.exportFormat).toBe('image/jpeg');
    expect(DEFAULT_SETTINGS.ctaStyle).toBe('soft');
  });
  it('ships brand-neutral: no handle or app name until the user sets one', () => {
    expect(DEFAULT_SETTINGS.handle).toBe('');
    expect(DEFAULT_SETTINGS.appName).toBe('');
  });
});
