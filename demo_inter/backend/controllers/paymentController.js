const { PrismaClient } = require("@prisma/client");
const { sendTextMessage } = require("../services/whatsappService");
const { buildReminderMessage } = require("../jobs/paymentReminderCron");

const prisma = new PrismaClient();

// POST /api/payments/:id/remind
// Yoneticinin panelden tek bir odeme kaydi icin aninda hatirlatma gondermesini saglar.
async function remindPayment(req, res) {
  try {
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { student: true },
    });

    if (!payment) {
      return res.status(404).json({ success: false, error: "Odeme kaydi bulunamadi." });
    }

    const phone = payment.student.motherPhone || payment.student.fatherPhone;
    if (!phone) {
      return res.status(400).json({ success: false, error: "Veli telefonu bulunamadi." });
    }

    const message = buildReminderMessage(payment);
    const result = await sendTextMessage(phone, message);

    if (!result.success) {
      return res.status(502).json({ success: false, error: result.error || "Mesaj gonderilemedi." });
    }

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { lastReminderDate: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: "Hatırlatma mesajı başarıyla gönderildi.",
      lastReminderDate: updated.lastReminderDate,
    });
  } catch (error) {
    console.error("[payment-remind] Hatirlatma gonderilirken hata olustu:", error);
    return res.status(500).json({ success: false, error: "Hatırlatma gönderilirken sunucu hatası oluştu." });
  }
}

module.exports = {
  remindPayment,
};
