import { PropsWithChildren, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Açılan her diyalog için: (1) açılışta odağı verilen elemana taşır, (2) pencere açıkken Tab
// tuşuyla gezinmeyi diyalog içindeki odaklanabilir elemanlarla sınırlar (arka plandaki sayfaya
// kaçmasın), (3) Escape ile kapatmayı sağlar, (4) kapanınca odağı diyalogu açan elemana geri verir.
function useDialogA11y(open: boolean, containerRef: React.RefObject<HTMLElement>, initialFocusRef: React.RefObject<HTMLElement>, onDismiss: () => void) {
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    initialFocusRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onDismiss();
        return;
      }
      if (e.key !== "Tab" || !containerRef.current) return;
      const focusable = containerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: PropsWithChildren<{ open: boolean; onClose: () => void; title: string }>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useDialogA11y(open, containerRef, closeButtonRef, onClose);
  if (!open) return null;

  // Portal: bu diyalog artık, açıldığı yerin DOM hiyerarşisinden (ör. bir üst ekranın kendi
  // konumlandırma/stacking bağlamından) bağımsız olarak doğrudan <body>'e render edilir — üstteki
  // bir ekranın arkasında kalma riski, z-index'ten bağımsız olarak yapısal şekilde ortadan kalkar.
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-5"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-3xl bg-paper2 p-6 pr-14 dark:bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
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
    </div>,
    document.body
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
  const containerRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const isOpen = open && errors.length > 0;
  useDialogA11y(isOpen, containerRef, confirmButtonRef, onClose);
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
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
          ref={confirmButtonRef}
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-red-600 py-3.5 text-sm font-extrabold text-white transition-colors hover:bg-red-700"
        >
          Tamam, Düzelteyim
        </button>
      </div>
    </div>,
    document.body
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
  const containerRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  useDialogA11y(open, containerRef, confirmButtonRef, onCancel);
  if (!open) return null;

  // Portal + z-[10000]: bu diyalog, açıldığı ekran hâlâ açık bir Modal'ın (z-[9999]) içinden
  // tetiklenebiliyor (ör. "Evrak Sil" onayı). Eskiden aynı DOM dalında, düşük bir z-index'te (z-50)
  // render edildiği için üstteki Modal'ın tam ekran backdrop'ının (kendi onClick={onClose}'uyla)
  // ARKASINDA kalıyor, tüm tıklamalar ona ulaşamadan üstteki backdrop tarafından yutuluyordu.
  // createPortal ile <body>'e taşınıp en üst z-index'e çekilerek bu yapısal olarak çözüldü.
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 p-5" onClick={onCancel}>
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl bg-paper2 p-6 dark:bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-lg font-extrabold text-slate-900 dark:text-white">{title}</div>
        <div className="mb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{body}</div>
        <div className="flex gap-2.5">
          <button
            ref={confirmButtonRef}
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
    </div>,
    document.body
  );
}
