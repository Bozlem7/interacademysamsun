import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth, requireRole, requirePaymentConfirmationAccess } from "../../common/middleware/auth";
import { validateBody } from "../../common/middleware/validate";
import { ForbiddenError, ValidationError } from "../../common/errors/AppError";
import { studentInputSchema, studentUpdateSchema } from "./students.dto";
import * as service from "./students.service";
import { uploadRegistrationDocuments, deleteRegistrationDocuments } from "./studentDocuments.service";
import { generatePaymentReportPdf } from "../payments/paymentReport.service";
import { listPaymentLogs, revertPayment } from "../payments/payments.service";
import { getStudentAttendanceReport } from "../attendance/attendanceReport.service";

export const studentsRouter = Router();

const ALLOWED_DOCUMENT_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);
const ALLOWED_DOCUMENT_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"];
// Bazı işletim sistemi/tarayıcı kombinasyonlarında `mimetype` boş, "application/octet-stream"
// veya "application/x-pdf" gibi standart dışı bir değer olarak gelebiliyor — yalnızca mimetype'a
// bakan kontrol bu durumda geçerli dosyaları reddediyordu (yerelde çalışıp başka bir makineden
// erişimde başarısız olma şikayetinin olası bir nedeni). Dosya adı uzantısını da yedek olarak kabul ediyoruz.
const documentsUpload = multer({
  storage: multer.memoryStorage(),
  // 20MB/dosya, en fazla 5 dosya — telefon kamerasıyla taranan yüksek çözünürlüklü görseller
  // 10MB sınırını rahatça aşabiliyor, bu da başka bir cihazdan yüklemede sessizce 413 ile
  // reddediliyordu (yerelde küçük test dosyalarıyla fark edilmiyordu).
  limits: { fileSize: 20 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const hasAllowedExtension = ALLOWED_DOCUMENT_EXTENSIONS.some((ext) => file.originalname.toLowerCase().endsWith(ext));
    if (!ALLOWED_DOCUMENT_MIME.has(file.mimetype) && !hasAllowedExtension) {
      cb(new ValidationError("Sadece JPG, PNG görsel veya PDF yükleyebilirsiniz"));
      return;
    }
    cb(null, true);
  },
});

studentsRouter.use(requireAuth);

// yonetici: full CRUD + list, scoped to the active session branch. egitmen/veli: single-record
// read with ownership + branch checks handled in route.
// Yalnızca ACTIVE öğrenciler — askıdakiler sadece GET /students/suspended üzerinden listelenir.
studentsRouter.get("/", requireRole("yonetici"), async (req, res) => {
  const { search, groupId } = req.query as { search?: string; groupId?: string };
  res.json(await service.listStudents(req.auth!.branchId, search, groupId));
});

// "Askıya Alınanlar" sekmesi — sayfalı, en son askıya alınan en üstte. `/:id`'den önce tanımlı
// olmalı, yoksa "suspended" bir öğrenci id'si sanılır.
studentsRouter.get("/suspended", requireRole("yonetici"), async (req, res) => {
  const { page, pageSize, search } = req.query as Record<string, string | undefined>;
  res.json(
    await service.listSuspendedStudents({
      branchId: req.auth!.branchId,
      search: search?.trim() || undefined,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 20)),
    })
  );
});

// Form üzerinde TCKN girildiğinde (submit'ten önce) canlı mükerrerlik kontrolü için.
studentsRouter.get("/check-tc/:tcNo", requireRole("yonetici"), async (req, res) => {
  const excludeStudentId = typeof req.query.excludeStudentId === "string" ? req.query.excludeStudentId : undefined;
  res.json({ exists: await service.tcExists(req.params.tcNo, excludeStudentId) });
});

// Ödeme hareketleri ("Ödendi" / "Geri Alındı") — `?limit=5` mini widget için, `?page=&pageSize=`
// tam geçmiş için. `/:id`'den önce tanımlı olmalı, yoksa "payment-logs" bir öğrenci id'si sanılır.
studentsRouter.get("/payment-logs", requireRole("yonetici"), async (req, res) => {
  const { limit, page, pageSize, search, action } = req.query as Record<string, string | undefined>;
  const size = Number(limit ?? pageSize) || 20;
  res.json(
    await listPaymentLogs({
      branchId: req.auth!.branchId,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, size)),
      search: search?.trim() || undefined,
      actionType: action === "PAID" || action === "REVERTED" ? action : undefined,
    })
  );
});

