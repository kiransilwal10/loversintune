import type { PresetId } from './layout';

export type CtaStyle = 'none' | 'soft' | 'brand';
export type MoodEmphasis = 'balanced' | 'sad' | 'flirty';
export type Effort = 'low' | 'medium' | 'high';
export type ExportFormat = 'image/jpeg' | 'image/png';

export interface Settings {
  apiKey: string;
  handle: string;
  appName: string;
  ctaStyle: CtaStyle;
  moodEmphasis: MoodEmphasis;
  effort: Effort;
  platforms: PresetId[];
  exportFormat: ExportFormat;
  attribution: boolean;
}

export const SETTINGS_KEY = 'lit.settings.v1';
export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  handle: '',
  appName: '',
  ctaStyle: 'soft',
  moodEmphasis: 'balanced',
  effort: 'high',
  platforms: ['tiktok', 'ig-portrait'],
  exportFormat: 'image/jpeg',
  attribution: true,
};

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const CTA_STYLES: readonly CtaStyle[] = ['none', 'soft', 'brand'];
const MOOD_EMPHASES: readonly MoodEmphasis[] = ['balanced', 'sad', 'flirty'];
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high'];
const PRESET_IDS: readonly PresetId[] = ['tiktok', 'ig-portrait', 'square'];
const FORMATS: readonly ExportFormat[] = ['image/jpeg', 'image/png'];

function pick<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;
}

function defaultStorage(): StorageLike | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function loadSettings(storage: StorageLike | null = defaultStorage()): Settings {
  if (!storage) return { ...DEFAULT_SETTINGS, platforms: [...DEFAULT_SETTINGS.platforms] };
  let raw: unknown = null;
  try { const s = storage.getItem(SETTINGS_KEY); raw = s ? JSON.parse(s) : null; } catch { raw = null; }
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS, platforms: [...DEFAULT_SETTINGS.platforms] };
  const r = raw as Record<string, unknown>;
  const platforms = Array.isArray(r.platforms)
    ? (r.platforms as unknown[]).filter((p): p is PresetId => (PRESET_IDS as readonly unknown[]).includes(p))
    : [];
  return {
    apiKey: typeof r.apiKey === 'string' ? r.apiKey : '',
    handle: typeof r.handle === 'string' ? r.handle : DEFAULT_SETTINGS.handle,
    appName: typeof r.appName === 'string' ? r.appName : DEFAULT_SETTINGS.appName,
    ctaStyle: pick(r.ctaStyle, CTA_STYLES, DEFAULT_SETTINGS.ctaStyle),
    moodEmphasis: pick(r.moodEmphasis, MOOD_EMPHASES, DEFAULT_SETTINGS.moodEmphasis),
    effort: pick(r.effort, EFFORTS, DEFAULT_SETTINGS.effort),
    platforms: platforms.length ? platforms : [...DEFAULT_SETTINGS.platforms],
    exportFormat: pick(r.exportFormat, FORMATS, DEFAULT_SETTINGS.exportFormat),
    attribution: typeof r.attribution === 'boolean' ? r.attribution : DEFAULT_SETTINGS.attribution,
  };
}

export function saveSettings(settings: Settings, storage: StorageLike | null = defaultStorage()): void {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage blocked or full: settings live for this session only */ }
}
