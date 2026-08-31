export function BatchBar({ total, ready, costUsd, busy, onDownloadAll }: { total: number; ready: number; costUsd: number; busy: boolean; onDownloadAll: () => void }) {
  if (!total) return null;
  return (
    <div className="batchbar">
      <span>{ready} of {total} ready</span>
      <span className="cost" title="Estimated from token usage at Claude Opus 5 rates">≈ ${costUsd.toFixed(2)} this session</span>
      <button className="btn primary" disabled={!ready || busy} onClick={onDownloadAll}>{busy ? 'Zipping…' : `Download all (${ready})`}</button>
    </div>
  );
}
