import { PropsWithChildren, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuthStore } from "../../features/auth/authStore";
import {
  Specialty,
  SPECIALTY_LABEL,
  SPECIALTY_BADGE_CLASS,
  SPECIALTY_BORDER_CLASS,
  categoryToSpecialty,
} from "../../lib/specialtyColors";
import {
  AttendanceRowStatus,
  ATTENDANCE_STATUS_BADGE_CLASS,
  ATTENDANCE_STATUS_LABEL,
  formatDateWithDay,
  LessonType,
  LESSON_TYPE_LABEL,
} from "../../lib/attendanceStatus";

interface Note {
  id: string;
  category: string;
  periodMonth: number;
  periodYear: number;
  body: string;
}
interface Payment {
  id: string;
  periodMonth: number;
  periodYear: number;
  status: "odenmedi" | "odendi";
  amount: string;
  dueDate: string;
}
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

const CATEGORY_LABEL: Record<string, string> = {
  antrenor_gorusu: "Antrenör Görüşü",
  diyetisyen_gorusu: "Diyetisyen Görüşü",
  psikolog_gorusu: "Psikolog Görüşü",
};

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/** Üç ana kartın (Uzman Notları / Yoklama Raporu / Aidat Durumu) ortak dış çerçevesi. */
function SummaryCard({
  order,
  title,
  onOpen,
  footerLabel,
  children,
}: PropsWithChildren<{ order: string; title: string; onOpen: () => void; footerLabel: string }>) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className={`flex cursor-pointer flex-col rounded-3xl border border-slate-200 bg-paper2 p-5 text-left transition-colors hover:border-brand dark:border-slate-800 dark:bg-surface dark:hover:border-[#93c5fd] ${order}`}
    >
      <h3 className="mb-3 text-lg font-extrabold text-slate-900 dark:text-white">{title}</h3>
      <div className="flex-1">{children}</div>
      <div className="mt-4 rounded-xl bg-slate-50 py-2.5 text-center text-xs font-extrabold text-brand dark:bg-surface2 dark:text-[#93c5fd]">
        {footerLabel} →
      </div>
    </div>
  );
}

