import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { ForbiddenError } from "../../common/errors/AppError";
import { stripSeedTag } from "../../common/text/displayName";
// Baileys tabanlı gercek gonderim servisi (proje kokunde duz JS, src/ disinda).
const { sendTextMessage } = require("../../../services/whatsappService");
const { getNotifyRecipients } = require("../../../services/notifyRecipients");

function formatTrDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getUTCFullYear()}`;
}

const TURKISH_DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
function formatTrDay(d: Date): string {
  return TURKISH_DAYS[d.getUTCDay()];
}

// TrainingSession.sessionType (saha/diyet/psikolog) -> otomatik mesaj şablonundaki ders_turu etiketi.
const DERS_TURU_LABELS: Record<string, string> = { saha: "antrenman", diyet: "diyetisyen", psikolog: "psikolog" };

// Devamsızlık için gönderilen otomatik (Hızlı Mesaj seçilmediğinde kullanılan) WhatsApp bildirimi.
// Ders türüne göre (antrenman / diyetisyen / psikolog / diğer) ayrı şablon kullanılır; WhatsApp
// biçimlendirmesiyle (*kalın*, _italik_) sporcu adı, tarih ve akademi adı vurgulanır.
function buildAutoAttendanceMessage(studentName: string, sessionDate: Date, dersTuru: string): string {
  const tarih = formatTrDate(sessionDate);
  const gun = formatTrDay(sessionDate);
  const footerWithHelp =
    "_(Bu mesaj sistemimiz tarafından otomatik olarak iletilmiştir. Bir hata olduğunu düşünüyorsanız lütfen bizimle iletişime geçiniz.)_";
  const footerPlain = "_(Bu mesaj sistemimiz tarafından otomatik olarak iletilmiştir.)_";

  if (dersTuru === "antrenman") {
    return `Sayın Velimiz,\nSporcumuz *${studentName}*, *${tarih}* (*${gun}*) tarihli antrenmanına katılmamıştır.\n\nBilginize sunar, iyi günler dileriz.\n${footerWithHelp}\n*Inter Academy Samsun*`;
  }
  if (dersTuru === "diyetisyen") {
    return `Sayın Velimiz,\nSporcumuz *${studentName}*, *${tarih}* (*${gun}*) tarihinde planlanan diyetisyen seansına katılmamıştır.\n\nYeni randevu veya telafi planlaması için lütfen bu hat üzerinden bizimle iletişime geçiniz.\n${footerPlain}\n*Inter Academy Samsun*`;
  }
  if (dersTuru === "psikolog") {
    return `Sayın Velimiz,\nSporcumuz *${studentName}*, *${tarih}* (*${gun}*) tarihinde planlanan psikolog görüşmesine / mental gelişim dersine katılmamıştır.\n\nBilginize sunar, sağlıklı günler dileriz.\n${footerPlain}\n*Inter Academy Samsun*`;
  }
  return `Sayın Velimiz,\nSporcumuz *${studentName}*, *${tarih}* (*${gun}*) tarihinde planlanan ${dersTuru} çalışmasına katılmamıştır.\n\nBilginize sunar, sağlıklı günler dileriz.\n${footerWithHelp}\n*Inter Academy Samsun*`;
}

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth);

// GET roster for a group: yonetici and egitmen both see every student registered
// in that branch + group (attendance needs the whole class roster, not just the
// instructor's individually assigned students). Diyetisyen/psikolog (isGlobalStaff)
// şube bağımsız çalıştığından branchId filtresi uygulanmaz, tüm şubeler döner.
attendanceRouter.get("/", requireRole("yonetici", "egitmen"), async (req, res) => {
  const { groupId, date } = req.query as { groupId?: string; date?: string };
  const { branchId, isGlobalStaff } = req.auth!;
  const where: any = isGlobalStaff ? {} : { branchId };
  if (groupId) where.groupId = groupId;
  const students = await prisma.student.findMany({ where, include: { group: true, branch: true } });

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
      branch: isGlobalStaff ? s.branch.name : undefined,
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

// `message`: yönetici/eğitmenin panelde Hızlı Mesaj şablonlarından seçip veya serbest
// yazıp gönderdiği, tüm kaydedilen öğrencilere ortak uygulanan WhatsApp metni. `{ogrenci_adi}`
// yer tutucusu her öğrenci için kendi ismiyle değiştirilerek gönderilir. Boş bırakılırsa eski
// davranış (sadece "yok" işaretlenenlere sabit devamsızlık şablonu) korunur.
const bulkSchema = z.object({
  records: z.array(markSchema).min(1),
  message: z.string().trim().min(1).max(1000).optional(),
});

attendanceRouter.post("/bulk", requireRole("yonetici", "egitmen"), validateBody(bulkSchema), async (req, res) => {
  const { sub, branchId, isGlobalStaff } = req.auth!;
  const results = [];
  const absentStudentIds = new Set<string>();

  for (const rec of req.body.records) {
    const student = await prisma.student.findUnique({ where: { id: rec.studentId } });
    if (!student || (!isGlobalStaff && student.branchId !== branchId)) {
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
    absentStudentIds.add(rec.studentId); // notify-candidate set; artık "var" da mesaj alabilir (bkz. asağı)
  }

  // Her kaydedilen öğrencinin velisine, akademinin WhatsApp altyapısı üzerinden bildirim
  // gönderilir (telefon numarası kayıtlıysa). Panelde özel bir mesaj (`req.body.message`)
  // girildiyse o kullanılır (yer tutucu `{ogrenci_adi}` her öğrenci için değiştirilir);
  // aksi halde eski davranış korunur: sadece "yok" işaretlenenlere sabit devamsızlık şablonu.
  let notifiedCount = 0;
  // Basarisiz gonderimler eskiden sadece konsola loglanip yanit her zaman "basarili"
  // donuyordu — yonetici/egitmen panelde hep yesil mesaj gorup mesajlarin gercekten
  // gitmedigini fark edemiyordu. Artik hatalar yanitla birlikte donuyor.
  const notifyErrors: { student: string; phone: string; error: string }[] = [];
  for (const studentId of absentStudentIds) {
    const student = await prisma.student.findUnique({ where: { id: studentId }, include: { group: true } });
    if (!student) continue;
    const rec = req.body.records.find((r: { studentId: string }) => r.studentId === studentId)!;

    let message: string;
    if (req.body.message) {
      message = req.body.message.replace(/\{ogrenci_adi\}/g, stripSeedTag(student.fullName));
    } else if (rec.status === "yok") {
      let dersTuru = "antrenman";
      if (rec.sessionId) {
        const session = await prisma.trainingSession.findUnique({ where: { id: rec.sessionId } });
        if (session) dersTuru = DERS_TURU_LABELS[session.sessionType] ?? session.sessionType;
      }
      message = buildAutoAttendanceMessage(stripSeedTag(student.fullName), rec.sessionDate, dersTuru);
    } else {
      continue; // "var" + özel mesaj yok -> eski davranış: bildirim gönderilmez
    }

    const recipients: { label: string; phone: string }[] = getNotifyRecipients(student);
    if (recipients.length === 0) continue;
    let anySent = false;
    for (const { phone } of recipients) {
      const result = await sendTextMessage(phone, message);
      if (result.success) {
        anySent = true;
      } else {
        console.error(`[attendance] ${stripSeedTag(student.fullName)} icin bildirim gonderilemedi:`, result.error);
        notifyErrors.push({ student: stripSeedTag(student.fullName), phone, error: result.error });
      }
    }
    if (anySent) notifiedCount++;
  }

  res.status(201).json({ results, notifiedCount, notifyErrors });
});
