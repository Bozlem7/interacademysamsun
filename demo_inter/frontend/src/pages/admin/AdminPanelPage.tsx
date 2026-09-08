import { useState } from "react";
import { useAuthStore } from "../../features/auth/authStore";
import { AdminStudentsTab } from "./tabs/AdminStudentsTab";
import { AdminStaffTab } from "./tabs/AdminStaffTab";
import { AdminPaymentsTab } from "./tabs/AdminPaymentsTab";
import { AdminContentTab } from "./tabs/AdminContentTab";
import { AdminScheduleTab } from "./tabs/AdminScheduleTab";

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

  return (
    <div>
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
