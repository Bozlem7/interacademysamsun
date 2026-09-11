import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";

export const contentRouter = Router();

contentRouter.get("/blocks", async (_req, res) => {
  res.json(await prisma.siteContentBlock.findMany({ orderBy: { sortOrder: "asc" } }));
});

contentRouter.get("/slides", async (_req, res) => {
  res.json(await prisma.heroSlide.findMany({ orderBy: { sortOrder: "asc" } }));
});

contentRouter.use(requireAuth, requireRole("yonetici"));

const blockSchema = z.object({
  blockKey: z.string().min(1),
  contentType: z.enum(["text", "image"]),
  value: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

contentRouter.put("/blocks/:key", validateBody(blockSchema.partial()), async (req, res) => {
  const row = await prisma.siteContentBlock.upsert({
    where: { blockKey: req.params.key },
    create: { blockKey: req.params.key, contentType: req.body.contentType ?? "text", value: req.body.value, updatedBy: req.auth!.sub },
    update: { ...req.body, updatedBy: req.auth!.sub },
  });
  res.json(row);
});

const slideCreateSchema = z.object({
  imageUrl: z.string().min(1),
  title: z.string().optional(),
  body: z.string().optional(),
});

const slideUpdateSchema = slideCreateSchema.extend({ sortOrder: z.number().int().optional() }).partial();

// Yeni slayt her zaman bir INSERT'tür (mevcut satırların üzerine asla yazılmaz) ve
// display_order otomatik olarak mevcut en büyük değerin +1'i yapılır — istemcinin
// gönderdiği bir sıralama değerine güvenilmez, sıralama mantığı burada, sunucuda kurulur.
contentRouter.post("/slides", validateBody(slideCreateSchema), async (req, res) => {
  const last = await prisma.heroSlide.findFirst({ orderBy: { sortOrder: "desc" } });
  const sortOrder = (last?.sortOrder ?? 0) + 1;
  res.status(201).json(await prisma.heroSlide.create({ data: { ...req.body, sortOrder } }));
});

contentRouter.put("/slides/:id", validateBody(slideUpdateSchema), async (req, res) => {
  res.json(await prisma.heroSlide.update({ where: { id: req.params.id }, data: req.body }));
});

contentRouter.delete("/slides/:id", async (req, res) => {
  await prisma.heroSlide.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
