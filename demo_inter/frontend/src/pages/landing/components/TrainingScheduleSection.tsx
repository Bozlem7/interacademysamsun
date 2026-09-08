import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { SPECIALTY_BADGE_CLASS, SPECIALTY_BORDER_CLASS, sessionTypeToSpecialty } from "../../../lib/specialtyColors";

interface SessionRow {
  id: string;
  group: { name: string; branch?: { name: string; code: string } };
  dayOfWeek: number;
  startTime: string;
  endTime?: string | null;
  sessionType: "saha" | "diyet" | "psikolog";
  location?: string | null;
  description?: string | null;
}

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const TYPE_LABEL: Record<string, string> = { saha: "Saha Antrenmanı", diyet: "Diyetisyen", psikolog: "Psikolog" };

const BRANCH_TABS = [
  { code: "atakum", label: "Atakum Programı" },
  { code: "vezirkopru", label: "Vezirköprü Programı" },
];

function fmtTime(t: string) {
  return t?.toString().slice(11, 16) || t?.toString().slice(0, 5) || "";
}

export function TrainingScheduleSection() {
  const [allRows, setAllRows] = useState<SessionRow[]>([]);
  const [activeDay, setActiveDay] = useState(0);
  const [activeBranchCode, setActiveBranchCode] = useState(BRANCH_TABS[0].code);

  useEffect(() => {
    apiClient.get("/schedule").then((r) => setAllRows(r.data));
  }, []);

  const rows = allRows.filter((r) => r.group?.branch?.code === activeBranchCode);
  const byDay = DAYS.map((_, i) => rows.filter((r) => r.dayOfWeek === i));

  return (
    <section id="antrenman-programi" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="mb-2.5 text-xs font-extrabold tracking-[1.2px] text-[#0057B8] dark:text-[#93c5fd]">ANTRENMAN PROGRAMI</div>
      <div className="text-[26px] font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-[32px]">
        Yaş gruplarına göre haftalık plan
      </div>
      <div className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-500">
        Bu program yönetim panelinden güncellenir — görüntüleme amaçlıdır.
      </div>

      {/* Şube sekmeleri */}
      <div className="mt-4 flex gap-2">
        {BRANCH_TABS.map((b) => (
          <button
            key={b.code}
            onClick={() => setActiveBranchCode(b.code)}
            className={`rounded-full px-4 py-2 text-xs font-extrabold transition-colors ${
              activeBranchCode === b.code
                ? "bg-[#010E80] text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-[#111827] dark:text-slate-400"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="mt-3.5 hidden overflow-hidden rounded-[18px] border border-slate-200 bg-paper2 dark:border-slate-800 dark:bg-surface md:block">
        <div className="grid grid-cols-5 gap-2.5 bg-slate-50 px-4 py-3 text-[11px] font-extrabold tracking-wide text-slate-500 dark:bg-black/30 dark:text-slate-500">
          <div>GRUP</div>
          <div>GÜN</div>
          <div>SAAT</div>
          <div>TÜR</div>
          <div>LOKASYON</div>
        </div>
        {rows.map((r) => (
          <div
            key={r.id}
            className={`grid grid-cols-5 items-center gap-2.5 border-t border-slate-100 px-4 py-3 pl-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-200 ${SPECIALTY_BORDER_CLASS[sessionTypeToSpecialty(r.sessionType)]}`}
          >
            <div className="font-bold text-slate-900 dark:text-white">{r.group?.name}</div>
            <div>{DAYS[r.dayOfWeek]}</div>
            <div className="tabular-nums">{fmtTime(r.startTime)}</div>
            <span className={`inline-block w-fit rounded-full px-2.5 py-1 text-xs font-bold ${SPECIALTY_BADGE_CLASS[sessionTypeToSpecialty(r.sessionType)]}`}>
              {TYPE_LABEL[r.sessionType]}
            </span>
            <div className="text-slate-400">{r.location ?? "—"}</div>
          </div>
        ))}
        {rows.length === 0 && <div className="px-4 py-6 text-sm text-slate-500">Henüz program tanımlanmamış.</div>}
      </div>

      {/* Mobile day pills + cards */}
      <div className="mt-3.5 md:hidden">
        <div className="mb-3.5 flex gap-2 overflow-x-auto pb-2">
          {DAYS.map((d, i) => (
            <button
              key={d}
              onClick={() => setActiveDay(i)}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold ${
                activeDay === i ? "bg-[#010E80] text-white" : "bg-slate-100 text-slate-500 dark:bg-[#111827] dark:text-slate-400"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-paper2 dark:border-slate-800 dark:bg-surface">
          <div className="bg-[#010E80] px-3.5 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white">
            📅 {DAYS[activeDay]}
          </div>
          <div className="flex flex-col gap-2.5 p-3">
            {byDay[activeDay].length === 0 && (
              <div className="px-1 py-1.5 text-[13px] font-semibold text-slate-500">
                Bugün planlanmış antrenman bulunmamaktadır.
              </div>
            )}
            {byDay[activeDay].map((s) => (
              <div
                key={s.id}
                className={`flex items-start gap-3 rounded-[13px] bg-slate-50 p-3 dark:bg-black/30 ${SPECIALTY_BORDER_CLASS[sessionTypeToSpecialty(s.sessionType)]}`}
              >
                <span className="rounded-lg bg-[#010E80] px-2 py-1 text-xs font-bold text-white">{fmtTime(s.startTime)}</span>
                <div className="flex-1">
                  <div className="mb-1 text-xs font-bold text-slate-700 dark:text-slate-300">{s.group?.name}</div>
                  <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${SPECIALTY_BADGE_CLASS[sessionTypeToSpecialty(s.sessionType)]}`}>
                    {TYPE_LABEL[s.sessionType]}
                  </span>
                  {s.description && <div className="mt-1.5 text-[13px] font-semibold text-slate-600 dark:text-slate-300">{s.description}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
