import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { ConfirmDialog, Modal } from "../../../components/common/Modal";

interface Summary {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
}

type TransactionType = "gelir" | "gider";

interface TransactionView {
  id: string;
  type: TransactionType;
  description: string;
  amount: string;
  category: string | null;
  transactionDate: string;
  paymentId: string | null;
  studentName: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string | null;
  previousAmount: string | null;
  isDeleted: boolean;
  deletedByName: string | null;
  deletedAt: string | null;
}

type AuditAction = "eklendi" | "guncellendi" | "silindi";

interface AuditEvent {
  id: string;
  action: AuditAction;
  at: string;
  actorName: string;
  transaction: TransactionView;
}

const EXPENSE_CATEGORIES = ["Kira", "Malzeme", "Maaş", "Fatura", "Diğer"];
const PAGE_SIZE = 25;

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white";

function formatMoney(value: number | string) {
  return `${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

/** "02.10.2026 - 14:35" */
function formatDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Bugün seçiliyse tarih gönderilmez — sunucu kaydı gerçek saatiyle (now()) tutar. */
function dateInputToPayload(value: string) {
  return value === toDateInput(new Date()) ? undefined : value;
}

function TypeBadge({ type }: { type: TransactionType }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
        type === "gelir"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      }`}
    >
      {type === "gelir" ? "GELİR" : "GİDER"}
    </span>
  );
}

