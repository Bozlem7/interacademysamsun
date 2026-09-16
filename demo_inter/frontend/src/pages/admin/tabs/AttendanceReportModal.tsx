import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import {
  AttendanceRowStatus,
  ATTENDANCE_STATUS_BADGE_CLASS,
  ATTENDANCE_STATUS_LABEL,
  formatDateWithDay,
  LessonType,
  LESSON_TYPE_LABEL,
} from "../../../lib/attendanceStatus";

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

export function AttendanceReportModal({
  open,
  onClose,
  studentId,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string | null;
}) {
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !studentId) return;
    setLoading(true);
    setError(null);
    setReport(null);
    apiClient
      .get(`/students/${studentId}/attendance-report`)
      .then((res) => setReport(res.data))
      .catch((e) => setError(e.response?.data?.error?.message ?? "Yoklama raporu alınamadı"))
      .finally(() => setLoading(false));
  }, [open, studentId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-5"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-y-auto rounded-3xl bg-paper2 p-6 pr-14 dark:bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-2xl font-bold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-surface2 dark:hover:text-white"
        >
          ✕
        </button>

        <div className="mb-4 text-xl font-extrabold text-slate-900 dark:text-white">
          Yoklama Raporu{report ? ` — ${report.studentName}` : ""}
        </div>

        {loading && <div className="py-10 text-center text-sm font-semibold text-slate-400">Rapor yükleniyor…</div>}

        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {report && !loading && !error && (
          <>
            <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 dark:border-slate-800 dark:bg-surface2">
                <div className="text-xs font-bold text-slate-400">TOPLAM DERS</div>
                <div className="text-lg font-extrabold text-slate-700 dark:text-slate-200">{report.summary.totalSessions}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 dark:border-slate-800 dark:bg-surface2">
                <div className="text-xs font-bold text-slate-400">GELDİ</div>
                <div className="text-lg font-extrabold text-green-600 dark:text-green-400">{report.summary.attended}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 dark:border-slate-800 dark:bg-surface2">
                <div className="text-xs font-bold text-slate-400">GELMEDİ</div>
                <div className="text-lg font-extrabold text-red-600 dark:text-red-400">{report.summary.absent}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 dark:border-slate-800 dark:bg-surface2">
                <div className="text-xs font-bold text-slate-400">İZİNLİ</div>
                <div className="text-lg font-extrabold text-amber-600 dark:text-amber-400">{report.summary.excused}</div>
              </div>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {(Object.keys(LESSON_TYPE_LABEL) as LessonType[]).map((type) => {
                const stat = report.summary.byLessonType[type];
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

            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="max-h-[45vh] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-500 dark:bg-surface2 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5 font-extrabold">Tarih ve Gün</th>
                      <th className="px-3 py-2.5 font-extrabold">Ders Türü</th>
                      <th className="px-3 py-2.5 font-extrabold">Durum</th>
                      <th className="px-3 py-2.5 font-extrabold">Not / Açıklama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.history.map((row, i) => (
                      <tr
                        key={`${row.date}-${i}`}
                        className="border-t border-slate-100 bg-paper2 dark:border-slate-800 dark:bg-surface"
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200">
                          {formatDateWithDay(row.date)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{LESSON_TYPE_LABEL[row.lessonType]}</td>
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
              {report.history.length === 0 && (
                <div className="p-6 text-center text-sm text-slate-400">Bu öğrenciye ait yoklama kaydı bulunmuyor.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
