import crypto from "node:crypto";
import { prisma } from "../../src/config/prisma";
import { hashPassword } from "../../src/common/security/password";
import { encryptTc, hashTc } from "../../src/common/security/tc";

export function rand(): string {
  return crypto.randomBytes(4).toString("hex");
}

/** Deterministic-format, checksum-valid Turkish TCKN generator for test fixtures. */
export function generateTc(): string {
  const seed = crypto.randomInt(100000000, 999999999);
  const digits = String(seed).padStart(9, "0").split("").map(Number);
  if (digits[0] === 0) digits[0] = 1;
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  const d10 = (((oddSum * 7 - evenSum) % 10) + 10) % 10;
  const d11 = (oddSum + evenSum + d10) % 10;
  return digits.join("") + d10 + d11;
}

export async function createBranch(label: string) {
  return prisma.branch.create({ data: { name: label, code: `${label.toLowerCase()}-${rand()}` } });
}

export async function createAdmin(password = "Admin_Test_1234") {
  const username = `admin_${rand()}`;
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { username, passwordHash, role: "yonetici" } });
  return { user, username, password };
}

export async function createInstructor(branchId: string, fullName = `Test Eğitmen ${rand()}`) {
  const tcNo = generateTc();
  const username = `staff_${rand()}`;
  const passwordHash = await hashPassword(tcNo);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: "egitmen",
      staffProfile: {
        create: {
          fullName,
          specialty: "antrenor",
          branchId,
          tcNoEncrypted: encryptTc(tcNo),
          tcNoHash: hashTc(tcNo),
        },
      },
    },
    include: { staffProfile: true },
  });
  return { user, username, tcNo };
}

export async function createGroup(branchId: string, name = `Grup ${rand()}`) {
  return prisma.group.create({ data: { branchId, name } });
}

export async function createStudent(branchId: string, opts: { groupId?: string; dobYear?: number; fullName?: string } = {}) {
  const tcNo = generateTc();
  const dobYear = opts.dobYear ?? new Date().getFullYear() - 10;
  const parentPasswordHash = await hashPassword(tcNo);
  const parentUser = await prisma.user.create({
    data: { username: `veli_${rand()}`, passwordHash: parentPasswordHash, role: "veli" },
  });
  const student = await prisma.student.create({
    data: {
      branchId,
      tcNoEncrypted: encryptTc(tcNo),
      tcNoHash: hashTc(tcNo),
      fullName: opts.fullName ?? `Test Öğrenci ${rand()}`,
      dob: new Date(Date.UTC(dobYear, 0, 1)),
      paymentDueDay: 15,
      groupId: opts.groupId,
      parentUserId: parentUser.id,
    },
  });
  return { student, tcNo, parentUser };
}

export async function assignInstructor(instructorUserId: string, studentId: string) {
  return prisma.instructorStudent.upsert({
    where: { instructorUserId_studentId: { instructorUserId, studentId } },
    create: { instructorUserId, studentId },
    update: {},
  });
}
