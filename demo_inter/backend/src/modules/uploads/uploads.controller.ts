import { Router } from "express";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { ValidationError } from "../../common/errors/AppError";

export const uploadsRouter = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new ValidationError("Sadece JPG, PNG, WEBP veya GIF görsel yükleyebilirsiniz"));
      return;
    }
    cb(null, true);
  },
});

// Sadece yonetici görsel yükleyebilir (site içeriği / slider yönetimi).
uploadsRouter.use(requireAuth, requireRole("yonetici"));

uploadsRouter.post("/image", upload.single("file"), (req, res) => {
  if (!req.file) throw new ValidationError("Görsel dosyası bulunamadı");
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});
