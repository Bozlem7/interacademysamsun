import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { Modal } from "../../../components/common/Modal";

interface Summary {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
}

interface TransactionRow {
  id: string;
  type: "gelir" | "gider";
  description: string;
  amount: string;
  category: string | null;
  transactionDate: string;
  studentName: string | null;
  createdByName: string;
}

const EXPENSE_CATEGORIES = ["Kira", "Malzeme", "Fatura", "Diğer"];

function formatMoney(value: number | string) {
  return `${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

/** "02.10.2026 - 14:35" — audit panelinde/detayında tam zaman damgası için; liste satırlarında yalnızca tarih kullanılır. */
function formatDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("tr-TR");
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return `${date} - ${time}`;
}

function ExpenseFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDescription("");
      setAmount("");
      setCategory(EXPENSE_CATEGORIES[0]);
      setError(null);
    }
  }, [open]);

  async function save() {
    setError(null);
    const numericAmount = Number(amount);
    if (!description.trim() || !(numericAmount > 0)) {
      setError("Açıklama ve 0'dan büyük bir tutar girmelisiniz.");
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/expenses", { description: description.trim(), amount: numericAmount, category });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error ?? "Gider kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Gider Ekle">
      <div className="space-y-3.5">
        {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-500">Açıklama</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white"
            placeholder="Ör. Eylül ayı kira ödemesi"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-500">Tutar (TL)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-500">Kategori</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-xl bg-brand py-3 text-sm font-extrabold text-white disabled:cursor-default disabled:opacity-60"
        >
          {saving ? "Kaydediliyor…" : "Gideri Kaydet"}
        </button>
      </div>
    </Modal>
  );
}

function IncomeFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDescription("");
      setAmount("");
      setError(null);
    }
  }, [open]);

  async function save() {
    setError(null);
    const numericAmount = Number(amount);
    if (!description.trim() || !(numericAmount > 0)) {
      setError("Açıklama ve 0'dan büyük bir tutar girmelisiniz.");
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/incomes", { description: description.trim(), amount: numericAmount });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error ?? "Gelir kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Gelir Ekle">
      <div className="space-y-3.5">
        {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-500">Açıklama</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white"
            placeholder="Ör. Sponsorluk geliri"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-500">Tutar (TL)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white"
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-xl bg-brand py-3 text-sm font-extrabold text-white disabled:cursor-default disabled:opacity-60"
        >
          {saving ? "Kaydediliyor…" : "Geliri Kaydet"}
        </button>
      </div>
    </Modal>
  );
}

function TransactionDetailModal({ transaction, onClose }: { transaction: TransactionRow | null; onClose: () => void }) {
  return (
    <Modal open={!!transaction} onClose={onClose} title="İşlem Detayı">
      {transaction && (
        <div className="space-y-3">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
              transaction.type === "gelir"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            }`}
          >
            {transaction.type === "gelir" ? "GELİR" : "GİDER"}
          </span>
          <div className="text-base font-extrabold text-slate-900 dark:text-white">{transaction.description}</div>
          <div className={`text-xl font-extrabold ${transaction.type === "gelir" ? "text-emerald-600" : "text-red-600"}`}>
            {transaction.type === "gelir" ? "+" : "-"}
            {formatMoney(transaction.amount)}
          </div>
          <dl className="space-y-1.5 text-sm">
            {transaction.studentName && (
              <div className="flex justify-between gap-3">
                <dt className="font-semibold text-slate-400">Öğrenci</dt>
                <dd className="text-right font-bold text-slate-700 dark:text-slate-200">{transaction.studentName}</dd>
              </div>
            )}
            {transaction.category && (
              <div className="flex justify-between gap-3">
                <dt className="font-semibold text-slate-400">Kategori</dt>
                <dd className="text-right font-bold text-slate-700 dark:text-slate-200">{transaction.category}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-slate-400">Tarih / Saat</dt>
              <dd className="text-right font-bold text-slate-700 dark:text-slate-200">{formatDateTime(transaction.transactionDate)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-slate-400">Ekleyen / Onaylayan</dt>
              <dd className="text-right font-bold text-slate-700 dark:text-slate-200">{transaction.createdByName}</dd>
            </div>
          </dl>
        </div>
      )}
    </Modal>
  );
}

