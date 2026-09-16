import { useEffect, useRef, useState, RefObject } from "react";
import { apiClient } from "../../lib/apiClient";
import { Modal, ErrorDialog } from "../common/Modal";
import { tcErrorMessage } from "../../lib/tcValidation";
import { ageErrorMessage } from "../../lib/ageValidation";
import { fetchBranches, Branch } from "../../features/branch/branchApi";
import { DocumentUploadField } from "./DocumentUploadField";

interface Group {
  id: string;
  name: string;
}

/** Validasyon hatasının ilk oluştuğu alan/bölüm — pop-up kapatılınca buraya kaydırma/odaklanma yapılır. */
type FieldKey = "branchId" | "tcNo" | "dob" | "contact";

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
  notifyMother: false,
  notifyFather: false,
  notifyGuardian: false,
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
  const [tcDuplicate, setTcDuplicate] = useState(false);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  // Merkezi hata pop-up'ı: submit anında toplanan TÜM hatalar tek seferde listelenir.
  const [errors, setErrors] = useState<string[]>([]);
  const [highlightField, setHighlightField] = useState<FieldKey | null>(null);
  const pendingFocusField = useRef<FieldKey | null>(null);

  const DUPLICATE_TC_MESSAGE = "Bu T.C. Kimlik Numarası ile kayıtlı bir öğrenci zaten bulunmaktadır!";

  const branchSectionRef = useRef<HTMLDivElement>(null);
  const tcNoInputRef = useRef<HTMLInputElement>(null);
  const dobInputRef = useRef<HTMLInputElement>(null);
  const contactSectionRef = useRef<HTMLDivElement>(null);
  const fieldRefs: Record<FieldKey, RefObject<HTMLElement>> = {
    branchId: branchSectionRef,
    tcNo: tcNoInputRef,
    dob: dobInputRef,
    contact: contactSectionRef,
  };

  /** Odaklanan alana geçici kırmızı çerçeve uygular (highlightField ile eşleşince). */
  function highlightCls(field: FieldKey) {
    return highlightField === field ? "border-red-500 ring-2 ring-red-400" : "";
  }

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
      setErrors([]);
      setHighlightField(null);
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

  /** Formdaki TÜM hataları (ilkinde durmadan) toplar — pop-up'ta hepsi birden listelenir. */
  function validate(): { messages: string[]; firstField: FieldKey | null } {
    const messages: string[] = [];
    let firstField: FieldKey | null = null;
    const fail = (field: FieldKey, message: string) => {
      messages.push(message);
      if (!firstField) firstField = field;
    };

    if (!form.branchId) fail("branchId", "Şube seçimi zorunludur");

    const tcError = tcErrorMessage(form.tcNo);
    if (tcError) fail("tcNo", tcError);
    else if (tcDuplicate) fail("tcNo", DUPLICATE_TC_MESSAGE);

    const ageError = ageErrorMessage(form.dob);
    if (ageError) fail("dob", ageError);

    const hasMother = form.motherPhone.trim().length > 0;
    const hasFather = form.fatherPhone.trim().length > 0;
    const hasGuardian = form.emergencyPhone.trim().length > 0;
    if (!hasMother && !hasFather && !hasGuardian) {
      fail("contact", "En az bir iletişim numarası girilmelidir");
    } else {
      const notifyAny = (form.notifyMother && hasMother) || (form.notifyFather && hasFather) || (form.notifyGuardian && hasGuardian);
      if (!notifyAny) fail("contact", "Lütfen bildirim gönderilecek en az bir veli/yakın seçiniz");
    }

    return { messages, firstField };
  }

  /** Hata pop-up'ı "Tamam, Düzelteyim" ile kapatılınca ilk hatalı alana yumuşak kaydırma + odaklanma. */
  function closeErrorDialog() {
    setErrors([]);
    const field = pendingFocusField.current;
    pendingFocusField.current = null;
    if (!field) return;
    const el = fieldRefs[field].current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus?.();
    }
    setHighlightField(field);
    setTimeout(() => setHighlightField(null), 2500);
  }

  async function save() {
    const { messages, firstField } = validate();
    if (messages.length > 0) {
      setErrors(messages);
      pendingFocusField.current = firstField;
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
          await apiClient.post(`/students/${created.id}/upload-documents`, formData);
        } catch {
          // Öğrenci kaydı zaten başarılı oldu — evrak birleştirme başarısız olursa yönetici
          // detay ekranından tekrar deneyebilir; kaydı bu yüzden geri almıyoruz.
        }
      }

      onSaved();
      onClose();
    } catch (e: any) {
      setErrors([e.response?.data?.error?.message ?? "Kayıt başarısız"]);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface2 dark:text-white";

  return (
    <Modal open={open} onClose={onClose} title={preRegistrationId ? "Ön Kayıttan Öğrenci Kaydı" : "Yeni Öğrenci Kaydet"}>
      <ErrorDialog open={errors.length > 0} errors={errors} onClose={closeErrorDialog} />

      <div
        ref={branchSectionRef}
        tabIndex={-1}
        className={`mb-4 rounded-2xl p-0.5 outline-none transition-shadow ${highlightCls("branchId")}`}
      >
        <div className="mb-2 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">BAYİ SEÇİMİ</div>
        <div className="flex gap-2">
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
      </div>

      <div className="mb-2 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">SPORCU BİLGİLERİ</div>
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <input className={inputCls} placeholder="Adı Soyadı" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
        <div>
          <input
            ref={tcNoInputRef}
            className={`${inputCls} w-full ${tcDuplicate ? "border-red-500" : ""} ${highlightCls("tcNo")}`}
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
        <input
          ref={dobInputRef}
          className={`${inputCls} ${highlightCls("dob")}`}
          type="date"
          value={form.dob}
          onChange={(e) => set("dob", e.target.value)}
        />
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

      <div
        ref={contactSectionRef}
        tabIndex={-1}
        className={`mb-4 rounded-2xl p-0.5 outline-none transition-shadow ${highlightCls("contact")}`}
      >
        <div className="mb-2 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">
          VELİ BİLGİLERİ{" "}
          <span className="font-normal normal-case text-slate-400">
            (anne, baba veya vasi/yakın telefonundan en az biri zorunlu — bildirim gönderilecek kişiyi işaretleyin)
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
        <input className={inputCls} placeholder="Anne Ad Soyad" value={form.motherName} onChange={(e) => set("motherName", e.target.value)} />
        <div className="flex items-center gap-2">
          <input
            className={`${inputCls} flex-1`}
            placeholder="Anne Telefon"
            value={form.motherPhone}
            onChange={(e) => {
              const value = e.target.value;
              setForm((f) => ({ ...f, motherPhone: value, notifyMother: value.trim() ? f.notifyMother : false }));
            }}
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.notifyMother}
              disabled={!form.motherPhone.trim()}
              onChange={(e) => set("notifyMother", e.target.checked)}
              className="h-4 w-4 accent-brand disabled:cursor-not-allowed disabled:opacity-40"
            />
            WhatsApp
          </label>
        </div>

        <input className={inputCls} placeholder="Baba Ad Soyad" value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} />
        <div className="flex items-center gap-2">
          <input
            className={`${inputCls} flex-1`}
            placeholder="Baba Telefon"
            value={form.fatherPhone}
            onChange={(e) => {
              const value = e.target.value;
              setForm((f) => ({ ...f, fatherPhone: value, notifyFather: value.trim() ? f.notifyFather : false }));
            }}
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.notifyFather}
              disabled={!form.fatherPhone.trim()}
              onChange={(e) => set("notifyFather", e.target.checked)}
              className="h-4 w-4 accent-brand disabled:cursor-not-allowed disabled:opacity-40"
            />
            WhatsApp
          </label>
        </div>

        <input className={inputCls} placeholder="Vasi / Yakın Adı" value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />
        <div className="flex items-center gap-2">
          <input
            className={`${inputCls} flex-1`}
            placeholder="Vasi / Yakın Telefonu"
            value={form.emergencyPhone}
            onChange={(e) => {
              const value = e.target.value;
              setForm((f) => ({ ...f, emergencyPhone: value, notifyGuardian: value.trim() ? f.notifyGuardian : false }));
            }}
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.notifyGuardian}
              disabled={!form.emergencyPhone.trim()}
              onChange={(e) => set("notifyGuardian", e.target.checked)}
              className="h-4 w-4 accent-brand disabled:cursor-not-allowed disabled:opacity-40"
            />
            WhatsApp
          </label>
        </div>
        </div>
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
