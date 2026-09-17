import cron from "node-cron";
import { generateMonthlyPayments } from "./payments.service";

/**
 * Registers the period-generation cron job:
 * - 1st of month, 00:05: generate this month's payment rows for every student.
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
  // Sunucu (VPS) saati UTC olduğu için timezone belirtilmeden "5 0 1 * *" aslında
  // 00:05 UTC'de, yani Türkiye saatiyle 03:05'te tetikleniyordu — aidat hatırlatma
  // cron'undaki (jobs/paymentReminderCron.js) aynı +3 saatlik kaymanın kardeşi.
  cron.schedule(
    "5 0 1 * *",
    async () => {
      console.log(`[Aidat Üretim Cron] Tetiklendi: ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`);
      try {
        const result = await generateMonthlyPayments();
        console.info("[cron] generateMonthlyPayments", result);
      } catch (err) {
        console.error("[cron] generateMonthlyPayments failed", err);
      }
    },
    {
      scheduled: true,
      timezone: "Europe/Istanbul",
    }
  );
}
