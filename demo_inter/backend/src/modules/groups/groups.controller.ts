import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { ConflictError, ForbiddenError, NotFoundError } from "../../common/errors/AppError";

export const groupsRouter = Router();

groupsRouter.use(requireAuth);

// yonetici ve egitmen (diyetisyen/psikolog dahil) yalnızca aktif oturum şubesinin
// gruplarını görür — hangi şubenin girişinden (branchCode) oturum açıldıysa grup listesi
// o şubeyle sınırlıdır, iki şubenin sınıfları asla karışmaz. egitmen, o şubedeki TÜM
// grupları görür — yoklama alacağı sınıfı seçebilmesi için gruba atanmış öğrencisi
// olması şartı aranmaz.
groupsRouter.get("/", async (req, res) => {
  const { branchId } = req.auth!;
  const groups = await prisma.group.findMany({ where: { branchId }, orderBy: { name: "asc" } });
  res.json(groups.map((g) => ({ id: g.id, name: g.name, ageRange: g.ageRange, branchId: g.branchId })));
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

/** Grubu yükler ve aktif şubeye ait olduğunu doğrular (başka şubenin ID'si 403 döner). */
async function loadOwnGroup(id: string, branchId: string) {
  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) throw new NotFoundError("Grup bulunamadı");
  if (group.branchId !== branchId) throw new ForbiddenError("Bu grup farklı bir şubeye ait");
  return group;
}

// Silme ön kontrolü: UI, onay penceresinin türünü (standart / kritik uyarı) buna göre seçer.
// Askıdaki öğrenciler de gruba bağlı olduğundan sayıma dahildir (status filtresi yok).
groupsRouter.get("/:id/delete-preview", requireRole("yonetici"), async (req, res) => {
  const group = await loadOwnGroup(req.params.id, req.auth!.branchId);
  const [studentCount, sessionCount] = await Promise.all([
    prisma.student.count({ where: { groupId: group.id } }),
    prisma.trainingSession.count({ where: { groupId: group.id } }),
  ]);
  res.json({ id: group.id, name: group.name, studentCount, sessionCount });
});

// Öğrenci varken silme yalnızca ?force=true ile yapılır — UI'ı atlayan istemciler de
// kazara toplu "boşa çıkarma" yapamaz. Öğrenciler ASLA silinmez; group_id = NULL olur.
// Grubun antrenman programı (TrainingSession) şema gereği grupla birlikte silinir.
groupsRouter.delete("/:id", requireRole("yonetici"), async (req, res) => {
  const force = req.query.force === "true";
  const group = await loadOwnGroup(req.params.id, req.auth!.branchId);

  // Sayım, boşa çıkarma ve silme tek transaction'da: aradan yeni öğrenci eklenirse
  // (yarış durumu) sayım yine aynı işlemin içinde güncel okunur; hata olursa hepsi geri alınır.
  const released = await prisma.$transaction(async (tx) => {
    const studentCount = await tx.student.count({ where: { groupId: group.id } });
    if (studentCount > 0 && !force) {
      throw new ConflictError(
        `Bu grupta kayıtlı ${studentCount} adet öğrenci bulunmaktadır. Silmek için onay gereklidir.`
      );
    }
    const { count } = await tx.student.updateMany({ where: { groupId: group.id }, data: { groupId: null } });
    await tx.group.delete({ where: { id: group.id } });
    return count;
  });

  res.json({ ok: true, releasedStudents: released });
});
