import type { Mood, StylePreset } from './schema';
import type { Zone } from './layout';

export const MOOD_LABELS: Record<Mood, string> = {
  sad: 'Sad', longing: 'Longing', flirty: 'Flirty', soft: 'Soft', playful: 'Playful', devoted: 'Devoted', spicy: 'Spicy',
};
export const STYLE_LABELS: Record<StylePreset, string> = {
  editorial: 'Editorial italic', serif: 'Classic serif', typewriter: 'Typewriter', handwritten: 'Handwritten', minimal: 'Minimal caps',
};
export const ZONE_LABELS: Record<Zone, string> = { top: 'Top', center: 'Center', bottom: 'Bottom' };
