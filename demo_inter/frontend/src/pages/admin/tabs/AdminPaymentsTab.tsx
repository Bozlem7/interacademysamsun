import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/apiClient";
import { Modal } from "../../../components/common/Modal";
import { useAuthStore } from "../../../features/auth/authStore";
import { getWhatsAppNotifyPrimaryRecipient, hasWhatsAppNotifyRecipient, StudentNotifyFields } from "../../../lib/notifyRecipients";
import { useWhatsAppStore } from "../../../features/whatsapp/whatsappStore";
import { AttendanceReportModal } from "./AttendanceReportModal";
import { turkishCompare } from "../../../lib/turkishSort";
import { PaymentActivityWidget, formatDateTime, formatTL } from "./PaymentActivityWidget";

interface PaymentRow {
  id: string;
  periodMonth: number;
  periodYear: number;
  dueDay: number;
  dueDate: string;
  amount: string;
  status: "odenmedi" | "odendi";
  paidAt: string | null;
  /** Dönemi bitmiş ve ödenmemiş aylar (eskiden yeniye) — "Ödenmeyen Aylar" rozeti. */
  unpaidMonths: UnpaidMonth[];
  /** Güncel dönem dahil tüm ödenmemiş dönemler — "Ödendi" penceresindeki tahsilat listesi. */
  pendingMonths: UnpaidMonth[];
  totalDueAmount: number;
  /** Vadesi gelmemiş bir dönem zaten ödenmiş (peşin ödeme). */
  isEarlyPaid: boolean;
  student: { id: string; fullName: string; tcNoMasked: string } & StudentNotifyFields;
}

interface UnpaidMonth {
  paymentId: string;
  month: number;
  year: number;
  label: string;
  amount: number;
  dueDate: string;
}

/** `onPick` verilirse (yalnızca ödeme onay yetkisi olan yönetici) her ay rozeti tıklanabilir olur. */
function UnpaidMonthsBadge({ p, onPick, onOpenAll }: { p: PaymentRow; onPick?: (m: UnpaidMonth) => void; onOpenAll?: () => void }) {
  if (p.status === "odenmedi") {
    // Backend, dönemi BİTMİŞ ödenmemiş ayları Türkçe adıyla döndürür (Ekim ancak 15 Kasım'da girer).
    // Yalnızca güncel dönem ödenmemişse rozet çıkmaz — satırın "Ödenmedi" durumu zaten bunu gösterir.
    const months: UnpaidMonth[] = p.unpaidMonths ?? [];
    if (months.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {p.isEarlyPaid && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-extrabold text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Gelecek Dönem Ödendi
          </span>
        )}
        <span className="text-[11px] font-extrabold text-red-700 dark:text-red-400">Ödenmeyen Aylar:</span>
        {months.map((m) =>
          onPick ? (
            <button
              key={m.paymentId}
              type="button"
              onClick={() => onPick(m)}
              title={`${m.label} borcunu tahsil et`}
              className="cursor-pointer rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-700 underline decoration-dotted underline-offset-2 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
            >
              {m.label}
            </button>
          ) : (
            <span
              key={m.paymentId}
              className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-700 dark:bg-red-900/30 dark:text-red-400"
            >
              {m.label}
            </span>
          )
        )}
        {onOpenAll && (
          <button
            type="button"
            onClick={onOpenAll}
            className="cursor-pointer rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-extrabold text-white hover:opacity-90"
          >
            Geçmiş Ödeme Al
          </button>
        )}
      </div>
    );
  }
  if (p.isEarlyPaid && new Date(p.dueDate) > new Date()) {
    return (
      <span className="rounded-lg bg-green-100 px-2.5 py-1 text-[11px] font-extrabold text-green-700 dark:bg-green-900/30 dark:text-green-400">
        Gelecek Dönem Ödendi
      </span>
    );
  }
  return null;
}

function isOverdue(p: PaymentRow) {
  return p.status === "odenmedi" && new Date(p.dueDate) < new Date();
}

