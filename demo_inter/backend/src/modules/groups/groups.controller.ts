import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { ConflictError, ForbiddenError, NotFoundError } from "../../common/errors/AppError";

export const groupsRouter = Router();

groupsRouter.use(requireAuth);

// yonetici ve egitmen her ikisi de sadece aktif oturum şubesinin gruplarını görür.
// egitmen, o şubedeki TÜM grupları görür — yoklama alacağı sınıfı seçebilmesi için
// gruba atanmış öğrencisi olması şartı aranmaz.
groupsRouter.get("/", async (req, res) => {
  const { branchId } = req.auth!;
  res.json(await prisma.group.findMany({ where: { branchId }, orderBy: { name: "asc" } }));
});

const groupSchema = z.object({
  name: z.string().min(1),
  ageRange: z.string().optional(),
});

async function assertNameNotTaken(branchId: string, name: string, excludeId?: string) {
  const existing = await prisma.group.findMany({ where: { branchId, name: { equals: name, mode: "insensitive" } } });
  if (existing.some((g) => g.id !== excludeId)) {
    throw new ConflictError("Bu grup adı zaten mevcut! Lütfen farklı bir grup adı giriniz.");
  }
}

groupsRouter.post("/", requireRole("yonetici"), validateBody(groupSchema), async (req, res) => {
  const branchId = req.auth!.branchId;
  await assertNameNotTaken(branchId, req.body.name);
  res.status(201).json(await prisma.group.create({ data: { ...req.body, branchId } }));
});

groupsRouter.put("/:id", requireRole("yonetici"), validateBody(groupSchema.partial()), async (req, res) => {
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) throw new NotFoundError("Grup bulunamadı");
  if (group.branchId !== req.auth!.branchId) throw new ForbiddenError("Bu grup farklı bir şubeye ait");
  if (req.body.name) await assertNameNotTaken(group.branchId, req.body.name, req.params.id);
  res.json(await prisma.group.update({ where: { id: req.params.id }, data: req.body }));
});

groupsRouter.delete("/:id", requireRole("yonetici"), async (req, res) => {
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) throw new NotFoundError("Grup bulunamadı");
  if (group.branchId !== req.auth!.branchId) throw new ForbiddenError("Bu grup farklı bir şubeye ait");
  await prisma.group.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