const revertPaymentSchema = z.object({ paymentId: z.string().min(1), confirm: z.literal(true) });

studentsRouter.post(
  "/:id/payment/revert",
  requireRole("yonetici"),
  requirePaymentConfirmationAccess(),
  validateBody(revertPaymentSchema),
  async (req, res) => {
    res.json(
      await revertPayment({
        studentId: req.params.id,
        paymentId: req.body.paymentId,
        branchId: req.auth!.branchId,
        adminId: req.auth!.sub,
        adminUsername: req.auth!.username,
      })
    );
  }
);

studentsRouter.get("/:id", async (req, res) => {
  const { role, studentId, branchId, isGlobalStaff } = req.auth!;
  if (role === "veli" && studentId !== req.params.id) {
    throw new ForbiddenError("Sadece kendi öğrencinizi görüntüleyebilirsiniz");
  }
  const student = await service.getStudent(req.params.id);
  if (role !== "veli" && !(role === "egitmen" && isGlobalStaff) && student.branchId !== branchId) {
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

studentsRouter.patch("/:id/suspend", requireRole("yonetici"), async (req, res) => {
  const existing = await service.getStudent(req.params.id);
  if (existing.branchId !== req.auth!.branchId) throw new ForbiddenError("Bu öğrenci farklı bir şubeye ait");
  res.json(await service.suspendStudent(req.params.id, req.auth!.sub, req.auth!.username));
});

studentsRouter.patch("/:id/reactivate", requireRole("yonetici"), async (req, res) => {
  const existing = await service.getStudent(req.params.id);
  if (existing.branchId !== req.auth!.branchId) throw new ForbiddenError("Bu öğrenci farklı bir şubeye ait");
  res.json(await service.reactivateStudent(req.params.id));
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

// Öğrencinin tüm dönemlerini kapsayan ödeme ekstresini (PDF) üretir. yonetici kendi şubesindeki
// her öğrenci için, veli yalnızca kendi çocuğu için isteyebilir; egitmen bu finansal veriye erişemez.
studentsRouter.get("/:id/payment-report-pdf", async (req, res) => {
  const { role, studentId, branchId } = req.auth!;
  if (role === "egitmen") throw new ForbiddenError("Bu rapora erişim yetkiniz yok");
  if (role === "veli" && studentId !== req.params.id) {
    throw new ForbiddenError("Sadece kendi öğrenciniz için rapor alabilirsiniz");
  }
  if (role === "yonetici") {
    const existing = await service.getStudent(req.params.id);
    if (existing.branchId !== branchId) throw new ForbiddenError("Bu öğrenci farklı bir şubeye ait");
  }

  const { bytes, fileName } = await generatePaymentReportPdf(req.params.id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
  res.send(Buffer.from(bytes));
});

// Öğrencinin tüm zamanların yoklama geçmişini (özet istatistik + kronolojik liste) döner.
// yonetici ve egitmen kendi şubesindeki her öğrenci için (diyetisyen/psikolog şube bağımsız
// çalışır), veli yalnızca kendi çocuğu için isteyebilir — GET /:id ile aynı erişim kuralları.
studentsRouter.get("/:id/attendance-report", async (req, res) => {
  const { role, studentId, branchId, isGlobalStaff } = req.auth!;
  if (role === "veli" && studentId !== req.params.id) {
    throw new ForbiddenError("Sadece kendi öğrencinizi görüntüleyebilirsiniz");
  } else if ((role === "yonetici" || role === "egitmen") && !(role === "egitmen" && isGlobalStaff)) {
    const existing = await service.getStudent(req.params.id);
    if (existing.branchId !== branchId) throw new ForbiddenError("Bu öğrenci farklı bir şubeye ait");
  }

  res.json(await getStudentAttendanceReport(req.params.id));
});
