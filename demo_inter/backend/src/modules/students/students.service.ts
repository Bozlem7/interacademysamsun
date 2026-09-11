import crypto from "node:crypto";
import { prisma } from "../../config/prisma";
import { encryptTc, hashTc, maskTc, decryptTc } from "../../common/security/tc";
import { hashPassword } from "../../common/security/password";
import { ConflictError, NotFoundError } from "../../common/errors/AppError";
import * as repo from "./students.repository";
import { StudentInput } from "./students.dto";
import { generatePaymentForNewStudent } from "../payments/payments.service";
import { stripSeedTag } from "../../common/text/displayName";

function toPublicStudent(student: any) {
  const { tcNoEncrypted, tcNoHash, ...rest } = student;
  return {
    ...rest,
    fullName: stripSeedTag(rest.fullName),
    tcNoMasked: maskTc(decryptTc(tcNoEncrypted)),
  };
}

export async function listStudents(branchId: string, search?: string, groupId?: string) {
  const rows = await repo.listStudents({ branchId, search, groupId });
  return rows.map(toPublicStudent);
}

export async function getStudent(id: string) {
  const student = await repo.findStudentById(id);
  if (!student) throw new NotFoundError("Öğrenci bulunamadı");
  return toPublicStudent(student);
}

async function createParentAccount(fullName: string, tcNo: string) {
  const handle = `veli_${crypto.randomBytes(6).toString("hex")}`;
  const passwordHash = await hashPassword(tcNo);
  return prisma.user.create({
    data: { username: handle, passwordHash, role: "veli" },
  });
}

const DUPLICATE_TC_MESSAGE = "Bu T.C. Kimlik Numarası ile kayıtlı bir öğrenci zaten bulunmaktadır!";

export async function tcExists(tcNo: string, excludeStudentId?: string): Promise<boolean> {
  const existing = await prisma.student.findUnique({ where: { tcNoHash: hashTc(tcNo) } });
  return !!existing && existing.id !== excludeStudentId;
}

export async function createStudent(input: StudentInput, reviewerUserId?: string) {
  const tcHash = hashTc(input.tcNo);
  const existing = await prisma.student.findUnique({ where: { tcNoHash: tcHash } });
  if (existing) throw new ConflictError(DUPLICATE_TC_MESSAGE);

  const parentUser = await createParentAccount(input.fullName, input.tcNo);

  const student = await repo.createStudent({
    fullName: input.fullName,
    tcNoEncrypted: encryptTc(input.tcNo),
    tcNoHash: tcHash,
    dob: input.dob,
    gender: input.gender,
    bloodType: input.bloodType,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    email: input.email || undefined,
    address: input.address,
    photoUrl: input.photoUrl,
    motherName: input.motherName,
    motherPhone: input.motherPhone,
    motherJob: input.motherJob,
    fatherName: input.fatherName,
    fatherPhone: input.fatherPhone,
    fatherJob: input.fatherJob,
    emergencyName: input.emergencyName,
    emergencyPhone: input.emergencyPhone,
    notifyMother: input.notifyMother,
    notifyFather: input.notifyFather,
    notifyGuardian: input.notifyGuardian,
    paymentDueDay: input.paymentDueDay,
    group: input.groupId ? { connect: { id: input.groupId } } : undefined,
    parentUser: { connect: { id: parentUser.id } },
    branch: { connect: { id: input.branchId } },
  });

  await generatePaymentForNewStudent(student.id);

  if (input.preRegistrationId) {
    await prisma.preRegistration.update({
      where: { id: input.preRegistrationId },
      data: {
        status: "onaylandi",
        reviewedAt: new Date(),
        reviewedBy: reviewerUserId,
        convertedStudentId: student.id,
      },
    });
  }

  return toPublicStudent(student);
}

export async function updateStudent(id: string, input: Partial<StudentInput>) {
  const existing = await repo.findStudentById(id);
  if (!existing) throw new NotFoundError("Öğrenci bulunamadı");

  const data: any = { ...input };
  delete data.tcNo;
  delete data.groupId;
  delete data.branchId;

  if (input.tcNo) {
    const duplicate = await tcExists(input.tcNo, id);
    if (duplicate) throw new ConflictError(DUPLICATE_TC_MESSAGE);
    data.tcNoEncrypted = encryptTc(input.tcNo);
    data.tcNoHash = hashTc(input.tcNo);
  }
  if (input.groupId !== undefined) {
    data.group = input.groupId ? { connect: { id: input.groupId } } : { disconnect: true };
  }
  if (input.branchId) {
    data.branch = { connect: { id: input.branchId } };
  }
  if (input.email === "") data.email = null;

  const updated = await repo.updateStudent(id, data);
  return toPublicStudent(updated);
}

export async function deleteStudent(id: string) {
  const existing = await repo.findStudentById(id);
  if (!existing) throw new NotFoundError("Öğrenci bulunamadı");
  await repo.deleteStudent(id);
}

export { isStudentAssignedToInstructor } from "./students.repository";
