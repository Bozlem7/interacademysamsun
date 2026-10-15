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

/**
 * Öğrencilerin EN SON ödedikleri dönemin tutarı (öğrenciye özel fiyat). Yeni dönem satırları bu tutarla
 * açılır; hiç ödemesi olmayan öğrenci genel aylık aidatı (varsayılan 3.500 TL) alır. Tutar her zaman
 * ödeme alınırken düzeltilebilir.
 */
async function lastPaidAmountMap(client: typeof prisma | TxClient, studentIds: string[]) {
  const map = new Map<string, number>();
  if (studentIds.length === 0) return map;
  const rows = await client.payment.findMany({
    where: { studentId: { in: studentIds }, status: "odendi" },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    distinct: ["studentId"],
    select: { studentId: true, amount: true },
  });
  for (const r of rows) map.set(r.studentId, Number(r.amount));
  return map;
}

/**
 * Verilen anın hangi faturalama dönemine düştüğünü döndürür. Dönem, öğrencinin ödeme gününden bir
 * sonraki ayın ödeme gününe kadar sürer ve ADINI başladığı aydan alır: ödeme günü 15 ise
 * 15 Eylül 00:00 – 15 Ekim 00:00 arası her an (ör. 1–14 Ekim dahil) "Eylül" dönemidir.
 * Gün sınırı Europe/Istanbul takvim gününe göre hesaplanır; kısa aylarda ödeme günü ayın son gününe kırpılır.
 */
