import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../common/errors/AppError";
import { stripSeedTag } from "../../common/text/displayName";
import { decryptTc, maskTc } from "../../common/security/tc";

const TURKISH_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;
const ROW_HEIGHT = 22;

const COL = {
  period: MARGIN,
  amount: MARGIN + 150,
  status: MARGIN + 280,
  date: MARGIN + 390,
};

const NAVY = rgb(0.004, 0.055, 0.502); // #010E80 — sitenin marka rengiyle tutarlı
const SLATE = rgb(0.29, 0.33, 0.41);
const INK = rgb(0.06, 0.09, 0.16);
const LIGHT_LINE = rgb(0.88, 0.9, 0.94);
const GREEN = rgb(0.02, 0.5, 0.24);
const RED = rgb(0.75, 0.11, 0.11);
const WHITE = rgb(1, 1, 1);

/**
 * pdf-lib'in standart fontları WinAnsi (cp1252) kodlaması kullanır; Türkçe'ye özgü ş/Ş,
 * ğ/Ğ, ı, İ bu kodlamada yer almaz (ç/ö/ü Latin-1'de olduğundan sorunsuz). Özel bir TTF
 * font gömmeden (fontkit + font dosyası gerektirir) bu karakterleri çizmeye çalışmak
 * pdf-lib'in encoding hatasıyla PDF üretimini tamamen durdurur — bu yüzden yalnızca PDF
 * çıktısında ASCII karşılıklarına çeviriyoruz; veritabanındaki orijinal metin etkilenmez.
 */
function pdfSafe(text: string): string {
  return text
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "S")
    .replace(/ş/g, "s")
    .replace(/Ğ/g, "G")
    .replace(/ğ/g, "g");
}

function formatTrDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getUTCFullYear()}`;
}

function formatAmount(value: unknown): string {
  return `${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

export async function generatePaymentReportPdf(studentId: string): Promise<{ bytes: Uint8Array; fileName: string }> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      group: true,
      payments: { orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }] },
    },
  });
  if (!student) throw new NotFoundError("Öğrenci bulunamadı");

  const fullName = pdfSafe(stripSeedTag(student.fullName));
  const tcMasked = maskTc(decryptTc(student.tcNoEncrypted));
  const groupName = pdfSafe(student.group?.name ?? "-");
  const dobStr = formatTrDate(student.dob);
  const reportDateStr = formatTrDate(new Date());

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function line(str: string, x: number, size: number, useFont: PDFFont, color = SLATE) {
    page.drawText(str, { x, y, size, font: useFont, color });
  }

  function rightAlign(str: string, rightX: number, size: number, useFont: PDFFont, color = SLATE) {
    const w = useFont.widthOfTextAtSize(str, size);
    page.drawText(str, { x: rightX - w, y, size, font: useFont, color });
  }

  function drawTableHeader() {
    page.drawRectangle({ x: MARGIN, y: y - 6, width: CONTENT_RIGHT - MARGIN, height: ROW_HEIGHT - 2, color: NAVY });
    page.drawText("DONEM", { x: COL.period + 6, y, size: 9, font: bold, color: WHITE });
    page.drawText("TUTAR", { x: COL.amount + 6, y, size: 9, font: bold, color: WHITE });
    page.drawText("DURUM", { x: COL.status + 6, y, size: 9, font: bold, color: WHITE });
    page.drawText("ODEME / ONAY TARIHI", { x: COL.date + 6, y, size: 9, font: bold, color: WHITE });
    y -= ROW_HEIGHT;
  }

  function newPageIfNeeded(reserve = ROW_HEIGHT * 3) {
    if (y < MARGIN + reserve) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawTableHeader();
    }
  }

  // ---- Başlık ----
  line("INTER ACADEMY SAMSUN", MARGIN, 20, bold, NAVY);
  rightAlign(`Rapor Tarihi: ${reportDateStr}`, CONTENT_RIGHT, 9, font);
  y -= 22;
  line("Odeme Ekstresi Raporu", MARGIN, 13, bold, SLATE);
  y -= 20;

  page.drawLine({ start: { x: MARGIN, y }, end: { x: CONTENT_RIGHT, y }, thickness: 1, color: LIGHT_LINE });
  y -= 20;

  // ---- Öğrenci bilgileri ----
  const infoRows: [string, string][] = [
    ["Ad Soyad", fullName],
    ["TC Kimlik No", tcMasked],
    ["Dogum Tarihi", dobStr],
    ["Grup", groupName],
  ];
  for (const [label, value] of infoRows) {
    line(`${label}:`, MARGIN, 10, bold, SLATE);
    line(value, MARGIN + 110, 10, font, INK);
    y -= 16;
  }
  y -= 12;

  // ---- Ödeme geçmişi tablosu ----
  drawTableHeader();

  let totalPaid = 0;
  let totalUnpaid = 0;

  for (const payment of student.payments) {
    newPageIfNeeded();
    const monthLabel = pdfSafe(`${TURKISH_MONTHS[payment.periodMonth - 1]} ${payment.periodYear}`);
    const amountNum = Number(payment.amount);
    const isPaid = payment.status === "odendi";
    if (isPaid) totalPaid += amountNum;
    else totalUnpaid += amountNum;

    line(monthLabel, COL.period + 6, 10, font, INK);
    line(formatAmount(amountNum), COL.amount + 6, 10, font, INK);
    line(isPaid ? "Odendi" : "Odenmedi", COL.status + 6, 10, bold, isPaid ? GREEN : RED);
    line(isPaid && payment.paidAt ? formatTrDate(payment.paidAt) : payment.status === "odenmedi" ? "Bekliyor" : "-", COL.date + 6, 10, font, INK);

    y -= ROW_HEIGHT - 4;
    page.drawLine({ start: { x: MARGIN, y: y + 10 }, end: { x: CONTENT_RIGHT, y: y + 10 }, thickness: 0.5, color: LIGHT_LINE });
  }

  if (student.payments.length === 0) {
    line("Bu ogrenciye ait odeme kaydi bulunmuyor.", MARGIN, 10, font, SLATE);
    y -= ROW_HEIGHT;
  }

  // ---- Özet ----
  newPageIfNeeded(ROW_HEIGHT * 6);
  y -= 14;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: CONTENT_RIGHT, y }, thickness: 1, color: LIGHT_LINE });
  y -= 20;

  line("Toplam Odenen:", MARGIN, 11, bold, SLATE);
  rightAlign(formatAmount(totalPaid), CONTENT_RIGHT, 11, bold, GREEN);
  y -= 18;
  line("Kalan Borc:", MARGIN, 11, bold, SLATE);
  rightAlign(formatAmount(totalUnpaid), CONTENT_RIGHT, 11, bold, totalUnpaid > 0 ? RED : SLATE);
  y -= 60;

  // ---- İmza / onay alanı ----
  newPageIfNeeded(ROW_HEIGHT * 3);
  page.drawLine({ start: { x: CONTENT_RIGHT - 170, y }, end: { x: CONTENT_RIGHT, y }, thickness: 0.7, color: SLATE });
  y -= 12;
  rightAlign("Yetkili Imza / Onay", CONTENT_RIGHT, 9, font, SLATE);

  const bytes = await pdfDoc.save();
  const fileName = `${fullName.replace(/\s+/g, "_")}_odeme_ekstresi.pdf`;
  return { bytes, fileName };
}
