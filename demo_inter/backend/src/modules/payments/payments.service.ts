import { prisma } from "../../config/prisma";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../../common/errors/AppError";
import { sendWhatsAppMessage } from "../../common/whatsapp/whatsapp.client";
import { stripSeedTag } from "../../common/text/displayName";
import { decryptTc, maskTc } from "../../common/security/tc";

const TURKISH_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate(); // month is 1-12, Date() rolls to last day of previous month index
}

function computeDueDate(year: number, month: number, dueDay: number): Date {
  const day = Math.min(dueDay, lastDayOfMonth(year, month));
  return new Date(Date.UTC(year, month - 1, day));
}

async function getMonthlyFee(): Promise<number> {
  const settings = await prisma.feeSettings.findUnique({ where: { id: 1 } });
  return Number(settings?.monthlyFee ?? 3500);
}

/** Called once when a new student is registered — creates the payment row for the current period immediately. */
export async function generatePaymentForNewStudent(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new NotFoundError("Öğrenci bulunamadı");

  const now = new Date();
  const amount = await getMonthlyFee();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  await prisma.payment.upsert({
    where: { studentId_periodYear_periodMonth: { studentId, periodYear: year, periodMonth: month } },
    create: {
      studentId,
      periodYear: year,
      periodMonth: month,
      dueDay: student.paymentDueDay,
      dueDate: computeDueDate(year, month, student.paymentDueDay),
      amount,
    },
    update: {},
  });
}

/**
 * Monthly period-generation job — run on the 1st of every month at 00:05.
 * Idempotent: relies on the (studentId, periodYear, periodMonth) unique constraint,
 * so re-running it (e.g. after a redeploy) never duplicates rows.
 */
export async function generateMonthlyPayments(referenceDate: Date = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth() + 1;
  const amount = await getMonthlyFee();

  const students = await prisma.student.findMany({ select: { id: true, paymentDueDay: true } });

  let created = 0;
  for (const student of students) {
    const result = await prisma.payment.upsert({
      where: {
        studentId_periodYear_periodMonth: { studentId: student.id, periodYear: year, periodMonth: month },
      },
      create: {
        studentId: student.id,
        periodYear: year,
        periodMonth: month,
        dueDay: student.paymentDueDay,
        dueDate: computeDueDate(year, month, student.paymentDueDay),
        amount,
      },
      update: {},
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
  }
  return { year, month, studentsProcessed: students.length, created };
}

export function listPayments(params: {
  periodYear?: number;
  periodMonth?: number;
  status?: string;
  studentId?: string;
  branchId: string;
}) {
  return prisma.payment
    .findMany({
      where: {
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        status: params.status as any,
        studentId: params.studentId,
        student: { branchId: params.branchId },
      },
      include: { student: true },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { dueDay: "asc" }],
    })
    .then((rows) =>
      rows.map((p) => {
        const { tcNoEncrypted, tcNoHash, ...restStudent } = p.student;
        return {
          ...p,
          student: {
            ...restStudent,
            fullName: stripSeedTag(p.student.fullName),
            tcNoMasked: maskTc(decryptTc(tcNoEncrypted)),
          },
        };
      })
    );
}

/**
 * Marks a payment as paid. Requires explicit double-confirmation (`confirm: true` from the
 * client-side confirm dialog) and is a one-way transition — enforced here AND by the
 * `trg_prevent_payment_downgrade` DB trigger as defense-in-depth.
 */
export async function markPaymentPaid(paymentId: string, confirmedByUserId: string, confirm: boolean) {
  if (!confirm) throw new ValidationError("Ödeme onayı için çift onay (confirm) gereklidir");

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new NotFoundError("Ödeme kaydı bulunamadı");
  if (payment.status === "odendi") throw new ConflictError("Bu dönem zaten ödenmiş olarak işaretli");

  return prisma.payment.update({
    where: { id: paymentId },
    data: { status: "odendi", paidAt: new Date(), confirmedBy: confirmedByUserId },
  });
}

/**
 * Daily overdue-payment trigger — run once a day (e.g. 09:00).
 * Condition: `dueDate < today && status === 'odenmedi'` (the "UNPAID" status) for every
 * period, not just the one whose due day happens to match today — this way a payment that
 * becomes overdue never slips through just because the cron missed its exact due day
 * (a restart, a deploy, etc.). `overdueNotifiedAt IS NULL` guard makes reruns a no-op
 * (each overdue payment is only notified once).
 */
export async function runOverdueNotificationCheck(referenceDate: Date = new Date()) {
  const startOfToday = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));

  const overdue = await prisma.payment.findMany({
    where: {
      status: "odenmedi",
      dueDate: { lt: startOfToday },
      overdueNotifiedAt: null,
    },
    include: { student: true },
  });

  for (const payment of overdue) {
    const phone = payment.student.motherPhone || payment.student.fatherPhone;
    if (phone) {
      await sendWhatsAppMessage(
        phone,
        `Sayın veli, ${stripSeedTag(payment.student.fullName)} için ${payment.periodMonth}/${payment.periodYear} dönemi aidat ödemesi gecikmiştir. Lütfen en kısa sürede tamamlayınız.`
      );
    }
    await prisma.payment.update({ where: { id: payment.id }, data: { overdueNotifiedAt: new Date() } });
  }

  return { triggered: true, notified: overdue.length };
}

/** Yöneticinin panelden tek bir ödeme kaydı için anında hatırlatma göndermesini sağlar. */
export async function sendManualPaymentReminder(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { student: true } });
  if (!payment) throw new NotFoundError("Ödeme kaydı bulunamadı");

  const phone = payment.student.motherPhone || payment.student.fatherPhone;
  if (!phone) throw new ValidationError("Veli telefonu bulunamadı");

  const monthName = TURKISH_MONTHS[payment.periodMonth - 1];
  const message = `Sayın Velimiz, sporcumuz ${stripSeedTag(payment.student.fullName)} adına ait ${monthName} ${payment.periodYear} dönemi aidat ödemesi henüz tamamlanmamıştır. En kısa sürede tamamlamanızı rica ederiz. - Inter Academy Samsun`;

  const result = await sendWhatsAppMessage(phone, message);
  if (!result.success) throw new AppError(502, result.error ?? "Mesaj gönderilemedi", "WHATSAPP_SEND_FAILED");

  return prisma.payment.update({ where: { id: payment.id }, data: { lastReminderDate: new Date() } });
}
