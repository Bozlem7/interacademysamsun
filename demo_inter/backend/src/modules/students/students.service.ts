import crypto from "node:crypto";
import { prisma } from "../../config/prisma";
import { encryptTc, hashTc, maskTc, decryptTc } from "../../common/security/tc";
import { hashPassword } from "../../common/security/password";
import { ConflictError, NotFoundError } from "../../common/errors/AppError";
import * as repo from "./students.repository";
import { StudentInput, StudentUpdateInput } from "./students.dto";
import { generatePaymentForNewStudent } from "../payments/payments.service";
import { stripSeedTag } from "../../common/text/displayName";

/** Bir nesnedeki (ve varsa iç içe geçmiş ilişkilerdeki) şifre hash'i / TC alanlarını temizler. */
function stripSecrets(value: any): any {
  if (Array.isArray(value)) return value.map(stripSecrets);
  // constructor === Object guard'ı olmadan Date/Buffer/Decimal gibi sınıf örnekleri de
  // "object" sayılıp destructure edilir — bu da onları kendi enumerable property'si olmayan
  // boş {} nesnesine çevirir (ör. dob/createdAt alanları bozulur). Sadece düz obje literalleri
  // (Prisma'nın ilişki sonuçları) ve tanıdık plain-object şeklindeki alanlar için özyinelenir.
  if (value && typeof value === "object" && value.constructor === Object) {
    const { passwordHash, tcNoEncrypted, tcNoHash, ...rest } = value;
    for (const key of Object.keys(rest)) rest[key] = stripSecrets(rest[key]);
    return rest;
  }
  return value;
}

// Defense-in-depth: repository sorgusu ileride bir ilişki eklerse bile o ilişkideki
// passwordHash/tcNoEncrypted/tcNoHash asla yanıta sızmasın diye tüm nesne ağacı taranıp
// temizleniyor — sadece öğrencinin kendi TC alanı burada ayrıca maskeli haliyle (tcNoMasked)
// geri ekleniyor.
function toPublicStudent(student: any) {
  const tcNoMasked = maskTc(decryptTc(student.tcNoEncrypted));
  const rest = stripSecrets(student); // öğrencinin kendi tcNoEncrypted/tcNoHash alanları da burada temizlenir
  return {
    ...rest,
    fullName: stripSeedTag(rest.fullName),
    tcNoMasked,
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

export async function updateStudent(id: string, input: StudentUpdateInput) {
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
