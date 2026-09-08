import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { hashPassword } from "../../common/security/password";
import { encryptTc, hashTc, maskTc, decryptTc, tcNoSchema } from "../../common/security/tc";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../common/errors/AppError";
import { stripSeedTag } from "../../common/text/displayName";

// Admin-only eğitmen detay & düzenleme ekranı — RBAC: yalnızca yonetici.
export const adminInstructorsRouter = Router();

adminInstructorsRouter.use(requireAuth, requireRole("yonetici"));

async function loadInstructor(id: string, branchId: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      staffProfile: true,
      instructorStudents: { include: { student: { select: { id: true, fullName: true } } } },
    },
  });
  if (!user || user.role !== "egitmen" || !user.staffProfile) {
    throw new NotFoundError("Eğitmen bulunamadı");
  }
  if (user.staffProfile.branchId !== branchId) {
    throw new ForbiddenError("Bu eğitmen farklı bir şubeye ait");
  }
  return user;
}

function toDetailResponse(user: Awaited<ReturnType<typeof loadInstructor>>) {
  const sp = user.staffProfile!;
  return {
    id: user.id,
    username: user.username,
    isActive: user.isActive,
    fullName: sp.fullName,
    phone: sp.phone,
    specialty: sp.specialty,
    metaNote: sp.metaNote,
    tcNoMasked: sp.tcNoEncrypted ? maskTc(decryptTc(sp.tcNoEncrypted)) : null,
    assignedStudents: user.instructorStudents.map((is) => ({ ...is.student, fullName: stripSeedTag(is.student.fullName) })),
  };
}

adminInstructorsRouter.get("/:id", async (req, res) => {
  const user = await loadInstructor(req.params.id, req.auth!.branchId);
  res.json(toDetailResponse(user));
});

const updateSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  specialty: z.enum(["antrenor", "diyetisyen", "psikolog"]).optional(),
  metaNote: z.string().optional(),
  isActive: z.boolean().optional(),
  // Boş bırakılırsa (undefined ya da "") mevcut TC/şifre korunur — üzerine yazılmaz.
  tcNo: z.union([tcNoSchema, z.literal("")]).optional(),
  // Verilirse, eğitmenin atandığı öğrenci listesi TAMAMEN bu setle senkronize edilir.
  studentIds: z.array(z.string().uuid()).optional(),
});

adminInstructorsRouter.put("/:id", validateBody(updateSchema), async (req, res) => {
  const user = await loadInstructor(req.params.id, req.auth!.branchId);
  const { fullName, phone, specialty, metaNote, isActive, tcNo, studentIds } = req.body as z.infer<typeof updateSchema>;

  const profileData: Record<string, unknown> = { fullName, phone, specialty, metaNote };
  Object.keys(profileData).forEach((k) => profileData[k] === undefined && delete profileData[k]);

  if (tcNo) {
    const tcHash = hashTc(tcNo);
    const dup = await prisma.staffProfile.findFirst({ where: { tcNoHash: tcHash, NOT: { userId: user.id } } });
    if (dup) throw new ConflictError("Bu TC kimlik numarasıyla kayıtlı başka bir eğitmen var");
    profileData.tcNoEncrypted = encryptTc(tcNo);
    profileData.tcNoHash = tcHash;
  }
  // tcNo boş/undefined ise passwordHash ve TC alanlarına hiç dokunulmuyor — mevcut şifre korunur.

  await prisma.$transaction(async (tx) => {
    if (Object.keys(profileData).length) {
      await tx.staffProfile.update({ where: { userId: user.id }, data: profileData });
    }
    if (isActive !== undefined) {
      await tx.user.update({ where: { id: user.id }, data: { isActive } });
    }
    if (tcNo) {
      const passwordHash = await hashPassword(tcNo);
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    }
    if (studentIds !== undefined) {
      await tx.instructorStudent.deleteMany({
        where: { instructorUserId: user.id, studentId: { notIn: studentIds } },
      });
      for (const studentId of studentIds) {
        const student = await tx.student.findUnique({ where: { id: studentId } });
        if (!student) throw new ValidationError(`Öğrenci bulunamadı: ${studentId}`);
        if (student.branchId !== user.staffProfile!.branchId) {
          throw new ValidationError("Öğrenci ve eğitmen farklı şubelerde — atama yapılamaz");
        }
        await tx.instructorStudent.upsert({
          where: { instructorUserId_studentId: { instructorUserId: user.id, studentId } },
          create: { instructorUserId: user.id, studentId },
          update: {},
        });
      }
    }
  });

  const updated = await loadInstructor(user.id, req.auth!.branchId);
  res.json(toDetailResponse(updated));
});
