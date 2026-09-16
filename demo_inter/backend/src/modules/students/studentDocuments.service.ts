import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError, ValidationError } from "../../common/errors/AppError";

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
// İstemcinin bildirdiği `mimetype` işletim sistemi/tarayıcıya göre değişebiliyor (bazı Windows
// kurulumlarında PDF için boş, "application/x-pdf" veya "application/octet-stream" gelebiliyor —
// yerelde çalışıp başka bir bilgisayardan erişimde "PDF Yüklenme Hatası" ile başarısız olmanın
// asıl nedeni buydu: mimetype eşleşmeyince PDF baytları görsel gibi embedJpg/embedPng'e
// veriliyor ve patlıyordu). Bunun yerine dosyanın gerçek baytlarındaki "magic number" imzasına
// bakıyoruz — istemci beyanından tamamen bağımsız, güvenilir bir tespit yöntemi.
function detectFileKind(buffer: Buffer, mimetype: string): "pdf" | "png" | "jpg" {
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  // Magic byte tespit edilemezse (beklenmedik/bozuk dosya) istemcinin bildirdiği mimetype'a düş.
  if (mimetype === "application/pdf") return "pdf";
  return mimetype === "image/png" ? "png" : "jpg";
}

async function mergeIntoPdf(files: UploadedFile[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();

  for (const file of files) {
    const kind = detectFileKind(file.buffer, file.mimetype);
    if (kind === "pdf") {
      const source = await PDFDocument.load(file.buffer);
      const pages = await merged.copyPages(source, source.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
      continue;
    }

    const image = kind === "png" ? await merged.embedPng(file.buffer) : await merged.embedJpg(file.buffer);

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

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await mergeIntoPdf(files);
  } catch (err) {
    console.error(`[studentDocuments] PDF birleştirme başarısız (studentId=${studentId}):`, err);
    throw new ValidationError("Yüklenen dosyalar geçerli bir görsel/PDF olarak işlenemedi");
  }

  const branchDir = path.join(STORAGE_ROOT, student.branch.code);
  const fileName = `${studentId}_kayit_belgeleri.pdf`;
  try {
    fs.mkdirSync(branchDir, { recursive: true });
    fs.writeFileSync(path.join(branchDir, fileName), pdfBytes);
  } catch (err) {
    console.error(`[studentDocuments] Diske yazma başarısız (studentId=${studentId}, dir=${branchDir}):`, err);
    throw new AppError(500, "Evrak diske yazılamadı, sunucu izinlerini kontrol edin");
  }

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
