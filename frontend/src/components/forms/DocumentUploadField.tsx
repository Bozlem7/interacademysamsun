import { useRef, useState } from "react";

const MAX_FILES = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

export function DocumentUploadField({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function addFiles(incoming: FileList | File[]) {
    const accepted = Array.from(incoming).filter((f) => ACCEPTED_TYPES.includes(f.type));
    if (accepted.length === 0) return;
    onChange([...files, ...accepted].slice(0, MAX_FILES));
  }

  function remove(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  function swap(a: number, b: number) {
    if (b < 0 || b >= files.length) return;
    const next = [...files];
    [next[a], next[b]] = [next[b], next[a]];
    onChange(next);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
          dragOver ? "border-brand bg-brand/5" : "border-slate-300 hover:border-brand dark:border-slate-700"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
          📎 Dosyaları buraya sürükleyin veya seçmek için tıklayın
        </div>
        <div className="mt-1 text-xs text-slate-400">JPG, PNG veya PDF · en fazla {MAX_FILES} dosya</div>
      </div>

      {files.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
          {files.map((f, i) => (
            <div key={`${f.name}-${f.lastModified}-${i}`} className="rounded-lg border border-slate-200 p-1.5 dark:border-slate-700">
              {f.type === "application/pdf" ? (
                <div className="flex h-20 w-full items-center justify-center rounded bg-slate-100 text-2xl dark:bg-surface2">📄</div>
              ) : (
                <img src={URL.createObjectURL(f)} alt={f.name} className="h-20 w-full rounded object-cover" />
              )}
              <div className="mt-1 truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400" title={f.name}>
                {i + 1}. {f.name}
              </div>
              <div className="mt-1 flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => swap(i, i - 1)}
                  disabled={i === 0}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 disabled:opacity-30 dark:bg-surface2 dark:text-slate-300"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => swap(i, i + 1)}
                  disabled={i === files.length - 1}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 disabled:opacity-30 dark:bg-surface2 dark:text-slate-300"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-950/30"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
