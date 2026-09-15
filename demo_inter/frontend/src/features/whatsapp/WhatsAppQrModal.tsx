import { useEffect, useState } from "react";
import { DIAGNOSTIC_STEP_LABEL, useWhatsAppStore } from "./whatsappStore";
import { requestLogout, requestReconnect } from "./whatsappSocket";

// Backend baglanti/sorgu timeout'larini 90-120sn'ye kadar genisletti (yavas VPS aglari
// icin), bu yuzden frontend'in "vazgec, yeniden dene" esigi de buna gore genis tutuluyor.
const QR_WAIT_TIMEOUT_MS = 60000;
const SLOW_CONNECTION_WARNING_MS = 45000;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function WhatsAppQrModal({ open, onClose }: Props) {
  const { status, qrBase64, lastError, lastDiagnosticStep, diagnosticSteps, sessionStartedAt } = useWhatsAppStore();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

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

  // Backend'den gelen tanı (diagnostic) adımlarına göre "X. sn, şu an ne yapıyor" sayacı.
  useEffect(() => {
    if (!waitingForQr || !sessionStartedAt) {
      setElapsedMs(0);
      return;
    }
    const tick = () => setElapsedMs(Date.now() - sessionStartedAt);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [waitingForQr, sessionStartedAt]);

  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const isSlow = elapsedMs >= SLOW_CONNECTION_WARNING_MS;
  const stepLabel = (lastDiagnosticStep && DIAGNOSTIC_STEP_LABEL[lastDiagnosticStep.step]) || "Sunucu WhatsApp'a bağlanıyor";

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
            <span>
              {stepLabel}
              {elapsedSeconds > 0 && ` (${elapsedSeconds}. sn)`}
            </span>
            {isSlow && (
              <span className="rounded-lg bg-amber-50 px-3 py-2 font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                İnternet bağlantısı yavaş görünüyor, bağlanma süresi uzadı…
              </span>
            )}
          </div>
        )}

        {lastError && (
          <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {lastError}
          </div>
        )}

        {(timedOut || lastError) && diagnosticSteps.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowDiagnostics((v) => !v)}
              className="text-xs font-bold text-slate-500 underline dark:text-slate-400"
            >
              {showDiagnostics ? "Teşhis detaylarını gizle" : "Teşhis detaylarını göster"}
            </button>
            {showDiagnostics && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 text-[11px] dark:border-slate-700 dark:bg-black/20">
                {diagnosticSteps.map((s, i) => (
                  <div key={i} className="flex justify-between gap-2 py-0.5 text-slate-600 dark:text-slate-300">
                    <span>{DIAGNOSTIC_STEP_LABEL[s.step] ?? s.step}{s.detail ? ` — ${s.detail}` : ""}</span>
                    <span className="shrink-0 text-slate-400">{s.durationMs !== null ? `+${s.durationMs}ms` : ""}</span>
                  </div>
                ))}
              </div>
            )}
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
