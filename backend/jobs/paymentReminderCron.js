const cron = require("node-cron");
const { PrismaClient } = require("@prisma/client");
const { sendTextMessage } = require("../services/whatsappService");

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

// Son odeme tarihi tam olarak "dun" olan, "UNPAID" (odenmedi) durumundaki ve
// daha once otomatik hatirlatma gonderilmemis (auto_reminder_sent = false) kayitlari tarar.
async function checkOverduePaymentsAndNotify() {
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));

  const overduePayments = await prisma.payment.findMany({
    where: {
      dueDate: yesterday,
      status: "odenmedi",
      autoReminderSent: false,
    },
    include: { student: true },
  });

  let notifiedCount = 0;

  for (const payment of overduePayments) {
    const phone = payment.student.motherPhone || payment.student.fatherPhone;
    if (!phone) {
      console.warn(`[payment-reminder] ${payment.student.fullName} icin veli telefonu bulunamadi, atlandi.`);
      continue;
    }

    const message = buildReminderMessage(payment);
    const result = await sendTextMessage(phone, message);

    if (result.success) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { autoReminderSent: true, lastReminderDate: new Date() },
      });
      notifiedCount++;
    } else {
      console.error(`[payment-reminder] ${payment.student.fullName} icin mesaj gonderilemedi:`, result.error);
    }
  }

  console.log(`[payment-reminder] Taranan: ${overduePayments.length}, bildirim gonderilen: ${notifiedCount}`);
  return { scanned: overduePayments.length, notifiedCount };
}

function startPaymentReminderCron() {
  cron.schedule("30 9 * * *", async () => {
    try {
      await checkOverduePaymentsAndNotify();
    } catch (error) {
      console.error("[payment-reminder] Cron calisirken hata olustu:", error);
    }
  });

  console.log("[payment-reminder] Cron job kaydedildi: her gun 09:30");
}

module.exports = {
  startPaymentReminderCron,
  checkOverduePaymentsAndNotify,
  buildReminderMessage,
};
