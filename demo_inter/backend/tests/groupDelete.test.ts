import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/config/prisma";
import { createAdmin, createBranch, createGroup, createStudent } from "./helpers/fixtures";

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

async function loginAdmin(branchCode: string) {
  const { username, password } = await createAdmin();
  const res = await request(app).post("/api/auth/admin-login").send({ username, password, branchCode });
  return { Authorization: `Bearer ${res.body.token}` };
}

describe("Grup silme", () => {
  test("öğrencisiz grup doğrudan silinir (200)", async () => {
    const branch = await createBranch("DelEmpty");
    const auth = await loginAdmin(branch.code);
    const group = await createGroup(branch.id);

    const preview = await request(app).get(`/api/groups/${group.id}/delete-preview`).set(auth);
    expect(preview.status).toBe(200);
    expect(preview.body.studentCount).toBe(0);

    const res = await request(app).delete(`/api/groups/${group.id}`).set(auth);
    expect(res.status).toBe(200);
    expect(await prisma.group.findUnique({ where: { id: group.id } })).toBeNull();
  });

  test("öğrenciliyken force olmadan 409; force=true ile öğrenciler korunur ve group_id NULL olur", async () => {
    const branch = await createBranch("DelStudents");
    const auth = await loginAdmin(branch.code);
    const group = await createGroup(branch.id);
    const { student: a } = await createStudent(branch.id, { groupId: group.id });
    const { student: b } = await createStudent(branch.id, { groupId: group.id });

    const preview = await request(app).get(`/api/groups/${group.id}/delete-preview`).set(auth);
    expect(preview.body.studentCount).toBe(2);

    const blocked = await request(app).delete(`/api/groups/${group.id}`).set(auth);
    expect(blocked.status).toBe(409);
    expect(await prisma.group.findUnique({ where: { id: group.id } })).not.toBeNull();

    const res = await request(app).delete(`/api/groups/${group.id}`).query({ force: "true" }).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.releasedStudents).toBe(2);
    expect(await prisma.group.findUnique({ where: { id: group.id } })).toBeNull();
    const kept = await prisma.student.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(kept).toHaveLength(2);
    expect(kept.every((s) => s.groupId === null)).toBe(true);
  });

  test("başka şubenin grubu 403, olmayan grup 404", async () => {
    const branchA = await createBranch("DelA");
    const branchB = await createBranch("DelB");
    const auth = await loginAdmin(branchA.code);
    const groupB = await createGroup(branchB.id);

    expect((await request(app).delete(`/api/groups/${groupB.id}`).set(auth)).status).toBe(403);
    expect((await request(app).delete("/api/groups/00000000-0000-4000-8000-000000000000").set(auth)).status).toBe(404);
  });
});
