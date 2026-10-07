import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateMonthlyPayments } from "../src/modules/payments/payments.service";
import { createAdmin, createBranch, createGroup, createInstructor, createStudent } from "./helpers/fixtures";

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

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

async function adminToken(branchCode: string) {
  const { username, password } = await createAdmin();
  const res = await request(app).post("/api/auth/admin-login").send({ username, password, branchCode });
  return res.body.token as string;
}

async function staffToken(branchId: string, branchCode: string) {
  const { username, tcNo } = await createInstructor(branchId);
  const res = await request(app).post("/api/auth/staff-login").send({ username, password: tcNo, branchCode });
  return res.body.token as string;
}

describe("Öğrenci Askıya Alma", () => {
  test("askıya alma ve aktif etme durum + metadata alanlarını günceller", async () => {
    const branch = await createBranch("SuspendBranch");
    const token = await adminToken(branch.code);
    const { student } = await createStudent(branch.id);

    const suspend = await request(app).patch(`/api/students/${student.id}/suspend`).set("Authorization", `Bearer ${token}`);
    expect(suspend.status).toBe(200);
    expect(suspend.body.status).toBe("SUSPENDED");
    expect(suspend.body.suspendedAt).toBeTruthy();
    expect(suspend.body.suspendedBy).toBeTruthy();

    const again = await request(app).patch(`/api/students/${student.id}/suspend`).set("Authorization", `Bearer ${token}`);
    expect(again.status).toBe(409);

    const suspendedList = await request(app).get("/api/students/suspended").set("Authorization", `Bearer ${token}`);
    expect(suspendedList.body.items.map((s: any) => s.id)).toEqual([student.id]);
    expect(suspendedList.body.total).toBe(1);

    const activeList = await request(app).get("/api/students").set("Authorization", `Bearer ${token}`);
    expect(activeList.body.map((s: any) => s.id)).not.toContain(student.id);
    // Eski "status" parametresiyle de askıdaki öğrenci ana listeye sızmamalı.
    for (const status of ["ALL", "SUSPENDED"]) {
      const res = await request(app).get("/api/students").query({ status }).set("Authorization", `Bearer ${token}`);
      expect(res.body.map((s: any) => s.id)).not.toContain(student.id);
    }

    const reactivate = await request(app).patch(`/api/students/${student.id}/reactivate`).set("Authorization", `Bearer ${token}`);
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.status).toBe("ACTIVE");
    expect(reactivate.body.suspendedAt).toBeNull();
    expect(reactivate.body.suspendedBy).toBeNull();

    const afterReactivate = await request(app).get("/api/students").set("Authorization", `Bearer ${token}`);
    expect(afterReactivate.body.map((s: any) => s.id)).toContain(student.id);
    const suspendedAfter = await request(app).get("/api/students/suspended").set("Authorization", `Bearer ${token}`);
    expect(suspendedAfter.body.total).toBe(0);

    // Aktif etme, içinde bulunulan dönemin aidat kaydını tamamlar.
    const now = new Date();
    const payment = await prisma.payment.findUnique({
      where: {
        studentId_periodYear_periodMonth: { studentId: student.id, periodYear: now.getUTCFullYear(), periodMonth: now.getUTCMonth() + 1 },
      },
    });
    expect(payment).not.toBeNull();
  });

  test("başka şubenin öğrencisi askıya alınamaz", async () => {
    const branch = await createBranch("SuspendOwnBranch");
    const otherBranch = await createBranch("SuspendOtherBranch");
    const token = await adminToken(branch.code);
    const { student } = await createStudent(otherBranch.id);

    const res = await request(app).patch(`/api/students/${student.id}/suspend`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    const after = await prisma.student.findUnique({ where: { id: student.id } });
    expect(after?.status).toBe("ACTIVE");
  });

  test("askıdaki öğrenci yoklama listesinde görünmez ve yoklaması alınamaz", async () => {
    const branch = await createBranch("SuspendAttendanceBranch");
    const group = await createGroup(branch.id);
    const { student: active } = await createStudent(branch.id, { groupId: group.id });
    const { student: suspended } = await createStudent(branch.id, { groupId: group.id });
    await prisma.student.update({ where: { id: suspended.id }, data: { status: "SUSPENDED", suspendedAt: new Date() } });
    const token = await staffToken(branch.id, branch.code);

    const roster = await request(app).get("/api/attendance").query({ groupId: group.id }).set("Authorization", `Bearer ${token}`);
    const ids = roster.body.map((r: any) => r.studentId);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(suspended.id);

    const sessionDate = new Date().toISOString().slice(0, 10);
    const bulk = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${token}`)
      .send({ records: [{ studentId: suspended.id, sessionDate, status: "var" }] });
    expect(bulk.status).toBe(409);
    expect(await prisma.attendanceRecord.count({ where: { studentId: suspended.id } })).toBe(0);
  });

  test("askıdaki öğrenciye not eklenemez", async () => {
    const branch = await createBranch("SuspendNotesBranch");
    const { student } = await createStudent(branch.id);
    await prisma.student.update({ where: { id: student.id }, data: { status: "SUSPENDED", suspendedAt: new Date() } });
    const token = await staffToken(branch.id, branch.code);

    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${token}`)
      .send({ studentId: student.id, periodMonth: 1, periodYear: 2026, body: "Test notu" });
    expect(res.status).toBe(409);
    expect(await prisma.studentNote.count({ where: { studentId: student.id } })).toBe(0);
  });

  test("askıdaki öğrenci yönetici ödeme listesinden ve aylık aidat üretiminden çıkarılır", async () => {
    const branch = await createBranch("SuspendPaymentsBranch");
    const token = await adminToken(branch.code);
    const { student: active } = await createStudent(branch.id);
    const { student: suspended } = await createStudent(branch.id);

    const periodYear = 2099;
    const periodMonth = 1;
    await prisma.payment.create({
      data: { studentId: suspended.id, periodYear: 2098, periodMonth: 12, dueDay: 15, dueDate: new Date(Date.UTC(2098, 11, 15)) },
    });
    await prisma.student.update({ where: { id: suspended.id }, data: { status: "SUSPENDED", suspendedAt: new Date() } });

    await generateMonthlyPayments(new Date(Date.UTC(periodYear, periodMonth - 1, 1)));
    const generated = await prisma.payment.findMany({
      where: { periodYear, periodMonth, studentId: { in: [active.id, suspended.id] } },
    });
    expect(generated.map((p) => p.studentId)).toEqual([active.id]);

    const payments = await request(app).get("/api/payments").set("Authorization", `Bearer ${token}`);
    const studentIds = payments.body.map((p: any) => p.student.id);
    expect(studentIds).toContain(active.id);
    expect(studentIds).not.toContain(suspended.id);
  });
});
