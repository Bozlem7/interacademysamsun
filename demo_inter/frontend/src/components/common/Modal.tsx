import { PropsWithChildren } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
}: PropsWithChildren<{ open: boolean; onClose: () => void; title: string }>) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-5"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-3xl bg-paper2 p-6 pr-14 dark:bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-2xl font-bold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-surface2 dark:hover:text-white"
        >
          ✕
        </button>
        {title && <div className="mb-4 text-xl font-extrabold text-slate-900 dark:text-white">{title}</div>}
        {children}
      </div>
    </div>
  );
}

/**
 * Merkezi hata pop-up'ı: uzun formlarda (öğrenci kaydı vb.) validasyon hatalarını sayfanın
 * tepesindeki statik bir div yerine ekranın ortasında, tüm hataları tek seferde listeleyerek
 * gösterir — kullanıcının hatayı görmek için sayfayı yukarı kaydırmasına gerek kalmaz.
 */
export function ErrorDialog({
  open,
  errors,
  onClose,
  title = "Formda Hata Var",
}: {
  open: boolean;
  errors: string[];
  onClose: () => void;
  title?: string;
}) {
  if (!open || errors.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-3xl border border-red-500/20 bg-paper2 p-6 shadow-2xl dark:bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-xl dark:bg-red-500/15">
            <span aria-hidden>⚠️</span>
          </div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white">{title}</div>
        </div>
        <ul className="mb-6 space-y-2">
          {errors.map((msg, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm font-semibold leading-relaxed text-red-600 dark:bg-red-500/10 dark:text-red-300"
            >
              <span className="shrink-0">•</span>
              <span>{msg}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-red-600 py-3.5 text-sm font-extrabold text-white transition-colors hover:bg-red-700"
        >
          Tamam, Düzelteyim
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Onayla",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    // z-[10000]: ConfirmDialog genellikle zaten açık bir Modal'ın (z-[9999]) içinden/yanından
    // tetiklenir (ör. "Evrak Sil" onayı). z-50 kullanıldığında üst Modal'ın tam ekran backdrop'ı
    // (kendi onClick={onClose}'uyla) üstte kalıp tüm tıklamaları yutuyor, onay butonuna hiç
    // ulaşılamıyordu — ErrorDialog ile aynı üst katmana (z-[10000]) çekildi.
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 p-5" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-paper2 p-6 dark:bg-surface" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 text-lg font-extrabold text-slate-900 dark:text-white">{title}</div>
        <div className="mb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{body}</div>
        <div className="flex gap-2.5">
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-extrabold text-white hover:bg-red-700"
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 dark:bg-surface2 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Vazgeç
          </button>
        </div>
      </div>
    </div>
  );
}
