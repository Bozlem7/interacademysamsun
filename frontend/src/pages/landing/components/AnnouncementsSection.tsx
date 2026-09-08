import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";

interface SessionRow {
  id: string;
  group: { name: string };
  dayOfWeek: number;
  startTime: string;
  sessionType: string;
}
interface Announcement {
  id: string;
  title: string;
  body: string;
  publishDate: string;
}

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

function fmtTime(t: string) {
  return t?.toString().slice(11, 16) || t?.toString().slice(0, 5) || "";
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}

export function AnnouncementsSection() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    apiClient.get("/schedule").then((r) => setRows(r.data));
    apiClient.get("/announcements").then((r) => setAnnouncements(r.data));
  }, []);

  return (
    <section id="haberler" className="bg-slate-50 px-4 py-14 dark:bg-[#0b1020] sm:px-6">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <div className="mb-3 text-xs font-extrabold tracking-[1.2px] text-[#0057B8] dark:text-[#93c5fd]">GENEL ANTRENMAN PROGRAMI</div>
          <div className="overflow-hidden rounded-[18px] bg-paper2 dark:bg-surface">
            {rows.slice(0, 6).map((row, i) => (
              <div
                key={row.id}
                className={`flex items-center gap-3.5 px-4.5 py-3.5 ${i > 0 ? "border-t border-slate-100 dark:border-slate-800" : ""}`}
              >
                <div className="w-[74px] text-sm font-bold text-slate-900 dark:text-white">{DAYS[row.dayOfWeek]}</div>
                <div className="text-[13px] tabular-nums text-slate-500 dark:text-slate-400">{fmtTime(row.startTime)}</div>
                <span className="rounded-lg bg-[#010E80]/10 px-2.5 py-1 text-xs font-bold text-[#010E80] dark:bg-[#010E80]/30 dark:text-[#93c5fd]">
                  {row.group?.name}
                </span>
              </div>
            ))}
            {rows.length === 0 && <div className="p-5 text-sm text-slate-500">Program bulunamadı.</div>}
          </div>
        </div>

        <div>
          <div className="mb-3 text-xs font-extrabold tracking-[1.2px] text-[#0057B8] dark:text-[#93c5fd]">DUYURULAR</div>
          <div className="flex flex-col gap-2.5">
            {announcements.map((a) => (
              <div key={a.id} className="rounded-2xl bg-paper2 p-4 dark:bg-surface">
                <div className="mb-1.5 text-[11px] font-bold tracking-wide text-slate-400 dark:text-slate-500">{fmtDate(a.publishDate)}</div>
                <div className="mb-1 text-[15px] font-bold text-slate-900 dark:text-white">{a.title}</div>
                <div className="text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">{a.body}</div>
              </div>
            ))}
            {announcements.length === 0 && <div className="text-sm text-slate-500">Henüz duyuru yok.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
