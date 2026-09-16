import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { ForbiddenError, WhatsAppUnavailableError } from "../../common/errors/AppError";
import { stripSeedTag } from "../../common/text/displayName";
// Baileys tabanlı gercek gonderim servisi (proje kokunde duz JS, src/ disinda).
const { sendTextMessage } = require("../../../services/whatsappService");
const { getNotifyRecipients } = require("../../../services/notifyRecipients");
const { getState: getWhatsAppState } = require("../../../services/whatsappClient");

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

// Devamsızlık için gönderilen otomatik (Hızlı Mesaj/serbest metin girilmediğinde kullanılan)
// WhatsApp bildirimi. Ders türüne göre (antrenman / diyetisyen / psikolog / diğer) ayrı şablon
// kullanılır; WhatsApp biçimlendirmesiyle (*kalın*, _italik_) sporcu adı, tarih ve akademi adı
// vurgulanır. Yalnızca "yok" işaretlenen öğrenciler için çağrılır — derse katılanlara hiç mesaj
// gönderilmez.
function buildAutoAttendanceMessage(studentName: string, sessionDate: Date, dersTuru: string): string {
  const tarih = formatTrDate(sessionDate);
  const gun = formatTrDay(sessionDate);
  const footerWithHelp =
    "_(Bu mesaj sistemimiz tarafından otomatik olarak iletilmiştir. Bir hata olduğunu düşünüyorsanız lütfen bu hat üzerinden bizimle iletişime geçiniz.)_";
  const footerPlain = "_(Bu mesaj sistemimiz tarafından otomatik olarak iletilmiştir.)_";

  if (dersTuru === "antrenman") {
    return `Sayın Velimiz,\nSporcumuz *${studentName}*, *${tarih}* (*${gun}*) tarihli *antrenman dersine katılmamıştır.*\n\nBilginize sunar, iyi günler dileriz.\n${footerWithHelp}\n*Inter Academy Samsun*`;
  }
  if (dersTuru === "diyetisyen") {
    return `Sayın Velimiz,\nSporcumuz *${studentName}*, *${tarih}* (*${gun}*) tarihinde planlanan *diyetisyen dersine katılmamıştır.*\n\nRandevu telafisi ve detaylı bilgi için lütfen bu hat üzerinden bizimle iletişime geçiniz.\n${footerPlain}\n*Inter Academy Samsun*`;
  }
  if (dersTuru === "psikolog") {
    return `Sayın Velimiz,\nSporcumuz *${studentName}*, *${tarih}* (*${gun}*) tarihinde planlanan *psikolog dersine katılmamıştır.*\n\nBilginize sunar, sağlıklı günler dileriz.\n${footerPlain}\n*Inter Academy Samsun*`;
  }
  return `Sayın Velimiz,\nSporcumuz *${studentName}*, *${tarih}* (*${gun}*) tarihinde planlanan *${dersTuru} dersine katılmamıştır.*\n\nBilginize sunar, sağlıklı günler dileriz.\n${footerWithHelp}\n*Inter Academy Samsun*`;
}

// Sanitize: veliye giden nihai metinde asla süslü parantez/placeholder kalmamalı. {ogrenci_adi}
// gerçek isimle değiştirilir; tanımsız kalan başka {...} kalıntıları (kullanıcı hatası/kopyala-
// yapıştır) tamamen temizlenir.
function sanitizeFreeText(text: string, studentName: string): string {
  return text.replace(/\{ogrenci_adi\}/g, studentName).replace(/\{[^}]*\}/g, "");
}

