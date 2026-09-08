import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuthStore } from "../../features/auth/authStore";
import { SPECIALTY_THEME } from "../../lib/specialtyColors";

interface RosterEntry {
  studentId: string;
  fullName: string;
  group: string;
  status: "var" | "yok" | null;
}
interface Group {
  id: string;
  name: string;
}

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function StaffPanelPage() {
  const { displayName, specialty } = useAuthStore();
  const theme = SPECIALTY_THEME[specialty ?? "antrenor"];
  const [tab, setTab] = useState<"attendance" | "notes">("attendance");
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string>("");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceSavedMessage, setAttendanceSavedMessage] = useState("");
  const [attendanceError, setAttendanceError] = useState("");

  const [noteGroupId, setNoteGroupId] = useState("");
  const [noteRoster, setNoteRoster] = useState<RosterEntry[]>([]);
  const [noteStudentId, setNoteStudentId] = useState("");
  const [noteMonth, setNoteMonth] = useState(new Date().getMonth() + 1);
  const [noteYear, setNoteYear] = useState(new Date().getFullYear());
  const [noteBody, setNoteBody] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  useEffect(() => {
    apiClient.get("/groups").then((r) => setGroups(r.data));
  }, []);

  useEffect(() => {
    if (!groupId) {
      setRoster([]);
      return;
    }
    apiClient.get("/attendance", { params: { groupId } }).then((r) => setRoster(r.data));
    setAttendanceSearch("");
  }, [groupId]);

  useEffect(() => {
    if (!noteGroupId) {
      setNoteRoster([]);
      setNoteStudentId("");
      return;
    }
    apiClient.get("/attendance", { params: { groupId: noteGroupId } }).then((r) => setNoteRoster(r.data));
    setNoteStudentId("");
  }, [noteGroupId]);

  const filteredRoster = useMemo(() => {
    const q = attendanceSearch.trim().toLocaleLowerCase("tr-TR");
    if (!q) return roster;
    return roster.filter((s) => s.fullName.toLocaleLowerCase("tr-TR").includes(q));
  }, [roster, attendanceSearch]);

  function mark(studentId: string, status: "var" | "yok") {
    // Yalnızca ekrandaki durumu günceller — asıl kayıt "Yoklamayı Kaydet ve Bildir" ile yapılır.
    setRoster((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
    setAttendanceSavedMessage("");
  }

  async function saveAttendance() {
    setAttendanceError("");
    setAttendanceSavedMessage("");
    const records = roster
      .filter((r) => r.status)
      .map((r) => ({ studentId: r.studentId, sessionDate: new Date().toISOString().slice(0, 10), status: r.status }));
    if (records.length === 0) {
      setAttendanceError("Kaydetmeden önce en az bir öğrencinin durumunu işaretleyin.");
      return;
    }
    setAttendanceSaving(true);
    try {
      const { data } = await apiClient.post("/attendance/bulk", { records });
      setAttendanceSavedMessage(
        `Yoklama kaydedildi ve gelmeyen ${data.notifiedCount} öğrencinin velisine WhatsApp bildirimi iletildi.`
      );
    } catch (e: any) {
      setAttendanceError(e.response?.data?.error?.message ?? "Yoklama kaydedilemedi");
    } finally {
      setAttendanceSaving(false);
    }
  }

  async function saveNote() {
    setNoteSaved(false);
    setNoteError("");
    setNoteSaving(true);
    try {
      await apiClient.post("/notes", {
        studentId: noteStudentId,
        periodMonth: noteMonth,
        periodYear: noteYear,
        body: noteBody,
      });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 4000);
      setNoteBody("");
      setNoteStudentId("");
    } catch (e: any) {
      setNoteError(e.response?.data?.error?.message ?? "Not kaydedilemedi");
    } finally {
      setNoteSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 border-b border-slate-200 bg-paper2 px-7 py-6 dark:border-slate-800 dark:bg-surface">
        <div className="text-lg font-extrabold text-slate-900 dark:text-white">{displayName}</div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 bg-slate-50 px-7 pt-4 dark:border-slate-800 dark:bg-transparent">
        <button
          onClick={() => setTab("attendance")}
          className={`rounded-t-xl px-4 py-2.5 text-sm font-bold transition-colors ${
            tab === "attendance" ? theme.activeTab : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          1. Yoklama Al
        </button>
        <button
          onClick={() => setTab("notes")}
          className={`rounded-t-xl px-4 py-2.5 text-sm font-bold transition-colors ${
            tab === "notes" ? theme.activeTab : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          2. Öğrenciye Not Ekle
        </button>
      </div>

      {tab === "attendance" && (
        <div className="p-7">
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className={`mb-4 rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-surface dark:text-white ${theme.focusRing}`}
          >
            <option value="">Sınıf seçiniz…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <input
            value={attendanceSearch}
            onChange={(e) => setAttendanceSearch(e.target.value)}
            placeholder="Öğrenci ara…"
            disabled={!groupId}
            className={`mb-3 w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-surface dark:text-white ${theme.focusRing}`}
          />
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-paper2 dark:border-slate-800 dark:bg-surface">
            {!groupId && <div className={`p-4 text-sm ${theme.infoBox}`}>Yoklama listesini görmek için önce bir sınıf seçin.</div>}
            {filteredRoster.map((s) => (
              <div key={s.studentId} className="flex items-center gap-4 border-b border-slate-100 px-5 py-3.5 last:border-0 dark:border-slate-800">
                <div className="flex-1 text-sm font-bold text-slate-800 dark:text-slate-100">{s.fullName}</div>
                <button
                  onClick={() => mark(s.studentId, "var")}
                  className={`rounded-lg px-3 py-2 text-xs font-bold ${s.status === "var" ? "bg-green-600 text-white" : "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}
                >
                  ✓ Var
                </button>
                <button
                  onClick={() => mark(s.studentId, "yok")}
                  className={`rounded-lg px-3 py-2 text-xs font-bold ${s.status === "yok" ? "bg-red-600 text-white" : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}
                >
                  ✕ Yok
                </button>
              </div>
            ))}
            {groupId && roster.length === 0 && <div className={`p-4 text-sm ${theme.infoBox}`}>Bu grupta kayıtlı öğrenci bulunamadı.</div>}
            {roster.length > 0 && filteredRoster.length === 0 && (
              <div className={`p-4 text-sm ${theme.infoBox}`}>Aramanızla eşleşen öğrenci bulunamadı.</div>
            )}
          </div>

          {groupId && roster.length > 0 && (
            <div className="mt-4">
              {attendanceSavedMessage && (
                <div className="mb-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700 dark:bg-green-900/20 dark:text-green-400">
                  ✓ {attendanceSavedMessage}
                </div>
              )}
              {attendanceError && (
                <div className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{attendanceError}</div>
              )}
              <button
                onClick={saveAttendance}
                disabled={attendanceSaving}
                className={`w-full rounded-xl py-4 text-base font-extrabold shadow-md transition-colors disabled:opacity-50 ${theme.activeTab}`}
              >
                {attendanceSaving ? "Kaydediliyor ve Bildiriliyor…" : "Yoklamayı Kaydet ve Bildir"}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "notes" && (
        <div className="max-w-lg p-7">
          <div className="rounded-2xl border border-slate-200 bg-paper2 p-5 dark:border-slate-800 dark:bg-surface">
            <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">1. Sınıf / Grup Seçiniz</label>
            <select
              value={noteGroupId}
              onChange={(e) => setNoteGroupId(e.target.value)}
              className={`mb-4 w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-surface2 dark:text-white ${theme.focusRing}`}
            >
              <option value="">Sınıf seçiniz…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">2. Öğrenci Seçiniz</label>
            <select
              value={noteStudentId}
              onChange={(e) => setNoteStudentId(e.target.value)}
              disabled={!noteGroupId}
              className={`mb-4 w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-surface2 dark:text-white ${theme.focusRing}`}
            >
              <option value="">{noteGroupId ? "Seçiniz…" : "Önce sınıf seçin"}</option>
              {noteRoster.map((s) => (
                <option key={s.studentId} value={s.studentId}>
                  {s.fullName}
                </option>
              ))}
            </select>

            <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Değerlendirme Dönemi</label>
            <div className="mb-4 flex gap-2">
              <select
                value={noteMonth}
                onChange={(e) => setNoteMonth(Number(e.target.value))}
                className={`flex-1 rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-surface2 dark:text-white ${theme.focusRing}`}
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={noteYear}
                onChange={(e) => setNoteYear(Number(e.target.value))}
                className={`w-28 rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-surface2 dark:text-white ${theme.focusRing}`}
              >
                {[noteYear - 1, noteYear, noteYear + 1].filter((v, i, arr) => arr.indexOf(v) === i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={4}
              placeholder="Değerlendirmenizi yazın…"
              className={`mb-4 w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-surface2 dark:text-white ${theme.focusRing}`}
            />
            {noteSaved && (
              <div className="mb-3 rounded-lg bg-green-50 px-4 py-3 text-sm font-bold text-green-700 dark:bg-green-900/20 dark:text-green-400">
                ✓ Öğrenci değerlendirme notu başarıyla kaydedildi.
              </div>
            )}
            {noteError && <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{noteError}</div>}
            <button
              onClick={saveNote}
              disabled={!noteStudentId || !noteBody || noteSaving}
              className={`w-full rounded-xl py-3.5 text-sm font-extrabold transition-colors disabled:opacity-40 ${theme.activeTab}`}
            >
              {noteSaving ? "Kaydediliyor…" : "Notu Kaydet"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