/** Ortak modal kabuğu — koyu backdrop + X butonu, tüm detay modalları bunu kullanır. */
function DetailModal({
  open,
  onClose,
  title,
  maxWidthClass = "max-w-lg",
  children,
}: PropsWithChildren<{ open: boolean; onClose: () => void; title: string; maxWidthClass?: string }>) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-5"
      onClick={onClose}
    >
      <div
        className={`relative flex max-h-[90vh] w-full ${maxWidthClass} flex-col overflow-y-auto rounded-3xl bg-paper2 p-6 pr-14 dark:bg-surface`}
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
        <div className="mb-4 text-xl font-extrabold text-slate-900 dark:text-white">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function ParentDashboardPage() {
  const { displayName, studentId } = useAuthStore();
  const [notes, setNotes] = useState<Note[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceReport | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [specialtyFilter, setSpecialtyFilter] = useState<Specialty | "hepsi">("hepsi");
  const [lessonFilter, setLessonFilter] = useState<LessonType | "hepsi">("hepsi");
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [paymentsModalOpen, setPaymentsModalOpen] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    apiClient.get(`/notes/student/${studentId}`).then((r) => setNotes(r.data));
    apiClient.get("/payments").then((r) => setPayments(r.data));
    apiClient.get("/parent/attendance-report").then((r) => setAttendance(r.data));
  }, [studentId]);

  const filteredNotes = useMemo(() => {
    if (specialtyFilter === "hepsi") return notes;
    return notes.filter((n) => categoryToSpecialty(n.category) === specialtyFilter);
  }, [notes, specialtyFilter]);

  const filteredHistory = useMemo(() => {
    if (!attendance) return [];
    if (lessonFilter === "hepsi") return attendance.history;
    return attendance.history.filter((r) => r.lessonType === lessonFilter);
  }, [attendance, lessonFilter]);

  const latestNote = notes[0];
  const latestAttendance = attendance?.history[0];
  const currentPayment = payments[0];
  const overduePaymentsCount = payments.filter((p) => p.status === "odenmedi" && new Date(p.dueDate) < new Date()).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-paper2 px-7 py-6 dark:border-slate-800 dark:bg-surface">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-lg font-extrabold text-white">
          {displayName?.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="text-xl font-extrabold text-slate-900 dark:text-white">{displayName}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-7 md:grid-cols-3">
        {/* Uzman Notları — masaüstü sol (order-1), mobil 2. sırada */}
        <SummaryCard order="order-2 md:order-1" title="Uzman Notları" onOpen={() => setNotesModalOpen(true)} footerLabel="Tüm Notları Gör">
          {notes.length === 0 ? (
            <p className="text-sm text-slate-400">Henüz not girilmemiş.</p>
          ) : (
            latestNote && (
              <div className={`rounded-2xl bg-slate-50 p-4 dark:bg-surface2 ${SPECIALTY_BORDER_CLASS[categoryToSpecialty(latestNote.category)]}`}>
                <span className={`mb-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${SPECIALTY_BADGE_CLASS[categoryToSpecialty(latestNote.category)]}`}>
                  {CATEGORY_LABEL[latestNote.category] ?? latestNote.category}
                </span>
                <div className="mb-1 mt-1 text-xs font-semibold text-slate-400">
                  {MONTH_NAMES[latestNote.periodMonth - 1]} {latestNote.periodYear}
                </div>
                <div className="line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{latestNote.body}</div>
              </div>
            )
          )}
          {notes.length > 1 && <div className="mt-2 text-xs font-semibold text-slate-400">+{notes.length - 1} not daha</div>}
        </SummaryCard>

        {/* Yoklama Raporu — masaüstü orta (order-2), mobil 1. sırada */}
        <SummaryCard order="order-1 md:order-2" title="Yoklama Raporu" onOpen={() => setAttendanceModalOpen(true)} footerLabel="Tüm Detayları Gör">
          {!attendance || attendance.summary.totalSessions === 0 ? (
            <p className="text-sm text-slate-400">Henüz girilmiş bir yoklama kaydı bulunmamaktadır.</p>
          ) : (
            <>
              {latestAttendance && (
                <div className="mb-3 rounded-2xl bg-slate-50 p-4 dark:bg-surface2">
                  <div className="text-xs font-semibold text-slate-400">Son Ders: {formatDateWithDay(latestAttendance.date)}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{LESSON_TYPE_LABEL[latestAttendance.lessonType]}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${ATTENDANCE_STATUS_BADGE_CLASS[latestAttendance.status]}`}>
                      {ATTENDANCE_STATUS_LABEL[latestAttendance.status]}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-extrabold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {attendance.summary.attended} Geldi
                </span>
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-extrabold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {attendance.summary.absent} Gelmedi
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                  %{attendance.summary.attendanceRate} katılım
                </span>
              </div>
            </>
          )}
        </SummaryCard>

        {/* Aidat Durumu — masaüstü sağ (order-3), mobil 3. sırada */}
        <SummaryCard order="order-3 md:order-3" title="Aidat Durumu" onOpen={() => setPaymentsModalOpen(true)} footerLabel="Tüm Ödemeleri Gör">
          {payments.length === 0 ? (
            <p className="text-sm text-slate-400">Henüz ödeme kaydı bulunmuyor.</p>
          ) : (
            currentPayment && (
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-surface2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {MONTH_NAMES[currentPayment.periodMonth - 1]} {currentPayment.periodYear} · {currentPayment.amount} TL
                  </span>
                  <span
                    className={`rounded-lg px-3 py-1 text-xs font-bold ${
                      currentPayment.status === "odendi" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {currentPayment.status === "odendi" ? "Ödendi" : "Ödenmedi"}
                  </span>
                </div>
                {overduePaymentsCount > 0 && (
                  <div className="mt-2 text-xs font-bold text-red-600 dark:text-red-400">{overduePaymentsCount} gecikmiş ödeme</div>
                )}
              </div>
            )
          )}
        </SummaryCard>
      </div>

      {/* Uzman Notları modalı */}
      <DetailModal open={notesModalOpen} onClose={() => setNotesModalOpen(false)} title="Uzman Notları" maxWidthClass="max-w-lg">
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setSpecialtyFilter("hepsi")}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              specialtyFilter === "hepsi"
                ? "bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-surface2 dark:text-slate-400"
            }`}
          >
            Tümü
          </button>
          {(Object.keys(SPECIALTY_LABEL) as Specialty[]).map((sp) => (
            <button
              key={sp}
              onClick={() => setSpecialtyFilter(sp)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                specialtyFilter === sp ? SPECIALTY_BADGE_CLASS[sp] : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-surface2 dark:text-slate-400"
              }`}
            >
              {SPECIALTY_LABEL[sp]}
            </button>
          ))}
        </div>

        {notes.length === 0 && <p className="text-sm text-slate-400">Henüz not girilmemiş.</p>}
        {notes.length > 0 && filteredNotes.length === 0 && <p className="text-sm text-slate-400">Bu branşta not bulunamadı.</p>}
        <div className="flex flex-col gap-3">
          {filteredNotes.map((n) => {
            const specialty = categoryToSpecialty(n.category);
            return (
              <button
                key={n.id}
                onClick={() => setSelectedNote(n)}
                className={`rounded-2xl bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100 dark:bg-surface2 dark:hover:bg-surface ${SPECIALTY_BORDER_CLASS[specialty]}`}
              >
                <span className={`mb-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${SPECIALTY_BADGE_CLASS[specialty]}`}>
                  {CATEGORY_LABEL[n.category] ?? n.category}
                </span>
                <div className="mb-1 mt-1 text-xs font-semibold text-slate-400">
                  {MONTH_NAMES[n.periodMonth - 1]} {n.periodYear}
                </div>
                <div className="line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{n.body}</div>
                {n.body.length > 110 && <div className="mt-1 text-xs font-bold text-brand dark:text-[#93c5fd]">… Devamını Gör</div>}
              </button>
            );
          })}
        </div>
      </DetailModal>

      {/* Aidat Durumu modalı */}
      <DetailModal open={paymentsModalOpen} onClose={() => setPaymentsModalOpen(false)} title="Aidat Durumu" maxWidthClass="max-w-lg">
        <div className="flex flex-col gap-2">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-surface2">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {MONTH_NAMES[p.periodMonth - 1]} {p.periodYear} · {p.amount} TL
              </span>
              <span className={`rounded-lg px-3 py-1 text-xs font-bold ${p.status === "odendi" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                {p.status === "odendi" ? "Ödendi" : "Ödenmedi"}
              </span>
            </div>
          ))}
          {payments.length === 0 && <p className="text-sm text-slate-400">Henüz ödeme kaydı bulunmuyor.</p>}
        </div>
      </DetailModal>

      {/* Yoklama Raporu modalı — tüm tarihsel dökümü scroll edilebilir liste/tablo olarak gösterir */}
      <DetailModal open={attendanceModalOpen} onClose={() => setAttendanceModalOpen(false)} title="Yoklama Raporu" maxWidthClass="max-w-2xl">
        {attendance && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-paper2 px-3 py-3 dark:border-slate-800 dark:bg-surface2">
                <div className="text-[10px] font-bold text-slate-400">TOPLAM</div>
                <div className="text-lg font-extrabold text-slate-700 dark:text-slate-200">{attendance.summary.totalSessions}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-paper2 px-3 py-3 dark:border-slate-800 dark:bg-surface2">
                <div className="text-[10px] font-bold text-slate-400">GELDİ</div>
                <div className="text-lg font-extrabold text-green-600 dark:text-green-400">{attendance.summary.attended}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-paper2 px-3 py-3 dark:border-slate-800 dark:bg-surface2">
                <div className="text-[10px] font-bold text-slate-400">GELMEDİ</div>
                <div className="text-lg font-extrabold text-red-600 dark:text-red-400">{attendance.summary.absent}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-paper2 px-3 py-3 dark:border-slate-800 dark:bg-surface2">
                <div className="text-[10px] font-bold text-slate-400">KATILIM</div>
                <div className="text-lg font-extrabold text-slate-700 dark:text-slate-200">%{attendance.summary.attendanceRate}</div>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-1.5">
              <button
                onClick={() => setLessonFilter("hepsi")}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  lessonFilter === "hepsi"
                    ? "bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-surface2 dark:text-slate-400"
                }`}
              >
                Tümü
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
            </div>

            {filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
                <span className="text-2xl">🗓️</span>
                <div className="text-sm font-bold text-slate-500 dark:text-slate-400">
                  {attendance.history.length === 0 ? "Henüz girilmiş bir yoklama kaydı bulunmamaktadır." : "Bu ders türünde kayıt bulunamadı."}
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="max-h-[45vh] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-slate-500 dark:bg-surface2 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2.5 font-extrabold">Tarih</th>
                        <th className="px-3 py-2.5 font-extrabold">Ders</th>
                        <th className="px-3 py-2.5 font-extrabold">Eğitmen / Grup</th>
                        <th className="px-3 py-2.5 font-extrabold">Durum</th>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </DetailModal>

      {/* Not detay modalı (uzman notlar modalı içinden açılır) */}
      {selectedNote && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 p-5" onClick={() => setSelectedNote(null)}>
          <div
            className={`w-full max-w-lg rounded-3xl bg-paper2 p-6 dark:bg-surface ${SPECIALTY_BORDER_CLASS[categoryToSpecialty(selectedNote.category)]}`}
            onClick={(e) => e.stopPropagation()}
          >
            <span className={`mb-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-extrabold ${SPECIALTY_BADGE_CLASS[categoryToSpecialty(selectedNote.category)]}`}>
              {CATEGORY_LABEL[selectedNote.category] ?? selectedNote.category}
            </span>
            <div className="mb-4 text-sm font-bold text-slate-400">
              {MONTH_NAMES[selectedNote.periodMonth - 1]} {selectedNote.periodYear}
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">{selectedNote.body}</div>
            <button
              onClick={() => setSelectedNote(null)}
              className="mt-6 w-full rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-600 dark:bg-surface2 dark:text-slate-300"
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