export function cyclePeriodContaining(date: Date, dueDay: number): { year: number; month: number } {
  const { year, month, day } = istanbulDateParts(date);
  const startDay = Math.min(dueDay, lastDayOfMonth(year, month));
  if (day >= startDay) return { year, month };
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Called once when a new student is registered — creates the payment row for the current billing cycle immediately. */
export async function generatePaymentForNewStudent(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new NotFoundError("Öğrenci bulunamadı");

  const amount = (await lastPaidAmountMap(prisma, [studentId])).get(studentId) ?? (await getMonthlyFee());
  const { year, month } = cyclePeriodContaining(new Date(), student.paymentDueDay);

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

const TURKISH_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/** Verilen anın Türkiye saatindeki takvim günü (sunucu UTC olsa bile 00:00 TR doğru gün sayılır). */
function istanbulDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Dönem, bir sonraki dönemin başladığı gün (ertesi ayın aynı ödeme günü) biter. */
function periodEndDate(year: number, month: number, dueDay: number): Date {
  return month === 12 ? computeDueDate(year + 1, 1, dueDay) : computeDueDate(year, month + 1, dueDay);
}

// Eşzamanlı/çoklu instance tetiklemelerinde rollover'ın tek seferde çalışması için advisory lock anahtarı.
const ROLLOVER_LOCK_KEY = 727401;

/**
 * Faturalama döngüsü devri — her gün 00:00'da (Europe/Istanbul) çalışır.
 * - Ayın 15'i: ödeme günü 15 olan aktif öğrencilerin o ayın dönem kaydı (15 Ekim → 10/2026) "Ödenmedi" açılır.
 * - Ayın 30'u (veya 30'dan kısa ayların son günü): ödeme günü 30 olan öğrenciler için aynısı.
 * - Yeni dönemi açmadan önce biten dönemin kaydı olmayan öğrencilere "Ödenmedi" satırı yazılır (snapshot).
 *
 * Güvenlik: kayıtlar `createMany({ skipDuplicates })` ile eklenir, yani (öğrenci, yıl, ay) için zaten
 * var olan kayıt — örn. önceden "Ödendi" olarak girilmiş peşin ödeme — ASLA ezilmez. İşlem tek
 * transaction + `pg_try_advisory_xact_lock` altında çalışır; aynı anda tetiklenen ikinci çalıştırma
 * (çoklu instance, manuel tetikleme) kilidi alamayıp atlanır, ayrıca unique kısıt çift kaydı engeller.
 */
export async function rolloverBillingCycle(referenceDate: Date = new Date()) {
  const { year, month, day } = istanbulDateParts(referenceDate);
  const lastDay = lastDayOfMonth(year, month);

  const cycles: number[] = [];
  if (day === 15) cycles.push(15);
  if (day === 30 || (day === lastDay && lastDay < 30)) cycles.push(30);
  if (cycles.length === 0) return { skipped: true as const, reason: "not-a-rollover-day", cycles, created: 0 };

  // 15'inde başlayan dönem o ayın dönemidir (15 Ekim → "10/2026"); Ekim dönemini önceden ödeyenlerin
  // kaydı zaten vardır ve skipDuplicates sayesinde "Ödendi" olarak korunur.
  const nextMonth = month;
  const nextYear = year;
  const amount = await getMonthlyFee();

  return prisma.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${ROLLOVER_LOCK_KEY}) AS locked`;
    if (!locked) return { skipped: true as const, reason: "locked", cycles, created: 0 };

    // Askıdaki öğrencilere yeni dönem borcu açılmaz (aktif edildiklerinde reactivateStudent tamamlar).
    const students = await tx.student.findMany({
      where: { status: "ACTIVE", paymentDueDay: { in: cycles } },
      select: { id: true, paymentDueDay: true },
    });

    // Her öğrencinin yeni satırı, en son ödediği tutarla açılır (yoksa genel aidat).
    const lastPaid = await lastPaidAmountMap(tx, students.map((s) => s.id));
    const amountFor = (studentId: string) => lastPaid.get(studentId) ?? amount;

    // 1) Biten dönemin anlık görüntüsü: o dönem için hiç satırı olmayan öğrenciye "Ödenmedi" satırı yazılır.
    //    Mevcut satırlar (Ödendi/Ödenmedi) zaten biten dönemin kalıcı durumudur ve olduğu gibi kalır —
    //    böylece ödemeyen öğrenci "Ödenmeyen Aylar" geçmişinden asla düşmez.
    const endedMonth = month === 1 ? 12 : month - 1;
    const endedYear = month === 1 ? year - 1 : year;
    const { count: snapshotCreated } = await tx.payment.createMany({
      data: students.map((s) => ({
        studentId: s.id,
        periodYear: endedYear,
        periodMonth: endedMonth,
        dueDay: s.paymentDueDay,
        dueDate: computeDueDate(endedYear, endedMonth, s.paymentDueDay),
        amount: amountFor(s.id),
      })),
      skipDuplicates: true,
    });

    // 2) Yeni dönem: herkes için "Ödenmedi" (zaten var olan kayıt ezilmez).
    const { count } = await tx.payment.createMany({
      data: students.map((s) => ({
        studentId: s.id,
        periodYear: nextYear,
        periodMonth: nextMonth,
        dueDay: s.paymentDueDay,
        dueDate: computeDueDate(nextYear, nextMonth, s.paymentDueDay),
        amount: amountFor(s.id),
      })),
      skipDuplicates: true,
    });

    return {
      skipped: false as const,
      cycles,
      term: { year: nextYear, month: nextMonth },
      studentsProcessed: students.length,
      snapshotCreated,
      created: count,
    };
  });
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
    .then(async (rows) => {
      const balances = await getStudentBalances([...new Set(rows.map((r) => r.studentId))]);
      return rows.map((p) => {
        const { tcNoEncrypted, tcNoHash, ...restStudent } = p.student;
        const balance = balances.get(p.studentId) ?? { unpaidMonths: [], pendingMonths: [], totalDueAmount: 0, isEarlyPaid: false };
        return {
          ...p,
          ...balance,
          student: {
            ...restStudent,
            fullName: stripSeedTag(p.student.fullName),
            tcNoMasked: maskTc(decryptTc(tcNoEncrypted)),
          },
        };
      });
    });
}

/**
 * Öğrenci başına birikmiş borç özeti — dönem filtresinden bağımsız. Dönem 15'inden 15'ine (veya
 * 30'undan 30'una) sürer: "Eylül" = 15 Eylül–15 Ekim. Bir dönem ancak BİTTİKTEN sonra "ödenmeyen ay"
 * sayılır (Ekim dönemi 15 Kasım'da); içinde bulunulan dönem yalnızca satır durumunda "Ödenmedi" görünür.
 * - unpaidMonths: dönemi bitmiş ve hâlâ ödenmemiş aylar (eskiden yeniye) — "Ödenmeyen Aylar" rozeti
 * - pendingMonths: güncel dönem dahil tüm "Ödenmedi" dönemler — "Ödendi" penceresindeki tahsilat listesi
 * - totalDueAmount: pendingMonths tutar toplamı
 * - isEarlyPaid: vadesi henüz gelmemiş bir dönem zaten "Ödendi" (peşin ödeme)
 */
type BalanceMonth = { paymentId: string; month: number; year: number; label: string; amount: number; dueDate: Date };

async function getStudentBalances(studentIds: string[]) {
  const result = new Map<string, { unpaidMonths: BalanceMonth[]; pendingMonths: BalanceMonth[]; totalDueAmount: number; isEarlyPaid: boolean }>();
  if (studentIds.length === 0) return result;

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [unpaid, earlyPaid] = await Promise.all([
    prisma.payment.findMany({
      where: { studentId: { in: studentIds }, status: "odenmedi" },
      orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
      select: { id: true, studentId: true, periodMonth: true, periodYear: true, dueDay: true, amount: true, dueDate: true },
    }),
    prisma.payment.findMany({
      where: { studentId: { in: studentIds }, status: "odendi", dueDate: { gt: startOfToday } },
      select: { studentId: true },
      distinct: ["studentId"],
    }),
  ]);

  for (const id of studentIds) result.set(id, { unpaidMonths: [], pendingMonths: [], totalDueAmount: 0, isEarlyPaid: false });
  for (const u of unpaid) {
    const entry = result.get(u.studentId)!;
    const amount = Number(u.amount);
    const item: BalanceMonth = {
      paymentId: u.id,
      month: u.periodMonth,
      year: u.periodYear,
      label: `${TURKISH_MONTHS[u.periodMonth - 1]} ${u.periodYear}`,
      amount,
      dueDate: u.dueDate,
    };
    entry.pendingMonths.push(item);
    entry.totalDueAmount += amount;
    if (startOfToday >= periodEndDate(u.periodYear, u.periodMonth, u.dueDay)) entry.unpaidMonths.push(item);
  }
  for (const e of earlyPaid) result.get(e.studentId)!.isEarlyPaid = true;
  return result;
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
    const adminName = await resolveAdminName(tx, confirmedByUserId, confirmedByUsername);
    return applyPaid(tx, payment, amount, confirmedByUserId, adminName, `${payment.periodMonth}/${payment.periodYear} dönemi aidat tahsilatı`);
  });
}

/**
 * Birden fazla dönemi (birikmiş borç) tek transaction'da "Ödendi" yapar: ya hepsi uygulanır ya hiçbiri.
 * Her dönem için yönetici tarafından girilen tutar kullanılır (öğrenciye özel fiyat/indirim olabilir);
 * her dönemin gelir kaydı ve logu kendi tutarıyla yazılır. Statü koşullu update, eşzamanlı çift
 * tıklamayı/isteği engeller.
 */
export async function settlePayments(params: {
  items: { paymentId: string; amount: number; note?: string }[];
  /** Verilirse "Geçmiş Ödeme Al" modu: yalnızca bu öğrencinin bitmiş dönemleri, "Geçmiş Ay Tahsilatı - …" açıklamasıyla. */
  historicalStudentId?: string;
  branchId: string;
  confirm: boolean;
  adminId: string;
  adminUsername?: string;
}) {
  if (!params.confirm) throw new ValidationError("Ödeme onayı için çift onay (confirm) gereklidir");
  if (params.items.length === 0) throw new ValidationError("En az bir dönem seçilmelidir");
  const amounts = new Map(params.items.map((i) => [i.paymentId, i.amount]));
  const notes = new Map(params.items.map((i) => [i.paymentId, i.note?.trim() || undefined]));
  if (amounts.size !== params.items.length) throw new ValidationError("Aynı dönem birden fazla kez gönderilemez");
  if (params.items.some((i) => !(i.amount > 0))) throw new ValidationError("Ödeme tutarı 0'dan büyük olmalıdır");
  const ids = [...amounts.keys()];

  const payments = await prisma.payment.findMany({ where: { id: { in: ids } }, include: { student: true } });
  if (payments.length !== ids.length) throw new NotFoundError("Ödeme kaydı bulunamadı");
  if (payments.some((p) => p.student.branchId !== params.branchId)) throw new ForbiddenError("Bu ödeme farklı bir şubeye ait");
  if (new Set(payments.map((p) => p.studentId)).size > 1) throw new ValidationError("Seçilen dönemler aynı öğrenciye ait olmalıdır");
  if (payments.some((p) => p.status === "odendi")) throw new ConflictError("Seçilen dönemlerden biri zaten ödenmiş olarak işaretli");

  if (params.historicalStudentId) {
    // "Geçmiş Ödeme Al" yolu: yalnızca belirtilen öğrencinin, dönemi BİTMİŞ aylarını tahsil eder.
    if (payments.some((p) => p.studentId !== params.historicalStudentId)) throw new NotFoundError("Ödeme kaydı bulunamadı");
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (payments.some((p) => startOfToday < periodEndDate(p.periodYear, p.periodMonth, p.dueDay))) {
      throw new ValidationError("Yalnızca dönemi bitmiş geçmiş aylar bu yolla tahsil edilebilir");
    }
  }

  return prisma.$transaction(async (tx) => {
    const adminName = await resolveAdminName(tx, params.adminId, params.adminUsername);
    const ordered = [...payments].sort((a, b) => a.periodYear - b.periodYear || a.periodMonth - b.periodMonth);
    const results = [];
    for (const payment of ordered) {
      const note = notes.get(payment.id);
      const suffix = note ? ` — Not: ${note}` : "";
      const description = params.historicalStudentId
        ? `Geçmiş Ay Tahsilatı - ${stripSeedTag(payment.student.fullName)} (${TURKISH_MONTHS[payment.periodMonth - 1]} ${payment.periodYear})${suffix}`
        : `${payment.periodMonth}/${payment.periodYear} dönemi aidat tahsilatı${suffix}`;
      results.push(await applyPaid(tx, payment, amounts.get(payment.id)!, params.adminId, adminName, description));
    }
    return { settled: results.length, totalAmount: results.reduce((s, r) => s + Number(r.amount), 0), payments: results };
  });
}

/** Tek dönemi "Ödendi" yapar + gelir kaydı + log yazar. Çağıran transaction içinde olmalıdır. */
async function applyPaid(
  tx: TxClient,
  payment: { id: string; studentId: string; periodMonth: number; periodYear: number },
  amount: number,
  adminId: string,
  adminName: string,
  description: string
) {
  // Statü koşullu update: eşzamanlı iki istekten yalnızca biri geçer.
  const { count } = await tx.payment.updateMany({
    where: { id: payment.id, status: "odenmedi" },
    data: { status: "odendi", paidAt: new Date(), confirmedBy: adminId, amount },
  });
  if (count === 0) throw new ConflictError("Bu dönem zaten ödenmiş olarak işaretli");

  await tx.financeTransaction.create({
    data: {
      type: "gelir",
      // İşlem tarihi (transactionDate) varsayılan olarak "şimdi"dir: geçmiş bir dönemin tahsilatı da
      // bugünün tarihiyle Finans/Net Kasa'ya yazılır.
      description,
      amount,
      studentId: payment.studentId,
      paymentId: payment.id,
      createdBy: adminId,
    },
  });

  await tx.studentPaymentLog.create({
    data: {
      studentId: payment.studentId,
      paymentId: payment.id,
      adminId,
      adminName,
      actionType: "PAID",
      amount,
    },
  });

  return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
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
