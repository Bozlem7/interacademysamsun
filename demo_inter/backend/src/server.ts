import http from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app";
import { env } from "./config/env";
import { registerPaymentCronJobs } from "./modules/payments/payments.scheduler";
import { registerWhatsAppGateway } from "./modules/whatsapp/whatsapp.gateway";
import { corsOriginHandler } from "./common/security/corsOrigin";

// WPPConnect tabanlı servisler proje kökünde düz JS dosyaları olarak yazıldı
// (src/ TypeScript derlemesinin dışında), bu yüzden require() ile yükleniyor.
const { initWhatsApp } = require("../services/whatsappClient");
const { startPaymentReminderCron } = require("../jobs/paymentReminderCron");

const app = createApp();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: corsOriginHandler } });

registerWhatsAppGateway(io);

httpServer.listen(env.port, () => {
  console.log(`Inter Academy API listening on port ${env.port} (${env.nodeEnv})`);

  // Aylık aidat kaydı üretim job'ı (her ayın 1'i, 00:05)
  registerPaymentCronJobs();

  // WPPConnect oturumunu başlat (kalıcı oturum varsa QR sormadan bağlanır) ve bağlı client
  // hazır olunca wppconnect tabanlı aidat hatırlatma cron'unu (vade tarihi + 2 gün, her gün 12:00) devreye al.
  initWhatsApp()
    .then(() => startPaymentReminderCron())
    .catch((err: unknown) => console.error("[whatsapp] Baslatilamadi:", err));
});