/** Aidat tahsilatının silinmesi yalnızca "Geri Al" ile olur — akışta bu yüzden ayrı etiketlenir. */
function auditLabel(event: AuditEvent) {
  if (event.action === "silindi" && event.transaction.paymentId) return { text: "Geri Alındı", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" };
  if (event.action === "silindi") return { text: "Silindi", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
  if (event.action === "guncellendi") return { text: "Güncellendi", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" };
  return { text: "Eklendi", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
}

type FormMode = { kind: "create"; type: TransactionType } | { kind: "edit"; transaction: TransactionView };

function TransactionFormModal({ mode, onClose, onSaved }: { mode: FormMode | null; onClose: () => void; onSaved: () => void }) {
  const type = mode?.kind === "edit" ? mode.transaction.type : mode?.type;
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [date, setDate] = useState(toDateInput(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    setError(null);
    if (mode.kind === "edit") {
      const t = mode.transaction;
      setDescription(t.description);
      setAmount(String(Number(t.amount)));
      setCategory(t.category ?? EXPENSE_CATEGORIES[0]);
      setDate(toDateInput(new Date(t.transactionDate)));
    } else {
      setDescription("");
      setAmount("");
      setCategory(EXPENSE_CATEGORIES[0]);
      setDate(toDateInput(new Date()));
    }
  }, [mode]);

  async function save() {
    if (!mode) return;
    setError(null);
    const numericAmount = Number(amount);
    if (!description.trim() || !(numericAmount > 0) || !date) {
      setError("Açıklama, tarih ve 0'dan büyük bir tutar girmelisiniz.");
      return;
    }
    setSaving(true);
    try {
      if (mode.kind === "edit") {
        await apiClient.put(`/finance/transactions/${mode.transaction.id}`, {
          description: description.trim(),
          amount: numericAmount,
          ...(type === "gider" ? { category } : {}),
          transactionDate: date,
        });
      } else if (mode.type === "gider") {
        await apiClient.post("/expenses", { description: description.trim(), amount: numericAmount, category, expenseDate: dateInputToPayload(date) });
      } else {
        await apiClient.post("/incomes", { description: description.trim(), amount: numericAmount, incomeDate: dateInputToPayload(date) });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? "Kayıt kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  const title = mode?.kind === "edit" ? (type === "gelir" ? "Geliri Düzenle" : "Gideri Düzenle") : type === "gelir" ? "Gelir Ekle" : "Gider Ekle";

  return (
    <Modal open={!!mode} onClose={onClose} title={title}>
      <div className="space-y-3.5">
        {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-500">Açıklama</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
            placeholder={type === "gelir" ? "Ör. Sponsorluk geliri" : "Ör. Ekim ayı kira ödemesi"}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-500">Tutar (TL)</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-500">Tarih</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
        </div>
        {type === "gider" && (
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-500">Kategori</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {[...new Set([...EXPENSE_CATEGORIES, category])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-xl bg-brand py-3 text-sm font-extrabold text-white disabled:cursor-default disabled:opacity-60"
        >
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </Modal>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 font-semibold text-slate-400">{label}</dt>
      <dd className="text-right font-bold text-slate-700 dark:text-slate-200">{children}</dd>
    </div>
  );
}

function TransactionDetailModal({ transaction, onClose }: { transaction: TransactionView | null; onClose: () => void }) {
  const t = transaction;
  const amountChanged = t?.previousAmount != null && Number(t.previousAmount) !== Number(t.amount);
  return (
    <Modal open={!!t} onClose={onClose} title="İşlem Detayı">
      {t && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TypeBadge type={t.type} />
            {t.isDeleted && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-extrabold text-slate-600 dark:bg-surface2 dark:text-slate-300">
                {t.paymentId ? "GERİ ALINDI" : "SİLİNDİ"}
              </span>
            )}
          </div>
          <div className={`text-base font-extrabold text-slate-900 dark:text-white ${t.isDeleted ? "line-through opacity-60" : ""}`}>{t.description}</div>
          <div className={`text-xl font-extrabold ${t.type === "gelir" ? "text-emerald-600" : "text-red-600"} ${t.isDeleted ? "line-through opacity-60" : ""}`}>
            {t.type === "gelir" ? "+" : "-"}
            {formatMoney(t.amount)}
          </div>
          <dl className="space-y-1.5 text-sm">
            {t.studentName && <DetailRow label="Öğrenci">{t.studentName}</DetailRow>}
            {t.category && <DetailRow label="Kategori">{t.category}</DetailRow>}
            <DetailRow label="İşlem Tarihi">{new Date(t.transactionDate).toLocaleDateString("tr-TR")}</DetailRow>
          </dl>

          <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600 dark:bg-surface2 dark:text-slate-300">
            <div>
              <span className="font-bold">{t.paymentId ? "Onaylayan" : "Ekleyen"}:</span> {t.createdByName ?? "bilinmiyor"} · {formatDateTime(t.createdAt)}
            </div>
            {t.updatedAt && (
              <div>
                <span className="font-bold">Düzenleyen:</span> {t.updatedByName ?? "bilinmiyor"} · {formatDateTime(t.updatedAt)}
                {amountChanged && (
                  <span>
                    {" "}
                    (Eski: {formatMoney(t.previousAmount!)}, Yeni: {formatMoney(t.amount)})
                  </span>
                )}
              </div>
            )}
            {t.deletedAt && (
              <div className="font-semibold text-red-600 dark:text-red-400">
                <span className="font-bold">{t.paymentId ? "Geri Alan" : "Silen"}:</span> {t.deletedByName ?? "bilinmiyor"} · {formatDateTime(t.deletedAt)}
              </div>
            )}
          </div>

          {t.paymentId && (
            <div className="text-xs text-slate-400">
              Bu kayıt öğrenci aidat tahsilatından otomatik oluşturuldu. Düzeltme için Ödeme & WhatsApp sekmesindeki "Geri Al" kullanılır.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function AuditFeed({ events, onSelect }: { events: AuditEvent[]; onSelect: (t: TransactionView) => void }) {
  if (events.length === 0) return <div className="p-5 text-xs text-slate-400">Henüz bir işlem hareketi yok.</div>;
  return (
    <>
      {events.map((e) => {
        const label = auditLabel(e);
        return (
          <button
            key={e.id}
            onClick={() => onSelect(e.transaction)}
            className="block w-full border-b border-slate-100 px-5 py-3 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-surface2"
          >
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${label.cls}`}>{label.text}</span>
              <span className={`shrink-0 text-xs font-extrabold ${e.transaction.type === "gelir" ? "text-emerald-600" : "text-red-600"}`}>
                {e.transaction.type === "gelir" ? "+" : "-"}
                {formatMoney(e.transaction.amount)}
              </span>
            </div>
            <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
              {e.transaction.description}
              {e.transaction.studentName && <span className="font-normal text-slate-400"> · {e.transaction.studentName}</span>}
            </div>
            <div className="text-[11px] text-slate-400">{formatDateTime(e.at)}</div>
            <div className="text-[11px] font-semibold text-slate-400">İşlemi yapan: {e.actorName}</div>
          </button>
        );
      })}
    </>
  );
}

export function AdminFinanceTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [transactions, setTransactions] = useState<TransactionView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<"" | TransactionType>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [detailTarget, setDetailTarget] = useState<TransactionView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TransactionView | null>(null);
  const [mobileFeedOpen, setMobileFeedOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    apiClient
      .get("/finance/transactions", { params: { type: typeFilter || undefined, search: debouncedSearch || undefined, page, pageSize: PAGE_SIZE } })
      .then((r) => {
        setTransactions(r.data.items);
        setTotal(r.data.total);
      });
  }, [typeFilter, debouncedSearch, page, refreshKey]);

  useEffect(() => {
    apiClient.get("/finance/summary").then((r) => setSummary(r.data));
    apiClient.get("/finance/audit-logs", { params: { limit: 20 } }).then((r) => setAuditEvents(r.data));
  }, [refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setActionError(null);
    try {
      await apiClient.delete(`/finance/transactions/${deleteTarget.id}`);
      refresh();
    } catch (e: any) {
      setActionError(e.response?.data?.error?.message ?? "Kayıt silinemedi.");
    } finally {
      setDeleteTarget(null);
    }
  }

  const netPositive = (summary?.netBalance ?? 0) >= 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-7">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 dark:border-slate-800 dark:bg-surface">
          <div className="text-xs font-bold text-slate-400">TOPLAM GELİR</div>
          <div className="text-base font-extrabold text-emerald-600">{summary ? formatMoney(summary.totalIncome) : "—"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 dark:border-slate-800 dark:bg-surface">
          <div className="text-xs font-bold text-slate-400">TOPLAM GİDER</div>
          <div className="text-base font-extrabold text-red-600">{summary ? formatMoney(summary.totalExpense) : "—"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 dark:border-slate-800 dark:bg-surface">
          <div className="text-xs font-bold text-slate-400">NET KASA</div>
          <div className={`text-base font-extrabold ${netPositive ? "text-emerald-600" : "text-red-600"}`}>{summary ? formatMoney(summary.netBalance) : "—"}</div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={() => setMobileFeedOpen(true)}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-surface2 dark:text-slate-200 lg:hidden"
          >
            Son İşlemler
          </button>
          <button
            onClick={() => setFormMode({ kind: "create", type: "gelir" })}
            className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
          >
            + Gelir Ekle
          </button>
          <button
            onClick={() => setFormMode({ kind: "create", type: "gider" })}
            className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700"
          >
            + Gider Ekle
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Açıklama, kategori veya öğrenci adı ile ara…" className={`${inputClass} sm:flex-1`} />
        <div className="flex gap-2">
          {(
            [
              ["", "Tümü"],
              ["gelir", "Gelirler"],
              ["gider", "Giderler"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => {
                setTypeFilter(value);
                setPage(1);
              }}
              className={`rounded-lg px-3.5 py-2 text-xs font-bold ${
                typeFilter === value ? "bg-brand text-white" : "bg-slate-100 text-slate-600 dark:bg-surface2 dark:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-300">{actionError}</div>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-paper2 dark:border-slate-800 dark:bg-surface">
            <div className="hidden grid-cols-[90px_64px_minmax(0,1fr)_90px_120px_120px_120px] gap-3 border-b border-slate-100 px-5 py-2.5 text-[11px] font-extrabold uppercase text-slate-400 dark:border-slate-800 md:grid">
              <div>Tarih</div>
              <div>Tür</div>
              <div>Açıklama</div>
              <div>Kategori</div>
              <div className="text-right">Tutar</div>
              <div>Ekleyen</div>
              <div />
            </div>
            {transactions.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-100 px-5 py-3.5 last:border-0 dark:border-slate-800 md:grid md:grid-cols-[90px_64px_minmax(0,1fr)_90px_120px_120px_120px]"
              >
                <div className="text-xs text-slate-500 dark:text-slate-400">{new Date(t.transactionDate).toLocaleDateString("tr-TR")}</div>
                <div>
                  <TypeBadge type={t.type} />
                </div>
                <div className="w-full min-w-0 md:w-auto">
                  <div className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
                    {t.description}
                    {t.studentName && <span className="font-normal text-slate-400"> · {t.studentName}</span>}
                  </div>
                  {t.updatedAt && <div className="text-[11px] text-sky-600 dark:text-sky-400">düzenlendi</div>}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{t.category ?? (t.paymentId ? "Aidat" : "—")}</div>
                <div className={`text-sm font-extrabold md:text-right ${t.type === "gelir" ? "text-emerald-600" : "text-red-600"}`}>
                  {t.type === "gelir" ? "+" : "-"}
                  {formatMoney(t.amount)}
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{t.createdByName}</div>
                <div className="ml-auto flex gap-1.5 md:ml-0 md:justify-end">
                  {t.paymentId ? (
                    <span
                      title='Aidat tahsilatı — Ödeme & WhatsApp sekmesinden "Geri Al" ile yönetilir.'
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-400 dark:bg-surface2"
                    >
                      Aidat
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => setFormMode({ kind: "edit", transaction: t })}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-surface2 dark:text-slate-200"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => setDeleteTarget(t)}
                        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                      >
                        Sil
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setDetailTarget(t)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-surface2 dark:text-slate-200 lg:hidden"
                  >
                    Detay
                  </button>
                </div>
              </div>
            ))}
            {transactions.length === 0 && <div className="p-6 text-sm text-slate-400">Kayıt bulunamadı.</div>}
          </div>

          {total > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 hover:bg-slate-200 disabled:opacity-40 dark:bg-surface2 dark:text-slate-300"
              >
                ‹ Önceki
              </button>
              <span>
                {page} / {totalPages} · {total} kayıt
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
        </div>

        <aside className="hidden w-80 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-paper2 dark:border-slate-800 dark:bg-surface lg:sticky lg:top-7 lg:block lg:max-h-[calc(100vh-3.5rem)] lg:overflow-y-auto">
          <div className="border-b border-slate-100 px-5 py-3.5 text-sm font-extrabold text-slate-800 dark:border-slate-800 dark:text-slate-100">Son İşlemler & Detaylar</div>
          <AuditFeed events={auditEvents} onSelect={setDetailTarget} />
        </aside>
      </div>

      <Modal open={mobileFeedOpen} onClose={() => setMobileFeedOpen(false)} title="Son İşlemler & Detaylar">
        <div className="-mx-6 -mb-6">
          <AuditFeed
            events={auditEvents}
            onSelect={(t) => {
              setMobileFeedOpen(false);
              setDetailTarget(t);
            }}
          />
        </div>
      </Modal>

      <TransactionFormModal mode={formMode} onClose={() => setFormMode(null)} onSaved={refresh} />
      <TransactionDetailModal transaction={detailTarget} onClose={() => setDetailTarget(null)} />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Kaydı sil"
        body={`"${deleteTarget?.description}" (${deleteTarget ? formatMoney(deleteTarget.amount) : ""}) kasadan düşülecek. Kayıt kalıcı olarak silinmez; "Son İşlemler" akışında kimin sildiği bilgisiyle görünmeye devam eder.`}
        confirmLabel="Evet, Sil"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
