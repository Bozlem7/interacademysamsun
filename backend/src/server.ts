import { createApp } from "./app";
import { env } from "./config/env";
import { registerPaymentCronJobs } from "./modules/payments/payments.scheduler";

// WPPConnect tabanlı servisler proje kökünde düz JS dosyaları olarak yazıldı
// (src/ TypeScript derlemesinin dışında), bu yüzden require() ile yükleniyor.
const { initWhatsApp } = require("../services/whatsappClient");
const { startPaymentReminderCron } = require("../jobs/paymentReminderCron");

const app = createApp();

app.listen(env.port, () => {
  console.log(`Inter Academy API listening on port ${env.port} (${env.nodeEnv})`);

  // Mevcut Cloud API tabanlı ödeme hatırlatma job'ı
  registerPaymentCronJobs();

  // WPPConnect oturumunu başlat (QR terminale basılır) ve bağlı client hazır olunca
  // yeni wppconnect tabanlı aidat hatırlatma cron'unu (her gün 09:30) devreye al.
  initWhatsApp()
    .then(() => startPaymentReminderCron())
    .catch((err: unknown) => console.error("[whatsapp] Baslatilamadi:", err));
});
