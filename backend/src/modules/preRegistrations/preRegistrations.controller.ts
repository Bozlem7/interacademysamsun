import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { encryptTc, hashTc, decryptTc, tcNoSchema } from "../../common/security/tc";
import { resolveBranchByCode } from "../branches/branches.service";
import { ForbiddenError, NotFoundError } from "../../common/errors/AppError";

export const preRegistrationsRouter = Router();

const preRegSchema = z.object({
  fullName: z.string().min(2),
  tcNo: tcNoSchema,
  gender: z.enum(["erkek", "kiz"]).optional(),
  // Form alanı zorunlu değil — boş bırakılınca frontend "" gönderir. z.coerce.date() boş
  // string'i doğrudan Invalid Date'e çevirip .optional()'a hiç ulaşmadan reddederdi;
  // preprocess ile önce "" -> undefined'a normalize ediyoruz.
  dob: z
    .preprocess((v) => (v === "" ? undefined : v), z.coerce.date().optional())
    .refine((d) => !d || new Date().getFullYear() - d.getFullYear() >= 5, "Sporcu yaşı en az 5 olmalıdır."),
  ageGroup: z.string().optional(),
  parentName: z.string().min(2),
  phone: z.string().min(6),
  il: z.string().optional(),
  ilce: z.string().optional(),
  branchCode: z.string().min(1, "Şube seçimi zorunludur"),
});

// Public — anonim ziyaretçi, auth gerekmez. Bayi seçimi formda zorunlu (branchCode).
preRegistrationsRouter.post("/", validateBody(preRegSchema), async (req, res) => {
  const { tcNo, branchCode, ...rest } = req.body;
  const branch = await resolveBranchByCode(branchCode);
  const row = await prisma.preRegistration.create({
    data: {
      ...rest,
      branchId: branch.id,
      tcNoEncrypted: encryptTc(tcNo),
      tcNoHash: hashTc(tcNo),
    },
  });
  res.status(201).json({ id: row.id });
});

// Kalan tüm route'lar sadece yonetici — aktif oturum şubesine göre filtrelenir.
preRegistrationsRouter.use(requireAuth, requireRole("yonetici"));

preRegistrationsRouter.get("/", async (req, res) => {
  const status = (req.query.status as string) ?? "beklemede";
  const rows = await prisma.preRegistration.findMany({
    where: { status: status as any, branchId: req.auth!.branchId },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    rows.map(({ tcNoEncrypted, tcNoHash, ...rest }) => rest)
  );
});

// Prefill verisi — TC dahil (yönetici, öğrenci formunu doldururken görmesi gereken tek yer).
preRegistrationsRouter.get("/:id/prefill", async (req, res) => {
  const row = await prisma.preRegistration.findUnique({ where: { id: req.params.id } });
  if (!row) throw new NotFoundError("Ön kayıt bulunamadı");
  if (row.branchId !== req.auth!.branchId) throw new ForbiddenError("Bu ön kayıt farklı bir şubeye ait");
  res.json({
    id: row.id,
    fullName: row.fullName,
    tcNo: decryptTc(row.tcNoEncrypted),
    gender: row.gender,
    dob: row.dob,
    ageGroup: row.ageGroup,
    parentName: row.parentName,
    phone: row.phone,
    il: row.il,
    ilce: row.ilce,
    branchId: row.branchId,
  });
});

preRegistrationsRouter.patch("/:id/reject", async (req, res) => {
  const row = await prisma.preRegistration.findUnique({ where: { id: req.params.id } });
  if (!row) throw new NotFoundError("Ön kayıt bulunamadı");
  if (row.branchId !== req.auth!.branchId) throw new ForbiddenError("Bu ön kayıt farklı bir şubeye ait");
  await prisma.preRegistration.update({
    where: { id: req.params.id },
    data: { status: "reddedildi", reviewedAt: new Date(), reviewedBy: req.auth!.sub },
  });
  res.status(204).send();
});
