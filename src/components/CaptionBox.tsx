import { useRef, useState } from 'react';

export function CaptionBox({ label, text }: { label: string; text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'select'>('idle');
  const pre = useRef<HTMLPreElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      const sel = window.getSelection();
      if (pre.current && sel) { sel.removeAllRanges(); const r = document.createRange(); r.selectNodeContents(pre.current); sel.addRange(r); }
      setState('select');
    }
    setTimeout(() => setState('idle'), 1600);
  };
  return (
    <div className="caption">
      <div className="caption-head">
        <span>{label}</span>
        <button className="btn small" onClick={copy}>{state === 'copied' ? 'Copied' : state === 'select' ? 'Press ⌘C' : 'Copy'}</button>
      </div>
      <pre ref={pre} className="caption-text">{text}</pre>
    </div>
  );
}
