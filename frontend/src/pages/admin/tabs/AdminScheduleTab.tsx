import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { fetchBranches, Branch } from "../../../features/branch/branchApi";
import { useAuthStore } from "../../../features/auth/authStore";
import { SPECIALTY_BADGE_CLASS, sessionTypeToSpecialty } from "../../../lib/specialtyColors";

const SESSION_TYPE_LABEL: Record<string, string> = { saha: "Saha Antrenmanı", diyet: "Diyetisyen", psikolog: "Psikolog" };

interface SessionRow {
  id: string;
  groupId: string;
  group: { name: string };
  dayOfWeek: number;
  startTime: string;
  sessionType: "saha" | "diyet" | "psikolog";
  location?: string;
  description?: string;
}
interface Group {
  id: string;
  name: string;
}

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

export function AdminScheduleTab() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const sessionBranch = useAuthStore((s) => s.branch);
  const [newRow, setNewRow] = useState({ groupId: "", dayOfWeek: 0, startTime: "17:00", sessionType: "saha" as const, description: "" });
  const [locationBranch, setLocationBranch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  function load() {
    apiClient.get("/schedule").then((r) => setRows(r.data));
    apiClient.get("/groups").then((r) => {
      setGroups(r.data);
      if (r.data[0]) setNewRow((n) => ({ ...n, groupId: r.data[0].id }));
    });
  }
  useEffect(load, []);
  useEffect(() => {
    fetchBranches().then(setBranches);
  }, []);
  useEffect(() => {
    if (sessionBranch) setLocationBranch(sessionBranch.name);
  }, [sessionBranch]);

  async function addRow() {
    setError("");
    if (!newRow.groupId) {
      setError("Lütfen bir grup seçin");
      return;
    }
    if (!locationBranch) {
      setError("Lütfen bir lokasyon (şube) seçin");
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/schedule", { ...newRow, location: locationBranch });
      load();
      setSuccessMessage("Antrenman programı başarıyla kaydedildi.");
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? "Antrenman programı kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }
  async function removeRow(id: string) {
    await apiClient.delete(`/schedule/${id}`);
    load();
  }

  return (
    <div className="p-7">
      <p className="mb-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
        Ana sayfadaki sabit genel programı buradan yönetin — değişiklikler anında yansır.
      </p>

      {successMessage && (
        <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700 dark:bg-green-900/20 dark:text-green-400">
          ✓ {successMessage}
        </div>
      )}
      {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-paper2 dark:border-slate-800 dark:bg-surface">
        <div className="grid grid-cols-6 gap-2.5 bg-slate-100 px-4 py-3 text-xs font-extrabold text-slate-400 dark:bg-black/30">
          <div>GRUP</div>
          <div>GÜN</div>
          <div>SAAT</div>
          <div>TÜR</div>
          <div>LOKASYON</div>
          <div></div>
        </div>
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-6 items-center gap-2.5 border-b border-slate-100 px-4 py-3 text-sm last:border-0 dark:border-slate-800 dark:text-slate-200">
            <div className="font-bold text-slate-800 dark:text-white">{r.group?.name}</div>
            <div>{DAYS[r.dayOfWeek]}</div>
            <div>{r.startTime?.toString().slice(11, 16) || r.startTime?.toString().slice(0, 5)}</div>
            <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${SPECIALTY_BADGE_CLASS[sessionTypeToSpecialty(r.sessionType)]}`}>
              {SESSION_TYPE_LABEL[r.sessionType]}
            </span>
            <div className="text-slate-500 dark:text-slate-400">{r.location}</div>
            <button onClick={() => removeRow(r.id)} className="justify-self-end rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-extrabold text-red-600">
              Sil
            </button>
          </div>
        ))}

        <div className="flex flex-wrap items-start gap-2.5 bg-slate-50 px-4 py-3 dark:bg-black/20">
          <select className="rounded-lg border border-slate-200 bg-paper2 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-surface2 dark:text-white" value={newRow.groupId} onChange={(e) => setNewRow({ ...newRow, groupId: e.target.value })}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select className="rounded-lg border border-slate-200 bg-paper2 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-surface2 dark:text-white" value={newRow.dayOfWeek} onChange={(e) => setNewRow({ ...newRow, dayOfWeek: Number(e.target.value) })}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <input
            type="time"
            className="rounded-lg border border-slate-200 bg-paper2 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-surface2 dark:text-white"
            value={newRow.startTime}
            onChange={(e) => setNewRow({ ...newRow, startTime: e.target.value })}
          />
          <select className="rounded-lg border border-slate-200 bg-paper2 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-surface2 dark:text-white" value={newRow.sessionType} onChange={(e) => setNewRow({ ...newRow, sessionType: e.target.value as any })}>
            <option value="saha">Saha Antrenmanı</option>
            <option value="diyet">Diyetisyen</option>
            <option value="psikolog">Psikolog</option>
          </select>

          <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-paper2 p-2 dark:border-slate-700 dark:bg-surface2">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Lokasyon (Şube)</span>
            <div className="flex gap-3">
              {branches.map((b) => (
                <label key={b.code} className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="scheduleLocationBranch"
                    checked={locationBranch === b.name}
                    onChange={() => setLocationBranch(b.name)}
                    className="h-3.5 w-3.5"
                  />
                  {b.name}
                </label>
              ))}
            </div>
          </div>

          <button onClick={addRow} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50">
            {saving ? "Kaydediliyor…" : "+ Ekle"}
          </button>
        </div>
      </div>
    </div>
  );
}
