import { prisma } from "../../config/prisma";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../common/errors/AppError";
import { sendWhatsAppMessage } from "../../common/whatsapp/whatsapp.client";
import { stripSeedTag } from "../../common/text/displayName";
import { decryptTc, maskTc } from "../../common/security/tc";
// WPPConnect tabanlı gercek gonderim icin bildirim-isaretli alici listesi (proje kokunde duz JS).
const { getNotifyRecipients } = require("../../../services/notifyRecipients");

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

  // Askıdaki öğrencilere yeni dönem borcu açılmaz; aktif edildiklerinde içinde bulunulan dönem
  // students.service.reactivateStudent'ta tamamlanır.
  const students = await prisma.student.findMany({ where: { status: "ACTIVE" }, select: { id: true, paymentDueDay: true } });

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
  /** Yönetici ödeme listesi ve KPI'ları için askıdaki öğrencileri dışlar; veli kendi geçmişini görmeye devam eder. */
  activeStudentsOnly?: boolean;
}) {
  return prisma.payment
    .findMany({
      where: {
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        status: params.status as any,
        studentId: params.studentId,
        student: { branchId: params.branchId, ...(params.activeStudentsOnly ? { status: "ACTIVE" as const } : {}) },
      },
      include: { student: true },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { dueDay: "asc" }, { student: { fullName: "asc" } }],
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
 * client-side confirm dialog). The reverse transition is only possible via the explicit
 * `revertPayment` ("Geri Al") flow — the `trg_prevent_payment_downgrade` DB trigger blocks it
 * everywhere else as defense-in-depth.
 *
 * `paidAmount` lets the admin record a different amount than the period's nominal `amount`
 * (full payment, discount, custom installment) — defaults to the existing amount so older
 * callers that only send `{ confirm: true }` keep working unchanged. The payment update and the
 * resulting income ledger entry (`FinanceTransaction`) are written atomically: either both
 * succeed, or neither does.
 */
export async function markPaymentPaid(
  paymentId: string,
  confirmedByUserId: string,
  confirm: boolean,
  paidAmount?: number,
  confirmedByUsername?: string
) {
  if (!confirm) throw new ValidationError("Ödeme onayı için çift onay (confirm) gereklidir");

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new NotFoundError("Ödeme kaydı bulunamadı");
  if (payment.status === "odendi") throw new ConflictError("Bu dönem zaten ödenmiş olarak işaretli");

  const amount = paidAmount ?? Number(payment.amount);
  if (!(amount > 0)) throw new ValidationError("Ödeme tutarı 0'dan büyük olmalıdır");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: { status: "odendi", paidAt: new Date(), confirmedBy: confirmedByUserId, amount },
    });

    await tx.financeTransaction.create({
      data: {
        type: "gelir",
        description: `${payment.periodMonth}/${payment.periodYear} dönemi aidat tahsilatı`,
        amount,
        studentId: payment.studentId,
        paymentId: payment.id,
        createdBy: confirmedByUserId,
      },
    });

    await tx.studentPaymentLog.create({
      data: {
        studentId: payment.studentId,
        paymentId: payment.id,
        adminId: confirmedByUserId,
        adminName: await resolveAdminName(tx, confirmedByUserId, confirmedByUsername),
        actionType: "PAID",
        amount,
      },
    });

    return updated;
  });
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Token'daki kullanıcı adını tercih eder; eski token'larda yoksa DB'den okur. */
async function resolveAdminName(tx: TxClient, userId: string, username?: string) {
  if (username) return username;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { username: true } });
  return user?.username ?? "bilinmiyor";
}

/**
 * "Geri Al": "Ödendi" olarak işaretlenmiş bir dönemi tekrar "Ödenmedi" yapar. Tek bir
 * transaction içinde (1) ödeme statüsünü geri çevirir, (2) bağlı aidat gelir kaydını soft-delete
 * eder (Net Kasa'dan anında düşer, kayıt denetim izi olarak kalır), (3) REVERTED log'u yazar —
 * herhangi bir adım başarısız olursa hiçbiri uygulanmaz.
 *
 * `trg_prevent_payment_downgrade` trigger'ı bu geçişi normalde engeller; yalnızca bu
 * transaction'a özel `app.allow_payment_revert` ayarıyla (SET LOCAL semantiği — commit/rollback
 * ile otomatik sıfırlanır) bilinçli olarak serbest bırakılır.
 */
