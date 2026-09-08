import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { Modal } from "../../../components/common/Modal";

interface GroupOption {
  id: string;
  name: string;
}
interface StudentOption {
  id: string;
  fullName: string;
  group?: { id: string; name: string } | null;
}

export function GroupWizardModal({
  open,
  onClose,
  existingGroups,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  existingGroups: GroupOption[];
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [nameError, setNameError] = useState("");

  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setName("");
    setAgeRange("");
    setNameError("");
    setStudentSearch("");
    setSelectedIds(new Set());
    setSubmitError("");
    apiClient.get("/students").then((r) => setAllStudents(r.data));
  }, [open]);

  const unassignedFiltered = useMemo(() => {
    const q = studentSearch.trim().toLocaleLowerCase("tr-TR");
    return allStudents
      .filter((s) => !s.group)
      .filter((s) => !q || s.fullName.toLocaleLowerCase("tr-TR").includes(q));
  }, [allStudents, studentSearch]);

  function goNext() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Grup adı zorunludur");
      return;
    }
    const duplicate = existingGroups.some((g) => g.name.trim().toLocaleLowerCase("tr-TR") === trimmed.toLocaleLowerCase("tr-TR"));
    if (duplicate) {
      setNameError("Bu grup adı zaten mevcut! Lütfen farklı bir grup adı giriniz.");
      return;
    }
    setNameError("");
    setStep(2);
  }

  function toggleStudent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function finish() {
    setSubmitError("");
    if (selectedIds.size === 0) {
      setSubmitError("Grup oluşturmak için en az bir öğrenci seçmelisiniz!");
      return;
    }
    setSubmitting(true);
    try {
      const { data: newGroup } = await apiClient.post("/groups", { name: name.trim(), ageRange: ageRange || undefined });
      await Promise.all(
        Array.from(selectedIds).map((studentId) => apiClient.put(`/students/${studentId}`, { groupId: newGroup.id }))
      );
      onCreated();
      onClose();
    } catch (e: any) {
      const message = e.response?.data?.error?.message ?? "Grup oluşturulamadı";
      setSubmitError(message);
      if (e.response?.status === 409) setStep(1);
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface2 dark:text-white";

  return (
    <Modal open={open} onClose={onClose} title="">
      <div className="mb-4 flex gap-2">
        <div
          className={`flex-1 rounded-lg py-2 text-center text-[11.5px] font-extrabold ${
            step === 1 ? "bg-[#010E80] text-white" : "bg-slate-100 text-slate-500 dark:bg-surface2 dark:text-slate-400"
          }`}
        >
          1. Grup Adı
        </div>
        <div
          className={`flex-1 rounded-lg py-2 text-center text-[11.5px] font-extrabold ${
            step === 2 ? "bg-[#010E80] text-white" : "bg-slate-100 text-slate-500 dark:bg-surface2 dark:text-slate-400"
          }`}
        >
          2. Öğrenci Ata
        </div>
      </div>

      {submitError && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{submitError}</div>}

      {step === 1 && (
        <div>
          <div className="mb-3 text-base font-extrabold text-slate-900 dark:text-white">Yeni Grup Adı</div>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && goNext()}
            placeholder="Örn: U-11 Akademi"
            className={inputCls}
          />
          {nameError && <div className="mt-2 text-xs font-bold text-red-600">{nameError}</div>}

          <label className="mb-1.5 mt-4 block text-xs font-bold text-slate-500 dark:text-slate-400">Yaş Aralığı (opsiyonel)</label>
          <input value={ageRange} onChange={(e) => setAgeRange(e.target.value)} placeholder="Örn: 10-11" className={inputCls} />

          <button
            onClick={goNext}
            className="mt-5 w-full rounded-xl bg-[#010E80] py-3.5 text-sm font-extrabold text-white hover:bg-brand-hover"
          >
            İleri / Öğrenci Seçimine Geç →
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="mb-3 text-base font-extrabold text-slate-900 dark:text-white">
            {name} — Öğrenci Seç
          </div>
          <input
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            placeholder="İsim, soyisim ile ara…"
            className={`${inputCls} mb-2`}
          />
          <div className="mb-3 text-xs font-semibold text-slate-400">Varsayılan olarak henüz gruba atanmamış öğrenciler listelenir.</div>

          <div className="mb-4 flex max-h-72 flex-col gap-1 overflow-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
            {unassignedFiltered.map((s) => (
              <div
                key={s.id}
                onClick={() => toggleStudent(s.id)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-surface2"
              >
                <input type="checkbox" readOnly checked={selectedIds.has(s.id)} className="pointer-events-none h-[18px] w-[18px]" />
                <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{s.fullName}</span>
              </div>
            ))}
            {unassignedFiltered.length === 0 && (
              <div className="p-3 text-xs text-slate-400">Atanmamış öğrenci bulunamadı.</div>
            )}
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={() => setStep(1)}
              className="rounded-xl bg-slate-100 px-5 py-3.5 text-sm font-bold text-slate-600 dark:bg-surface2 dark:text-slate-300"
            >
              ← Geri
            </button>
            <button
              onClick={finish}
              disabled={submitting}
              className="flex-1 rounded-xl bg-[#010E80] py-3.5 text-sm font-extrabold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {submitting ? "Kaydediliyor…" : `Seçilenleri Ata ve Grubu Tamamla (${selectedIds.size})`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
