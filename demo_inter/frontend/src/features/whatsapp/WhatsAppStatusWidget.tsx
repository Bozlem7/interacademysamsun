import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useWhatsAppStore, WhatsAppStatus } from "./whatsappStore";
import { requestLogout, requestReconnect } from "./whatsappSocket";
import { WhatsAppQrModal } from "./WhatsAppQrModal";

type PendingAction = "restart" | "logout" | null;

const TOAST_DURATION_MS = 4000;
// Backend'den beklenen onay hiç gelmezse (ör. socket paketi kaybolursa) buton sonsuza kadar
// kilitli kalmasın diye güvenlik ağı.
const PENDING_ACTION_TIMEOUT_MS = 8000;

const PENDING_STATUSES: WhatsAppStatus[] = ["INITIALIZING", "QR_READY", "AUTHENTICATING"];

function badgeForStatus(status: WhatsAppStatus): { dot: string; label: string } {
  if (status === "CONNECTED") return { dot: "bg-green-500", label: "Bağlı" };
  if (PENDING_STATUSES.includes(status)) return { dot: "bg-yellow-500", label: "QR Bekleniyor" };
  return { dot: "bg-red-500", label: "Bağlantı Yok" };
}

export function WhatsAppStatusWidget() {
  const status = useWhatsAppStore((s) => s.status);
  const setStatus = useWhatsAppStore((s) => s.setStatus);
  const setQr = useWhatsAppStore((s) => s.setQr);
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [toast, setToast] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const awaitingLogoutConfirmRef = useRef(false);

  const badge = badgeForStatus(status);

  // Sayfa yenilendiğinde/mount olduğunda rozet backend'i beklemesin — anlık durumu bir kez
  // REST'ten çek. Ardından whatsappSocket.ts'deki 'wp:status' dinleyicisi güncel tutar.
  useEffect(() => {
    apiClient
      .get("/whatsapp/status")
      .then((res) => {
        const data = res.data as {
          status: WhatsAppStatus;
          qrBase64: string | null;
          attempt: number;
          maxAttempts: number;
          lastError: string | null;
        };
        setStatus(data.status, data.lastError ?? undefined);
        if (data.qrBase64) setQr(data.qrBase64, data.attempt, data.maxAttempts);
      })
      .catch((err) => console.error("[whatsapp] Başlangıç durumu alınamadı:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bağlantı kurulunca QR modalı açıksa otomatik kapat.
  useEffect(() => {
    if (status === "CONNECTED") setModalOpen(false);
  }, [status]);

  // Rozet SADECE bu efekt aracılığıyla, yani backend'den gelen gerçek 'status' değeri
  // üzerinden güncellenir — buton tıklaması kendi başına hiçbir zaman rengi değiştirmez.
  useEffect(() => {
    setPendingAction(null);

    if (awaitingLogoutConfirmRef.current && status !== "CONNECTED" && !PENDING_STATUSES.includes(status)) {
      awaitingLogoutConfirmRef.current = false;
      setModalOpen(false);
      setToast("Oturum kapatıldı");
    }
  }, [status]);

  useEffect(() => {
    if (!pendingAction) return;
    const timer = setTimeout(() => setPendingAction(null), PENDING_ACTION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingAction]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  function handleRestart() {
    if (pendingAction) return;
    setPendingAction("restart");
    setMenuOpen(false);
    setModalOpen(true);
    requestReconnect();
  }

  function handleDisconnect() {
    if (pendingAction) return;
    if (
      !window.confirm("WhatsApp oturumu kapatılacak. Devam edilsin mi?")
    ) {
      return;
    }
    setPendingAction("logout");
    setMenuOpen(false);
    awaitingLogoutConfirmRef.current = true;
    requestLogout();
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-paper2 px-3 py-1.5 dark:border-slate-700 dark:bg-surface2"
      >
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
          <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
          {badge.label}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">▾</span>
      </button>

      {menuOpen && (
        <div className="absolute right-0 z-40 mt-1 w-64 rounded-xl border border-slate-200 bg-paper2 p-1.5 shadow-lg dark:border-slate-700 dark:bg-surface2">
          <button
            type="button"
            onClick={handleRestart}
            disabled={pendingAction !== null}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200 dark:hover:bg-white/5"
          >
            {pendingAction === "restart" && (
              <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
            )}
            Yeniden Bağlan
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={pendingAction !== null}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            {pendingAction === "logout" && (
              <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-red-200 border-t-red-600" />
            )}
            Bağlantıyı Kes
          </button>
        </div>
      )}

      <WhatsAppQrModal open={modalOpen} onClose={() => setModalOpen(false)} />

      {toast && (
        <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-lg dark:bg-slate-700">
          {toast}
        </div>
      )}
    </div>
  );
}
