import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { hashPassword } from "../../common/security/password";
import { encryptTc, hashTc, tcNoSchema } from "../../common/security/tc";
import { ConflictError, ForbiddenError, NotFoundError } from "../../common/errors/AppError";

export const staffRouter = Router();

staffRouter.use(requireAuth, requireRole("yonetici"));

staffRouter.get("/", async (req, res) => {
  const staff = await prisma.user.findMany({
    where: { role: "egitmen", staffProfile: { branchId: req.auth!.branchId } },
    include: { staffProfile: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    staff.map((s) => ({
      id: s.id,
      username: s.username,
      isActive: s.isActive,
      fullName: s.staffProfile?.fullName,
      phone: s.staffProfile?.phone,
      specialty: s.staffProfile?.specialty,
      metaNote: s.staffProfile?.metaNote,
    }))
  );
});

function usernameFromName(fullName: string) {
  return fullName
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z]/g, "");
}

const staffSchema = z.object({
  fullName: z.string().min(2),
  tcNo: tcNoSchema,
  phone: z.string().optional(),
  specialty: z.enum(["antrenor", "diyetisyen", "psikolog"]),
  metaNote: z.string().optional(),
  branchId: z.string().uuid("Şube seçimi zorunludur"),
});

staffRouter.post("/", validateBody(staffSchema), async (req, res) => {
  const { fullName, tcNo, phone, specialty, metaNote, branchId } = req.body;
  const username = usernameFromName(fullName);

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw new ConflictError("Bu ad-soyad ile bir kullanıcı adı zaten mevcut");

  const tcHash = hashTc(tcNo);
  const dupTc = await prisma.staffProfile.findUnique({ where: { tcNoHash: tcHash } });
  if (dupTc) throw new ConflictError("Bu TC kimlik numarasıyla kayıtlı bir eğitmen zaten var");

  const passwordHash = await hashPassword(tcNo);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: "egitmen",
      staffProfile: {
        create: { fullName, phone, specialty, metaNote, branchId, tcNoEncrypted: encryptTc(tcNo), tcNoHash: tcHash },
      },
    },
    include: { staffProfile: true },
  });

  res.status(201).json({
    id: user.id,
    username: user.username,
    fullName: user.staffProfile?.fullName,
    specialty: user.staffProfile?.specialty,
  });
});

const staffUpdateSchema = staffSchema.partial().omit({ tcNo: true });

staffRouter.put("/:id", validateBody(staffUpdateSchema), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { staffProfile: true } });
  if (!user || !user.staffProfile) throw new NotFoundError("Personel bulunamadı");
  if (user.staffProfile.branchId !== req.auth!.branchId) throw new ForbiddenError("Bu personel farklı bir şubeye ait");

  await prisma.staffProfile.update({
    where: { userId: user.id },
    data: req.body,
  });
  res.json({ ok: true });
});

staffRouter.delete("/:id", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { staffProfile: true } });
  if (!user) throw new NotFoundError("Personel bulunamadı");
  if (user.staffProfile && user.staffProfile.branchId !== req.auth!.branchId) {
    throw new ForbiddenError("Bu personel farklı bir şubeye ait");
  }
  await prisma.user.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
