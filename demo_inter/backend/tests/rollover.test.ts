import { prisma } from "../src/config/prisma";
import { cyclePeriodContaining, listPayments, rolloverBillingCycle, settlePayments } from "../src/modules/payments/payments.service";
import { getFinanceSummary } from "../src/modules/finance/finance.service";
import { createAdmin, createBranch, createStudent } from "./helpers/fixtures";

// Baileys ESM paketi Jest'in CommonJS ortamında yüklenemiyor; bu testler gerçek WhatsApp
// oturumuna ihtiyaç duymuyor.
jest.mock("../services/whatsappClient", () => ({
  getState: () => ({ status: "DISCONNECTED" }),
  getWhatsAppClient: () => null,
  initWhatsApp: jest.fn(),
  onStateChange: jest.fn(),
  offStateChange: jest.fn(),
  onDiagnostic: jest.fn(),
  offDiagnostic: jest.fn(),
  requestReconnect: jest.fn(),
  logoutSession: jest.fn(),
}));

// 12:00 UTC = 15:00 TR — gün sınırından uzak, Istanbul takvim günüyle UTC günü aynı.
const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

async function studentWithDay(branchId: string, day: 15 | 30, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  const { student } = await createStudent(branchId);
  return prisma.student.update({ where: { id: student.id }, data: { paymentDueDay: day, status, ...(status === "SUSPENDED" ? { suspendedAt: new Date() } : {}) } });
}

describe("rolloverBillingCycle", () => {
  test("ayın 15'i: yalnızca ödeme günü 15 olanlara 'Ödenmedi' açar, peşin 'Ödendi' kaydı ezilmez", async () => {
    const branch = await createBranch("RolloverBranch15");
    const missing = await studentWithDay(branch.id, 15);
    const prepaid = await studentWithDay(branch.id, 15);
    const day30 = await studentWithDay(branch.id, 30);
    const suspended = await studentWithDay(branch.id, 15, "SUSPENDED");

    await prisma.payment.create({
      data: { studentId: prepaid.id, periodYear: 2099, periodMonth: 3, dueDay: 15, dueDate: new Date(Date.UTC(2099, 2, 15)), amount: 6500, status: "odendi", paidAt: new Date() },
    });

    const res = await rolloverBillingCycle(at(2099, 3, 15));
    expect(res.skipped).toBe(false);

    const rows = await prisma.payment.findMany({ where: { periodYear: 2099, periodMonth: 3, studentId: { in: [missing.id, prepaid.id, day30.id, suspended.id] } } });
    const byStudent = new Map(rows.map((r) => [r.studentId, r]));
    expect(byStudent.get(missing.id)?.status).toBe("odenmedi");
    expect(byStudent.get(missing.id)?.dueDate.toISOString().slice(0, 10)).toBe("2099-03-15");
    expect(byStudent.get(prepaid.id)?.status).toBe("odendi");
    expect(Number(byStudent.get(prepaid.id)?.amount)).toBe(6500);
    expect(byStudent.has(day30.id)).toBe(false);
    expect(byStudent.has(suspended.id)).toBe(false);
  });

  test("tekrar / eşzamanlı çalıştırma çift kayıt üretmez", async () => {
    const branch = await createBranch("RolloverBranchRace");
    const s = await studentWithDay(branch.id, 15);

    await Promise.all([rolloverBillingCycle(at(2099, 4, 15)), rolloverBillingCycle(at(2099, 4, 15)), rolloverBillingCycle(at(2099, 4, 15))]);
    await rolloverBillingCycle(at(2099, 4, 15));

    expect(await prisma.payment.count({ where: { studentId: s.id, periodYear: 2099, periodMonth: 4 } })).toBe(1);
  });

  test("ayın 30'u: ödeme günü 30 olanlara açar; 15 olanlara dokunmaz", async () => {
    const branch = await createBranch("RolloverBranch30");
    const d30 = await studentWithDay(branch.id, 30);
    const d15 = await studentWithDay(branch.id, 15);

    await rolloverBillingCycle(at(2099, 6, 30));

    expect(await prisma.payment.count({ where: { studentId: d30.id, periodYear: 2099, periodMonth: 6, status: "odenmedi" } })).toBe(1);
    expect(await prisma.payment.count({ where: { studentId: d15.id, periodYear: 2099, periodMonth: 6 } })).toBe(0);
  });

  test("Şubat'ta (28 gün) ödeme günü 30 olanlar ayın son günü devreder, vade son güne kırpılır", async () => {
    const branch = await createBranch("RolloverBranchFeb");
    const d30 = await studentWithDay(branch.id, 30);

    const res = await rolloverBillingCycle(at(2099, 2, 28));
    expect(res.skipped).toBe(false);

    const row = await prisma.payment.findFirstOrThrow({ where: { studentId: d30.id, periodYear: 2099, periodMonth: 2 } });
    expect(row.status).toBe("odenmedi");
    expect(row.dueDate.toISOString().slice(0, 10)).toBe("2099-02-28");
  });

  test("devir günü olmayan günlerde (ör. 31'i, 14'ü) hiçbir şey yapmaz", async () => {
    const branch = await createBranch("RolloverBranchSkip");
    const s30 = await studentWithDay(branch.id, 30);
    const s15 = await studentWithDay(branch.id, 15);

    for (const d of [at(2099, 7, 31), at(2099, 7, 14), at(2099, 7, 1)]) {
      const res = await rolloverBillingCycle(d);
      expect(res.skipped).toBe(true);
    }
    expect(await prisma.payment.count({ where: { studentId: { in: [s30.id, s15.id] }, periodYear: 2099, periodMonth: 7 } })).toBe(0);
  });

  test("Türkiye saatine göre gün: 14'ünün 21:00 UTC'si = 15'inin 00:00 TR → devir çalışır", async () => {
    const branch = await createBranch("RolloverBranchTz");
    const s = await studentWithDay(branch.id, 15);

    const res = await rolloverBillingCycle(new Date(Date.UTC(2099, 8, 14, 21, 0, 0)));
    expect(res.skipped).toBe(false);
    expect(await prisma.payment.count({ where: { studentId: s.id, periodYear: 2099, periodMonth: 9 } })).toBe(1);
  });
});

