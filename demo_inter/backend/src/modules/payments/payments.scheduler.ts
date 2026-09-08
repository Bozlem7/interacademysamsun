import cron from "node-cron";
import { generateMonthlyPayments, runOverdueNotificationCheck } from "./payments.service";

/**
 * Registers the two payment-related cron jobs described in the architecture doc:
 * - 1st of month, 00:05: generate this month's payment rows for every student.
 * - Every day, 09:00: find every payment where `dueDate < today && status === 'odenmedi'`
 *   and fire an overdue WhatsApp notification (once per payment, guarded by overdueNotifiedAt).
 */
export function registerPaymentCronJobs() {
  cron.schedule("5 0 1 * *", async () => {
    try {
      const result = await generateMonthlyPayments();
      console.info("[cron] generateMonthlyPayments", result);
    } catch (err) {
      console.error("[cron] generateMonthlyPayments failed", err);
    }
  });

  cron.schedule("0 9 * * *", async () => {
    try {
      const result = await runOverdueNotificationCheck();
      console.info("[cron] runOverdueNotificationCheck", result);
    } catch (err) {
      console.error("[cron] runOverdueNotificationCheck failed", err);
    }
  });
}
