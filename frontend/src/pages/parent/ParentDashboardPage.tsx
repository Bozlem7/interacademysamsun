import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuthStore } from "../../features/auth/authStore";
import {
  Specialty,
  SPECIALTY_LABEL,
  SPECIALTY_BADGE_CLASS,
  SPECIALTY_BORDER_CLASS,
  categoryToSpecialty,
} from "../../lib/specialtyColors";

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

const CATEGORY_LABEL: Record<string, string> = {
  antrenor_gorusu: "Antrenör Görüşü",
  diyetisyen_gorusu: "Diyetisyen Görüşü",
  psikolog_gorusu: "Psikolog Görüşü",
};

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function ParentDashboardPage() {
  const { displayName, studentId } = useAuthStore();
  const [notes, setNotes] = useState<Note[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [specialtyFilter, setSpecialtyFilter] = useState<Specialty | "hepsi">("hepsi");

  useEffect(() => {
    if (!studentId) return;
    apiClient.get(`/notes/student/${studentId}`).then((r) => setNotes(r.data));
    apiClient.get("/payments").then((r) => setPayments(r.data));
  }, [studentId]);

  const filteredNotes = useMemo(() => {
    if (specialtyFilter === "hepsi") return notes;
    return notes.filter((n) => categoryToSpecialty(n.category) === specialtyFilter);
  }, [notes, specialtyFilter]);

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

      <div className="grid gap-5 p-7 md:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-paper2 p-5 dark:border-slate-800 dark:bg-surface">
          <h3 className="mb-3 text-lg font-extrabold text-slate-900 dark:text-white">Uzman Notları</h3>

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
          {notes.length > 0 && filteredNotes.length === 0 && (
            <p className="text-sm text-slate-400">Bu branşta not bulunamadı.</p>
          )}
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
                  {n.body.length > 110 && (
                    <div className="mt-1 text-xs font-bold text-brand dark:text-[#93c5fd]">… Devamını Gör</div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-paper2 p-5 dark:border-slate-800 dark:bg-surface">
          <h3 className="mb-3 text-lg font-extrabold text-slate-900 dark:text-white">Aidat Durumu</h3>
          <div className="flex flex-col gap-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-surface2">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {p.periodMonth}/{p.periodYear} · {p.amount} TL
                </span>
                <span
                  className={`rounded-lg px-3 py-1 text-xs font-bold ${
                    p.status === "odendi" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {p.status === "odendi" ? "Ödendi" : "Ödenmedi"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {selectedNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-5"
          onClick={() => setSelectedNote(null)}
        >
          <div
            className={`w-full max-w-lg rounded-3xl bg-paper2 p-6 dark:bg-surface ${SPECIALTY_BORDER_CLASS[categoryToSpecialty(selectedNote.category)]}`}
            onClick={(e) => e.stopPropagation()}
          >
            <span
              className={`mb-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-extrabold ${SPECIALTY_BADGE_CLASS[categoryToSpecialty(selectedNote.category)]}`}
            >
              {CATEGORY_LABEL[selectedNote.category] ?? selectedNote.category}
            </span>
            <div className="mb-4 text-sm font-bold text-slate-400">
              {MONTH_NAMES[selectedNote.periodMonth - 1]} {selectedNote.periodYear}
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {selectedNote.body}
            </div>
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
