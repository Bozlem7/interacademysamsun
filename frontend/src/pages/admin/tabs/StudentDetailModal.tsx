import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { Modal, ConfirmDialog } from "../../../components/common/Modal";
import { tcErrorMessage } from "../../../lib/tcValidation";
import { calcAge, formatPhone } from "../../../lib/format";
import { DocumentUploadField } from "../../../components/forms/DocumentUploadField";

interface GroupOption {
  id: string;
  name: string;
}

interface StudentDetail {
  id: string;
  fullName: string;
  tcNoMasked: string;
  dob: string;
  gender: "erkek" | "kiz" | null;
  bloodType: string | null;
  heightCm: number | null;
  weightKg: number | null;
  email: string | null;
  address: string | null;
  photoUrl: string | null;
  motherName: string | null;
  motherPhone: string | null;
  motherJob: string | null;
  fatherName: string | null;
  fatherPhone: string | null;
  fatherJob: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  registrationPdfUrl: string | null;
  group: { id: string; name: string } | null;
}

type EditableForm = {
  fullName: string;
  tcNo: string;
  dob: string;
  gender: "erkek" | "kiz";
  groupId: string;
  bloodType: string;
  heightCm: string;
  weightKg: string;
  email: string;
  address: string;
  motherName: string;
  motherPhone: string;
  motherEmail: string;
  motherJob: string;
  fatherName: string;
  fatherPhone: string;
  fatherEmail: string;
  fatherJob: string;
  emergencyName: string;
  emergencyPhone: string;
};

