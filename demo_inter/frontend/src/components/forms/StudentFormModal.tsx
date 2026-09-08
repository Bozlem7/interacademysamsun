import { useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { Modal } from "../common/Modal";
import { tcErrorMessage } from "../../lib/tcValidation";
import { ageErrorMessage } from "../../lib/ageValidation";
import { fetchBranches, Branch } from "../../features/branch/branchApi";
import { DocumentUploadField } from "./DocumentUploadField";

interface Group {
  id: string;
  name: string;
}

const emptyForm = {
  branchId: "",
  fullName: "",
  tcNo: "",
  dob: "",
  gender: "erkek" as "erkek" | "kiz",
  bloodType: "",
  heightCm: "",
  weightKg: "",
  email: "",
  address: "",
  motherName: "",
  motherPhone: "",
  motherJob: "",
  fatherName: "",
  fatherPhone: "",
  fatherJob: "",
  emergencyName: "",
  emergencyPhone: "",
  groupId: "",
  paymentDueDay: 15 as 15 | 30,
};

export function StudentFormModal({
  open,
  onClose,
  onSaved,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Ön kayıttan gelen prefill verisi + preRegistrationId. */
  prefill?: (Partial<typeof emptyForm> & { preRegistrationId?: string }) | null;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [preRegistrationId, setPreRegistrationId] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [tcDuplicate, setTcDuplicate] = useState(false);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const DUPLICATE_TC_MESSAGE = "Bu T.C. Kimlik Numarası ile kayıtlı bir öğrenci zaten bulunmaktadır!";

  useEffect(() => {
    if (open) {
      apiClient.get("/groups").then((r) => setGroups(r.data));
      fetchBranches().then(setBranches);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, ...prefill });
      setPreRegistrationId(prefill?.preRegistrationId);
      setError("");
      setTcDuplicate(false);
      setDocFiles([]);
    }
  }, [open, prefill]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function checkTcDuplicate() {
    if (tcErrorMessage(form.tcNo)) {
      setTcDuplicate(false);
      return;
    }
    try {
      const { data } = await apiClient.get(`/students/check-tc/${form.tcNo}`);
      setTcDuplicate(!!data.exists);
    } catch {
      // Canlı kontrol başarısız olsa bile submit anındaki backend kontrolü son sözü söyler.
    }
  }

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
    if (tcDuplicate) {
      setError(DUPLICATE_TC_MESSAGE);
      return;
    }
    const ageError = ageErrorMessage(form.dob);
    if (ageError) {
      setError(ageError);
      return;
    }
    if (!form.motherPhone.trim() && !form.fatherPhone.trim()) {
      setError("Anne veya baba telefon numarasından en az biri girilmelidir.");
      return;
    }
    setSaving(true);
    try {
      const { data: created } = await apiClient.post("/students", {
        ...form,
        heightCm: form.heightCm ? Number(form.heightCm) : undefined,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        groupId: form.groupId || undefined,
        preRegistrationId,
      });

      if (docFiles.length > 0) {
        const formData = new FormData();
        docFiles.forEach((f) => formData.append("files", f));
        try {
          await apiClient.post(`/students/${created.id}/upload-documents`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch {
          // Öğrenci kaydı zaten başarılı oldu — evrak birleştirme başarısız olursa yönetici
          // detay ekranından tekrar deneyebilir; kaydı bu yüzden geri almıyoruz.
        }
      }

      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface2 dark:text-white";

  return (
    <Modal open={open} onClose={onClose} title={preRegistrationId ? "Ön Kayıttan Öğrenci Kaydı" : "Yeni Öğrenci Kaydet"}>
      {error && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="mb-2 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">BAYİ SEÇİMİ</div>
      <div className="mb-4 flex gap-2">
        {branches.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => set("branchId", b.id)}
            className={`flex-1 rounded-xl border-2 py-3 text-sm font-bold transition-colors ${
              form.branchId === b.id
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-paper2 text-slate-600 dark:border-slate-700 dark:bg-surface2 dark:text-slate-300"
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      <div className="mb-2 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">SPORCU BİLGİLERİ</div>
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <input className={inputCls} placeholder="Adı Soyadı" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
        <div>
          <input
            className={`${inputCls} w-full ${tcDuplicate ? "border-red-500" : ""}`}
            placeholder="TCKN"
            value={form.tcNo}
            onChange={(e) => {
              set("tcNo", e.target.value.replace(/\D/g, ""));
              setTcDuplicate(false);
            }}
            onBlur={checkTcDuplicate}
            maxLength={11}
          />
          {tcDuplicate && <div className="mt-1 text-xs font-bold text-red-600">{DUPLICATE_TC_MESSAGE}</div>}
        </div>
        <input className={inputCls} type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
        <select className={inputCls} value={form.gender} onChange={(e) => set("gender", e.target.value as "erkek" | "kiz")}>
          <option value="erkek">Erkek</option>
          <option value="kiz">Kız</option>
        </select>
        <select className={inputCls} value={form.groupId} onChange={(e) => set("groupId", e.target.value)}>
          <option value="">Grup seçiniz</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select className={inputCls} value={form.paymentDueDay} onChange={(e) => set("paymentDueDay", Number(e.target.value) as 15 | 30)}>
          <option value={15}>Ödeme Günü: 15</option>
          <option value={30}>Ödeme Günü: 30</option>
        </select>
        <input className={inputCls} placeholder="Boy (cm)" value={form.heightCm} onChange={(e) => set("heightCm", e.target.value)} />
        <input className={inputCls} placeholder="Kilo (kg)" value={form.weightKg} onChange={(e) => set("weightKg", e.target.value)} />
        <input className={`${inputCls} col-span-2`} placeholder="Adres" value={form.address} onChange={(e) => set("address", e.target.value)} />
      </div>

      <div className="mb-2 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">
        VELİ BİLGİLERİ <span className="font-normal normal-case text-slate-400">(anne veya baba telefonundan en az biri zorunlu)</span>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <input className={inputCls} placeholder="Anne Ad Soyad" value={form.motherName} onChange={(e) => set("motherName", e.target.value)} />
        <input className={inputCls} placeholder="Anne Telefon *" value={form.motherPhone} onChange={(e) => set("motherPhone", e.target.value)} />
        <input className={inputCls} placeholder="Baba Ad Soyad" value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} />
        <input className={inputCls} placeholder="Baba Telefon *" value={form.fatherPhone} onChange={(e) => set("fatherPhone", e.target.value)} />
        <input className={inputCls} placeholder="Acil Durum Kişisi" value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />
        <input className={inputCls} placeholder="Acil Durum Telefonu" value={form.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} />
      </div>

      <div className="mb-2 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">KAYIT EVRAKLARI / SÖZLEŞME YÜKLE</div>
      <div className="mb-4">
        <DocumentUploadField files={docFiles} onChange={setDocFiles} />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-xl bg-brand py-3.5 text-sm font-extrabold text-white hover:bg-brand-hover disabled:opacity-50"
      >
        {saving ? "Kaydediliyor…" : "Kaydet"}
      </button>
    </Modal>
  );
}