export function AdminFinanceTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [typeFilter, setTypeFilter] = useState<"" | "gelir" | "gider">("");
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [incomeModalOpen, setIncomeModalOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<TransactionRow | null>(null);
  const [recentActivity, setRecentActivity] = useState<TransactionRow[]>([]);

  function loadSummary() {
    apiClient.get("/finance/summary").then((r) => setSummary(r.data));
  }

  function loadTransactions() {
    apiClient.get("/finance/transactions", { params: { type: typeFilter || undefined, pageSize: 50 } }).then((r) => setTransactions(r.data.items));
  }

  /** Filtreden bağımsız, her zaman en güncel işlemleri gösteren audit paneli/drawer içeriği. */
  function loadRecentActivity() {
    apiClient.get("/finance/transactions", { params: { pageSize: 8 } }).then((r) => setRecentActivity(r.data.items));
  }

  function reload() {
    loadSummary();
    loadTransactions();
    loadRecentActivity();
  }

  useEffect(reload, [typeFilter]);

  const netPositive = (summary?.netBalance ?? 0) >= 0;

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
          <div className={`text-base font-extrabold ${netPositive ? "text-emerald-600" : "text-red-600"}`}>
            {summary ? formatMoney(summary.netBalance) : "—"}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setIncomeModalOpen(true)}
            className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
          >
            + Gelir Ekle
          </button>
          <button onClick={() => setExpenseModalOpen(true)} className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700">
            + Gider Ekle
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {([
          ["", "Tümü"],
          ["gelir", "Gelirler"],
          ["gider", "Giderler"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTypeFilter(value)}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold ${
              typeFilter === value ? "bg-brand text-white" : "bg-slate-100 text-slate-600 dark:bg-surface2 dark:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-paper2 dark:border-slate-800 dark:bg-surface">
          {transactions.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3.5 border-b border-slate-100 px-5 py-3.5 last:border-0 dark:border-slate-800">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                  t.type === "gelir"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}
              >
                {t.type === "gelir" ? "GELİR" : "GİDER"}
              </span>
              <div className="min-w-[200px] flex-1">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {t.description}
                  {t.studentName && <span className="font-normal text-slate-400"> · {t.studentName}</span>}
                </div>
                <div className="text-xs text-slate-400">
                  {new Date(t.transactionDate).toLocaleDateString("tr-TR")}
                  {t.category && ` · ${t.category}`} · Kaydeden: {t.createdByName}
                </div>
              </div>
              <div className={`text-sm font-extrabold ${t.type === "gelir" ? "text-emerald-600" : "text-red-600"}`}>
                {t.type === "gelir" ? "+" : "-"}
                {formatMoney(t.amount)}
              </div>
              {/* Masaüstünde bu bilgiler zaten sağdaki "Son İşlemler & Detaylar" panelinde sürekli görünür —
                  dar ekranda panel gizlendiği için tam audit detayına (saat + onaylayan) buradan erişilir. */}
              <button
                onClick={() => setDetailTarget(t)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-surface2 dark:text-slate-200 dark:hover:bg-surface lg:hidden"
              >
                Detay
              </button>
            </div>
          ))}
          {transactions.length === 0 && <div className="p-6 text-sm text-slate-400">Henüz bir işlem kaydı bulunmuyor.</div>}
        </div>

        <aside className="hidden w-80 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-paper2 dark:border-slate-800 dark:bg-surface lg:sticky lg:top-7 lg:block lg:max-h-[calc(100vh-3.5rem)] lg:overflow-y-auto">
          <div className="border-b border-slate-100 px-5 py-3.5 text-sm font-extrabold text-slate-800 dark:border-slate-800 dark:text-slate-100">
            Son İşlemler & Detaylar
          </div>
          {recentActivity.map((t) => (
            <button
              key={t.id}
              onClick={() => setDetailTarget(t)}
              className="block w-full border-b border-slate-100 px-5 py-3 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-surface2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{t.description}</div>
                <div className={`shrink-0 text-xs font-extrabold ${t.type === "gelir" ? "text-emerald-600" : "text-red-600"}`}>
                  {t.type === "gelir" ? "+" : "-"}
                  {formatMoney(t.amount)}
                </div>
              </div>
              <div className="text-[11px] text-slate-400">{formatDateTime(t.transactionDate)}</div>
              <div className="text-[11px] font-semibold text-slate-400">Ekleyen / Onaylayan: {t.createdByName}</div>
            </button>
          ))}
          {recentActivity.length === 0 && <div className="p-5 text-xs text-slate-400">Henüz bir işlem kaydı bulunmuyor.</div>}
        </aside>
      </div>

      <ExpenseFormModal open={expenseModalOpen} onClose={() => setExpenseModalOpen(false)} onSaved={reload} />
      <IncomeFormModal open={incomeModalOpen} onClose={() => setIncomeModalOpen(false)} onSaved={reload} />
      <TransactionDetailModal transaction={detailTarget} onClose={() => setDetailTarget(null)} />
    </div>
  );
}
