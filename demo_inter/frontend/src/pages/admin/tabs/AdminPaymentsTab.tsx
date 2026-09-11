import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { ConfirmDialog } from "../../../components/common/Modal";

interface PaymentRow {
  id: string;
  periodMonth: number;
  periodYear: number;
  dueDay: number;
  dueDate: string;
  amount: string;
  status: "odenmedi" | "odendi";
  student: { id: string; fullName: string; tcNoMasked: string; motherPhone?: string; fatherPhone?: string };
}

function isOverdue(p: PaymentRow) {
  return p.status === "odenmedi" && new Date(p.dueDate) < new Date();
}

export function AdminPaymentsTab() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<PaymentRow | null>(null);
  const [search, setSearch] = useState("");
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [remindResult, setRemindResult] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);

  function load() {
    apiClient.get("/payments").then((r) => setPayments(r.data));
  }
  useEffect(load, []);

  async function markPaid() {
    if (!confirmTarget) return;
    await apiClient.patch(`/payments/${confirmTarget.id}/status`, { confirm: true });
    setConfirmTarget(null);
    load();
  }

  async function sendReminder(p: PaymentRow) {
    setRemindingId(p.id);
    setRemindResult(null);
    try {
      const res = await apiClient.post(`/payments/${p.id}/remind`);
      setRemindResult({ id: p.id, ok: true, text: res.data.message ?? "Hatırlatma mesajı gönderildi." });
    } catch (e: any) {
      setRemindResult({ id: p.id, ok: false, text: e.response?.data?.error ?? "Hatırlatma gönderilemedi." });
    } finally {
      setRemindingId(null);
    }
  }

  /** Öğrencinin tüm dönemlerini kapsayan ödeme ekstresi PDF'ini indirir/yeni sekmede açar. */
  async function downloadReport(studentId: string) {
    setDownloadingReportId(studentId);
    try {
      const res = await apiClient.get(`/students/${studentId}/payment-report-pdf`, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      alert("Ödeme raporu oluşturulamadı, lütfen tekrar deneyin.");
    } finally {
      setDownloadingReportId(null);
    }
  }

  const unpaidCount = payments.filter((p) => p.status === "odenmedi").length;
  const overdueCount = payments.filter(isOverdue).length;

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return payments;
    return payments.filter(
      (p) => p.student.fullName.toLocaleLowerCase("tr-TR").includes(q) || p.student.tcNoMasked.toLowerCase().includes(q)
    );
  }, [payments, search]);

  return (
    <div className="p-7">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 dark:border-slate-800 dark:bg-surface">
          <div className="text-xs font-bold text-slate-400">BEKLEYEN ÖDEME</div>
          <div className="text-base font-extrabold text-amber-600">{unpaidCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 dark:border-slate-800 dark:bg-surface">
          <div className="text-xs font-bold text-slate-400">GECİKMİŞ ÖDEME</div>
          <div className="text-base font-extrabold text-red-600">{overdueCount}</div>
        </div>
        <div className="ml-auto text-xs font-semibold text-slate-500 dark:text-slate-400">Sabit aylık aidat: 3.500 TL</div>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Ad, soyad veya TCKN ile ara…"
        className="mb-4 w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white"
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-paper2 dark:border-slate-800 dark:bg-surface">
        {filteredPayments.map((p) => {
          const overdue = isOverdue(p);
          const phone = p.student.motherPhone || p.student.fatherPhone;
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-3.5 border-b border-slate-100 px-5 py-3.5 last:border-0 dark:border-slate-800">
              <div className="min-w-[160px] flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{p.student.fullName}</div>
                  {overdue && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Gecikmiş Ödeme
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  {p.periodMonth}/{p.periodYear} (vade: {p.dueDay}) · {p.amount} TL
                </div>
              </div>
              <button
                disabled={p.status === "odendi"}
                onClick={() => setConfirmTarget(p)}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold ${
                  p.status === "odendi"
                    ? "cursor-default bg-green-100 text-green-700"
                    : overdue
                      ? "bg-red-100 text-red-700 hover:bg-red-200"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                }`}
              >
                {p.status === "odendi" ? "Ödendi" : "Ödenmedi"}
              </button>
              {phone && p.status === "odenmedi" && (
                <button
                  onClick={() => sendReminder(p)}
                  disabled={remindingId === p.id}
                  className="rounded-lg bg-green-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:cursor-default disabled:opacity-60"
                >
                  {remindingId === p.id ? "Gönderiliyor…" : "WhatsApp İle Hatırlat"}
                </button>
              )}
              <button
                onClick={() => downloadReport(p.student.id)}
                disabled={downloadingReportId === p.student.id}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:opacity-60 dark:border-slate-700 dark:bg-surface2 dark:text-slate-200 dark:hover:bg-surface"
              >
                {downloadingReportId === p.student.id ? "Hazırlanıyor…" : "📄 Ödeme Raporu (PDF)"}
              </button>
              {remindResult?.id === p.id && (
                <div className={`w-full text-xs font-semibold ${remindResult.ok ? "text-green-600" : "text-red-600"}`}>
                  {remindResult.text}
                </div>
              )}
            </div>
          );
        })}
        {payments.length > 0 && filteredPayments.length === 0 && (
          <div className="p-6 text-sm text-slate-400">Aramanızla eşleşen ödeme kaydı bulunamadı.</div>
        )}
        {payments.length === 0 && <div className="p-6 text-sm text-slate-400">Bu döneme ait ödeme kaydı bulunamadı.</div>}
      </div>

      <ConfirmDialog
        open={!!confirmTarget}
        title="Ödemeyi onayla"
        body={`${confirmTarget?.student.fullName} için ${confirmTarget?.periodMonth}/${confirmTarget?.periodYear} dönemi "Ödendi" olarak işaretlenecek. Bu işlem geri alınamaz — dönem sona erene kadar tekrar "Ödenmedi" durumuna düşmez.`}
        confirmLabel="Evet, Ödendi Olarak İşaretle"
        onConfirm={markPaid}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
