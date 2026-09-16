const cron = require("node-cron");
const { PrismaClient } = require("@prisma/client");
const { sendTextMessage } = require("../services/whatsappService");
const { getNotifyRecipients } = require("../services/notifyRecipients");

const prisma = new PrismaClient();

const TURKISH_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function stripSeedTag(fullName) {
  return fullName.replace(/\s*\[seed\]\s*$/i, "").trim();
}

function formatDate(date) {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

function buildReminderMessage(payment) {
  const studentName = stripSeedTag(payment.student.fullName);
  const ayAdi = TURKISH_MONTHS[payment.periodMonth - 1];
  return `Sayın Velimiz, sporcumuz ${studentName} adına ait ${ayAdi} dönemi aidat ödemesinin son günü ${formatDate(
    payment.dueDate
  )} idi. Ödemenizin geciktiğini hatırlatır, en kısa sürede tamamlamanızı rica ederiz. Dekontunuzu bu hat üzerinden iletebilirsiniz. - Inter Academy Samsun`;
}

// Bugunun tarihinden (UTC gun baslangici) tam 2 gun once denk gelen takvim gununu dondurur.
// Ay/yil gecislerini (30/31 -> 1/2) doğru sekilde yonetmek icin Date.UTC uzerinden hesaplanir.
function computeTargetDueDate(referenceDate) {
  const startOfToday = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));
  return new Date(startOfToday.getTime() - 2 * 24 * 60 * 60 * 1000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// WhatsApp ban/spam riskine karsi ardisik gonderimler arasina 3-7 saniye rastgele bekleme koyar,
// boylece 12:00'de baslayan toplu gonderim saat boyunca (12:00 - 13:00) yayilir.
function randomJitterMs() {
  return Math.floor(3000 + Math.random() * 4000);
}

// Vade tarihinden tam 2 gun sonra devreye giren aidat hatirlatma taramasi.
// "UNPAID" (odenmedi) durumundaki, vade tarihi tam olarak hedef gune denk gelen ve
// bu donem icin daha once otomatik hatirlatma gonderilmemis (auto_reminder_sent = false)
// kayitlari tarar. auto_reminder_sent guard'i sayesinde cron ayni gun icinde tekrar
// tetiklense bile ayni kisiye ikinci kez mesaj gitmez.
async function checkOverduePaymentsAndNotify(referenceDate = new Date()) {
  const targetDueDate = computeTargetDueDate(referenceDate);

  const duePayments = await prisma.payment.findMany({
    where: {
      dueDate: targetDueDate,
      status: "odenmedi",
      autoReminderSent: false,
    },
    include: { student: true },
  });

  console.log(
    `[Aidat Cron] 12:00 Tetiklendi. Hedef Vade Tarihi: ${targetDueDate.toISOString().slice(0, 10)}. Gönderilecek Kişi Sayısı: ${duePayments.length}`
  );

  let notifiedCount = 0;

  for (const payment of duePayments) {
    const recipients = getNotifyRecipients(payment.student);
    if (recipients.length === 0) {
      console.warn(`[payment-reminder] ${payment.student.fullName} icin bildirim isaretli/telefonlu veli bulunamadi, atlandi.`);
      continue;
    }

    await sleep(randomJitterMs());

    const message = buildReminderMessage(payment);
    let anySent = false;
    for (const { phone } of recipients) {
      const result = await sendTextMessage(phone, message);
      if (result.success) anySent = true;
      else console.error(`[payment-reminder] ${payment.student.fullName} icin mesaj gonderilemedi:`, result.error);
    }

    if (anySent) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { autoReminderSent: true, lastReminderDate: new Date(), reminderCount: { increment: 1 } },
      });
      notifiedCount++;
    }
  }

  console.log(`[payment-reminder] Taranan: ${duePayments.length}, bildirim gonderilen: ${notifiedCount}`);
  return { scanned: duePayments.length, notifiedCount, targetDueDate };
}

function startPaymentReminderCron() {
  cron.schedule("0 12 * * *", async () => {
    try {
      await checkOverduePaymentsAndNotify();
    } catch (error) {
      console.error("[payment-reminder] Cron calisirken hata olustu:", error);
    }
  });

  console.log("[payment-reminder] Cron job kaydedildi: her gun 12:00 (vade tarihi + 2 gun)");
}

module.exports = {
  startPaymentReminderCron,
  checkOverduePaymentsAndNotify,
  buildReminderMessage,
  computeTargetDueDate,
};
