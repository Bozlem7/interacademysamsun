import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { ForbiddenError } from "../../common/errors/AppError";
import { stripSeedTag } from "../../common/text/displayName";
// WPPConnect tabanlı gercek gonderim servisi (proje kokunde duz JS, src/ disinda).
const { sendTextMessage } = require("../../../services/whatsappService");
const { getNotifyRecipients } = require("../../../services/notifyRecipients");

function formatTrDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getUTCFullYear()}`;
}

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth);

// GET roster for a group: yonetici and egitmen both see every student registered
// in that branch + group (attendance needs the whole class roster, not just the
// instructor's individually assigned students).
attendanceRouter.get("/", requireRole("yonetici", "egitmen"), async (req, res) => {
  const { groupId, date } = req.query as { groupId?: string; date?: string };
  const where: any = { branchId: req.auth!.branchId };
  if (groupId) where.groupId = groupId;
  const students = await prisma.student.findMany({ where, include: { group: true } });

  const sessionDate = date ? new Date(date) : new Date();
  const records = await prisma.attendanceRecord.findMany({
    where: { studentId: { in: students.map((s) => s.id) }, sessionDate },
  });
  const byStudent = new Map(records.map((r) => [r.studentId, r]));

  res.json(
    students.map((s) => ({
      studentId: s.id,
      fullName: stripSeedTag(s.fullName),
      group: s.group?.name,
      status: byStudent.get(s.id)?.status ?? null,
    }))
  );
});

const markSchema = z.object({
  studentId: z.string().uuid(),
  sessionDate: z.coerce.date(),
  status: z.enum(["var", "yok"]),
  sessionId: z.string().uuid().optional(),
});

const bulkSchema = z.object({ records: z.array(markSchema).min(1) });

attendanceRouter.post("/bulk", requireRole("yonetici", "egitmen"), validateBody(bulkSchema), async (req, res) => {
  const { sub, branchId } = req.auth!;
  const results = [];
  const absentStudentIds = new Set<string>();

  for (const rec of req.body.records) {
    const student = await prisma.student.findUnique({ where: { id: rec.studentId } });
    if (!student || student.branchId !== branchId) {
      throw new ForbiddenError(`Öğrenci ${rec.studentId} bu şubeye ait değil`);
    }
    // Yoklama, eğitmenin kendisine bireysel atanmış öğrencilerle sınırlı değildir —
    // seçtiği sınıftaki tüm öğrenciler için yoklama alabilir.
    // Prisma'nın upsert()'ü, compound-unique anahtarın son alanı (sessionId) null olduğunda
    // "Argument sessionId must not be null" hatasıyla reddediyor (bilinen Prisma kısıtı —
    // nullable alanlı compound unique, findUnique/upsert where'inde null ile eşleştirilemiyor).
    // sessionId göndermeyen normal yoklama akışı için bu her zaman 500 hatasına yol açıyordu;
    // bu yüzden find+create/update ile elle upsert yapıyoruz.
    const existing = await prisma.attendanceRecord.findFirst({
      where: { studentId: rec.studentId, sessionDate: rec.sessionDate, sessionId: rec.sessionId ?? null },
    });
    const row = existing
      ? await prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: { status: rec.status, markedBy: sub },
        })
      : await prisma.attendanceRecord.create({ data: { ...rec, markedBy: sub } });
    results.push(row);
    if (rec.status === "yok") absentStudentIds.add(rec.studentId);
  }

  // "Yok" işaretlenen her öğrencinin velisine, akademinin WhatsApp altyapısı üzerinden
  // otomatik devamsızlık bildirimi gönderilir (telefon numarası kayıtlıysa).
  let notifiedCount = 0;
  for (const studentId of absentStudentIds) {
    const student = await prisma.student.findUnique({ where: { id: studentId }, include: { group: true } });
    if (!student) continue;
    const recipients: { label: string; phone: string }[] = getNotifyRecipients(student);
    if (recipients.length === 0) continue;
    const rec = req.body.records.find((r: { studentId: string }) => r.studentId === studentId)!;
    const message = `Sayın Velimiz, sporcumuz ${stripSeedTag(student.fullName)}, ${formatTrDate(
      rec.sessionDate
    )} tarihli ${student.group?.name ?? "antrenman"} antrenmanına katılmamıştır. Bilgilerinize sunarız. - Inter Academy Samsun`;
    let anySent = false;
    for (const { phone } of recipients) {
      const result = await sendTextMessage(phone, message);
      if (result.success) anySent = true;
      else console.error(`[attendance] ${stripSeedTag(student.fullName)} icin bildirim gonderilemedi:`, result.error);
    }
    if (anySent) notifiedCount++;
  }

  res.status(201).json({ results, notifiedCount });
});