// "Özel bilgilendirme" — panelde yönetici/eğitmenin serbest yazdığı notu, kilitli başlık
// (öğrenci adı + tarih + gün) ve kilitli alt bilgi (yasal uyarı + akademi adı) arasına yerleştirir.
// Bu iki blok kullanıcı tarafından değiştirilemez; yalnızca ortadaki not serbesttir.
function buildOzelBilgilendirmeMessage(studentName: string, sessionDate: Date, ozelNot: string): string {
  const tarih = formatTrDate(sessionDate);
  const gun = formatTrDay(sessionDate);
  return `Sayın Velimiz,\nSporcumuz *${studentName}* için *${tarih}* (*${gun}*) tarihli bilgilendirme:\n\n${ozelNot}\n\n_(Bu mesaj sistemimiz tarafından otomatik olarak iletilmiştir. Sorularınız için bu hat üzerinden yanıt verebilirsiniz.)_\n*Inter Academy Samsun*`;
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

  // "yok" (devamsız) işaretlenen her öğrencinin velisine WhatsApp bildirimi gitmesi gerekir.
  // WhatsApp oturumu bağlı değilse bildirim hiç gönderilemeyeceğinden, yoklama TAMAMEN abort
  // edilir — hiçbir kayıt (ne "var" ne "yok") veritabanına yazılmaz. Kimse devamsız
  // işaretlenmediyse (bildirilecek kimse yoksa) WhatsApp durumu kaydı engellemez.
  const absentCount = req.body.records.filter((r: { status: string }) => r.status === "yok").length;
  if (absentCount > 0) {
    const whatsappStatus = getWhatsAppState().status;
    if (whatsappStatus !== "CONNECTED") {
      throw new WhatsAppUnavailableError(
        `WhatsApp bağlantısı aktif değil! ${absentCount} öğrencinin velisine mesaj iletilemediği için yoklama kaydedilmedi. Lütfen panelden QR kod ile bağlantınızı yenileyip işlemi tekrar deneyin.`,
        { absentCount, whatsappStatus }
      );
    }
  }

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
    // "yok" işaretlenen öğrenciler için, panelde girilen özel bilgilendirme metni (varsa)
    // rapor tablosunda gösterilmek üzere kayıtla birlikte saklanır — "var" kayıtlarında not tutulmaz.
    // {ogrenci_adi} yer tutucusu burada da veliye giden mesajla tutarlı şekilde gerçek isimle değiştirilir.
    const notes =
      rec.status === "yok" && req.body.message
        ? sanitizeFreeText(req.body.message, stripSeedTag(student.fullName))
        : null;
    const row = existing
      ? await prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: { status: rec.status, markedBy: sub, notes },
        })
      : await prisma.attendanceRecord.create({ data: { ...rec, markedBy: sub, notes } });
    results.push(row);
    if (rec.status === "yok") absentStudentIds.add(rec.studentId);
  }

  // Derse katılan ("var") öğrencilere hiçbir koşulda WhatsApp bildirimi gönderilmez — yalnızca
  // "yok" işaretlenenler için işlem yapılır. Panelde özel bir not (`req.body.message`) girildiyse
  // "özel bilgilendirme" şablonuyla (kilitli başlık/alt bilgi + serbest orta metin) gönderilir;
  // aksi halde ders türüne göre otomatik devamsızlık şablonu kullanılır.
  let notifiedCount = 0;
  // Basarisiz gonderimler eskiden sadece konsola loglanip yanit her zaman "basarili"
  // donuyordu — yonetici/egitmen panelde hep yesil mesaj gorup mesajlarin gercekten
  // gitmedigini fark edemiyordu. Artik hatalar yanitla birlikte donuyor.
  const notifyErrors: { student: string; phone: string; error: string }[] = [];
  for (const studentId of absentStudentIds) {
    const student = await prisma.student.findUnique({ where: { id: studentId }, include: { group: true } });
    if (!student) continue;
    const rec = req.body.records.find((r: { studentId: string }) => r.studentId === studentId)!;

    const studentName = stripSeedTag(student.fullName);
    let message: string;
    if (req.body.message) {
      message = buildOzelBilgilendirmeMessage(studentName, rec.sessionDate, sanitizeFreeText(req.body.message, studentName));
    } else {
      let dersTuru = "antrenman";
      if (rec.sessionId) {
        const session = await prisma.trainingSession.findUnique({ where: { id: rec.sessionId } });
        if (session) dersTuru = DERS_TURU_LABELS[session.sessionType] ?? session.sessionType;
      }
      message = buildAutoAttendanceMessage(studentName, rec.sessionDate, dersTuru);
    }

    const recipients: { label: string; phone: string }[] = getNotifyRecipients(student);
    if (recipients.length === 0) continue;
    let anySent = false;
    for (const { phone } of recipients) {
      const result = await sendTextMessage(phone, message);
      if (result.success) {
        anySent = true;
      } else {
        console.error(`[attendance] ${studentName} icin bildirim gonderilemedi:`, result.error);
        notifyErrors.push({ student: studentName, phone, error: result.error });
      }
    }
    if (anySent) notifiedCount++;
  }

  res.status(201).json({ results, notifiedCount, notifyErrors });
});
