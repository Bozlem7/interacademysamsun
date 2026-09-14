import { useEffect, useState } from "react";
import { useWhatsAppStore } from "./whatsappStore";
import { requestLogout, requestReconnect } from "./whatsappSocket";

const QR_WAIT_TIMEOUT_MS = 20000;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function WhatsAppQrModal({ open, onClose }: Props) {
  const { status, qrBase64, lastError } = useWhatsAppStore();
  const [timedOut, setTimedOut] = useState(false);

  const busy = status === "INITIALIZING" || status === "AUTHENTICATING";
  const waitingForQr = open && !qrBase64 && status !== "CONNECTED";

  // Sunucu belirli bir süre icinde QR uretemezse (ör. tarayici baslatma sorunu) kullaniciyi
  // sonsuza kadar "bekleniyor" spinner'inda birakmak yerine "Yeniden Dene" secenegi sunuyoruz.
  useEffect(() => {
    if (!waitingForQr) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), QR_WAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waitingForQr, status]);

  if (!open) return null;

  function handleLogout() {
    if (window.confirm("WhatsApp oturumunu kapatmak istediğinize emin misiniz? Otomatik bildirimler duracak.")) {
      requestLogout();
    }
  }

  function handleRetry() {
    setTimedOut(false);
    requestReconnect();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-paper2 p-6 dark:bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-extrabold text-slate-900 dark:text-white">WhatsApp QR Kod</div>
          <button onClick={onClose} className="text-lg font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            ✕
          </button>
        </div>

        {status === "QR_READY" && qrBase64 ? (
          <div className="flex flex-col items-center gap-2">
            <img src={qrBase64} alt="WhatsApp QR kodu" className="h-56 w-56" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Telefonunuzdan taratın</span>
          </div>
        ) : timedOut ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              QR kod {QR_WAIT_TIMEOUT_MS / 1000} saniye içinde gelmedi. Sunucu tarafında bir sorun olabilir.
            </span>
            <button
              onClick={handleRetry}
              className="rounded-lg bg-brand px-4 py-2 text-xs font-extrabold text-white"
            >
              Yeniden Dene
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
            {busy ? "Bağlanıyor…" : "QR kod bekleniyor…"}
          </div>
        )}

        {lastError && (
          <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {lastError}
          </div>
        )}

        <button
          onClick={handleLogout}
          className="mt-4 w-full rounded-lg bg-red-50 px-3 py-2 text-xs font-extrabold text-red-600 dark:bg-red-900/20 dark:text-red-400"
        >
          Oturumu Kapat
        </button>
      </div>
    </div>
  );
}