export async function revertPayment(params: {
  studentId: string;
  paymentId: string;
  branchId: string;
  adminId: string;
  adminUsername?: string;
}) {
  const payment = await prisma.payment.findUnique({ where: { id: params.paymentId }, include: { student: true } });
  if (!payment || payment.studentId !== params.studentId) throw new NotFoundError("Ödeme kaydı bulunamadı");
  if (payment.student.branchId !== params.branchId) throw new ForbiddenError("Bu ödeme farklı bir şubeye ait");
  if (payment.status !== "odendi") throw new ConflictError("Bu dönem zaten ödenmemiş durumda");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.allow_payment_revert', 'on', true)`;

    // Statü koşullu update: eşzamanlı iki "Geri Al" isteğinden yalnızca biri geçer.
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: "odendi" },
      data: { status: "odenmedi", paidAt: null, confirmedBy: null },
    });
    if (count === 0) throw new ConflictError("Bu dönem zaten ödenmemiş durumda");

    const income = await tx.financeTransaction.findFirst({
      where: { paymentId: payment.id, isDeleted: false },
    });
    if (income) {
      await tx.financeTransaction.update({
        where: { id: income.id },
        data: { isDeleted: true, deletedAt: new Date(), deletedBy: params.adminId },
      });
    }

    const amount = income ? income.amount : payment.amount;
    const log = await tx.studentPaymentLog.create({
      data: {
        studentId: payment.studentId,
        paymentId: payment.id,
        adminId: params.adminId,
        adminName: await resolveAdminName(tx, params.adminId, params.adminUsername),
        actionType: "REVERTED",
        amount,
      },
    });

    return { paymentId: payment.id, status: "odenmedi" as const, revertedAmount: amount, logId: log.id };
  });
}

export async function listPaymentLogs(params: {
  branchId: string;
  page: number;
  pageSize: number;
  search?: string;
  actionType?: "PAID" | "REVERTED";
}) {
  const where = {
    actionType: params.actionType,
    student: {
      branchId: params.branchId,
      ...(params.search ? { fullName: { contains: params.search, mode: "insensitive" as const } } : {}),
    },
  };

  const [rows, total] = await Promise.all([
    prisma.studentPaymentLog.findMany({
      where,
      include: { student: { select: { fullName: true } }, payment: { select: { periodMonth: true, periodYear: true } } },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.studentPaymentLog.count({ where }),
  ]);

  return {
    total,
    page: params.page,
    pageSize: params.pageSize,
    items: rows.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      studentName: stripSeedTag(r.student.fullName),
      paymentId: r.paymentId,
      period: r.payment ? `${r.payment.periodMonth}/${r.payment.periodYear}` : null,
      actionType: r.actionType,
      amount: r.amount,
      adminName: r.adminName,
      createdAt: r.createdAt,
    })),
  };
}

/**
 * Cloud API-based overdue check — not wired to an automatic cron (no `WHATSAPP_API_TOKEN`
 * configured in this project), only reachable via the manual `POST /payments/run-overdue-check`
 * admin endpoint. The automatic daily reminder runs through the WPPConnect-based
 * `jobs/paymentReminderCron.js` instead (vade tarihi + 2 gün, her gün 12:00).
 * Condition: `dueDate < today && status === 'odenmedi'` (the "UNPAID" status) for every
 * period. `overdueNotifiedAt IS NULL` guard makes reruns a no-op (each overdue payment is
 * only notified once).
 */
export async function runOverdueNotificationCheck(referenceDate: Date = new Date()) {
  const startOfToday = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));

  const overdue = await prisma.payment.findMany({
    where: {
      status: "odenmedi",
      dueDate: { lt: startOfToday },
      overdueNotifiedAt: null,
      student: { status: "ACTIVE" },
    },
    include: { student: true },
  });

  for (const payment of overdue) {
    const recipients: { label: string; phone: string }[] = getNotifyRecipients(payment.student);
    for (const { phone } of recipients) {
      await sendWhatsAppMessage(
        phone,
        `Sayın veli, ${stripSeedTag(payment.student.fullName)} için ${payment.periodMonth}/${payment.periodYear} dönemi aidat ödemesi gecikmiştir. Lütfen en kısa sürede tamamlayınız.`
      );
    }
    await prisma.payment.update({ where: { id: payment.id }, data: { overdueNotifiedAt: new Date() } });
  }

  return { triggered: true, notified: overdue.length };
}
