import { useEffect, useState } from "react";
import { useWhatsAppStore } from "./whatsappStore";
import { requestReconnect } from "./whatsappSocket";
import { WhatsAppQrModal } from "./WhatsAppQrModal";

export function WhatsAppStatusWidget() {
  const status = useWhatsAppStore((s) => s.status);
  const [modalOpen, setModalOpen] = useState(false);
  const connected = status === "CONNECTED";

  // Bağlantı kurulunca modal açıksa otomatik kapat.
  useEffect(() => {
    if (connected) setModalOpen(false);
  }, [connected]);

  function handleClick() {
    requestReconnect();
    if (!connected) setModalOpen(true);
  }

  return (
    <>
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-paper2 px-3 py-1.5 dark:border-slate-700 dark:bg-surface2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          {connected ? "Bağlı" : "Bağlantı Yok"}
        </span>
        <button
          onClick={handleClick}
          className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-extrabold text-white"
        >
          {connected ? "Yeniden Başlat" : "Bağlan"}
        </button>
      </div>

      <WhatsAppQrModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
