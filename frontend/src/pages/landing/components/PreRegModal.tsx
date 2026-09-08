import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { Modal } from "../../../components/common/Modal";
import { IlIlceSelect } from "../../../components/common/IlIlceSelect";
import { tcErrorMessage } from "../../../lib/tcValidation";
import { ageErrorMessage } from "../../../lib/ageValidation";
import { fetchBranches, Branch } from "../../../features/branch/branchApi";

const emptyPreReg = {
  fullName: "",
  tcNo: "",
  gender: "erkek" as "erkek" | "kiz",
  dob: "",
  ageGroup: "",
  parentName: "",
  phone: "",
  il: "Samsun",
  ilce: "",
  branchCode: "",
};

export function PreRegModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState(emptyPreReg);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      fetchBranches().then(setBranches);
    }
  }, [open]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setError("");
    if (!form.branchCode) {
      setError("Lütfen bayi seçiniz");
      return;
    }
    const tcError = tcErrorMessage(form.tcNo);
    if (tcError) {
      setError(tcError);
      return;
    }
    const ageError = ageErrorMessage(form.dob);
    if (ageError) {
      setError(ageError);
      return;
    }
    if (!form.il || !form.ilce) {
      setError("Lütfen il ve ilçe seçiniz");
      return;
    }
    try {
      await apiClient.post("/pre-registrations", form);
      setSaved(true);
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? "Başvuru gönderilemedi");
    }
  }

  function close() {
    onClose();
    setTimeout(() => {
      setSaved(false);
      setForm(emptyPreReg);
      setError("");
    }, 200);
  }

  const inputCls =
    "rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#010E80] dark:border-slate-700 dark:bg-surface2 dark:text-white";

  if (saved) {
    return (
      <Modal open={open} onClose={close} title="">
        <div className="py-5 text-center">
          <div className="mb-2.5 text-4xl">✓</div>
          <div className="mb-2 text-lg font-extrabold text-slate-900 dark:text-white">Ön kayıt başvurunuz alındı</div>
          <div className="mb-5 text-[13.5px] text-slate-500 dark:text-slate-400">
            Yöneticilerimiz en kısa sürede sizinle iletişime geçecektir.
          </div>
          <button onClick={close} className="rounded-xl bg-[#010E80] px-5 py-3 text-sm font-extrabold text-white">
            Kapat
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={close} title="Ön Kayıt Başvurusu">
      {error && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</div>}

      <label className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400">Bayi Seçimi *</label>
      <div className="mb-4 flex gap-2">
        {branches.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => set("branchCode", b.code)}
            className={`flex-1 rounded-xl border-2 py-3 text-sm font-bold transition-colors ${
              form.branchCode === b.code
                ? "border-[#010E80] bg-[#010E80] text-white"
                : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-surface2 dark:text-slate-300"
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className={inputCls} placeholder="Ad Soyad" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
        <input
          className={inputCls}
          placeholder="TCKN"
          value={form.tcNo}
          onChange={(e) => set("tcNo", e.target.value.replace(/\D/g, ""))}
          maxLength={11}
        />
        <div className="flex gap-2">
          <button
            onClick={() => set("gender", "erkek")}
            className={`flex-1 rounded-xl py-3 text-sm font-bold ${form.gender === "erkek" ? "bg-[#010E80] text-white" : "bg-slate-100 text-slate-600 dark:bg-surface2 dark:text-slate-300"}`}
          >
            Erkek
          </button>
          <button
            onClick={() => set("gender", "kiz")}
            className={`flex-1 rounded-xl py-3 text-sm font-bold ${form.gender === "kiz" ? "bg-[#010E80] text-white" : "bg-slate-100 text-slate-600 dark:bg-surface2 dark:text-slate-300"}`}
          >
            Kız
          </button>
        </div>
        <input className={inputCls} type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
        <select className={inputCls} value={form.ageGroup} onChange={(e) => set("ageGroup", e.target.value)}>
          <option value="">Yaş Seçiniz</option>
          {Array.from({ length: 12 }, (_, i) => String(i + 5)).map((age) => (
            <option key={age} value={age}>
              {age} Yaş
            </option>
          ))}
        </select>
        <input className={inputCls} placeholder="Veli Ad Soyad" value={form.parentName} onChange={(e) => set("parentName", e.target.value)} />
        <input className={inputCls} placeholder="İletişim Tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        <IlIlceSelect
          il={form.il}
          ilce={form.ilce}
          onIlChange={(v) => set("il", v)}
          onIlceChange={(v) => set("ilce", v)}
          className={inputCls}
        />
      </div>
      <div className="mt-5 flex gap-2.5">
        <button onClick={submit} className="flex-1 rounded-xl bg-[#010E80] py-3.5 text-sm font-extrabold text-white hover:bg-[#0057B8]">
          Ön Kayıt Başvurusunu Tamamla
        </button>
        <button onClick={close} className="rounded-xl bg-slate-100 px-5 py-3.5 text-sm font-bold text-slate-600 dark:bg-surface2 dark:text-slate-300">
          Vazgeç
        </button>
      </div>
    </Modal>
  );
}
