import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { prisma } from "../../config/prisma";
import { NotFoundError, ValidationError } from "../../common/errors/AppError";

const STORAGE_ROOT = path.join(process.cwd(), "storage", "documents");

interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 24;

/**
 * 1-5 taranmış görsel (jpg/png) ve/veya tek bir mevcut PDF'i, doğru sayfa sırasıyla
 * (dosyaların gönderildiği sıra = sayfa sırası) tek bir A4 PDF'te birleştirir; PDF
 * dosyaları varsa sayfaları doğrudan kopyalanır, görseller her biri kendi A4 sayfasına
 * ortalanarak yerleştirilir.
 */
async function mergeIntoPdf(files: UploadedFile[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();

  for (const file of files) {
    if (file.mimetype === "application/pdf") {
      const source = await PDFDocument.load(file.buffer);
      const pages = await merged.copyPages(source, source.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
      continue;
    }

    const image = file.mimetype === "image/png" ? await merged.embedPng(file.buffer) : await merged.embedJpg(file.buffer);

    const page = merged.addPage([A4_WIDTH, A4_HEIGHT]);
    const maxWidth = A4_WIDTH - MARGIN * 2;
    const maxHeight = A4_HEIGHT - MARGIN * 2;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;

    page.drawImage(image, {
      x: (A4_WIDTH - drawWidth) / 2,
      y: (A4_HEIGHT - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }

  return merged.save();
}

export async function uploadRegistrationDocuments(studentId: string, files: UploadedFile[]) {
  if (files.length === 0) throw new ValidationError("En az bir görsel veya PDF yüklemelisiniz");
  if (files.length > 5) throw new ValidationError("En fazla 5 dosya yükleyebilirsiniz");

  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { branch: true } });
  if (!student) throw new NotFoundError("Öğrenci bulunamadı");

  const pdfBytes = await mergeIntoPdf(files);

  const branchDir = path.join(STORAGE_ROOT, student.branch.code);
  fs.mkdirSync(branchDir, { recursive: true });
  const fileName = `${studentId}_kayit_belgeleri.pdf`;
  fs.writeFileSync(path.join(branchDir, fileName), pdfBytes);

  const registrationPdfUrl = `/storage/documents/${student.branch.code}/${fileName}`;
  await prisma.student.update({ where: { id: studentId }, data: { registrationPdfUrl } });

  return { registrationPdfUrl };
}

export async function deleteRegistrationDocuments(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { branch: true } });
  if (!student) throw new NotFoundError("Öğrenci bulunamadı");
  if (!student.registrationPdfUrl) throw new ValidationError("Bu öğrenciye ait yüklenmiş bir kayıt evrakı yok");

  const fileName = `${studentId}_kayit_belgeleri.pdf`;
  const filePath = path.join(STORAGE_ROOT, student.branch.code, fileName);
  fs.rmSync(filePath, { force: true });

  await prisma.student.update({ where: { id: studentId }, data: { registrationPdfUrl: null } });
}
