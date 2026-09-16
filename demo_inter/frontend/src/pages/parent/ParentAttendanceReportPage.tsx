import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { useAuthStore } from "../../features/auth/authStore";
import {
  AttendanceRowStatus,
  ATTENDANCE_STATUS_BADGE_CLASS,
  ATTENDANCE_STATUS_LABEL,
  formatDateWithDay,
  LessonType,
  LESSON_TYPE_LABEL,
} from "../../lib/attendanceStatus";

interface AttendanceReportRow {
  date: string;
  lessonType: LessonType;
  status: AttendanceRowStatus;
  groupName: string | null;
  markedByName: string | null;
  notes: string | null;
}

interface AttendanceReport {
  studentId: string;
  studentName: string;
  summary: {
    totalSessions: number;
    attended: number;
    absent: number;
    excused: number;
    attendanceRate: number;
    byLessonType: Record<LessonType, { attended: number; total: number }>;
  };
  history: AttendanceReportRow[];
}

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function monthKey(isoDate: string) {
  return isoDate.slice(0, 7); // "YYYY-MM"
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function ProgressRing({ percent }: { percent: number }) {
  const size = 76;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(percent, 0), 100) / 100) * circumference;
  const color = percent >= 80 ? "#16a34a" : percent >= 50 ? "#d97706" : "#dc2626";

  return (
    <div className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="stroke-slate-200 dark:stroke-slate-700" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <div className="absolute text-sm font-extrabold text-slate-800 dark:text-white">%{percent}</div>
    </div>
  );
}

