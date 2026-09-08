import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";

export const announcementsRouter = Router();

announcementsRouter.get("/", async (_req, res) => {
  res.json(await prisma.announcement.findMany({ orderBy: { publishDate: "desc" }, take: 20 }));
});

announcementsRouter.use(requireAuth, requireRole("yonetici"));

const announcementSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  publishDate: z.coerce.date().optional(),
});

announcementsRouter.post("/", validateBody(announcementSchema), async (req, res) => {
  res.status(201).json(
    await prisma.announcement.create({ data: { ...req.body, createdBy: req.auth!.sub } })
  );
});

announcementsRouter.delete("/:id", async (req, res) => {
  await prisma.announcement.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