function toForm(d: StudentDetail): EditableForm {
  return {
    fullName: d.fullName,
    tcNo: "",
    dob: d.dob?.slice(0, 10) ?? "",
    gender: d.gender ?? "erkek",
    groupId: d.group?.id ?? "",
    bloodType: d.bloodType ?? "",
    heightCm: d.heightCm != null ? String(d.heightCm) : "",
    weightKg: d.weightKg != null ? String(d.weightKg) : "",
    email: d.email ?? "",
    address: d.address ?? "",
    motherName: d.motherName ?? "",
    motherPhone: d.motherPhone ?? "",
    motherEmail: "",
    motherJob: d.motherJob ?? "",
    fatherName: d.fatherName ?? "",
    fatherPhone: d.fatherPhone ?? "",
    fatherEmail: "",
    fatherJob: d.fatherJob ?? "",
    emergencyName: d.emergencyName ?? "",
    emergencyPhone: d.emergencyPhone ?? "",
  };
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function StudentDetailModal({
  studentId,
  onClose,
  onSaved,
}: {
  studentId: string | null;
  onClose: () => void;
  onSaved: (updated: { id: string; group: { id: string; name: string } | null } & Record<string, unknown>) => void;
}) {
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<EditableForm | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tcDuplicate, setTcDuplicate] = useState(false);
  const [docUploadOpen, setDocUploadOpen] = useState(false);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState("");
  const [docDeleteConfirmOpen, setDocDeleteConfirmOpen] = useState(false);
  const [docDeleting, setDocDeleting] = useState(false);
  const [docDeletedMessage, setDocDeletedMessage] = useState("");

  const DUPLICATE_TC_MESSAGE = "Bu T.C. Kimlik Numarası ile kayıtlı bir öğrenci zaten bulunmaktadır!";

  function loadDetail() {
    if (!studentId) return;
    Promise.all([apiClient.get(`/students/${studentId}`), apiClient.get("/groups")]).then(([detailRes, groupsRes]) => {
      setDetail(detailRes.data);
      setForm(toForm(detailRes.data));
      setGroups(groupsRes.data);
    });
  }

  useEffect(() => {
    if (!studentId) return;
    setMode("view");
    setError("");
    setTcDuplicate(false);
    setDocUploadOpen(false);
    setDocFiles([]);
    setDocError("");
    setDocDeleteConfirmOpen(false);
    setDocDeletedMessage("");
    loadDetail();
  }, [studentId]);

  async function deleteDocument() {
    if (!studentId) return;
    setDocError("");
    setDocDeleting(true);
    try {
      await apiClient.delete(`/students/${studentId}/documents`);
      setDocDeleteConfirmOpen(false);
      setDocDeletedMessage("Kayıt evrakı başarıyla silindi.");
      setTimeout(() => setDocDeletedMessage(""), 4000);
      loadDetail();
    } catch (e: any) {
      setDocDeleteConfirmOpen(false);
      setDocError(e.response?.data?.error?.message ?? "Evrak silinemedi");
    } finally {
      setDocDeleting(false);
    }
  }

  async function uploadDocuments() {
    if (!studentId || docFiles.length === 0) return;
    setDocError("");
    setDocUploading(true);
    try {
      const formData = new FormData();
      docFiles.forEach((f) => formData.append("files", f));
      await apiClient.post(`/students/${studentId}/upload-documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDocFiles([]);
      setDocUploadOpen(false);
      loadDetail();
    } catch (e: any) {
      setDocError(e.response?.data?.error?.message ?? "Evrak yüklenemedi");
    } finally {
      setDocUploading(false);
    }
  }

  function set<K extends keyof EditableForm>(key: K, value: EditableForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function checkTcDuplicate() {
    if (!form?.tcNo || tcErrorMessage(form.tcNo)) {
      setTcDuplicate(false);
      return;
    }
    try {
      const { data } = await apiClient.get(`/students/check-tc/${form.tcNo}`, { params: { excludeStudentId: studentId } });
      setTcDuplicate(!!data.exists);
    } catch {
      // Canlı kontrol başarısız olsa bile submit anındaki backend kontrolü son sözü söyler.
    }
  }

  async function save() {
    if (!form || !studentId || !detail) return;
    setError("");
    if (form.tcNo) {
      const tcError = tcErrorMessage(form.tcNo);
      if (tcError) {
        setError(tcError);
        return;
      }
      if (tcDuplicate) {
        setError(DUPLICATE_TC_MESSAGE);
        return;
      }
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        fullName: form.fullName,
        dob: form.dob,
        gender: form.gender,
        groupId: form.groupId || undefined,
        bloodType: form.bloodType || undefined,
        heightCm: form.heightCm ? Number(form.heightCm) : undefined,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        email: form.email,
        address: form.address || undefined,
        motherName: form.motherName || undefined,
        motherPhone: form.motherPhone || undefined,
        motherJob: form.motherJob || undefined,
        fatherName: form.fatherName || undefined,
        fatherPhone: form.fatherPhone || undefined,
        fatherJob: form.fatherJob || undefined,
        emergencyName: form.emergencyName || undefined,
        emergencyPhone: form.emergencyPhone || undefined,
      };
      if (form.tcNo) payload.tcNo = form.tcNo;
      if (!form.groupId) payload.groupId = null;

      const { data: updated } = await apiClient.put(`/students/${studentId}`, payload);
      setDetail(updated);
      setForm(toForm(updated));
      setMode("view");
      onSaved(updated);
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? "Güncelleme başarısız");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-paper2 p-2.5 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface2 dark:text-white";
  const labelCls = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";

  function Field({ label, value }: { label: string; value: string }) {
    return (
      <div>
        <div className={labelCls}>{label}</div>
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{value || "—"}</div>
      </div>
    );
  }

  return (
    <>
    <Modal open={!!studentId} onClose={onClose} title="">
      {!detail || !form ? (
        <div className="py-10 text-center text-sm text-slate-400">Yükleniyor…</div>
      ) : (
        <>
          {/* Başlık / Üst Bilgi */}
          <div className="mb-5 flex items-start gap-4">
            {detail.photoUrl ? (
              <img src={detail.photoUrl} alt={detail.fullName} className="h-16 w-16 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#010E80] text-lg font-extrabold text-white">
                {initials(detail.fullName)}
              </div>
            )}
            <div className="flex-1">
              <div className="text-lg font-extrabold text-slate-900 dark:text-white">{detail.fullName}</div>
              <div className="font-mono text-xs text-slate-400">{detail.tcNoMasked}</div>
              <div className="mt-1.5">
                {detail.group ? (
                  <span className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-brand dark:bg-[#010E80]/30 dark:text-[#93c5fd]">
                    {detail.group.name}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">Grup atanmamış</span>
                )}
                <span className="ml-2 text-xs text-slate-400">{calcAge(detail.dob)} yaş</span>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {mode === "view" ? (
                <button
                  onClick={() => setMode("edit")}
                  className="rounded-lg bg-[#010E80] px-4 py-2 text-xs font-extrabold text-white hover:bg-brand-hover"
                >
                  Düzenle
                </button>
              ) : (
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-green-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              )}
              <button onClick={onClose} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 dark:bg-surface2 dark:text-slate-300">
                ✕
              </button>
            </div>
          </div>

          {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          {/* SPORCU BİLGİLERİ */}
          <div className="mb-2 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">SPORCU BİLGİLERİ</div>
          {mode === "view" ? (
            <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 dark:bg-surface2 sm:grid-cols-3">
              <Field label="Adı Soyadı" value={detail.fullName} />
              <Field label="T.C. Kimlik No" value={detail.tcNoMasked} />
              <Field label="Doğum Tarihi" value={detail.dob?.slice(0, 10)} />
              <Field label="Cinsiyet" value={detail.gender === "erkek" ? "Erkek" : detail.gender === "kiz" ? "Kız" : ""} />
              <Field label="Kan Grubu" value={detail.bloodType ?? ""} />
              <Field label="Boy (cm)" value={detail.heightCm != null ? String(detail.heightCm) : ""} />
              <Field label="Kilo (kg)" value={detail.weightKg != null ? String(detail.weightKg) : ""} />
              <Field label="E-Posta" value={detail.email ?? ""} />
              <Field label="İkametgah Adresi" value={detail.address ?? ""} />
            </div>
          ) : (
            <div className="mb-5 grid grid-cols-2 gap-2.5">
              <div>
                <div className={labelCls}>Adı Soyadı</div>
                <input className={inputCls} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
              </div>
              <div>
                <div className={labelCls}>T.C. Kimlik No (değiştirmek için doldurun)</div>
                <input
                  className={`${inputCls} ${tcDuplicate ? "border-red-500" : ""}`}
                  placeholder={detail.tcNoMasked}
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
              <div>
                <div className={labelCls}>Doğum Tarihi</div>
                <input className={inputCls} type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
              </div>
              <div>
                <div className={labelCls}>Cinsiyet</div>
                <select className={inputCls} value={form.gender} onChange={(e) => set("gender", e.target.value as "erkek" | "kiz")}>
                  <option value="erkek">Erkek</option>
                  <option value="kiz">Kız</option>
                </select>
              </div>
              <div>
                <div className={labelCls}>Grup Seçimi</div>
                <select className={inputCls} value={form.groupId} onChange={(e) => set("groupId", e.target.value)}>
                  <option value="">Grup atanmamış</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className={labelCls}>Kan Grubu</div>
                <select className={inputCls} value={form.bloodType} onChange={(e) => set("bloodType", e.target.value)}>
                  <option value="">Seçiniz</option>
                  {["A Rh+", "A Rh-", "B Rh+", "B Rh-", "AB Rh+", "AB Rh-", "0 Rh+", "0 Rh-"].map((bt) => (
                    <option key={bt}>{bt}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className={labelCls}>Boy (cm)</div>
                <input className={inputCls} value={form.heightCm} onChange={(e) => set("heightCm", e.target.value.replace(/\D/g, ""))} />
              </div>
              <div>
                <div className={labelCls}>Kilo (kg)</div>
                <input className={inputCls} value={form.weightKg} onChange={(e) => set("weightKg", e.target.value.replace(/\D/g, ""))} />
              </div>
              <div>
                <div className={labelCls}>E-Posta</div>
                <input className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="col-span-2">
                <div className={labelCls}>İkametgah Adresi</div>
                <input className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} />
              </div>
            </div>
          )}

          {/* VELİ & İLETİŞİM BİLGİLERİ */}
          <div className="mb-2 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">VELİ &amp; İLETİŞİM BİLGİLERİ</div>
          {mode === "view" ? (
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 dark:bg-surface2 sm:grid-cols-3">
              <Field label="Anne Adı Soyadı" value={detail.motherName ?? ""} />
              <Field label="Anne Telefon" value={formatPhone(detail.motherPhone)} />
              <Field label="Anne Meslek" value={detail.motherJob ?? ""} />
              <Field label="Baba Adı Soyadı" value={detail.fatherName ?? ""} />
              <Field label="Baba Telefon" value={formatPhone(detail.fatherPhone)} />
              <Field label="Baba Meslek" value={detail.fatherJob ?? ""} />
              <Field label="Acil Durum Kişisi" value={detail.emergencyName ?? ""} />
              <Field label="Acil Durum Telefonu" value={formatPhone(detail.emergencyPhone)} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <div className={labelCls}>Anne Adı Soyadı</div>
                <input className={inputCls} value={form.motherName} onChange={(e) => set("motherName", e.target.value)} />
              </div>
              <div>
                <div className={labelCls}>Anne Telefon</div>
                <input className={inputCls} value={form.motherPhone} onChange={(e) => set("motherPhone", e.target.value)} />
              </div>
              <div>
                <div className={labelCls}>Anne Meslek</div>
                <input className={inputCls} value={form.motherJob} onChange={(e) => set("motherJob", e.target.value)} />
              </div>
              <div />
              <div>
                <div className={labelCls}>Baba Adı Soyadı</div>
                <input className={inputCls} value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} />
              </div>
              <div>
                <div className={labelCls}>Baba Telefon</div>
                <input className={inputCls} value={form.fatherPhone} onChange={(e) => set("fatherPhone", e.target.value)} />
              </div>
              <div>
                <div className={labelCls}>Baba Meslek</div>
                <input className={inputCls} value={form.fatherJob} onChange={(e) => set("fatherJob", e.target.value)} />
              </div>
              <div />
              <div>
                <div className={labelCls}>Acil Durumda Aranacak Kişi</div>
                <input className={inputCls} value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />
              </div>
              <div>
                <div className={labelCls}>Acil Durum Telefonu</div>
                <input className={inputCls} value={form.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} />
              </div>
            </div>
          )}

          {/* KAYIT EVRAKLARI */}
          <div className="mt-5 mb-2 text-xs font-extrabold tracking-wide text-brand dark:text-[#93c5fd]">KAYIT EVRAKLARI</div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-surface2">
            {docDeletedMessage && (
              <div className="mb-3 rounded-lg bg-green-50 px-3.5 py-2.5 text-xs font-bold text-green-700 dark:bg-green-900/20 dark:text-green-400">
                ✓ {docDeletedMessage}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              {detail.registrationPdfUrl ? (
                <a
                  href={detail.registrationPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#010E80] px-4 py-3 text-sm font-extrabold text-white hover:bg-brand-hover"
                >
                  📄 Kayıt Bilgileri PDF'i Görüntüle
                </a>
              ) : (
                <>
                  <button
                    type="button"
                    disabled
                    className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-slate-300 px-4 py-3 text-sm font-extrabold text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                  >
                    📄 Kayıt Bilgileri PDF'i Görüntüle
                  </button>
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                    Kayıt evrakı yüklenmemiş
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => setDocUploadOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-300 dark:bg-surface dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {detail.registrationPdfUrl ? "Yeni Evrak Yükle / Değiştir" : "Evrak Yükle"}
              </button>
              {detail.registrationPdfUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setDocError("");
                    setDocDeleteConfirmOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm font-bold text-red-500 transition hover:bg-red-500/20"
                >
                  🗑️ Evrakı Sil
                </button>
              )}
            </div>
            {docError && <div className="mt-2 text-xs font-bold text-red-600">{docError}</div>}

            {docUploadOpen && (
              <div className="mt-4">
                <DocumentUploadField files={docFiles} onChange={setDocFiles} />
                <button
                  type="button"
                  onClick={uploadDocuments}
                  disabled={docFiles.length === 0 || docUploading}
                  className="mt-3 w-full rounded-xl bg-brand py-3 text-sm font-extrabold text-white disabled:opacity-40"
                >
                  {docUploading ? "Yükleniyor ve PDF Oluşturuluyor…" : "Yükle ve PDF Oluştur"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </Modal>

    <ConfirmDialog
      open={docDeleteConfirmOpen}
      title="Kayıt evrakını sil"
      body="Bu öğrenciye ait 'Kayıt Bilgileri PDF' dosyasını kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
      confirmLabel={docDeleting ? "Siliniyor…" : "Evet, Kalıcı Olarak Sil"}
      onConfirm={deleteDocument}
      onCancel={() => setDocDeleteConfirmOpen(false)}
    />
    </>
  );
}
