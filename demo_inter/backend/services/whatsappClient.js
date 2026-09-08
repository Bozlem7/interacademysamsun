const wppconnect = require("@wppconnect-team/wppconnect");
const fs = require("fs");
const path = require("path");

const SESSION_NAME = "inter-academy-session";
const QR_PATH = path.join(__dirname, "..", "tokens", "qr-latest.png");

let whatsappClient = null;

async function initWhatsApp() {
  try {
    const client = await wppconnect.create({
      session: SESSION_NAME,
      catchQR: (base64Qr, asciiQR) => {
        console.log("[whatsapp] QR kodu okutmak icin taratin:");
        console.log(asciiQR);
        try {
          const data = base64Qr.replace(/^data:image\/\w+;base64,/, "");
          fs.mkdirSync(path.dirname(QR_PATH), { recursive: true });
          fs.writeFileSync(QR_PATH, Buffer.from(data, "base64"));
          console.log(`[whatsapp] QR kodu PNG olarak kaydedildi: ${QR_PATH}`);
        } catch (qrErr) {
          console.error("[whatsapp] QR PNG kaydedilemedi:", qrErr);
        }
      },
      statusFind: (statusSession) => {
        console.log(`[whatsapp] Oturum durumu: ${statusSession}`);
      },
      headless: true,
      puppeteerOptions: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
      logQR: false,
      autoClose: 0,
    });

    whatsappClient = client;
    console.log("[whatsapp] Baglanti basariyla kuruldu.");

    return client;
  } catch (error) {
    console.error("[whatsapp] Baglanti kurulurken hata olustu:", error);
    throw error;
  }
}

function getWhatsAppClient() {
  return whatsappClient;
}

module.exports = {
  initWhatsApp,
  getWhatsAppClient,
};