describe("cyclePeriodContaining (15'inden 15'ine dönem)", () => {
  test("ödeme günü 15: 15 Eylül – 14 Ekim arası her an 'Eylül' dönemidir", () => {
    for (const d of [at(2026, 9, 15), at(2026, 9, 30), at(2026, 10, 1), at(2026, 10, 14)]) {
      expect(cyclePeriodContaining(d, 15)).toEqual({ year: 2026, month: 9 });
    }
    expect(cyclePeriodContaining(at(2026, 10, 15), 15)).toEqual({ year: 2026, month: 10 });
  });

  test("Türkiye gece yarısı sınırı: 15 Ekim 00:00 TR (14 Ekim 21:00 UTC) yeni dönemdir, 23:59 TR eski dönemdir", () => {
    expect(cyclePeriodContaining(new Date(Date.UTC(2026, 9, 14, 21, 0, 0)), 15)).toEqual({ year: 2026, month: 10 });
    expect(cyclePeriodContaining(new Date(Date.UTC(2026, 9, 14, 20, 59, 59)), 15)).toEqual({ year: 2026, month: 9 });
  });

  test("yıl başı: 5 Ocak ödeme günü 15 → önceki yılın Aralık dönemi", () => {
    expect(cyclePeriodContaining(at(2027, 1, 5), 15)).toEqual({ year: 2026, month: 12 });
  });

  test("ödeme günü 30: 30 Eylül – 29 Ekim arası 'Eylül'; Şubat'ta ödeme günü son güne kırpılır", () => {
    expect(cyclePeriodContaining(at(2026, 10, 29), 30)).toEqual({ year: 2026, month: 9 });
    expect(cyclePeriodContaining(at(2026, 10, 30), 30)).toEqual({ year: 2026, month: 10 });
    expect(cyclePeriodContaining(at(2099, 2, 28), 30)).toEqual({ year: 2099, month: 2 });
    expect(cyclePeriodContaining(at(2099, 2, 27), 30)).toEqual({ year: 2099, month: 1 });
  });
});

