import cron from "node-cron";
import { rolloverBillingCycle } from "./payments.service";

/**
 * Registers the period-generation cron job:
 * - Every day 00:00 (Europe/Istanbul): on the 15th (payment day 15 students) and on the 30th
 *   or the last day of shorter months (payment day 30 students) open the month's period as
 *   "Ödenmedi". See `rolloverBillingCycle`. The old "1st of month, every student" generator
 *   was removed — periods now open on each student's own payment day.
 *
 * The actual overdue-reminder WhatsApp notification (vade tarihi + 2 gün, 12:00-13:00 arası)
 * is handled by the WPPConnect-based `jobs/paymentReminderCron.js`, registered in server.ts —
 * that is the system with a live WhatsApp session configured. The Cloud API-based
 * `runOverdueNotificationCheck` job was removed from here to avoid two parallel reminder
 * systems double-notifying the same parent; `WHATSAPP_API_TOKEN` is unset in this project,
 * so it was a no-op stub anyway. Its implementation still lives in payments.service.ts if the
 * Cloud API integration is set up in the future.
 */
export function registerPaymentCronJobs() {
  // Açılışta bir kez telafi: sunucu 00:00'da kapalıydıysa veya güncelleme gün içinde geldiyse bugünün
  // devri kaçmasın. Idempotent — mevcut kayıtlara (ör. "Ödendi") dokunmaz, yalnızca eksikleri açar.
  rolloverBillingCycle()
    .then((result) => {
      if (!result.skipped) console.info("[startup] rolloverBillingCycle", result);
    })
    .catch((err) => console.error("[startup] rolloverBillingCycle failed", err));

  // Faturalama döngüsü devri: her gün 00:00 (TR) tetiklenir, yalnızca ayın 15'i ve 30'unda
  // (kısa aylarda son günde) iş yapar. Bkz. rolloverBillingCycle.
  cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        const result = await rolloverBillingCycle();
        if (!result.skipped || result.reason === "locked") console.info("[cron] rolloverBillingCycle", result);
      } catch (err) {
        console.error("[cron] rolloverBillingCycle failed", err);
      }
    },
    {
      scheduled: true,
      timezone: "Europe/Istanbul",
    }
  );
}
