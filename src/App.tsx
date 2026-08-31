import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import fixture from '../test/fixtures/sample-result.json';
import { loadSettings, saveSettings, type Settings, type MoodEmphasis } from './lib/settings';
import { prepareImage, isSupportedFile, type PreparedImage } from './lib/imagePrep';
import { generateForImage, type GenerateOutcome } from './lib/claude';
import { normalizeResult } from './lib/schema';
import { createQueue, type QueuedTask } from './lib/queue';
import { estimateCostUsd } from './lib/usage';
import { downloadPoster, downloadCardZip, downloadBatchZip } from './lib/exporters';
import { cardsReducer, newCards, type Card } from './state/cards';
import { Dropzone } from './components/Dropzone';
import { PosterCard } from './components/PosterCard';
import { SettingsDrawer } from './components/SettingsDrawer';
import { BatchBar } from './components/BatchBar';
import { Toast } from './components/Toast';

const params = new URLSearchParams(window.location.search);
const FIXTURE_MODE = params.get('fixture') === '1';
const GUIDES = params.get('guides') === '1';
const queue = createQueue(2);

async function fixtureOutcome(signal: AbortSignal): Promise<GenerateOutcome> {
  await new Promise((r) => setTimeout(r, 400));
  if (signal.aborted) return { ok: false, kind: 'aborted', message: 'Cancelled' };
  return { ok: true, result: normalizeResult(fixture), usage: { input: 1500, output: 1800, cacheRead: 0, cacheWrite: 0 } };
}

