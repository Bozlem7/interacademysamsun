import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/config/prisma";
import { createAdmin, createBranch, createGroup, generateTc } from "./helpers/fixtures";

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

async function adminToken(branchId: string, branchCode: string) {
  const { username, password } = await createAdmin();
  const res = await request(app).post("/api/auth/admin-login").send({ username, password, branchCode });
  return res.body.token as string;
}

describe("Form Validasyonları ve Sınır Değer Testleri", () => {
  test("5 yaşından küçük doğum yılıyla öğrenci kaydı reddedilir", async () => {
    const branch = await createBranch("AgeRejectBranch");
    const token = await adminToken(branch.id, branch.code);

    const tooYoungYear = new Date().getFullYear() - 4; // yaş = 4 < 5
    const res = await request(app)
      .post("/api/students")
      .set("Authorization", `Bearer ${token}`)
      .send({
        branchId: branch.id,
        fullName: "Çok Küçük Sporcu",
        tcNo: generateTc(),
        dob: `${tooYoungYear}-01-01`,
        paymentDueDay: 15,
      });

    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body.error)).toContain("Sporcu yaşı en az 5 olmalıdır");
  });

  test("tam 5 yaşındaki bir doğum yılı sorunsuz kabul edilir", async () => {
    const branch = await createBranch("AgeAcceptBranch");
    const token = await adminToken(branch.id, branch.code);

    const exactlyFiveYear = new Date().getFullYear() - 5; // yaş = 5 >= 5
    const res = await request(app)
      .post("/api/students")
      .set("Authorization", `Bearer ${token}`)
      .send({
        branchId: branch.id,
        fullName: "Tam Beş Yaşında Sporcu",
        tcNo: generateTc(),
        dob: `${exactlyFiveYear}-01-01`,
        paymentDueDay: 15,
      });

    expect(res.status).toBe(201);
    expect(res.body.fullName).toBe("Tam Beş Yaşında Sporcu");
  });

  test("aynı isimle (case-insensitive) aynı şubede tekrar grup oluşturma reddedilir", async () => {
    const branch = await createBranch("DupGroupBranch");
    const token = await adminToken(branch.id, branch.code);
    await createGroup(branch.id, "U-11 Gelişim");

    const res = await request(app)
      .post("/api/groups")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "u-11 gelişim" }); // farklı harf büyüklüğü

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain("Bu grup adı zaten mevcut");
  });

  test("farklı şubelerde aynı grup adı serbestçe kullanılabilir (branch-scoped uniqueness)", async () => {
    const branchA = await createBranch("SameNameA");
    const branchB = await createBranch("SameNameB");
    await createGroup(branchA.id, "U-12");
    const tokenB = await adminToken(branchB.id, branchB.code);

    const res = await request(app)
      .post("/api/groups")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "U-12" });

    expect(res.status).toBe(201);
  });

  test("ön kayıtta da 5 yaş altı doğum tarihi reddedilir", async () => {
    const branch = await createBranch("PreRegAgeBranch");
    const tooYoungYear = new Date().getFullYear() - 3;

    const res = await request(app)
      .post("/api/pre-registrations")
      .send({
        fullName: "Küçük Aday",
        tcNo: generateTc(),
        parentName: "Veli Adayı",
        phone: "05551112233",
        dob: `${tooYoungYear}-01-01`,
        branchCode: branch.code,
      });

    expect(res.status).toBe(422);
  });
});
