import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";

export const scheduleRouter = Router();

// Public read (landing sayfası genel program) — şube sekmeleri için grup üzerinden şube bilgisi de döner.
scheduleRouter.get("/", async (_req, res) => {
  const rows = await prisma.trainingSession.findMany({
    include: { group: { include: { branch: true } } },
    orderBy: { dayOfWeek: "asc" },
  });
  res.json(rows);
});

scheduleRouter.use(requireAuth, requireRole("yonetici"));

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
  res.status(201).json(await prisma.trainingSession.create({ data: req.body as any }));
});

scheduleRouter.put("/:id", validateBody(sessionSchema.partial()), async (req, res) => {
  res.json(await prisma.trainingSession.update({ where: { id: req.params.id }, data: req.body as any }));
});

scheduleRouter.delete("/:id", async (req, res) => {
  await prisma.trainingSession.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
