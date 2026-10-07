import { prisma } from "../../config/prisma";
import { Prisma, StudentStatus } from "@prisma/client";

export function listStudents(params: { search?: string; groupId?: string; branchId: string }) {
  const where: Prisma.StudentWhereInput = { branchId: params.branchId, status: "ACTIVE" };
  if (params.search) where.fullName = { contains: params.search, mode: "insensitive" };
  if (params.groupId) where.groupId = params.groupId;
  // Postgres'in varsayılan collation'ı (genelde "C"/binary) Türkçe harf sırasını (ı, İ, ş,
  // ğ, ö, ü, ç) doğru sıralamaz — bu yüzden bu ORDER BY tek başına kesin doğru alfabetik
  // sırayı garanti etmez, sadece kabaca bir ön sıralama sağlar. Kesin doğru Türkçe sıralama
  // frontend'de `localeCompare(..., 'tr', { sensitivity: 'base' })` ile yapılıyor.
  return prisma.student.findMany({
    where,
    include: { group: true },
    orderBy: { fullName: "asc" },
  });
}

export async function listSuspendedStudents(params: { branchId: string; search?: string; page: number; pageSize: number }) {
  const where: Prisma.StudentWhereInput = { branchId: params.branchId, status: "SUSPENDED" };
  if (params.search) where.fullName = { contains: params.search, mode: "insensitive" };
  const [rows, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: { group: true },
      orderBy: { suspendedAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.student.count({ where }),
  ]);
  return { rows, total };
}

/**
 * Statü koşullu update: eşzamanlı iki istekten yalnızca biri geçer, zaten hedef statüdeki
 * öğrenci için count 0 döner.
 */
export function setStudentStatus(
  id: string,
  from: StudentStatus,
  data: { status: StudentStatus; suspendedAt: Date | null; suspendedBy: string | null }
) {
  return prisma.student.updateMany({ where: { id, status: from }, data });
}

export function findStudentById(id: string) {
  return prisma.student.findUnique({
    where: { id },
    include: { group: true },
  });
}

export function createStudent(data: Prisma.StudentCreateInput) {
  return prisma.student.create({ data });
}

export function updateStudent(id: string, data: Prisma.StudentUpdateInput) {
  // include: group şart — aksi halde yanıt sadece ham groupId döner, ilişkisel { id, name }
  // gelmez ve frontend'deki liste, grup değişse bile eski grup adını göstermeye devam eder.
  return prisma.student.update({ where: { id }, data, include: { group: true } });
}

export function deleteStudent(id: string) {
  return prisma.student.delete({ where: { id } });
}
