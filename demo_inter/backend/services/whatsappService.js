const { getWhatsAppClient, getState } = require("./whatsappClient");

const TR_NUMBER_REGEX = /^90\d{10}$/;

// '0532 123 45 67', '+90 532 123 45 67', '532-123-45-67' gibi girdileri
// '905321234567@s.whatsapp.net' formatina cevirir (Baileys JID formati). Numara
// eksik/gecersizse null doner.
function sanitizePhoneNumber(phone) {
  if (!phone) return null;

  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (!digits.startsWith("90")) {
    digits = `90${digits}`;
  }

  if (!TR_NUMBER_REGEX.test(digits)) {
    return null;
  }

  return `${digits}@s.whatsapp.net`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SEND_TIMEOUT_MS = 8000;

// Baglanti "CONNECTED" gorunse bile socket gercekte yanit vermiyor olabilir (ör. bozuk/askida
// kalmis WebSocket) — client.sendMessage() boyle bir durumda sonsuza kadar askida kalabilir.
// Bu yuzden sabit bir ust sinir koyup, suresi dolarsa net bir hata ile kullaniciya donuyoruz.
function sendWithTimeout(client, jid, messageText) {
  return Promise.race([
    client.sendMessage(jid, { text: messageText }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("WhatsApp bağlantınız iyi değil veya yanıt vermiyor.")), SEND_TIMEOUT_MS)
    ),
  ]);
}

async function sendTextMessage(toPhone, messageText) {
  const client = getWhatsAppClient();
  const currentStatus = getState().status;

  console.log(
    `[whatsapp] sendTextMessage cagrildi -> hedef(ham): "${toPhone}", client hazir mi: ${!!client}, durum: ${currentStatus}`
  );

  if (!client) {
    const error = `WhatsApp client hazir degil (durum: ${currentStatus}). Once panelden QR okutup bağlanın.`;
    console.error(`[whatsapp] ${error}`);
    return { success: false, error };
  }

  const jid = sanitizePhoneNumber(toPhone);

  if (!jid) {
    const error = `Gecersiz telefon numarasi: "${toPhone}"`;
    console.error(`[whatsapp] ${error}`);
    return { success: false, error };
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await sendWithTimeout(client, jid, messageText);
      console.log(`[whatsapp] Mesaj basariyla gonderildi -> ${jid}`);
      return { success: true, result };
    } catch (error) {
      const willRetry = attempt === 1;
      console.error(
        `[whatsapp] Mesaj gonderilirken hata olustu -> ${jid} (deneme ${attempt}/2):`,
        error.message,
        error.output?.statusCode ? `(kod: ${error.output.statusCode})` : ""
      );
      if (!willRetry) {
        return { success: false, error: error.message };
      }
      await sleep(1500);
    }
  }
}

module.exports = {
  sanitizePhoneNumber,
  sendTextMessage,
};
