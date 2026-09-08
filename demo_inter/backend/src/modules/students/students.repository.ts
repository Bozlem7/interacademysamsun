import { prisma } from "../../config/prisma";
import { Prisma } from "@prisma/client";

export function listStudents(params: { search?: string; groupId?: string; branchId: string }) {
  const where: Prisma.StudentWhereInput = { branchId: params.branchId };
  if (params.search) where.fullName = { contains: params.search, mode: "insensitive" };
  if (params.groupId) where.groupId = params.groupId;
  return prisma.student.findMany({
    where,
    include: { group: true },
    orderBy: { fullName: "asc" },
  });
}

export function findStudentById(id: string) {
  return prisma.student.findUnique({
    where: { id },
    include: { group: true, instructorStudents: { include: { instructor: { include: { staffProfile: true } } } } },
  });
}

export function isStudentAssignedToInstructor(studentId: string, instructorUserId: string) {
  return prisma.instructorStudent
    .findUnique({ where: { instructorUserId_studentId: { instructorUserId, studentId } } })
    .then((row) => !!row);
}

export function createStudent(data: Prisma.StudentCreateInput) {
  return prisma.student.create({ data });
}

export function updateStudent(id: string, data: Prisma.StudentUpdateInput) {
  return prisma.student.update({ where: { id }, data });
}

export function deleteStudent(id: string) {
  return prisma.student.delete({ where: { id } });
}
