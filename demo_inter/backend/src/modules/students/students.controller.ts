import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { ForbiddenError, ValidationError } from "../../common/errors/AppError";
import { studentInputSchema, studentUpdateSchema } from "./students.dto";
import * as service from "./students.service";
import { uploadRegistrationDocuments, deleteRegistrationDocuments } from "./studentDocuments.service";

export const studentsRouter = Router();

const ALLOWED_DOCUMENT_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);
const documentsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }, // 10MB/dosya, en fazla 5 dosya
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_DOCUMENT_MIME.has(file.mimetype)) {
      cb(new ValidationError("Sadece JPG, PNG görsel veya PDF yükleyebilirsiniz"));
      return;
    }
    cb(null, true);
  },
});

studentsRouter.use(requireAuth);

// yonetici: full CRUD + list, scoped to the active session branch. egitmen/veli: single-record
// read with ownership + branch checks handled in route.
studentsRouter.get("/", requireRole("yonetici"), async (req, res) => {
  const { search, groupId } = req.query as { search?: string; groupId?: string };
  res.json(await service.listStudents(req.auth!.branchId, search, groupId));
});

// Form üzerinde TCKN girildiğinde (submit'ten önce) canlı mükerrerlik kontrolü için.
studentsRouter.get("/check-tc/:tcNo", requireRole("yonetici"), async (req, res) => {
  const excludeStudentId = typeof req.query.excludeStudentId === "string" ? req.query.excludeStudentId : undefined;
  res.json({ exists: await service.tcExists(req.params.tcNo, excludeStudentId) });
});

studentsRouter.get("/:id", async (req, res) => {
  const { role, sub, studentId, branchId } = req.auth!;
  if (role === "egitmen") {
    const assigned = await service.isStudentAssignedToInstructor(req.params.id, sub);
    if (!assigned) throw new ForbiddenError("Bu öğrenci size atanmamış");
  } else if (role === "veli") {
    if (studentId !== req.params.id) throw new ForbiddenError("Sadece kendi öğrencinizi görüntüleyebilirsiniz");
  }
  const student = await service.getStudent(req.params.id);
  if (role !== "veli" && student.branchId !== branchId) {
    throw new ForbiddenError("Bu öğrenci farklı bir şubeye ait");
  }
  res.json(student);
});

studentsRouter.post("/", requireRole("yonetici"), validateBody(studentInputSchema), async (req, res) => {
  res.status(201).json(await service.createStudent(req.body, req.auth!.sub));
});

studentsRouter.put("/:id", requireRole("yonetici"), validateBody(studentUpdateSchema), async (req, res) => {
  const existing = await service.getStudent(req.params.id);
  if (existing.branchId !== req.auth!.branchId) throw new ForbiddenError("Bu öğrenci farklı bir şubeye ait");
  res.json(await service.updateStudent(req.params.id, req.body));
});

studentsRouter.delete("/:id", requireRole("yonetici"), async (req, res) => {
  const existing = await service.getStudent(req.params.id);
  if (existing.branchId !== req.auth!.branchId) throw new ForbiddenError("Bu öğrenci farklı bir şubeye ait");
  await service.deleteStudent(req.params.id);
  res.status(204).send();
});

// Kesin kayıt evrakları: 1-5 taranmış görsel ve/veya bir PDF alır, tek bir "Kayıt Bilgileri
// PDF"i olarak birleştirip öğrenci profiline bağlar.
studentsRouter.post(
  "/:id/upload-documents",
  requireRole("yonetici"),
  documentsUpload.array("files", 5),
  async (req, res) => {
    const existing = await service.getStudent(req.params.id);
    if (existing.branchId !== req.auth!.branchId) throw new ForbiddenError("Bu öğrenci farklı bir şubeye ait");

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const result = await uploadRegistrationDocuments(
      req.params.id,
      files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype }))
    );
    res.status(201).json(result);
  }
);

// Kayıt evrakını (birleştirilmiş PDF) diskten ve öğrenci profilinden kalıcı olarak kaldırır.
studentsRouter.delete("/:id/documents", requireRole("yonetici"), async (req, res) => {
  const existing = await service.getStudent(req.params.id);
  if (existing.branchId !== req.auth!.branchId) throw new ForbiddenError("Bu öğrenci farklı bir şubeye ait");
  await deleteRegistrationDocuments(req.params.id);
  res.status(204).send();
});
