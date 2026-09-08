import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { NotFoundError, ValidationError } from "../../common/errors/AppError";

// Atama sadece yonetici tarafindan yapilir — egitmen kendine ogrenci talep edemez (onaylanan is kurali).
export const instructorStudentsRouter = Router();

instructorStudentsRouter.use(requireAuth, requireRole("yonetici"));

instructorStudentsRouter.get("/instructor/:instructorUserId", async (req, res) => {
  const rows = await prisma.instructorStudent.findMany({
    where: { instructorUserId: req.params.instructorUserId },
    include: { student: true },
  });
  res.json(rows.map((r) => r.student));
});

const assignSchema = z.object({
  instructorUserId: z.string().uuid(),
  studentId: z.string().uuid(),
});

instructorStudentsRouter.post("/", validateBody(assignSchema), async (req, res) => {
  const instructor = await prisma.user.findUnique({ where: { id: req.body.instructorUserId }, include: { staffProfile: true } });
  if (!instructor || instructor.role !== "egitmen" || !instructor.staffProfile) {
    throw new ValidationError("Belirtilen kullanıcı bir eğitmen değil");
  }
  const student = await prisma.student.findUnique({ where: { id: req.body.studentId } });
  if (!student) throw new NotFoundError("Öğrenci bulunamadı");
  if (student.branchId !== instructor.staffProfile.branchId) {
    throw new ValidationError("Öğrenci ve eğitmen farklı şubelerde — atama yapılamaz");
  }

  const row = await prisma.instructorStudent.upsert({
    where: {
      instructorUserId_studentId: {
        instructorUserId: req.body.instructorUserId,
        studentId: req.body.studentId,
      },
    },
    create: req.body,
    update: {},
  });
  res.status(201).json(row);
});

instructorStudentsRouter.delete("/:instructorUserId/:studentId", async (req, res) => {
  await prisma.instructorStudent.delete({
    where: {
      instructorUserId_studentId: {
        instructorUserId: req.params.instructorUserId,
        studentId: req.params.studentId,
      },
    },
  });
  res.status(204).send();
});
