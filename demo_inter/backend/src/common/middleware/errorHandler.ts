import { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { AppError } from "../errors/AppError";

const MULTER_ERROR_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: "Dosya boyutu izin verilen üst sınırı aşıyor (en fazla 20 MB)",
  LIMIT_FILE_COUNT: "İzin verilenden fazla dosya yüklemeye çalıştınız",
  LIMIT_UNEXPECTED_FILE: "Beklenmeyen dosya alanı gönderildi",
};

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code ?? "ERROR", message: err.message, details: (err as any).details },
    });
  }
  if (err instanceof MulterError) {
    console.error(`[upload] Multer hatası (${req.method} ${req.originalUrl}):`, err.code, err.message);
    return res.status(400).json({
      error: { code: err.code, message: MULTER_ERROR_MESSAGES[err.code] ?? "Dosya yüklenemedi" },
    });
  }
  console.error(err);
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Sunucu hatası oluştu" } });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route bulunamadı" } });
}
