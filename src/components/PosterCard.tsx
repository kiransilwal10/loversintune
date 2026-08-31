import { useEffect, useRef, useState } from 'react';
import { PRESETS, PRESET_ORDER, type PresetId } from '../lib/layout';
import type { Settings } from '../lib/settings';
import { MOOD_LABELS } from '../lib/labels';
import { selectedVariant, type Card, type CardStatus } from '../state/cards';
import { usePosterCanvas } from '../hooks/usePosterCanvas';
import { PlatformTabs } from './PlatformTabs';
import { VariantChips } from './VariantChips';
import { StyleControls, type StyleValues } from './StyleControls';
import { CaptionBox } from './CaptionBox';

interface Props {
  card: Card;
  settings: Settings;
  guides: boolean;
  onSelectVariant: (id: string) => void;
  onOption: (patch: Partial<StyleValues>) => void;
  onRetry: () => void;
  onRegenerate: () => void;
  onRemove: () => void;
  onDownload: (preset: PresetId) => Promise<void>;
  onDownloadZip: () => Promise<void>;
}

const STATUS_TEXT: Record<CardStatus, string> = {
  queued: 'Queued', preparing: 'Reading image…', waiting_key: 'Waiting for API key', generating: 'Claude is writing…',
  ready: 'Ready', error: 'Error', declined: 'Declined',
};

/**
 * Data URL for the thumbnail, read via FileReader rather than `URL.createObjectURL`.
 * A blob URL assigned to `<img src>` in the same synchronous render that creates it can lose a
 * race against Chromium's async blob-registry IPC (renderer → browser process): the image fetch
 * sometimes dispatches before the registration lands, failing with `net::ERR_FILE_NOT_FOUND`.
 * Data URLs are parsed inline with no such round trip, so no race is possible.
 */
function useObjectUrl(file: File): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    setUrl('');
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => { if (!cancelled && typeof reader.result === 'string') setUrl(reader.result); };
    reader.readAsDataURL(file);
    return () => { cancelled = true; };
  }, [file]);
  return url;
}

export function PosterCard(p: Props) {
  const enabled = PRESET_ORDER.filter((id) => p.settings.platforms.includes(id));
  const enabledKey = enabled.join(',');
  const [preset, setPreset] = useState<PresetId>(enabled[0] ?? 'tiktok');
  useEffect(() => { if (!enabled.includes(preset)) setPreset(enabled[0] ?? 'tiktok'); }, [enabledKey, enabled, preset]);
  const [busy, setBusy] = useState<'download' | 'zip' | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const thumb = useObjectUrl(p.card.file);
  usePosterCanvas(previewRef, p.card, preset, p.settings, p.guides);

  const variant = selectedVariant(p.card);
  const ready = p.card.status === 'ready' && !!variant && !!p.card.result;
  const run = async (what: 'download' | 'zip', fn: () => Promise<void>) => {
    setBusy(what);
    try { await fn(); } finally { setBusy(null); }
  };

  return (
    <article className={`card status-${p.card.status}`}>
      <div className="card-preview" data-preset={preset}>
        {ready ? (
          <div ref={previewRef} className="poster" />
        ) : (
          <div className="poster placeholder">
            {thumb && <img src={thumb} alt="" />}
            <span className="placeholder-text">{p.card.status === 'generating' && <span className="spinner" />}{STATUS_TEXT[p.card.status]}</span>
          </div>
        )}
      </div>
      <div className="card-body">
        <header className="card-head">
          <strong className="card-name" title={p.card.file.name}>{p.card.file.name}</strong>
          {p.card.prepared?.lowRes && <span className="badge warn" title="Source is narrower than 900px; the poster may look soft">low-res</span>}
          <span className={`badge ${p.card.status}`}>{STATUS_TEXT[p.card.status]}</span>
          <button className="btn ghost small" onClick={p.onRemove}>Remove</button>
        </header>
        {p.card.status === 'waiting_key' && <p className="hint">Add your Anthropic API key in Settings — this image will start automatically.</p>}
        {p.card.error && (
          <p className="error">{p.card.error} {p.card.status === 'error' && <button className="btn small" onClick={p.onRetry}>Retry</button>}</p>
        )}
        {ready && variant && p.card.result && (
          <>
            <PlatformTabs ids={enabled} active={preset} onChange={setPreset} />
            <VariantChips variants={p.card.result.variants} selectedId={p.card.selectedVariantId} onSelect={p.onSelectVariant} />
            <blockquote className="quote-text">
              {variant.quote}
              <footer>{MOOD_LABELS[variant.mood]} · {variant.why_it_fits}</footer>
            </blockquote>
            <StyleControls values={{ style: p.card.style, zone: p.card.zone, size: p.card.size, scrim: p.card.scrim }} autoStyle={variant.style_preset} onChange={p.onOption} />
            <div className="actions">
              <button className="btn primary" disabled={!!busy} onClick={() => run('download', () => p.onDownload(preset))}>
                {busy === 'download' ? 'Rendering…' : `Download ${PRESETS[preset].label}`}
              </button>
              <button className="btn" disabled={!!busy} onClick={() => run('zip', p.onDownloadZip)}>
                {busy === 'zip' ? 'Zipping…' : 'All sizes + captions (zip)'}
              </button>
              <button className="btn ghost" onClick={p.onRegenerate}>Regenerate quotes</button>
            </div>
            <CaptionBox label="TikTok caption" text={variant.caption_tiktok} />
            <CaptionBox label="Instagram caption" text={variant.caption_instagram} />
          </>
        )}
      </div>
    </article>
  );
}
