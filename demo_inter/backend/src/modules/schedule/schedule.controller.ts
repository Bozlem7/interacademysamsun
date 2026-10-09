import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { ForbiddenError, NotFoundError } from "../../common/errors/AppError";

export const scheduleRouter = Router();

// Antrenman şubeye özeldir: şube bağı TrainingSession → Group.branchId üzerinden taşınır.
async function assertGroupInBranch(groupId: string, branchId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { branchId: true } });
  if (!group) throw new NotFoundError("Grup bulunamadı");
  if (group.branchId !== branchId) throw new ForbiddenError("Bu grup farklı bir şubeye ait");
}

/** Şube dışı kayıt 404 döner — başka şubedeki ID'lerin varlığı sızmasın. */
async function assertSessionInBranch(id: string, branchId: string) {
  const row = await prisma.trainingSession.findFirst({ where: { id, group: { branchId } }, select: { id: true } });
  if (!row) throw new NotFoundError("Antrenman bulunamadı");
}

// Public read (landing sayfası genel program) — şube sekmeleri için grup üzerinden şube bilgisi de döner.
// ?branchCode=... ile tek şubeye daraltılabilir.
scheduleRouter.get("/", async (req, res) => {
  const branchCode = typeof req.query.branchCode === "string" ? req.query.branchCode : undefined;
  const rows = await prisma.trainingSession.findMany({
    where: branchCode ? { group: { branch: { code: branchCode } } } : undefined,
    include: { group: { include: { branch: true } } },
    orderBy: { dayOfWeek: "asc" },
  });
  res.json(rows);
});

scheduleRouter.use(requireAuth, requireRole("yonetici"));

// Yönetici listesi: yalnızca aktif şubenin antrenmanları.
scheduleRouter.get("/mine", async (req, res) => {
  res.json(
    await prisma.trainingSession.findMany({
      where: { group: { branchId: req.auth!.branchId } },
      include: { group: true },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    })
  );
});

// "HH:MM" gibi salt saat metnini, Prisma'nın @db.Time() alanının beklediği tam ISO
// DateTime'a çevirir — bu dönüşüm olmadan Prisma "17:00" gibi bir string'i reddedip
// 500 atıyordu (kaydet butonu donuyormuş gibi görünen asıl sebep buydu).
const timeField = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Saat HH:MM formatında olmalıdır")
  .transform((t) => new Date(`1970-01-01T${t}:00.000Z`));

const sessionSchema = z.object({
  groupId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeField,
  endTime: timeField.optional(),
  sessionType: z.enum(["saha", "diyet", "psikolog"]),
  location: z.string().optional(),
  description: z.string().optional(),
});

scheduleRouter.post("/", validateBody(sessionSchema), async (req, res) => {
  await assertGroupInBranch(req.body.groupId, req.auth!.branchId);
  res.status(201).json(await prisma.trainingSession.create({ data: req.body as any }));
});

scheduleRouter.put("/:id", validateBody(sessionSchema.partial()), async (req, res) => {
  await assertSessionInBranch(req.params.id, req.auth!.branchId);
  if (req.body.groupId) await assertGroupInBranch(req.body.groupId, req.auth!.branchId);
  res.json(await prisma.trainingSession.update({ where: { id: req.params.id }, data: req.body as any }));
});

scheduleRouter.delete("/:id", async (req, res) => {
  await assertSessionInBranch(req.params.id, req.auth!.branchId);
  await prisma.trainingSession.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
