import { useEffect, useState } from "react";
import { useAuthStore } from "../../features/auth/authStore";
import { AdminStudentsTab } from "./tabs/AdminStudentsTab";
import { AdminStaffTab } from "./tabs/AdminStaffTab";
import { AdminPaymentsTab } from "./tabs/AdminPaymentsTab";
import { AdminContentTab } from "./tabs/AdminContentTab";
import { AdminScheduleTab } from "./tabs/AdminScheduleTab";
import { connectWhatsAppSocket, disconnectWhatsAppSocket } from "../../features/whatsapp/whatsappSocket";
import { DISCONNECTED_STATUSES, useWhatsAppStore } from "../../features/whatsapp/whatsappStore";

const TABS = [
  { key: "students", label: "Öğrenci Yönetimi" },
  { key: "staff", label: "Eğitmen & Uzman" },
  { key: "payments", label: "Ödeme & WhatsApp" },
  { key: "content", label: "Site İçeriği" },
  { key: "schedule", label: "Antrenman Programı Yönetimi" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AdminPanelPage() {
  const { displayName } = useAuthStore();
  const [tab, setTab] = useState<TabKey>("students");
  const status = useWhatsAppStore((s) => s.status);
  const triggerHighlight = useWhatsAppStore((s) => s.triggerHighlight);

  useEffect(() => {
    connectWhatsAppSocket();
    return () => disconnectWhatsAppSocket();
  }, []);

  const whatsappDisconnected = DISCONNECTED_STATUSES.includes(status);

  function goToWhatsAppCard() {
    setTab("schedule");
    setTimeout(() => {
      document.getElementById("whatsapp-sync-card")?.scrollIntoView({ behavior: "smooth" });
      triggerHighlight();
    }, 50);
  }

  return (
    <div>
      {whatsappDisconnected && (
        <div className="fixed right-4 top-4 z-50 flex max-w-xs items-center gap-3 rounded-xl bg-red-600 px-4 py-3 text-xs font-bold text-white shadow-lg">
          <span>WhatsApp bağlantısı kopuk! Otomatik veli bilgilendirmeleri çalışmıyor.</span>
          <button onClick={goToWhatsAppCard} className="shrink-0 rounded-lg bg-white/20 px-2.5 py-1.5 font-extrabold">
            QR Okut
          </button>
        </div>
      )}

      <div className="flex items-center gap-4 border-b border-slate-200 bg-paper2 px-7 py-6 dark:border-slate-800 dark:bg-surface">
        <div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white">Yönetici Paneli</div>
          <div className="text-xs text-slate-400">{displayName}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 px-7 pt-4 dark:border-slate-800 dark:bg-transparent">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-t-xl px-4 py-2.5 text-sm font-bold ${
              tab === t.key ? "bg-paper2 text-brand dark:bg-surface dark:text-[#93c5fd]" : "text-slate-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "students" && <AdminStudentsTab />}
      {tab === "staff" && <AdminStaffTab />}
      {tab === "payments" && <AdminPaymentsTab />}
      {tab === "content" && <AdminContentTab />}
      {tab === "schedule" && <AdminScheduleTab />}
    </div>
  );
}
