import { createApp } from "./app";
import { env } from "./config/env";
import { registerPaymentCronJobs } from "./modules/payments/payments.scheduler";

const app = createApp();

app.listen(env.port, () => {
  console.log(`Inter Academy API listening on port ${env.port} (${env.nodeEnv})`);

  // WhatsApp artık Meta Cloud API üzerinden (src/common/whatsapp/whatsapp.client.ts) çalışıyor —
  // QR/oturum gerektirmez, bu yüzden ayrı bir bağlantı başlatma adımına ihtiyaç yok.
  registerPaymentCronJobs();
});
