const { PrismaClient } = require("@prisma/client");
const { sendTextMessage } = require("../services/whatsappService");
const { getNotifyRecipients } = require("../services/notifyRecipients");

const prisma = new PrismaClient();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getUTCFullYear()}`;
}

function stripSeedTag(fullName) {
  return fullName.replace(/\s*\[seed\]\s*$/i, "").trim();
}

// Dis dunyadan gelen 'ABSENT' / 'PRESENT' degerlerini Prisma'nin AttendanceStatus enum'una cevirir.
function mapStatus(status) {
  if (status === "ABSENT") return "yok";
  if (status === "PRESENT") return "var";
  return null;
}

function buildAbsenceMessage(student, sessionDate) {
  return `Sayın Velimiz, sporcumuz ${stripSeedTag(student.fullName)}, ${formatDate(
    sessionDate
  )} tarihli ${student.group?.name ?? "antrenman"} antrenmanına katılmamıştır. Bilgilerinize sunarız. - Inter Academy Samsun`;
}

// Beklenen body sekli:
// { records: [{ studentId, sessionDate, status: 'ABSENT' | 'PRESENT', sessionId? }, ...] }
async function saveAttendanceAndNotify(req, res) {
  try {
    const records = req.body.records || [];
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: "records alani bos olamaz." });
    }

    const savedRecords = [];
    const absentStudentIds = new Set();

    for (const rec of records) {
      const status = mapStatus(rec.status);
      if (!status) {
        return res.status(400).json({ success: false, error: `Gecersiz status: ${rec.status}` });
      }

      const sessionDate = new Date(rec.sessionDate);
      const sessionId = rec.sessionId ?? null;

      // Prisma'nin (studentId, sessionDate, sessionId) compound-unique'i sessionId null
      // oldugunda upsert()'te calismiyor, bu yuzden find+create/update ile elle upsert.
      const existing = await prisma.attendanceRecord.findFirst({
        where: { studentId: rec.studentId, sessionDate, sessionId },
      });

      const saved = existing
        ? await prisma.attendanceRecord.update({ where: { id: existing.id }, data: { status } })
        : await prisma.attendanceRecord.create({
            data: { studentId: rec.studentId, sessionDate, sessionId, status },
          });

      savedRecords.push(saved);
      if (status === "yok") absentStudentIds.add(rec.studentId);
    }

    let notifiedCount = 0;

    for (const studentId of absentStudentIds) {
      const student = await prisma.student.findUnique({ where: { id: studentId }, include: { group: true } });
      if (!student) continue;

      const recipients = getNotifyRecipients(student);
      if (recipients.length === 0) {
        console.warn(`[attendance] ${student.fullName} icin bildirim isaretli/telefonlu veli bulunamadi, atlandi.`);
        continue;
      }

      const record = records.find((r) => r.studentId === studentId);
      const message = buildAbsenceMessage(student, record.sessionDate);

      let anySent = false;
      for (const { phone } of recipients) {
        const result = await sendTextMessage(phone, message);
        if (result.success) anySent = true;
        // Ardisik mesajlar arasinda spam algilanmamasi icin 1-2 saniye gecikme
        await sleep(1000 + Math.floor(Math.random() * 1000));
      }
      if (anySent) notifiedCount++;
    }

    return res.status(201).json({
      success: true,
      savedCount: savedRecords.length,
      totalAbsent: absentStudentIds.size,
      notifiedCount,
    });
  } catch (error) {
    console.error("[attendance] Yoklama kaydedilirken/bildirim gonderilirken hata olustu:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  saveAttendanceAndNotify,
};
