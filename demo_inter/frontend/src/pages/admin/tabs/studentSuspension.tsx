export type StudentStatus = "ACTIVE" | "SUSPENDED";

export const SUSPEND_CONFIRM_BODY =
  "Bu öğrenciyi askıya almak istediğinize emin misiniz? Öğrenci yoklama, not girişi, WhatsApp bildirimleri ve ödeme listesinden kaldırılacaktır.";

export function reactivateConfirmBody(fullName?: string) {
  return `${fullName ?? "Öğrenci"} tekrar aktif edilecek ve yoklama, not girişi, WhatsApp bildirimleri ile ödeme listesine geri dönecek. Bu ayın aidat kaydı yoksa otomatik oluşturulur.`;
}

export function SuspendedBadge() {
  return (
    <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
      Pasif
    </span>
  );
}

export const suspendButtonCls =
  "rounded-md bg-white px-3 py-1 text-xs font-semibold text-amber-600 shadow-sm hover:bg-amber-50 dark:bg-surface2 dark:text-amber-400 dark:hover:bg-amber-950/30";

export const reactivateButtonCls =
  "rounded-md bg-white px-3 py-1 text-xs font-semibold text-emerald-600 shadow-sm hover:bg-emerald-50 dark:bg-surface2 dark:text-emerald-400 dark:hover:bg-emerald-950/30";
