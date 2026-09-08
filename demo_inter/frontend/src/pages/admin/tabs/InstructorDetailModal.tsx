import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { Modal } from "../../../components/common/Modal";
import { tcErrorMessage } from "../../../lib/tcValidation";

interface StudentOption {
  id: string;
  fullName: string;
}

interface InstructorDetail {
  id: string;
  username: string;
  isActive: boolean;
  fullName: string;
  phone: string | null;
  specialty: "antrenor" | "diyetisyen" | "psikolog";
  metaNote: string | null;
  tcNoMasked: string | null;
  assignedStudents: StudentOption[];
}

export function InstructorDetailModal({
  instructorId,
  onClose,
  onSaved,
}: {
  instructorId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<InstructorDetail | null>(null);
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ fullName: "", phone: "", specialty: "antrenor" as InstructorDetail["specialty"], isActive: true, tcNo: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!instructorId) return;
    setError("");
    Promise.all([apiClient.get(`/admin/instructors/${instructorId}`), apiClient.get("/students")]).then(
      ([detailRes, studentsRes]) => {
        const d: InstructorDetail = detailRes.data;
        setDetail(d);
        setForm({ fullName: d.fullName, phone: d.phone ?? "", specialty: d.specialty, isActive: d.isActive, tcNo: "" });
        setAllStudents(studentsRes.data.map((s: any) => ({ id: s.id, fullName: s.fullName })));
        setAssignedIds(new Set(d.assignedStudents.map((s) => s.id)));
      }
    );
  }, [instructorId]);

  function toggleStudent(id: string) {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function save() {
    setError("");
    if (form.tcNo) {
      const tcError = tcErrorMessage(form.tcNo);
      if (tcError) {
        setError(tcError);
        return;
      }
    }
    setSaving(true);
    try {
      await apiClient.put(`/admin/instructors/${instructorId}`, {
        fullName: form.fullName,
        phone: form.phone,
        specialty: form.specialty,
        isActive: form.isActive,
        tcNo: form.tcNo || undefined,
        studentIds: Array.from(assignedIds),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? "Güncelleme başarısız");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface2 dark:text-white";

  return (
    <Modal open={!!instructorId} onClose={onClose} title={detail ? `${detail.fullName} — Detay & Düzenle` : "Yükleniyor…"}>
      {!detail ? (
        <div className="py-8 text-center text-sm text-slate-400">Yükleniyor…</div>
      ) : (
        <>
          {error && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-surface2">
            <div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">Kullanıcı Adı</div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white">{detail.username}</div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              {form.isActive ? "Aktif" : "Pasif"}
            </label>
          </div>

          <div className="mb-2 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">KİŞİSEL BİLGİLER</div>
          <div className="mb-4 grid grid-cols-2 gap-2.5">
            <input className={`${inputCls} col-span-2`} placeholder="Ad Soyad" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            <input className={inputCls} placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <select
              className={inputCls}
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value as InstructorDetail["specialty"] })}
            >
              <option value="antrenor">Antrenör</option>
              <option value="diyetisyen">Diyetisyen</option>
              <option value="psikolog">Psikolog</option>
            </select>
          </div>

          <div className="mb-2 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">TC KİMLİK NUMARASI</div>
          <div className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">
            Kayıtlı: <strong className="text-slate-700 dark:text-slate-200">{detail.tcNoMasked ?? "Tanımlı değil"}</strong>
          </div>
          <input
            className={`${inputCls} mb-4`}
            placeholder="Değiştirmek için yeni TCKN girin, boş bırakırsanız mevcut şifre/TCKN korunur"
            value={form.tcNo}
            onChange={(e) => setForm({ ...form, tcNo: e.target.value.replace(/\D/g, "") })}
            maxLength={11}
          />

          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">ATANDIĞI ÖĞRENCİLER</div>
            <span className="text-xs font-bold text-slate-400">{assignedIds.size} öğrenci</span>
          </div>
          <div className="mb-5 flex max-h-56 flex-col gap-1 overflow-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
            {allStudents.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-surface2">
                <input type="checkbox" checked={assignedIds.has(s.id)} onChange={() => toggleStudent(s.id)} />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{s.fullName}</span>
              </label>
            ))}
            {allStudents.length === 0 && <div className="p-2 text-xs text-slate-400">Sistemde kayıtlı öğrenci yok.</div>}
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 rounded-xl bg-brand py-3.5 text-sm font-extrabold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {saving ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
            </button>
            <button onClick={onClose} className="rounded-xl bg-slate-100 px-5 py-3.5 text-sm font-bold text-slate-600 dark:bg-surface2 dark:text-slate-300">
              Kapat
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