export function ParentAttendanceReportPage() {
  const { displayName } = useAuthStore();
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lessonFilter, setLessonFilter] = useState<LessonType | "hepsi">("hepsi");
  const [monthFilter, setMonthFilter] = useState<string | "hepsi">("hepsi");

  useEffect(() => {
    setLoading(true);
    setError("");
    apiClient
      .get("/parent/attendance-report")
      .then((res) => setReport(res.data))
      .catch((e) => setError(e.response?.data?.error?.message ?? "Yoklama raporu alınamadı"))
      .finally(() => setLoading(false));
  }, []);

  const availableMonths = useMemo(() => {
    if (!report) return [];
    const keys = new Set(report.history.map((r) => monthKey(r.date)));
    return Array.from(keys).sort().reverse();
  }, [report]);

  const filteredHistory = useMemo(() => {
    if (!report) return [];
    return report.history.filter((r) => {
      if (lessonFilter !== "hepsi" && r.lessonType !== lessonFilter) return false;
      if (monthFilter !== "hepsi" && monthKey(r.date) !== monthFilter) return false;
      return true;
    });
  }, [report, lessonFilter, monthFilter]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <Link to="/veli/panel" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand dark:text-[#93c5fd]">
        ← Panele Dön
      </Link>

      <h1 className="mb-1 text-2xl font-extrabold text-slate-900 dark:text-white">Yoklama Raporu</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{displayName}</p>

      {loading && <div className="py-16 text-center text-sm font-semibold text-slate-400">Rapor yükleniyor…</div>}

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</div>
      )}

      {report && !loading && !error && (
        <>
          {/* KPI kartları */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-paper2 p-4 dark:border-slate-800 dark:bg-surface">
              <div className="text-xs font-bold text-slate-400">TOPLAM DERS</div>
              <div className="mt-1 text-2xl font-extrabold text-slate-800 dark:text-white">{report.summary.totalSessions}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-paper2 p-4 dark:border-slate-800 dark:bg-surface">
              <div className="text-xs font-bold text-slate-400">KATILDIĞI</div>
              <div className="mt-1 text-2xl font-extrabold text-green-600 dark:text-green-400">{report.summary.attended}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-paper2 p-4 dark:border-slate-800 dark:bg-surface">
              <div className="text-xs font-bold text-slate-400">DEVAMSIZLIK</div>
              <div className="mt-1 text-2xl font-extrabold text-red-600 dark:text-red-400">{report.summary.absent}</div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-paper2 p-4 dark:border-slate-800 dark:bg-surface">
              <ProgressRing percent={report.summary.attendanceRate} />
              <div className="text-xs font-bold text-slate-400">
                GENEL
                <br />
                KATILIM ORANI
              </div>
            </div>
          </div>

          {/* Branş bazlı dağılım */}
          <div className="mb-6 flex flex-wrap gap-2">
            {(Object.keys(LESSON_TYPE_LABEL) as LessonType[]).map((type) => {
              const stat = report.summary.byLessonType[type];
              if (stat.total === 0) return null;
              return (
                <div
                  key={type}
                  className="rounded-full border border-slate-200 bg-paper2 px-3 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-surface2 dark:text-slate-300"
                >
                  {LESSON_TYPE_LABEL[type]}: {stat.attended}/{stat.total}
                </div>
              );
            })}
          </div>

          {/* Filtreler */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setLessonFilter("hepsi")}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                lessonFilter === "hepsi"
                  ? "bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-surface2 dark:text-slate-400"
              }`}
            >
              Tüm Dersler
            </button>
            {(Object.keys(LESSON_TYPE_LABEL) as LessonType[]).map((type) => (
              <button
                key={type}
                onClick={() => setLessonFilter(type)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  lessonFilter === type
                    ? "bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-surface2 dark:text-slate-400"
                }`}
              >
                {LESSON_TYPE_LABEL[type]}
              </button>
            ))}

            {availableMonths.length > 0 && (
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="ml-auto rounded-full border border-slate-200 bg-paper2 px-3 py-1.5 text-xs font-bold text-slate-600 outline-none dark:border-slate-700 dark:bg-surface2 dark:text-slate-300"
              >
                <option value="hepsi">Tüm Aylar</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Boş durum */}
          {filteredHistory.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
              <span className="text-3xl">🗓️</span>
              <div className="text-sm font-bold text-slate-500 dark:text-slate-400">
                {report.history.length === 0
                  ? "Henüz girilmiş bir yoklama kaydı bulunmamaktadır."
                  : "Seçtiğiniz filtreye uyan yoklama kaydı bulunamadı."}
              </div>
            </div>
          )}

          {/* Mobil: kart listesi */}
          {filteredHistory.length > 0 && (
            <div className="flex flex-col gap-2.5 md:hidden">
              {filteredHistory.map((row, i) => (
                <div key={`${row.date}-${i}`} className="rounded-2xl border border-slate-200 bg-paper2 p-4 dark:border-slate-800 dark:bg-surface">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400">{formatDateWithDay(row.date)}</div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${ATTENDANCE_STATUS_BADGE_CLASS[row.status]}`}>
                      {ATTENDANCE_STATUS_LABEL[row.status]}
                    </span>
                  </div>
                  <div className="text-sm font-extrabold text-slate-800 dark:text-white">{LESSON_TYPE_LABEL[row.lessonType]}</div>
                  {(row.groupName || row.markedByName) && (
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {[row.groupName, row.markedByName].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {row.notes && <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-surface2 dark:text-slate-300">{row.notes}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Masaüstü: tablo */}
          {filteredHistory.length > 0 && (
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 md:block">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-500 dark:bg-surface2 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5 font-extrabold">Tarih ve Gün</th>
                    <th className="px-3 py-2.5 font-extrabold">Ders Türü</th>
                    <th className="px-3 py-2.5 font-extrabold">Eğitmen / Grup</th>
                    <th className="px-3 py-2.5 font-extrabold">Katılım Durumu</th>
                    <th className="px-3 py-2.5 font-extrabold">Not</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((row, i) => (
                    <tr key={`${row.date}-${i}`} className="border-t border-slate-100 bg-paper2 dark:border-slate-800 dark:bg-surface">
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200">{formatDateWithDay(row.date)}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{LESSON_TYPE_LABEL[row.lessonType]}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                        {[row.groupName, row.markedByName].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${ATTENDANCE_STATUS_BADGE_CLASS[row.status]}`}>
                          {ATTENDANCE_STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{row.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