describe("devirde biten dönemin anlık görüntüsü (snapshot)", () => {
  test("biten döneme ait satırı olmayan öğrenciye 'Ödenmedi' yazılır; mevcut Ödendi/Ödenmedi kayıtlar aynen kalır", async () => {
    const branch = await createBranch("SnapshotBranch");
    const noRow = await studentWithDay(branch.id, 15);
    const paid = await studentWithDay(branch.id, 15);
    const unpaid = await studentWithDay(branch.id, 15);
    const d = (m: number) => new Date(Date.UTC(2097, m - 1, 15));
    await prisma.payment.create({ data: { studentId: paid.id, periodYear: 2097, periodMonth: 8, dueDay: 15, dueDate: d(8), amount: 6500, status: "odendi", paidAt: new Date() } });
    await prisma.payment.create({ data: { studentId: unpaid.id, periodYear: 2097, periodMonth: 8, dueDay: 15, dueDate: d(8), amount: 3500 } });

    // 15 Eylül 2097 devri: biten dönem Ağustos, yeni dönem Eylül.
    await rolloverBillingCycle(at(2097, 9, 15));

    const get = (id: string, m: number) => prisma.payment.findUnique({ where: { studentId_periodYear_periodMonth: { studentId: id, periodYear: 2097, periodMonth: m } } });
    expect((await get(noRow.id, 8))?.status).toBe("odenmedi"); // snapshot ile eklendi
    expect((await get(paid.id, 8))?.status).toBe("odendi");
    expect(Number((await get(paid.id, 8))?.amount)).toBe(6500);
    expect((await get(unpaid.id, 8))?.status).toBe("odenmedi");
    for (const s of [noRow, paid, unpaid]) expect((await get(s.id, 9))?.status).toBe("odenmedi"); // yeni dönem herkeste Ödenmedi

    // Snapshot ile eklenen Ağustos satırı öğrencinin borç listesinde (tahsilat penceresi) görünür.
    const rows = await listPayments({ branchId: branch.id, studentId: noRow.id });
    expect(rows[0].pendingMonths.map((m) => m.label)).toContain("Ağustos 2097");
  });
});

describe("geçmiş ay tahsilatı → Finans", () => {
  test("not ile tahsil edilen geçmiş ay bugünün tarihiyle gelire yazılır, Net Kasa'ya yansır, listeden düşer", async () => {
    const branch = await createBranch("SettleFinanceBranch");
    const { user } = await createAdmin();
    const student = await studentWithDay(branch.id, 15);
    const sep = await prisma.payment.create({ data: { studentId: student.id, periodYear: 2025, periodMonth: 9, dueDay: 15, dueDate: new Date(Date.UTC(2025, 8, 15)), amount: 3500 } });

    const before = await getFinanceSummary({});
    const t0 = Date.now();
    await settlePayments({ items: [{ paymentId: sep.id, amount: 5200, note: "Elden alındı" }], branchId: branch.id, confirm: true, adminId: user.id, adminUsername: "muhammet" });
    const after = await getFinanceSummary({});

    expect(after.netBalance - before.netBalance).toBe(5200);
    const income = await prisma.financeTransaction.findFirstOrThrow({ where: { paymentId: sep.id, isDeleted: false } });
    expect(income.createdBy).toBe(user.id);
    expect(income.description).toContain("9/2025");
    expect(income.description).toContain("Elden alındı");
    expect(Math.abs(income.transactionDate.getTime() - t0)).toBeLessThan(60_000); // geçmiş dönem de BUGÜNÜN tarihiyle yazılır
    expect(await prisma.studentPaymentLog.count({ where: { paymentId: sep.id, actionType: "PAID" } })).toBe(1);

    const rows = await listPayments({ branchId: branch.id, studentId: student.id });
    expect(rows[0].unpaidMonths).toEqual([]);
    expect(rows[0].pendingMonths).toEqual([]);
  });
});

