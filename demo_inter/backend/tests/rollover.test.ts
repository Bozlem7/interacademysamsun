import { prisma } from "../src/config/prisma";
import { listPayments, rolloverBillingCycle, settlePayments } from "../src/modules/payments/payments.service";
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
