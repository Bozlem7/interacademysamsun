const wppconnect = require("@wppconnect-team/wppconnect");

const SESSION_NAME = "inter-academy-session";

let whatsappClient = null;

async function initWhatsApp() {
  try {
    const client = await wppconnect.create({
      session: SESSION_NAME,
      catchQR: (base64Qr, asciiQR) => {
        console.log("[whatsapp] QR kodu okutmak icin taratin:");
        console.log(asciiQR);
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
