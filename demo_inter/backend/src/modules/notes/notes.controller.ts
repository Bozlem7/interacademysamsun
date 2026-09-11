import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { ForbiddenError, NotFoundError, ValidationError } from "../../common/errors/AppError";

export const notesRouter = Router();

notesRouter.use(requireAuth);

const SPECIALTY_TO_CATEGORY: Record<string, string> = {
  antrenor: "antrenor_gorusu",
  diyetisyen: "diyetisyen_gorusu",
  psikolog: "psikolog_gorusu",
};

// Eğitmen, bireysel atama şartı aranmaksızın kendi şubesindeki her öğrencinin
// notlarını görüp not ekleyebilir — yoklamadaki (Bölüm 3) aynı erişim mantığı.
// Diyetisyen/psikolog (isGlobalStaff) şube bağımsız çalıştığından bu kontrol tamamen atlanır.
async function assertSameBranchAsInstructor(studentId: string, instructorBranchId: string, isGlobalStaff?: boolean) {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { branchId: true } });
  if (!student) throw new NotFoundError("Öğrenci bulunamadı");
  if (!isGlobalStaff && student.branchId !== instructorBranchId) throw new ForbiddenError("Bu öğrenci farklı bir şubeye ait");
}

notesRouter.get("/student/:studentId", async (req, res) => {
  const { role, sub, studentId, branchId, isGlobalStaff } = req.auth!;
  if (role === "egitmen") {
    await assertSameBranchAsInstructor(req.params.studentId, branchId, isGlobalStaff);
  } else if (role === "veli" && studentId !== req.params.studentId) {
    throw new ForbiddenError("Sadece kendi öğrencinizin notlarını görebilirsiniz");
  }
  const notes = await prisma.studentNote.findMany({
    where: { studentId: req.params.studentId },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });
  res.json(notes);
});

const noteSchema = z.object({
  studentId: z.string().uuid(),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int(),
  body: z.string().min(1),
});

notesRouter.post("/", requireRole("egitmen"), validateBody(noteSchema), async (req, res) => {
  const { sub, branchId, isGlobalStaff } = req.auth!;
  await assertSameBranchAsInstructor(req.body.studentId, branchId, isGlobalStaff);

  const staffProfile = await prisma.staffProfile.findUnique({ where: { userId: sub } });
  if (!staffProfile) throw new ForbiddenError("Eğitmen profili bulunamadı");

  const category = SPECIALTY_TO_CATEGORY[staffProfile.specialty];
  if (!category) throw new ValidationError("Uzmanlık alanı için not kategorisi tanımlı değil");

  const note = await prisma.studentNote.create({
    data: {
      studentId: req.body.studentId,
      authorId: sub,
      category: category as any,
      periodMonth: req.body.periodMonth,
      periodYear: req.body.periodYear,
      body: req.body.body,
    },
  });
  res.status(201).json(note);
});