export function AdminPaymentsTab() {
  const username = useAuthStore((s) => s.username);
  const canConfirmPayment = username?.trim().toLowerCase() === "muhammet";
  useEffect(() => {
    console.log("Giriş Yapan:", username, "Muhammet mi?:", canConfirmPayment);
  }, [username, canConfirmPayment]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<PaymentRow | null>(null);
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>({});
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [histTarget, setHistTarget] = useState<{ studentId: string; studentName: string; months: UnpaidMonth[] } | null>(null);
  const [histSelected, setHistSelected] = useState<Set<string>>(new Set());
  const [histAmounts, setHistAmounts] = useState<Record<string, string>>({});
  const [histNotes, setHistNotes] = useState<Record<string, string>>({});
  const [histError, setHistError] = useState<string | null>(null);
  const [histSaving, setHistSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [remindResult, setRemindResult] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);
  const [attendanceReportTarget, setAttendanceReportTarget] = useState<{ id: string; name: string } | null>(null);
  const [revertTarget, setRevertTarget] = useState<PaymentRow | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);
  // Her "Ödendi" / "Geri Al" işleminden sonra artırılır — Son Ödeme Hareketleri widget'ını tazeler.
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  function load() {
    apiClient.get("/payments").then((r) => setPayments(r.data));
  }
  useEffect(load, []);

  function openRevert(p: PaymentRow) {
    if (!canConfirmPayment) return;
    setRevertError(null);
    setRevertTarget(p);
  }

  async function revertPaid() {
    if (!revertTarget || !canConfirmPayment || reverting) return;
    setReverting(true);
    try {
      await apiClient.post(`/students/${revertTarget.student.id}/payment/revert`, { paymentId: revertTarget.id, confirm: true });
      setRevertTarget(null);
      load();
      setActivityRefreshKey((k) => k + 1);
    } catch (e: any) {
      setRevertError(e.response?.data?.error?.message ?? "Ödeme geri alınamadı.");
    } finally {
      setReverting(false);
    }
  }

  function openConfirm(p: PaymentRow) {
    if (!canConfirmPayment) return;
    setMarkPaidError(null);
    // Varsayılan: tüm birikmiş borç seçili (toplam bakiyeyi kapat); yönetici istediği ayı çıkarabilir.
    const months = p.pendingMonths?.length ? p.pendingMonths : [];
    const ids = months.map((m) => m.paymentId);
    setSelectedIds(new Set(ids.includes(p.id) ? ids : [...ids, p.id]));
    // Her ayın tutarı varsayılan (nominal) değerle dolu gelir; yönetici ay bazında düzeltebilir.
    const amounts: Record<string, string> = { [p.id]: String(Number(p.amount)) };
    for (const m of months) amounts[m.paymentId] = String(m.amount);
    setAmountInputs(amounts);
    setConfirmTarget(p);
  }

  // "Geçmiş Ödeme Al": öğrencinin bitmiş ödenmemiş aylarını seçip her biri için ayrı tutarla tahsil eden
  // pencere. Yalnızca "muhammet" (canConfirmPayment). Rozetteki bir aya tıklanırsa o ay önceden seçili gelir.
  function openHistorical(p: PaymentRow, preselect?: UnpaidMonth) {
    if (!canConfirmPayment || !p.unpaidMonths?.length) return;
    setHistError(null);
    setHistSelected(new Set(preselect ? [preselect.paymentId] : []));
    setHistAmounts(Object.fromEntries(p.unpaidMonths.map((m) => [m.paymentId, String(m.amount)])));
    setHistNotes({});
    setHistTarget({ studentId: p.student.id, studentName: p.student.fullName, months: p.unpaidMonths });
  }

  const histSelectedMonths = histTarget ? histTarget.months.filter((m) => histSelected.has(m.paymentId)) : [];
  const histTotal = histSelectedMonths.reduce((s, m) => s + (Number(histAmounts[m.paymentId]) || 0), 0);
  const histOverdueBalance = histTarget ? histTarget.months.reduce((s, m) => s + m.amount, 0) : 0;

  async function submitHistorical() {
    if (!histTarget || !canConfirmPayment || histSaving) return;
    if (histSelectedMonths.length === 0) {
      setHistError("En az bir ay seçmelisiniz.");
      return;
    }
    const bad = histSelectedMonths.find((m) => !(Number(histAmounts[m.paymentId]) > 0));
    if (bad) {
      setHistError(`${bad.label} için ödenen tutar 0'dan büyük olmalıdır.`);
      return;
    }
    setHistSaving(true);
    try {
      await apiClient.post(`/students/${histTarget.studentId}/settle-historical-payments`, {
        items: histSelectedMonths.map((m) => {
          const note = (histNotes[m.paymentId] ?? "").trim();
          return { paymentId: m.paymentId, amount: Number(histAmounts[m.paymentId]), ...(note ? { note } : {}) };
        }),
        confirm: true,
      });
      setHistTarget(null);
      load(); // liste yenilenir: tahsil edilen aylar "Ödenmeyen Aylar"dan düşer
      setActivityRefreshKey((k) => k + 1);
    } catch (e: any) {
      setHistError(e.response?.data?.error?.message ?? "Ödeme kaydedilemedi.");
    } finally {
      setHistSaving(false);
    }
  }

  function toggleHist(id: string) {
    setHistSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Modalda listelenecek dönemler: öğrencinin tüm ödenmemiş ayları (yoksa yalnızca tıklanan satır).
  const modalMonths: UnpaidMonth[] = confirmTarget
    ? confirmTarget.pendingMonths?.length
      ? confirmTarget.pendingMonths
      : [{ paymentId: confirmTarget.id, month: confirmTarget.periodMonth, year: confirmTarget.periodYear, label: `${confirmTarget.periodMonth}/${confirmTarget.periodYear}`, amount: Number(confirmTarget.amount), dueDate: confirmTarget.dueDate }]
    : [];
  const selectedMonths = modalMonths.filter((m) => selectedIds.has(m.paymentId));
  const amountOf = (id: string) => Number(amountInputs[id]);
  const selectedTotal = selectedMonths.reduce((s, m) => s + (amountOf(m.paymentId) || 0), 0);

  async function markPaid() {
    if (!confirmTarget || !canConfirmPayment) return;
    if (selectedMonths.length === 0) {
      setMarkPaidError("En az bir dönem seçmelisiniz.");
      return;
    }
    const bad = selectedMonths.find((m) => !(amountOf(m.paymentId) > 0));
    if (bad) {
      setMarkPaidError(`${bad.label} için ödeme tutarı 0'dan büyük olmalıdır.`);
      return;
    }
    try {
      await apiClient.post("/payments/settle", {
        items: selectedMonths.map((m) => ({ paymentId: m.paymentId, amount: amountOf(m.paymentId) })),
        confirm: true,
      });
      setConfirmTarget(null);
      load();
      setActivityRefreshKey((k) => k + 1);
    } catch (e: any) {
      setMarkPaidError(e.response?.data?.error?.message ?? "Ödeme işaretlenemedi.");
    }
  }

  const whatsappStatus = useWhatsAppStore((s) => s.status);

  async function sendReminder(p: PaymentRow) {
    if (whatsappStatus !== "CONNECTED") {
      setRemindResult({
        id: p.id,
        ok: false,
        text: "WhatsApp bağlantınız aktif veya stabil değil. Lütfen bağlantınızı kontrol edip tekrar deneyin.",
      });
      return;
    }
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

  // Veritabanında her dönem ayrı kayıt olarak durur; ekranda öğrenci başına TEK satır gösterilir:
  // ödenmemiş dönemi olan öğrencide en güncel ödenmemiş dönem, yoksa en güncel dönem. Diğer
  // ödenmemiş aylar satırın ortasındaki rozette (UnpaidMonthsBadge) listelenir.
  const studentRows = useMemo(() => {
    const byStudent = new Map<string, PaymentRow>();
    const rank = (p: PaymentRow) => p.periodYear * 12 + p.periodMonth;
    for (const p of payments) {
      const cur = byStudent.get(p.student.id);
      if (!cur) {
        byStudent.set(p.student.id, p);
        continue;
      }
      const better =
        p.status !== cur.status ? p.status === "odenmedi" : rank(p) > rank(cur);
      if (better) byStudent.set(p.student.id, p);
    }
    return [...byStudent.values()];
  }, [payments]);

  const unpaidCount = studentRows.filter((p) => p.status === "odenmedi").length;
  const overdueCount = studentRows.filter(isOverdue).length;

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    const filtered = q
      ? studentRows.filter(
          (p) => p.student.fullName.toLocaleLowerCase("tr-TR").includes(q) || p.student.tcNoMasked.toLowerCase().includes(q)
        )
      : studentRows;
    // Backend'in ORDER BY'ı Türkçe collation garantili değil — kesin doğru alfabetik sıra
    // burada garanti edilir. Dönem/vade sırasını değil, öğrenci adını esas alır.
    return [...filtered].sort((a, b) => turkishCompare(a.student.fullName, b.student.fullName));
  }, [studentRows, search]);

  return (
    <div className="p-7">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 dark:border-slate-800 dark:bg-surface">
          <div className="text-xs font-bold text-slate-400">TOPLAM KAYIT</div>
          <div className="text-base font-extrabold text-slate-700 dark:text-slate-200">{filteredPayments.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 dark:border-slate-800 dark:bg-surface">
          <div className="text-xs font-bold text-slate-400">BEKLEYEN ÖDEME</div>
          <div className="text-base font-extrabold text-amber-600">{unpaidCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-paper2 px-4 py-3.5 dark:border-slate-800 dark:bg-surface">
          <div className="text-xs font-bold text-slate-400">GECİKMİŞ ÖDEME</div>
          <div className="text-base font-extrabold text-red-600">{overdueCount}</div>
        </div>
        <PaymentActivityWidget refreshKey={activityRefreshKey} />
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Ad, soyad veya TCKN ile ara…"
        className="mb-4 w-full rounded-xl border border-slate-200 bg-paper2 p-3 text-sm text-slate-900 outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white"
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-paper2 dark:border-slate-800 dark:bg-surface">
        {filteredPayments.map((p, index) => {
          const overdue = isOverdue(p);
          const canRemind = hasWhatsAppNotifyRecipient(p.student);
          const primaryRecipient = getWhatsAppNotifyPrimaryRecipient(p.student);
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-3.5 border-b border-slate-100 px-5 py-3.5 last:border-0 dark:border-slate-800">
              <div className="min-w-[160px] flex-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-extrabold text-slate-500 dark:bg-surface2 dark:text-slate-400">
                    {index + 1}
                  </span>
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
              {primaryRecipient && (
                <div className="flex items-center self-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Veli ({primaryRecipient.role}): {primaryRecipient.name}
                </div>
              )}
              <div className="flex min-w-[120px] flex-1 items-center self-center">
                <UnpaidMonthsBadge p={p} onPick={canConfirmPayment ? (m) => openHistorical(p, m) : undefined} onOpenAll={canConfirmPayment ? () => openHistorical(p) : undefined} />
              </div>
              {canConfirmPayment ? (
                <button
                  disabled={p.status === "odendi"}
                  onClick={() => openConfirm(p)}
                  className={`rounded-lg px-3.5 py-2 text-xs font-bold pointer-events-auto ${
                    p.status === "odendi"
                      ? "cursor-default bg-green-100 text-green-700"
                      : overdue
                        ? "cursor-pointer bg-red-100 text-red-700 hover:bg-red-200"
                        : "cursor-pointer bg-amber-100 text-amber-700 hover:bg-amber-200"
                  }`}
                >
                  {p.status === "odendi" ? "Ödendi" : "Ödenmedi"}
                </button>
              ) : (
                <span
                  title="Ödemeyi onaylama yetkiniz bulunmuyor."
                  className={`pointer-events-none select-none rounded-lg px-3.5 py-2 text-xs font-bold cursor-default ${
                    p.status === "odendi" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {p.status === "odendi" ? "Ödendi" : "Ödenmedi"}
                </span>
              )}
              {canConfirmPayment && p.status === "odendi" && (
                <button
                  onClick={() => openRevert(p)}
                  title="Ödemeyi geri al"
                  className="flex items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20"
                >
                  <span aria-hidden>↶</span> Geri Al
                </button>
              )}
              {canRemind && p.status === "odenmedi" && (
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
              <button
                onClick={() => setAttendanceReportTarget({ id: p.student.id, name: p.student.fullName })}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-surface2 dark:text-slate-200 dark:hover:bg-surface"
              >
                📊 Yoklama Raporu
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

      <Modal open={!!confirmTarget} onClose={() => setConfirmTarget(null)} title="Ödemeyi onayla">
        <div className="space-y-3.5">
          <div className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {confirmTarget?.student.fullName} için aşağıdan seçtiğiniz dönemler tek işlemde "Ödendi" olarak işaretlenecek (ya hepsi, ya
            hiçbiri). Hatalı işaretleme olursa "Geri Al" ile düzeltebilirsiniz; işlem ödeme hareketleri geçmişine kaydedilir.
          </div>
          <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 dark:bg-surface2">
            <div className="text-xs font-bold text-slate-500">Ödenecek Dönemler</div>
            {modalMonths.map((m) => (
              <label key={m.paymentId} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={selectedIds.has(m.paymentId)} onChange={() => toggleSelected(m.paymentId)} />
                <span className="flex-1 font-semibold">{m.label}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={!selectedIds.has(m.paymentId)}
                  value={amountInputs[m.paymentId] ?? ""}
                  onChange={(e) => setAmountInputs((prev) => ({ ...prev, [m.paymentId]: e.target.value }))}
                  className="w-28 rounded-lg border border-slate-200 bg-paper2 px-2 py-1 text-right text-sm font-bold outline-none focus:border-brand disabled:opacity-40 dark:border-slate-700 dark:bg-surface dark:text-white"
                />
                <span className="text-xs font-bold text-slate-500">TL</span>
              </label>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-extrabold text-slate-800 dark:border-slate-700 dark:text-slate-100">
              <span>Seçilen Toplam</span>
              <span>{formatTL(selectedTotal)}</span>
            </div>
          </div>
          {markPaidError && <div className="text-xs font-semibold text-red-600">{markPaidError}</div>}
          <div className="flex gap-2.5">
            <button onClick={markPaid} className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-extrabold text-white hover:bg-red-700">
              Evet, Ödendi Olarak İşaretle
            </button>
            <button
              onClick={() => setConfirmTarget(null)}
              className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 dark:bg-surface2 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Vazgeç
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!histTarget} onClose={() => !histSaving && setHistTarget(null)} title="Geçmiş Ödeme Al">
        <div className="space-y-3.5">
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 rounded-xl bg-slate-50 p-3.5 text-sm dark:bg-surface2">
            <dt className="font-bold text-slate-500">Öğrenci</dt>
            <dd className="font-bold text-slate-800 dark:text-slate-100">{histTarget?.studentName}</dd>
            <dt className="font-bold text-slate-500">Biriken Borç</dt>
            <dd className="font-extrabold text-red-700 dark:text-red-400">{formatTL(histOverdueBalance)}</dd>
          </dl>
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-500">Tahsil edilecek aylar</div>
            {histTarget?.months.map((m) => {
              const checked = histSelected.has(m.paymentId);
              return (
                <div key={m.paymentId} className="rounded-xl border border-slate-200 p-2.5 dark:border-slate-700">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <input type="checkbox" checked={checked} onChange={() => toggleHist(m.paymentId)} />
                    {m.label}
                  </label>
                  {checked && (
                    <div className="mt-2 space-y-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-slate-500">Ödenen Tutar (TL)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={histAmounts[m.paymentId] ?? ""}
                          onChange={(e) => setHistAmounts((prev) => ({ ...prev, [m.paymentId]: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 bg-paper2 p-2.5 text-sm font-bold outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white"
                        />
                      </div>
                      <input
                        type="text"
                        maxLength={300}
                        value={histNotes[m.paymentId] ?? ""}
                        onChange={(e) => setHistNotes((prev) => ({ ...prev, [m.paymentId]: e.target.value }))}
                        placeholder="Not (isteğe bağlı)"
                        className="w-full rounded-lg border border-slate-200 bg-paper2 p-2.5 text-xs outline-none focus:border-brand dark:border-slate-700 dark:bg-surface dark:text-white"
                      />
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-extrabold text-slate-800 dark:border-slate-700 dark:text-slate-100">
              <span>Girilen Toplam</span>
              <span>{formatTL(histTotal)}</span>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Her ay girdiğiniz tutarla bugünün tarihiyle Finans / Gelir kaydına yazılır ve ödeme hareketleri geçmişinde görünür.
          </div>
          {histError && <div className="text-xs font-semibold text-red-600">{histError}</div>}
          <div className="flex gap-2.5">
            <button
              onClick={submitHistorical}
              disabled={histSaving}
              className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-extrabold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {histSaving ? "Kaydediliyor…" : "Seçili Ayları Ödendi Yap"}
            </button>
            <button
              onClick={() => setHistTarget(null)}
              disabled={histSaving}
              className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 dark:bg-surface2 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Vazgeç
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!revertTarget} onClose={() => !reverting && setRevertTarget(null)} title="Ödemeyi Geri Al">
        <div className="space-y-3.5">
          <div className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Bu öğrencinin ödeme durumunu tekrar 'Ödenmedi' yapacak ve kaydedilen tutarı gelirlerden/kasadan düşeceksiniz. Emin misiniz?
          </div>
          {revertTarget && (
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 rounded-xl bg-slate-50 p-3.5 text-sm dark:bg-surface2">
              <dt className="font-bold text-slate-500">Öğrenci</dt>
              <dd className="font-bold text-slate-800 dark:text-slate-100">{revertTarget.student.fullName}</dd>
              <dt className="font-bold text-slate-500">Dönem</dt>
              <dd className="text-slate-700 dark:text-slate-200">
                {revertTarget.periodMonth}/{revertTarget.periodYear}
              </dd>
              <dt className="font-bold text-slate-500">Ödenen Tutar</dt>
              <dd className="font-extrabold text-slate-800 dark:text-slate-100">{formatTL(revertTarget.amount)}</dd>
              <dt className="font-bold text-slate-500">Ödeme Tarihi</dt>
              <dd className="text-slate-700 dark:text-slate-200">{revertTarget.paidAt ? formatDateTime(revertTarget.paidAt) : "—"}</dd>
            </dl>
          )}
          {revertError && <div className="text-xs font-semibold text-red-600">{revertError}</div>}
          <div className="flex gap-2.5">
            <button
              onClick={revertPaid}
              disabled={reverting}
              className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {reverting ? "Geri Alınıyor…" : "Evet, Geri Al"}
            </button>
            <button
              onClick={() => setRevertTarget(null)}
              disabled={reverting}
              className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 dark:bg-surface2 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Vazgeç
            </button>
          </div>
        </div>
      </Modal>

      <AttendanceReportModal
        open={!!attendanceReportTarget}
        onClose={() => setAttendanceReportTarget(null)}
        studentId={attendanceReportTarget?.id ?? null}
        studentName={attendanceReportTarget?.name}
      />
    </div>
  );
}
