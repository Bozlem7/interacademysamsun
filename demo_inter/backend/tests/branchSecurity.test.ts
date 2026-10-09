import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/config/prisma";
import { createAdmin, generateTc, createBranch, createGroup, createInstructor, createStudent } from "./helpers/fixtures";

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Bayi / Şube Güvenliği ve Yetkilendirme", () => {
  test("yanlış şubeden eğitmen girişi 403 + doğru mesajla reddedilir", async () => {
    const branchA = await createBranch("BranchA");
    const branchB = await createBranch("BranchB");
    const { username, tcNo } = await createInstructor(branchA.id);

    const res = await request(app)
      .post("/api/auth/staff-login")
      .send({ username, password: tcNo, branchCode: branchB.code });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Yanlış bayiden giriş yapmaya çalışıyorsunuz.");
  });

  test("doğru şubeden eğitmen girişi başarılı olur ve token'a branchId yazılır", async () => {
    const branch = await createBranch("BranchCorrect");
    const { username, tcNo } = await createInstructor(branch.id);

    const res = await request(app)
      .post("/api/auth/staff-login")
      .send({ username, password: tcNo, branchCode: branch.code });

    expect(res.status).toBe(200);
    expect(res.body.branch.id).toBe(branch.id);
    expect(res.body.token).toBeTruthy();
  });

  test("veli yanlış şubeden giriş yapmaya çalışırsa 403 döner", async () => {
    const branchA = await createBranch("ParentBranchA");
    const branchB = await createBranch("ParentBranchB");
    const { tcNo } = await createStudent(branchA.id);

    const res = await request(app)
      .post("/api/auth/parent-login")
      .send({ tcNo, branchCode: branchB.code });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Yanlış bayiden giriş yapmaya çalışıyorsunuz.");
  });

  test("admin her iki şubeden de giriş yapabilir ve veriler tam olarak o şubeyle sınırlıdır", async () => {
    const branchA = await createBranch("IsoA");
    const branchB = await createBranch("IsoB");
    const { username, password } = await createAdmin();

    const groupA = await createGroup(branchA.id, "IsoGroupA");
    const groupB = await createGroup(branchB.id, "IsoGroupB");
    const { student: studentA } = await createStudent(branchA.id, { groupId: groupA.id, fullName: "Ayşe IsoA" });
    const { student: studentB } = await createStudent(branchB.id, { groupId: groupB.id, fullName: "Mehmet IsoB" });

    const loginA = await request(app).post("/api/auth/admin-login").send({ username, password, branchCode: branchA.code });
    expect(loginA.status).toBe(200);
    const tokenA = loginA.body.token;

    const studentsResA = await request(app).get("/api/students").set("Authorization", `Bearer ${tokenA}`);
    const idsA = studentsResA.body.map((s: any) => s.id);
    expect(idsA).toContain(studentA.id);
    expect(idsA).not.toContain(studentB.id);

    const groupsResA = await request(app).get("/api/groups").set("Authorization", `Bearer ${tokenA}`);
    const groupIdsA = groupsResA.body.map((g: any) => g.id);
    expect(groupIdsA).toContain(groupA.id);
    expect(groupIdsA).not.toContain(groupB.id);

    // Aynı admin şimdi Vezirköprü(B) benzeri branchB'den giriş yapıyor.
    const loginB = await request(app).post("/api/auth/admin-login").send({ username, password, branchCode: branchB.code });
    expect(loginB.status).toBe(200);
    const tokenB = loginB.body.token;

    const studentsResB = await request(app).get("/api/students").set("Authorization", `Bearer ${tokenB}`);
    const idsB = studentsResB.body.map((s: any) => s.id);
    expect(idsB).toContain(studentB.id);
    expect(idsB).not.toContain(studentA.id);

    const groupsResB = await request(app).get("/api/groups").set("Authorization", `Bearer ${tokenB}`);
    const groupIdsB = groupsResB.body.map((g: any) => g.id);
    expect(groupIdsB).toContain(groupB.id);
    expect(groupIdsB).not.toContain(groupA.id);
  });

  test("admin, aktif oturum şubesinde olmayan bir öğrencinin detayına ID bilse dahi erişemez (403)", async () => {
    const branchA = await createBranch("CrossA");
    const branchB = await createBranch("CrossB");
    const { username, password } = await createAdmin();
    const { student: studentB } = await createStudent(branchB.id);

    const loginA = await request(app).post("/api/auth/admin-login").send({ username, password, branchCode: branchA.code });
    const tokenA = loginA.body.token;

    const res = await request(app).get(`/api/students/${studentB.id}`).set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
  });

  test("diyetisyen ortak havuza yazılır; her iki şubenin personel listesinde görünür, antrenör yalnızca kendi şubesinde", async () => {
    const branchA = await createBranch("PoolA");
    const branchB = await createBranch("PoolB");
    const { username, password } = await createAdmin();
    const trainerA = await createInstructor(branchA.id, "Antrenor PoolA");

    const loginA = await request(app).post("/api/auth/admin-login").send({ username, password, branchCode: branchA.code });
    const tokenA = loginA.body.token;
    const loginB = await request(app).post("/api/auth/admin-login").send({ username, password, branchCode: branchB.code });
    const tokenB = loginB.body.token;

    const created = await request(app)
      .post("/api/staff")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ fullName: `Diyetisyen Pool${Date.now()}`, tcNo: generateTc(), specialty: "diyetisyen" });
    expect(created.status).toBe(201);
    expect(created.body.scope).toBe("SHARED");
    const profile = await prisma.staffProfile.findFirst({ where: { userId: created.body.id } });
    expect(profile?.branchId).toBeNull();

    const listA = (await request(app).get("/api/staff").set("Authorization", `Bearer ${tokenA}`)).body.map((x: any) => x.id);
    const listB = (await request(app).get("/api/staff").set("Authorization", `Bearer ${tokenB}`)).body.map((x: any) => x.id);
    expect(listA).toContain(created.body.id);
    expect(listB).toContain(created.body.id);
    expect(listA).toContain(trainerA.user.id);
    expect(listB).not.toContain(trainerA.user.id);
  });

  test("antrenman şubeye özeldir: başka şubenin grubuna ekleme 403, başka şubenin antrenmanını silme 404, listede izolasyon", async () => {
    const branchA = await createBranch("SessA");
    const branchB = await createBranch("SessB");
    const { username, password } = await createAdmin();
    const groupA = await createGroup(branchA.id);
    const groupB = await createGroup(branchB.id);
    const sessionB = await prisma.trainingSession.create({
      data: { groupId: groupB.id, dayOfWeek: 1, startTime: new Date("1970-01-01T17:00:00.000Z"), sessionType: "saha" },
    });

    const login = await request(app).post("/api/auth/admin-login").send({ username, password, branchCode: branchA.code });
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const cross = await request(app).post("/api/schedule").set(auth).send({ groupId: groupB.id, dayOfWeek: 2, startTime: "18:00", sessionType: "saha" });
    expect(cross.status).toBe(403);

    const own = await request(app).post("/api/schedule").set(auth).send({ groupId: groupA.id, dayOfWeek: 2, startTime: "18:00", sessionType: "saha" });
    expect(own.status).toBe(201);

    const del = await request(app).delete(`/api/schedule/${sessionB.id}`).set(auth);
    expect(del.status).toBe(404);

    const mine = (await request(app).get("/api/schedule/mine").set(auth)).body.map((x: any) => x.id);
    expect(mine).toContain(own.body.id);
    expect(mine).not.toContain(sessionB.id);
  });
});
