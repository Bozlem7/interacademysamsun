import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/config/prisma";
import {
  assignInstructor,
  createAdmin,
  createBranch,
  createGroup,
  createInstructor,
  createStudent,
  generateTc,
} from "./helpers/fixtures";

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

async function adminToken(branchCode: string) {
  const { username, password } = await createAdmin();
  const res = await request(app).post("/api/auth/admin-login").send({ username, password, branchCode });
  return res.body.token as string;
}

describe("Öğrenci Grubu Transfer & Atama", () => {
  test("öğrenci eski gruptan düşüp yeni gruba geçer", async () => {
    const branch = await createBranch("TransferBranch");
    const token = await adminToken(branch.code);
    const oldGroup = await createGroup(branch.id, "Eski Grup");
    const newGroup = await createGroup(branch.id, "Yeni Grup");
    const { student } = await createStudent(branch.id, { groupId: oldGroup.id });

    const before = await prisma.student.findUnique({ where: { id: student.id } });
    expect(before?.groupId).toBe(oldGroup.id);

    const res = await request(app)
      .put(`/api/students/${student.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ groupId: newGroup.id });

    expect(res.status).toBe(200);
    expect(res.body.groupId).toBe(newGroup.id);

    const after = await prisma.student.findUnique({ where: { id: student.id } });
    expect(after?.groupId).toBe(newGroup.id);
    expect(after?.groupId).not.toBe(oldGroup.id);
  });
});

describe("Sınıf Bazlı Yoklama & Kayıt Doğruluğu", () => {
  test("eğitmen seçtiği sınıftaki tüm öğrencileri görür (bireysel atama şartı aranmaz)", async () => {
    const branch = await createBranch("AttendanceBranch");
    const group = await createGroup(branch.id, "Yoklama Grubu");
    const { user: instructor, username, tcNo } = await createInstructor(branch.id);
    const { student: assignedStudent } = await createStudent(branch.id, { groupId: group.id, fullName: "Atanmış Öğrenci" });
    const { student: otherStudent } = await createStudent(branch.id, { groupId: group.id, fullName: "Atanmamış Öğrenci" });
    await assignInstructor(instructor.id, assignedStudent.id);
    // otherStudent bu eğitmene bireysel atanmadı, ama aynı sınıfta olduğu için rostere gelmeli.

    const login = await request(app).post("/api/auth/staff-login").send({ username, password: tcNo, branchCode: branch.code });
    const token = login.body.token;

    const roster = await request(app).get("/api/attendance").query({ groupId: group.id }).set("Authorization", `Bearer ${token}`);
    const ids = roster.body.map((r: any) => r.studentId);
    expect(ids).toContain(assignedStudent.id);
    expect(ids).toContain(otherStudent.id);
  });

  test("yoklama işaretlemesi attendance_records tablosuna doğru student_id ve durumla yazılır", async () => {
    const branch = await createBranch("AttendanceWriteBranch");
    const group = await createGroup(branch.id, "Yazma Grubu");
    const { user: instructor, username, tcNo } = await createInstructor(branch.id);
    const { student } = await createStudent(branch.id, { groupId: group.id });
    await assignInstructor(instructor.id, student.id);

    const login = await request(app).post("/api/auth/staff-login").send({ username, password: tcNo, branchCode: branch.code });
    const token = login.body.token;

    const sessionDate = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${token}`)
      .send({ records: [{ studentId: student.id, sessionDate, status: "var" }] });

    expect(res.status).toBe(201);

    const row = await prisma.attendanceRecord.findFirst({ where: { studentId: student.id } });
    expect(row).not.toBeNull();
    expect(row?.studentId).toBe(student.id);
    expect(row?.status).toBe("var");
    expect(row?.markedBy).toBe(instructor.id);
  });

  test("eğitmen kendisine bireysel atanmamış ama aynı şubedeki bir öğrenciyi de yoklamaya işaretleyebilir", async () => {
    const branch = await createBranch("AttendanceForbidBranch");
    const group = await createGroup(branch.id, "Yasak Grup");
    const { username, tcNo } = await createInstructor(branch.id);
    const { student } = await createStudent(branch.id, { groupId: group.id }); // bireysel atanmamış

    const login = await request(app).post("/api/auth/staff-login").send({ username, password: tcNo, branchCode: branch.code });
    const token = login.body.token;

    const res = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${token}`)
      .send({ records: [{ studentId: student.id, sessionDate: new Date().toISOString().slice(0, 10), status: "var" }] });

    expect(res.status).toBe(201);
  });

  test("eğitmen farklı bir şubedeki öğrenciyi yoklamaya işaretleyemez", async () => {
    const branch = await createBranch("AttendanceForbidOtherBranch");
    const otherBranch = await createBranch("AttendanceForbidOtherBranch2");
    const { username, tcNo } = await createInstructor(branch.id);
    const { student } = await createStudent(otherBranch.id, {});

    const login = await request(app).post("/api/auth/staff-login").send({ username, password: tcNo, branchCode: branch.code });
    const token = login.body.token;

    const res = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${token}`)
      .send({ records: [{ studentId: student.id, sessionDate: new Date().toISOString().slice(0, 10), status: "var" }] });

    expect(res.status).toBe(403);
  });
});

describe("Ön Kayıttan Kesin Kayda Geçiş", () => {
  test("onaylanan ön kayıt, prefill uç noktasında girilen tüm verilerle eksiksiz döner", async () => {
    const branch = await createBranch("PreRegFlowBranch");
    const token = await adminToken(branch.code);

    const submitted = {
      fullName: "Ön Kayıt Adayı",
      tcNo: generateTc(),
      gender: "erkek" as const,
      dob: `${new Date().getFullYear() - 9}-05-15`,
      ageGroup: "U-11",
      parentName: "Veli Adayı",
      phone: "05321234567",
      il: "Samsun",
      ilce: "Atakum",
      branchCode: branch.code,
    };

    const createRes = await request(app).post("/api/pre-registrations").send(submitted);
    expect(createRes.status).toBe(201);
    const preRegId = createRes.body.id;

    const prefillRes = await request(app)
      .get(`/api/pre-registrations/${preRegId}/prefill`)
      .set("Authorization", `Bearer ${token}`);

    expect(prefillRes.status).toBe(200);
    expect(prefillRes.body.fullName).toBe(submitted.fullName);
    expect(prefillRes.body.tcNo).toBe(submitted.tcNo);
    expect(prefillRes.body.parentName).toBe(submitted.parentName);
    expect(prefillRes.body.il).toBe(submitted.il);
    expect(prefillRes.body.ilce).toBe(submitted.ilce);
    expect(prefillRes.body.branchId).toBe(branch.id);

    // Yönetici formu bu prefill verisiyle tamamlayıp kaydı kesinleştiriyor.
    const finalizeRes = await request(app)
      .post("/api/students")
      .set("Authorization", `Bearer ${token}`)
      .send({
        branchId: branch.id,
        fullName: prefillRes.body.fullName,
        tcNo: prefillRes.body.tcNo,
        dob: prefillRes.body.dob,
        paymentDueDay: 15,
        preRegistrationId: preRegId,
      });
    expect(finalizeRes.status).toBe(201);

    const updatedPreReg = await prisma.preRegistration.findUnique({ where: { id: preRegId } });
    expect(updatedPreReg?.status).toBe("onaylandi");
    expect(updatedPreReg?.convertedStudentId).toBe(finalizeRes.body.id);
  });
});