describe("Geçmiş Ödeme Al (settle-historical-payments)", () => {
  const past = (m: number) => ({ periodYear: 2025, periodMonth: m, dueDay: 15, dueDate: new Date(Date.UTC(2025, m - 1, 15)), amount: 3500 });

  test("seçilen geçmiş aylar ay bazlı tutarlarla tek işlemde ödenir; açıklama 'Geçmiş Ay Tahsilatı - Ad (Ay Yıl)' olur; Net Kasa artar", async () => {
    const branch = await createBranch("HistBranch");
    const { user } = await createAdmin();
    const student = await studentWithDay(branch.id, 15);
    await prisma.student.update({ where: { id: student.id }, data: { fullName: "Hist Öğrenci" } });
    const sep = await prisma.payment.create({ data: { studentId: student.id, ...past(9) } });
    const oct = await prisma.payment.create({ data: { studentId: student.id, ...past(10) } });

    const before = await getFinanceSummary({});
    const res = await settlePayments({
      items: [{ paymentId: sep.id, amount: 3500 }, { paymentId: oct.id, amount: 2000, note: "indirimli" }],
      historicalStudentId: student.id,
      branchId: branch.id,
      confirm: true,
      adminId: user.id,
      adminUsername: "muhammet",
    });
    expect(res.settled).toBe(2);
    expect((await getFinanceSummary({})).netBalance - before.netBalance).toBe(5500);

    const incomes = await prisma.financeTransaction.findMany({ where: { studentId: student.id, isDeleted: false }, orderBy: { amount: "desc" } });
    expect(incomes.map((i) => i.description)).toEqual([
      "Geçmiş Ay Tahsilatı - Hist Öğrenci (Eylül 2025)",
      "Geçmiş Ay Tahsilatı - Hist Öğrenci (Ekim 2025) — Not: indirimli",
    ]);
    expect(incomes.every((i) => i.createdBy === user.id)).toBe(true);
    expect(await prisma.studentPaymentLog.count({ where: { studentId: student.id, actionType: "PAID" } })).toBe(2);

    const rows = await listPayments({ branchId: branch.id, studentId: student.id });
    expect(rows[0].unpaidMonths).toEqual([]);
  });

  test("henüz bitmemiş (güncel/gelecek) dönem ve başka öğrencinin kaydı bu yolla tahsil edilemez; hiçbir şey yazılmaz", async () => {
    const branch = await createBranch("HistGuardBranch");
    const { user } = await createAdmin();
    const a = await studentWithDay(branch.id, 15);
    const b = await studentWithDay(branch.id, 15);
    const current = await prisma.payment.create({ data: { studentId: a.id, periodYear: 2098, periodMonth: 10, dueDay: 15, dueDate: new Date(Date.UTC(2098, 9, 15)), amount: 3500 } });
    const bPast = await prisma.payment.create({ data: { studentId: b.id, ...past(9) } });
    const aPast = await prisma.payment.create({ data: { studentId: a.id, ...past(9) } });

    const base = { branchId: branch.id, confirm: true as const, adminId: user.id };
    await expect(settlePayments({ ...base, historicalStudentId: a.id, items: [{ paymentId: current.id, amount: 3500 }] })).rejects.toThrow();
    await expect(settlePayments({ ...base, historicalStudentId: a.id, items: [{ paymentId: bPast.id, amount: 3500 }] })).rejects.toThrow();
    // Geçerli bir ay + geçersiz ay birlikte gönderilirse hiçbiri uygulanmaz (atomik).
    await expect(
      settlePayments({ ...base, historicalStudentId: a.id, items: [{ paymentId: aPast.id, amount: 3500 }, { paymentId: current.id, amount: 3500 }] })
    ).rejects.toThrow();

    expect((await prisma.payment.findUniqueOrThrow({ where: { id: aPast.id } })).status).toBe("odenmedi");
    expect(await prisma.financeTransaction.count({ where: { studentId: { in: [a.id, b.id] } } })).toBe(0);
  });
});

