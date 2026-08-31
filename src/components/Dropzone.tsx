import { useRef, useState } from 'react';

export function Dropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const handle = (list: FileList | null) => { if (list?.length) onFiles(Array.from(list)); };
  return (
    <div
      className={`dropzone${over ? ' over' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
    >
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { handle(e.target.files); e.target.value = ''; }} />
      <p className="dz-title">Drop your aesthetic images here</p>
      <p className="dz-sub">or click to choose · or paste from the clipboard · JPG, PNG, WebP · as many as you like</p>
    </div>
  );
}
