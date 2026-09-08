import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { StudentFormModal } from "../../../components/forms/StudentFormModal";
import { ConfirmDialog } from "../../../components/common/Modal";
import { GroupWizardModal } from "./GroupWizardModal";
import { StudentDetailModal } from "./StudentDetailModal";
import { calcAge, formatPhone } from "../../../lib/format";

interface StudentRow {
  id: string;
  fullName: string;
  tcNoMasked: string;
  dob: string;
  group?: { id: string; name: string } | null;
  motherPhone?: string | null;
  fatherPhone?: string | null;
}
interface PreRegRow {
  id: string;
  fullName: string;
  parentName: string;
  phone: string;
  ageGroup?: string;
}
interface GroupRow {
  id: string;
  name: string;
}

const AGE_BUCKETS = [
  { label: "Tüm Yaşlar", min: -Infinity, max: Infinity },
  ...Array.from({ length: 12 }, (_, i) => {
    const age = i + 5;
    return { label: `${age} Yaş`, min: age, max: age };
  }),
];

export function AdminStudentsTab() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [search, setSearch] = useState("");
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [ageFilter, setAgeFilter] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [prefill, setPrefill] = useState<any>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [preRegs, setPreRegs] = useState<PreRegRow[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<StudentRow | null>(null);
  const [groupWizardOpen, setGroupWizardOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  function loadStudents() {
    apiClient.get("/students", { params: { search, groupId: groupFilter || undefined } }).then((r) => setStudents(r.data));
  }
  function loadGroups() {
    apiClient.get("/groups").then((r) => setGroups(r.data));
  }
  function loadPreRegs() {
    apiClient.get("/pre-registrations", { params: { status: "beklemede" } }).then((r) => setPreRegs(r.data));
  }

  useEffect(loadStudents, [search, groupFilter]);
  useEffect(() => {
    loadGroups();
    loadPreRegs();
  }, []);

  const visibleStudents = useMemo(() => {
    const bucket = AGE_BUCKETS[ageFilter];
    return students.filter((s) => {
      const age = calcAge(s.dob);
      return age >= bucket.min && age <= bucket.max;
    });
  }, [students, ageFilter]);

  async function acceptPreReg(id: string) {
    const { data } = await apiClient.get(`/pre-registrations/${id}/prefill`);
    setPrefill({ ...data, preRegistrationId: id });
    setInboxOpen(false);
    setFormOpen(true);
  }

  async function rejectPreReg(id: string) {
    await apiClient.patch(`/pre-registrations/${id}/reject`);
    loadPreRegs();
  }

  async function doDelete() {
    if (!deleteTarget) return;
    await apiClient.delete(`/students/${deleteTarget.id}`);
    setDeleteTarget(null);
    loadStudents();
  }

  function onGroupCreated() {
    loadGroups();
    loadStudents();
    setSuccessMessage("Grup oluşturuldu ve seçilen öğrenciler atandı.");
    setTimeout(() => setSuccessMessage(""), 4000);
  }

  function onStudentSaved(updated: Record<string, unknown>) {
    setStudents((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } as StudentRow : s)));
    setSuccessMessage("Öğrenci bilgileri başarıyla güncellendi.");
    setTimeout(() => setSuccessMessage(""), 4000);
  }

  const selectCls =
    "rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white";

  return (
    <div className="p-7">
      {successMessage && (
        <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700 dark:bg-green-900/20 dark:text-green-400">
          ✓ {successMessage}
        </div>
      )}

      {/* Üst Kontrol ve Filtre Çubuğu */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ad veya soyad ara…"
          className="min-w-[180px] flex-1 rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white"
        />
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className={selectCls}>
          <option value="">Tüm gruplar</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select value={ageFilter} onChange={(e) => setAgeFilter(Number(e.target.value))} className={selectCls}>
          {AGE_BUCKETS.map((b, i) => (
            <option key={b.label} value={i}>
              {b.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setPrefill(null);
            setFormOpen(true);
          }}
          className="whitespace-nowrap rounded-xl bg-[#010E80] px-4 py-3 text-sm font-bold text-white hover:bg-brand-hover"
        >
          + Yeni Öğrenci Kaydet
        </button>
        <button
          onClick={() => setGroupWizardOpen(true)}
          className="whitespace-nowrap rounded-xl bg-[#FACC15] px-4 py-3 text-sm font-extrabold text-slate-900"
        >
          + Yeni Grup Oluştur
        </button>
        <button
          onClick={() => setInboxOpen(true)}
          className="whitespace-nowrap rounded-xl bg-[#FACC15] px-4 py-3 text-sm font-extrabold text-slate-900"
        >
          Ön Kayıt Talepleri ({preRegs.length})
        </button>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-paper2 dark:border-slate-800 dark:bg-surface">
        <div className="min-w-[760px]">
          {/* Tablo Başlık Şeridi */}
          <div className="grid grid-cols-[1.1fr_1.6fr_0.6fr_0.9fr_1.3fr_0.8fr] gap-3 bg-slate-200 px-5 py-3 text-[11px] font-extrabold uppercase tracking-wide text-slate-600 dark:bg-surface2 dark:text-slate-300">
            <div>T.C. No</div>
            <div>Ad Soyad</div>
            <div>Yaş</div>
            <div>Grup</div>
            <div>Veli Telefon</div>
            <div className="text-right">İşlemler</div>
          </div>

          {visibleStudents.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelectedStudentId(s.id)}
              className="grid cursor-pointer grid-cols-[1.1fr_1.6fr_0.6fr_0.9fr_1.3fr_0.8fr] items-center gap-3 border-b border-slate-100 px-5 py-3.5 transition hover:bg-slate-50 last:border-0 dark:border-slate-800 dark:hover:bg-slate-800/40"
            >
              <div className="font-mono text-xs text-slate-400">{s.tcNoMasked}</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">{s.fullName}</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">{calcAge(s.dob)}</div>
              <div>
                {s.group ? (
                  <span className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-brand dark:bg-[#010E80]/30 dark:text-[#93c5fd]">
                    {s.group.name}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </div>
              <div className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{formatPhone(s.motherPhone || s.fatherPhone)}</div>
              <div className="text-right">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(s);
                  }}
                  className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 dark:bg-surface2 dark:hover:bg-red-950/30"
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
          {visibleStudents.length === 0 && <div className="p-6 text-sm text-slate-400">Kayıtlı öğrenci bulunamadı.</div>}
        </div>
      </div>

      <StudentFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          loadStudents();
          loadPreRegs();
          setSuccessMessage("Öğrenci kaydı başarıyla oluşturuldu.");
          setTimeout(() => setSuccessMessage(""), 4000);
        }}
        prefill={prefill}
      />

      <GroupWizardModal
        open={groupWizardOpen}
        onClose={() => setGroupWizardOpen(false)}
        existingGroups={groups}
        onCreated={onGroupCreated}
      />

      <StudentDetailModal studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)} onSaved={onStudentSaved} />

      {inboxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-5" onClick={() => setInboxOpen(false)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-3xl bg-paper2 p-6 dark:bg-surface" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 text-xl font-extrabold text-slate-900 dark:text-white">Ön Kayıt Talepleri ({preRegs.length})</div>
            {preRegs.map((p) => (
              <div key={p.id} className="mb-2.5 rounded-2xl bg-slate-100 p-3.5 dark:bg-surface2">
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">{p.fullName}</div>
                <div className="mb-2.5 text-xs text-slate-500">
                  {p.parentName} · {p.phone} · {p.ageGroup}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => acceptPreReg(p.id)} className="flex-1 rounded-lg bg-green-600 py-2 text-xs font-extrabold text-white">
                    Onayla &amp; Kayıt Yap
                  </button>
                  <button onClick={() => rejectPreReg(p.id)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-extrabold text-red-600">
                    Reddet
                  </button>
                </div>
              </div>
            ))}
            {preRegs.length === 0 && <div className="text-sm text-slate-400">Bekleyen ön kayıt talebi yok.</div>}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Kaydı kaldır"
        body={`${deleteTarget?.fullName} kaydı silinecek. Bu işlem geri alınamaz.`}
        confirmLabel="Evet, Sil"
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
