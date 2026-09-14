import { useWhatsAppStore, WhatsAppStatus } from "./whatsappStore";
import { requestReconnect, requestLogout } from "./whatsappSocket";

const STATUS_BADGE: Record<WhatsAppStatus, { label: string; className: string }> = {
  CONNECTED: { label: "Bağlı", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  INITIALIZING: { label: "Başlatılıyor", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  QR_READY: { label: "QR Bekleniyor", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  AUTHENTICATING: { label: "Doğrulanıyor", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  DISCONNECTED: { label: "Bağlantı Yok", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  CONFLICT: { label: "Çakışma", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  DISCONNECTED_UNEXPECTED: { label: "Bağlantı Koptu", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

export function WhatsAppSyncCard() {
  const { status, qrBase64, lastError, lastConnectedAt, highlight } = useWhatsAppStore();
  const badge = STATUS_BADGE[status];
  const busy = status === "INITIALIZING" || status === "AUTHENTICATING";

  function handleLogout() {
    if (window.confirm("WhatsApp oturumunu kapatmak istediğinize emin misiniz? Otomatik bildirimler duracak.")) {
      requestLogout();
    }
  }

  return (
    <div
      id="whatsapp-sync-card"
      className={`h-fit rounded-2xl border border-slate-200 bg-paper2 p-5 dark:border-slate-800 dark:bg-surface ${
        highlight ? "animate-pulse ring-4 ring-red-400" : ""
      }`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-extrabold text-slate-900 dark:text-white">WhatsApp Entegrasyonu</div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.className}`}>{badge.label}</span>
      </div>

      {status === "QR_READY" && qrBase64 && (
        <div className="mb-4 flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700">
          <img src={qrBase64} alt="WhatsApp QR kodu" className="h-48 w-48 animate-pulse" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Telefonunuzdan taratın</span>
        </div>
      )}

      {busy && !qrBase64 && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-center text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Yeni QR Alınıyor…
        </div>
      )}

      {lastError && (
        <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {lastError}
        </div>
      )}

      <div className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        {lastConnectedAt ? `Son bağlantı: ${new Date(lastConnectedAt).toLocaleString("tr-TR")}` : "Henüz bağlantı kurulmadı"}
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={requestReconnect}
          disabled={busy}
          className="rounded-lg bg-brand px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50"
        >
          {busy ? "Bağlanıyor…" : "Yeniden Başlat / Bağlantıyı Yenile"}
        </button>
        <button
          onClick={handleLogout}
          className="rounded-lg bg-red-50 px-3 py-2 text-xs font-extrabold text-red-600 dark:bg-red-900/20 dark:text-red-400"
        >
          Oturumu Kapat
        </button>
      </div>
    </div>
  );
}