describe("birikmiş borç + toplu tahsilat", () => {
  // Geçmiş dönemler (2025): Eylül dönemi 15 Ekim 2025'te, Ekim dönemi 15 Kasım 2025'te bitmiştir.
  async function seedTwoUnpaid(branchId: string) {
    const student = await studentWithDay(branchId, 15);
    const sep = await prisma.payment.create({ data: { studentId: student.id, periodYear: 2025, periodMonth: 9, dueDay: 15, dueDate: new Date(Date.UTC(2025, 8, 15)), amount: 3500 } });
    const oct = await prisma.payment.create({ data: { studentId: student.id, periodYear: 2025, periodMonth: 10, dueDay: 15, dueDate: new Date(Date.UTC(2025, 9, 15)), amount: 3500 } });
    return { student, sep, oct };
  }

  test("listPayments ödenmeyen ayları Türkçe adlarıyla ve eskiden yeniye döndürür", async () => {
    const branch = await createBranch("DebtBranch");
    const { student } = await seedTwoUnpaid(branch.id);

    const rows = await listPayments({ branchId: branch.id, studentId: student.id });
    expect(rows.length).toBe(2);
    expect(rows[0].unpaidMonths.map((m) => m.label)).toEqual(["Eylül 2025", "Ekim 2025"]);
    expect(rows[0].pendingMonths.length).toBe(2);
    expect(rows[0].totalDueAmount).toBe(7000);
    expect(rows[0].isEarlyPaid).toBe(false);
  });

  test("içinde bulunulan (bitmemiş) dönem 'ödenmeyen ay' sayılmaz ama tahsilat listesinde (pendingMonths) yer alır", async () => {
    const branch = await createBranch("CurrentPeriodBranch");
    const student = await studentWithDay(branch.id, 15);
    // Gelecekteki bir dönem = henüz bitmemiş güncel dönem gibi davranır.
    await prisma.payment.create({ data: { studentId: student.id, periodYear: 2098, periodMonth: 10, dueDay: 15, dueDate: new Date(Date.UTC(2098, 9, 15)), amount: 3500 } });
    await prisma.payment.create({ data: { studentId: student.id, periodYear: 2025, periodMonth: 9, dueDay: 15, dueDate: new Date(Date.UTC(2025, 8, 15)), amount: 3500 } });

    const rows = await listPayments({ branchId: branch.id, studentId: student.id });
    expect(rows[0].unpaidMonths.map((m) => m.label)).toEqual(["Eylül 2025"]);
    expect(rows[0].pendingMonths.map((m) => m.label)).toEqual(["Eylül 2025", "Ekim 2098"]);
  });

  test("peşin ödenmiş gelecek dönem isEarlyPaid=true yapar", async () => {
    const branch = await createBranch("EarlyBranch");
    const student = await studentWithDay(branch.id, 15);
    await prisma.payment.create({ data: { studentId: student.id, periodYear: 2099, periodMonth: 12, dueDay: 15, dueDate: new Date(Date.UTC(2099, 11, 15)), status: "odendi", paidAt: new Date() } });

    const rows = await listPayments({ branchId: branch.id, studentId: student.id });
    expect(rows[0].isEarlyPaid).toBe(true);
    expect(rows[0].unpaidMonths).toEqual([]);
  });

  test("settlePayments her ayı kendi tutarıyla tek transaction'da öder (gelir + log)", async () => {
    const branch = await createBranch("SettleBranch");
    const { user } = await createAdmin();
    const { student, sep, oct } = await seedTwoUnpaid(branch.id);

    const res = await settlePayments({
      items: [{ paymentId: sep.id, amount: 3000 }, { paymentId: oct.id, amount: 4200 }],
      branchId: branch.id,
      confirm: true,
      adminId: user.id,
      adminUsername: "test-admin",
    });
    expect(res.settled).toBe(2);
    expect(res.totalAmount).toBe(7200);

    const after = await prisma.payment.findMany({ where: { studentId: student.id }, orderBy: { periodMonth: "asc" } });
    expect(after.map((p) => [p.status, Number(p.amount)])).toEqual([["odendi", 3000], ["odendi", 4200]]);
    const income = await prisma.financeTransaction.findMany({ where: { studentId: student.id, isDeleted: false } });
    expect(income.map((i) => Number(i.amount)).sort()).toEqual([3000, 4200]);
    expect(await prisma.studentPaymentLog.count({ where: { studentId: student.id, actionType: "PAID" } })).toBe(2);
  });

  test("seçimden biri zaten ödenmişse hiçbiri uygulanmaz (atomik)", async () => {
    const branch = await createBranch("SettleAtomicBranch");
    const { user } = await createAdmin();
    const { student, sep, oct } = await seedTwoUnpaid(branch.id);
    await prisma.payment.update({ where: { id: oct.id }, data: { status: "odendi", paidAt: new Date() } });

    await expect(
      settlePayments({ items: [{ paymentId: sep.id, amount: 3500 }, { paymentId: oct.id, amount: 3500 }], branchId: branch.id, confirm: true, adminId: user.id })
    ).rejects.toThrow();

    expect((await prisma.payment.findUniqueOrThrow({ where: { id: sep.id } })).status).toBe("odenmedi");
    expect(await prisma.financeTransaction.count({ where: { studentId: student.id } })).toBe(0);
  });

  test("farklı şubenin ödemesi ve geçersiz tutar reddedilir", async () => {
    const branch = await createBranch("SettleBranchA");
    const other = await createBranch("SettleBranchB");
    const { user } = await createAdmin();
    const { sep } = await seedTwoUnpaid(branch.id);

    await expect(settlePayments({ items: [{ paymentId: sep.id, amount: 3500 }], branchId: other.id, confirm: true, adminId: user.id })).rejects.toThrow();
    await expect(settlePayments({ items: [{ paymentId: sep.id, amount: 0 }], branchId: branch.id, confirm: true, adminId: user.id })).rejects.toThrow();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: sep.id } })).status).toBe("odenmedi");
  });
});
