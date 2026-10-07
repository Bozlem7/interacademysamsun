import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { ConfirmDialog } from "../../../components/common/Modal";
import { calcAge, formatPhone } from "../../../lib/format";
import { formatDateTime } from "./PaymentActivityWidget";
import { SuspendedBadge, reactivateButtonCls, reactivateConfirmBody } from "./studentSuspension";

const PAGE_SIZE = 20;

interface SuspendedStudentRow {
  id: string;
  fullName: string;
  tcNoMasked: string;
  dob: string;
  group?: { id: string; name: string } | null;
  motherPhone?: string | null;
  fatherPhone?: string | null;
  suspendedAt: string | null;
  suspendedBy: string | null;
}

interface SuspendedStudentPage {
  items: SuspendedStudentRow[];
  total: number;
  page: number;
  pageSize: number;
}

const GRID_COLS = "grid-cols-[0.3fr_1.1fr_1.6fr_0.5fr_0.9fr_1.2fr_1.3fr_0.8fr]";

/** "Askıya Alınanlar" — yalnızca askıdaki öğrencileri listeler, buradan tekrar aktif edilebilirler. */
export function AdminSuspendedStudentsTab() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SuspendedStudentPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [reactivateTarget, setReactivateTarget] = useState<SuspendedStudentRow | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<SuspendedStudentPage>("/students/suspended", {
        params: { page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined },
      })
      .then((r) => !cancelled && setData(r.data))
      .catch(() => !cancelled && setData({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, refreshKey]);

  async function doReactivate() {
    if (!reactivateTarget) return;
    const target = reactivateTarget;
    setReactivateTarget(null);
    try {
      await apiClient.patch(`/students/${target.id}/reactivate`);
      setMessage({ ok: true, text: `${target.fullName} tekrar aktif edildi ve "Öğrenci Yönetimi" listesine taşındı.` });
      // Sayfadaki son kayıt aktif edildiyse bir önceki sayfaya dön.
      if (data && data.items.length === 1 && page > 1) setPage((p) => p - 1);
      else setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setMessage({ ok: false, text: e.response?.data?.error?.message ?? "Öğrenci aktif edilemedi." });
    }
    setTimeout(() => setMessage(null), 4000);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="p-7">
      {message && (
        <div
          className={`mb-4 rounded-xl px-4 py-3 text-sm font-bold ${
            message.ok
              ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
          }`}
        >
          {message.ok ? "✓ " : ""}
          {message.text}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <span className="whitespace-nowrap rounded-full bg-amber-100 px-3.5 py-2 text-xs font-extrabold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
          Askıdaki Öğrenci: {data?.total ?? "…"}
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ad veya soyad ara…"
          className="min-w-[180px] flex-1 rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-paper2 dark:border-slate-800 dark:bg-surface">
        <div className={`min-w-[900px] ${loading ? "opacity-60" : ""}`}>
          <div
            className={`grid ${GRID_COLS} gap-3 bg-slate-200 px-5 py-3 text-[11px] font-extrabold uppercase tracking-wide text-slate-600 dark:bg-surface2 dark:text-slate-300`}
          >
            <div>#</div>
            <div>T.C. No</div>
            <div>Ad Soyad</div>
            <div>Yaş</div>
            <div>Grup</div>
            <div>Veli Telefon</div>
            <div>Askıya Alınma</div>
            <div className="text-right">İşlemler</div>
          </div>

          {data?.items.map((s, index) => (
            <div
              key={s.id}
              className={`grid ${GRID_COLS} items-center gap-3 border-b border-slate-100 px-5 py-3.5 last:border-0 dark:border-slate-800`}
            >
              <div className="text-xs font-bold text-slate-400">{(page - 1) * PAGE_SIZE + index + 1}</div>
              <div className="font-mono text-xs text-slate-400">{s.tcNoMasked}</div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{s.fullName}</span>
                <SuspendedBadge />
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">{calcAge(s.dob)}</div>
              <div>
                {s.group ? (
                  <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-surface2 dark:text-slate-400">
                    {s.group.name}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </div>
              <div className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{formatPhone(s.motherPhone || s.fatherPhone)}</div>
              <div className="text-xs leading-snug text-slate-500 dark:text-slate-400">
                <div className="font-semibold text-slate-700 dark:text-slate-200">{s.suspendedAt ? formatDateTime(s.suspendedAt) : "—"}</div>
                {s.suspendedBy && <div>{s.suspendedBy}</div>}
              </div>
              <div className="text-right">
                <button onClick={() => setReactivateTarget(s)} className={reactivateButtonCls}>
                  Aktif Et
                </button>
              </div>
            </div>
          ))}
          {data && data.items.length === 0 && <div className="p-6 text-sm text-slate-400">Askıya alınmış öğrenci bulunmuyor.</div>}
          {!data && <div className="p-6 text-sm text-slate-400">Yükleniyor…</div>}
        </div>
      </div>

      {data && data.total > data.pageSize && (
        <div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg bg-slate-100 px-3 py-1.5 hover:bg-slate-200 disabled:opacity-40 dark:bg-surface2 dark:text-slate-300"
          >
            ‹ Önceki
          </button>
          <span>
            {page} / {totalPages} · {data.total} kayıt
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg bg-slate-100 px-3 py-1.5 hover:bg-slate-200 disabled:opacity-40 dark:bg-surface2 dark:text-slate-300"
          >
            Sonraki ›
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!reactivateTarget}
        title="Öğrenciyi aktif et"
        body={reactivateConfirmBody(reactivateTarget?.fullName)}
        confirmLabel="Evet, Aktif Et"
        tone="success"
        onConfirm={doReactivate}
        onCancel={() => setReactivateTarget(null)}
      />
    </div>
  );
}