export function App() {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  const settingsRef = useRef(settings);
  const [cards, dispatch] = useReducer(cardsReducer, []);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const tasks = useRef(new Map<string, QueuedTask<GenerateOutcome>>());

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const updateSettings = (next: Settings) => {
    settingsRef.current = next;
    setSettingsState(next);
    saveSettings(next);
  };

  const generate = useCallback(async (id: string, prepared: PreparedImage, avoid: string[] = []) => {
    if (tasks.current.has(id)) return; // already in flight (StrictMode double effects, double clicks)
    const s = settingsRef.current;
    if (!s.apiKey && !FIXTURE_MODE) { dispatch({ type: 'status', id, status: 'waiting_key' }); return; }
    dispatch({ type: 'status', id, status: 'generating' });
    const task = queue.add<GenerateOutcome>((signal) =>
      FIXTURE_MODE
        ? fixtureOutcome(signal)
        : generateForImage({
            apiKey: s.apiKey, effort: s.effort,
            image: { base64: prepared.apiBase64, mediaType: prepared.apiMediaType },
            context: { handle: s.handle, appName: s.appName, ctaStyle: s.ctaStyle, moodEmphasis: s.moodEmphasis, avoid },
            signal,
          }),
    );
    tasks.current.set(id, task);
    try {
      const outcome = await task.promise;
      if (outcome.ok) dispatch({ type: 'result', id, result: outcome.result, usage: outcome.usage });
      else if (outcome.kind !== 'aborted') dispatch({ type: 'error', id, message: outcome.message, status: outcome.kind === 'refusal' ? 'declined' : 'error', usage: outcome.usage });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) dispatch({ type: 'error', id, message: e instanceof Error ? e.message : String(e) });
    } finally {
      tasks.current.delete(id);
    }
  }, []);

  const startCard = useCallback(async (card: Card) => {
    dispatch({ type: 'status', id: card.id, status: 'preparing' });
    let prepared: PreparedImage;
    try { prepared = await prepareImage(card.file); }
    catch { dispatch({ type: 'error', id: card.id, message: 'Could not read this image file.' }); return; }
    dispatch({ type: 'prepared', id: card.id, prepared });
    await generate(card.id, prepared);
  }, [generate]);

  const addFiles = useCallback((files: File[]) => {
    const ok = files.filter(isSupportedFile);
    const skipped = files.length - ok.length;
    if (skipped) showToast(`${skipped} file${skipped > 1 ? 's' : ''} skipped — use JPG, PNG or WebP`);
    if (!ok.length) return;
    const fresh = newCards(ok, cardsRef.current.map((c) => c.stem));
    dispatch({ type: 'add', cards: fresh });
    fresh.forEach((c) => { void startCard(c); });
  }, [startCard, showToast]);

  // Cards that were waiting for a key start as soon as one is saved.
  useEffect(() => {
    if (!settings.apiKey) return;
    for (const c of cardsRef.current) if (c.status === 'waiting_key' && c.prepared) void generate(c.id, c.prepared);
  }, [settings.apiKey, generate]);

  // Paste an image from the clipboard (Pinterest → copy image → ⌘V here).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const retry = (card: Card) => { if (card.prepared) void generate(card.id, card.prepared); else void startCard(card); };
  const regenerate = (card: Card) => { if (card.prepared) void generate(card.id, card.prepared, card.result?.variants.map((v) => v.quote) ?? []); };
  const remove = (card: Card) => { tasks.current.get(card.id)?.cancel(); dispatch({ type: 'remove', id: card.id }); };
  const downloadAll = async () => {
    setZipping(true);
    try { await downloadBatchZip(cardsRef.current, settingsRef.current); }
    catch (e) { console.error(e); showToast('Could not build the zip — download posters individually.'); }
    finally { setZipping(false); }
  };
  const guard = (fn: () => Promise<void>) => fn().catch((e) => { console.error(e); showToast('Download failed. Try again.'); });

  const readyCount = cards.filter((c) => c.status === 'ready').length;
  const cost = cards.reduce((sum, c) => sum + estimateCostUsd(c.usage), 0);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">💌</span>
          <div><h1>Lovers in Tune</h1><p>Quote Studio</p></div>
        </div>
        <div className="topbar-actions">
          <label className="inline">Mood
            <select value={settings.moodEmphasis} onChange={(e) => updateSettings({ ...settings, moodEmphasis: e.target.value as MoodEmphasis })}>
              <option value="balanced">Balanced</option>
              <option value="sad">More sad & longing</option>
              <option value="flirty">More flirty & playful</option>
            </select>
          </label>
          <button className={`btn${settings.apiKey || FIXTURE_MODE ? '' : ' attention'}`} onClick={() => setSettingsOpen(true)}>
            {settings.apiKey || FIXTURE_MODE ? 'Settings' : 'Settings · add API key'}
          </button>
        </div>
      </header>

      {!settings.apiKey && !FIXTURE_MODE && (
        <div className="banner">Paste your Anthropic API key in <button className="link" onClick={() => setSettingsOpen(true)}>Settings</button> to start generating. It stays in this browser and only goes to Anthropic.</div>
      )}
      {FIXTURE_MODE && <div className="banner">Fixture mode: using a sample result instead of calling Claude.{GUIDES ? ' Safe-zone guides on.' : ''}</div>}

      <Dropzone onFiles={addFiles} />
      <BatchBar total={cards.length} ready={readyCount} costUsd={cost} busy={zipping} onDownloadAll={() => void downloadAll()} />

      <section className="cards">
        {cards.map((card) => (
          <PosterCard
            key={card.id}
            card={card}
            settings={settings}
            guides={GUIDES}
            onSelectVariant={(variantId) => dispatch({ type: 'select_variant', id: card.id, variantId })}
            onOption={(patch) => dispatch({ type: 'set_option', id: card.id, patch })}
            onRetry={() => retry(card)}
            onRegenerate={() => regenerate(card)}
            onRemove={() => remove(card)}
            onDownload={(preset) => guard(() => downloadPoster(card, preset, settingsRef.current))}
            onDownloadZip={() => guard(() => downloadCardZip(card, settingsRef.current))}
          />
        ))}
      </section>

      <SettingsDrawer open={settingsOpen} settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
      <Toast message={toast} />
    </div>
  );
}
