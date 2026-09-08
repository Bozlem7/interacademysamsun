import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { Modal } from "../../../components/common/Modal";
import { tcErrorMessage } from "../../../lib/tcValidation";
import { InstructorDetailModal } from "./InstructorDetailModal";
import { fetchBranches, Branch } from "../../../features/branch/branchApi";
import { SPECIALTY_LABEL, SPECIALTY_BADGE_CLASS, SPECIALTY_BORDER_CLASS } from "../../../lib/specialtyColors";

interface StaffRow {
  id: string;
  username: string;
  fullName: string;
  specialty: "antrenor" | "diyetisyen" | "psikolog";
  phone?: string;
  isActive: boolean;
}

export function AdminStaffTab() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    tcNo: "",
    phone: "",
    specialty: "antrenor" as StaffRow["specialty"],
    branchId: "",
  });
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  function load() {
    apiClient.get("/staff").then((r) => setStaff(r.data));
  }
  useEffect(load, []);
  useEffect(() => {
    fetchBranches().then(setBranches);
  }, []);

  async function save() {
    setError("");
    if (!form.branchId) {
      setError("Şube seçimi zorunludur");
      return;
    }
    const tcError = tcErrorMessage(form.tcNo);
    if (tcError) {
      setError(tcError);
      return;
    }
    try {
      await apiClient.post("/staff", form);
      setFormOpen(false);
      setForm({ fullName: "", tcNo: "", phone: "", specialty: "antrenor", branchId: "" });
      load();
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? "Kayıt başarısız");
    }
  }

  async function remove(id: string) {
    await apiClient.delete(`/staff/${id}`);
    load();
  }

  return (
    <div className="p-7">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-bold text-slate-500 dark:text-slate-400">Kayıtlı eğitmen ve uzmanlar</div>
        <button onClick={() => setFormOpen(true)} className="rounded-xl bg-brand px-4 py-3 text-sm font-extrabold text-white hover:bg-brand-hover">
          + Yeni Eğitmen / Uzman Ekle
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {staff.map((p) => (
          <button
            key={p.id}
            onClick={() => setDetailId(p.id)}
            className={`rounded-2xl border border-slate-200 bg-paper2 p-4 text-left transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-surface ${SPECIALTY_BORDER_CLASS[p.specialty]}`}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="text-base font-extrabold text-slate-900 dark:text-white">{p.fullName}</div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  p.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                }`}
              >
                {p.isActive ? "Aktif" : "Pasif"}
              </span>
            </div>
            <span className={`mb-3 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${SPECIALTY_BADGE_CLASS[p.specialty]}`}>
              {SPECIALTY_LABEL[p.specialty]}
            </span>
            <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Kullanıcı adı: <strong className="text-slate-700 dark:text-slate-200">{p.username}</strong>
              {p.phone && <div>Telefon: {p.phone}</div>}
            </div>
            <div className="flex gap-2">
              <span className="flex-1 rounded-lg bg-slate-100 py-2 text-center text-xs font-extrabold text-slate-700 dark:bg-surface2 dark:text-slate-200">
                Detay / Düzenle →
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  remove(p.id);
                }}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-extrabold text-white"
              >
                Sil
              </span>
            </div>
          </button>
        ))}
        {staff.length === 0 && <div className="text-sm text-slate-400">Henüz eğitmen/uzman kaydı yok.</div>}
      </div>

      <InstructorDetailModal instructorId={detailId} onClose={() => setDetailId(null)} onSaved={load} />

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Yeni Eğitmen / Uzman">
        {error && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        <label className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400">Bayi Seçimi</label>
        <div className="mb-3 flex gap-2">
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setForm({ ...form, branchId: b.id })}
              className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-bold transition-colors ${
                form.branchId === b.id
                  ? "border-brand bg-brand text-white"
                  : "border-slate-200 bg-paper2 text-slate-600 dark:border-slate-700 dark:bg-surface2 dark:text-slate-300"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
        <input
          className="mb-2.5 w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-surface2 dark:text-white"
          placeholder="Ad Soyad"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <input
          className="mb-2.5 w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-surface2 dark:text-white"
          placeholder="TCKN (şifre olarak tanımlanır)"
          value={form.tcNo}
          onChange={(e) => setForm({ ...form, tcNo: e.target.value.replace(/\D/g, "") })}
          maxLength={11}
        />
        <input
          className="mb-2.5 w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-surface2 dark:text-white"
          placeholder="Telefon"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <select
          className="mb-4 w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-surface2 dark:text-white"
          value={form.specialty}
          onChange={(e) => setForm({ ...form, specialty: e.target.value as StaffRow["specialty"] })}
        >
          <option value="antrenor">Antrenör</option>
          <option value="diyetisyen">Diyetisyen</option>
          <option value="psikolog">Psikolog</option>
        </select>
        <button onClick={save} className="w-full rounded-xl bg-brand py-3.5 text-sm font-extrabold text-white hover:bg-brand-hover">
          Kaydet
        </button>
      </Modal>
    </div>
  );
}
