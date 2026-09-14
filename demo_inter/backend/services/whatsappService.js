const { getWhatsAppClient } = require("./whatsappClient");

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

async function sendTextMessage(toPhone, messageText) {
  const client = getWhatsAppClient();

  if (!client) {
    console.error("[whatsapp] Client hazir degil (baglanti kurulmamis), mesaj gonderilemedi.");
    return { success: false, error: "WhatsApp client hazir degil." };
  }

  const jid = sanitizePhoneNumber(toPhone);

  if (!jid) {
    console.error(`[whatsapp] Gecersiz telefon numarasi, mesaj gonderilemedi: ${toPhone}`);
    return { success: false, error: "Gecersiz telefon numarasi." };
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await client.sendMessage(jid, { text: messageText });
      console.log(`[whatsapp] Mesaj basariyla gonderildi -> ${jid}`);
      return { success: true, result };
    } catch (error) {
      const willRetry = attempt === 1;
      console.error(
        `[whatsapp] Mesaj gonderilirken hata olustu -> ${jid} (deneme ${attempt}):`,
        error.message
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
