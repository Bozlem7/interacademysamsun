import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { Modal } from "../../../components/common/Modal";

export type PaymentLogAction = "PAID" | "REVERTED";

export interface PaymentLogItem {
  id: string;
  studentId: string;
  studentName: string;
  period: string | null;
  actionType: PaymentLogAction;
  amount: string;
  adminName: string;
  createdAt: string;
}

interface PaymentLogPage {
  items: PaymentLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

const ACTION_LABEL: Record<PaymentLogAction, string> = { PAID: "Ödendi", REVERTED: "Geri Alındı" };
const HISTORY_PAGE_SIZE = 20;

export function formatTL(amount: string | number) {
  return `${Number(amount).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL`;
}

/** DD.MM.YYYY HH:mm — `withSeconds` ile DD.MM.YYYY - HH:mm:ss. */
export function formatDateTime(iso: string, withSeconds = false) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}${withSeconds ? `:${pad(d.getSeconds())}` : ""}`;
  return withSeconds ? `${date} - ${time}` : `${date} ${time}`;
}

function ActionDot({ action }: { action: PaymentLogAction }) {
  return (
    <span
      aria-hidden
      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${action === "PAID" ? "bg-emerald-500" : "bg-orange-500"}`}
    />
  );
}

function ActionBadge({ action }: { action: PaymentLogAction }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
        action === "PAID"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
      }`}
    >
      {ACTION_LABEL[action]}
    </span>
  );
}

/**
 * "Son Ödeme Hareketleri" — Ödeme & WhatsApp sekmesinin sağ üstündeki kompakt kart. `refreshKey`
 * her "Ödendi" / "Geri Al" işleminden sonra artırılır ki liste sayfa yenilenmeden güncellensin.
 */
export function PaymentActivityWidget({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<PaymentLogItem[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    apiClient
      .get<PaymentLogPage>("/students/payment-logs", { params: { limit: 5 } })
      .then((r) => setItems(r.data.items))
      .catch(() => setItems([]));
  }, [refreshKey]);

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 sm:ml-auto sm:w-[380px] dark:border-slate-800 dark:bg-surface">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-bold text-slate-400">SON ÖDEME HAREKETLERİ</div>
        <button
          onClick={() => setHistoryOpen(true)}
          className="rounded-md px-2 py-1 text-[11px] font-bold text-brand hover:bg-slate-100 dark:text-[#93c5fd] dark:hover:bg-surface2"
        >
          Tümünü Gör / Detay
        </button>
      </div>
      {items === null && <div className="py-2 text-xs text-slate-400">Yükleniyor…</div>}
      {items?.length === 0 && <div className="py-2 text-xs text-slate-400">Henüz ödeme hareketi yok.</div>}
      <ul className="space-y-1.5">
        {items?.map((log) => (
          <li key={log.id} className="flex gap-2 text-xs leading-snug">
            <ActionDot action={log.actionType} />
            <div className="min-w-0">
              <span className="font-bold text-slate-700 dark:text-slate-200">{log.studentName}</span>
              <span className="text-slate-500 dark:text-slate-400">
                {" "}
                – {formatTL(log.amount)}{" "}
                <span className={log.actionType === "PAID" ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400"}>
                  {ACTION_LABEL[log.actionType]}
                </span>
              </span>
              <div className="text-[11px] text-slate-400">
                {formatDateTime(log.createdAt)} · {log.adminName}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <PaymentHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} refreshKey={refreshKey} />
    </div>
  );
}

function PaymentHistoryModal({ open, onClose, refreshKey }: { open: boolean; onClose: () => void; refreshKey: number }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [action, setAction] = useState<"" | PaymentLogAction>("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaymentLogPage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<PaymentLogPage>("/students/payment-logs", {
        params: { page, pageSize: HISTORY_PAGE_SIZE, search: debouncedSearch || undefined, action: action || undefined },
      })
      .then((r) => !cancelled && setData(r.data))
      .catch(() => !cancelled && setData({ items: [], total: 0, page: 1, pageSize: HISTORY_PAGE_SIZE }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, page, debouncedSearch, action, refreshKey]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Modal open={open} onClose={onClose} title="Ödeme Hareketleri Geçmişi">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Öğrenci adı ile ara…"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-paper2 p-2.5 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white"
        />
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value as "" | PaymentLogAction);
            setPage(1);
          }}
          className="rounded-xl border border-slate-200 bg-paper2 p-2.5 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white"
        >
          <option value="">Tüm işlemler</option>
          <option value="PAID">Ödendi</option>
          <option value="REVERTED">Geri Alındı</option>
        </select>
      </div>

      <div className={`overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 ${loading ? "opacity-60" : ""}`}>
        {data?.items.map((log) => (
          <div key={log.id} className="border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{log.studentName}</span>
              <ActionBadge action={log.actionType} />
              <span className="ml-auto text-sm font-extrabold text-slate-700 dark:text-slate-200">{formatTL(log.amount)}</span>
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              {formatDateTime(log.createdAt, true)} · {log.adminName}
              {log.period && ` · Dönem: ${log.period}`}
            </div>
          </div>
        ))}
        {data && data.items.length === 0 && <div className="p-5 text-sm text-slate-400">Kayıt bulunamadı.</div>}
        {!data && <div className="p-5 text-sm text-slate-400">Yükleniyor…</div>}
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
    </Modal>
  );
}
