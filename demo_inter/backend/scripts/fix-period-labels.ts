import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Tek seferlik düzeltme: eski sistem her ayın 1'inde takvim ayına göre satır açtığı için, 15 Eylül–15 Ekim
 * dönemine (= "Eylül") yapılan ödemeler "10/2026" satırına işlenmişti. Dönem artık 15'inden 15'ine sayılıyor.
 *
 * Kurallar (yalnızca 2026 Eylül/Ekim satırları, yalnızca ACTIVE öğrenciler):
 *   A) 10/2026 "Ödendi" + 9/2026 satırı YOK  → ödeme Eylül'e aittir: satır 9/2026'ya taşınır (ödeme bilgisi,
 *      gelir kaydı korunur), ödeme günü 15 ise yeni 10/2026 "Ödenmedi" satırı açılır.
 *   B) 10/2026 "Ödenmedi" + 9/2026 satırı YOK → Eylül ödenmemiştir: 9/2026 "Ödenmedi" satırı eklenir
 *      (15 Eylül'den sonra kayıt olan öğrenciler hariç).
 *   C) 10/2026 "Ödendi" + 9/2026 satırı VAR   → belirsiz; DEĞİŞTİRİLMEZ, yalnızca raporlanır.
 *   D) Diğer her durum                         → dokunulmaz.
 *
 * Kullanım (önce yedek alın: bash /var/scripts/backup_db.sh):
 *   npx tsx scripts/fix-period-labels.ts            # sadece plan yazdırır, hiçbir şeyi değiştirmez
 *   npx tsx scripts/fix-period-labels.ts --apply    # planı tek transaction'da uygular
 */

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const YEAR = 2026;
const SEP = 9;
const OCT = 10;
// 15 Eylül 2026 00:00 Türkiye = 14 Eylül 21:00 UTC — bu tarihten sonra kayıt olanların Eylül borcu yoktur.
const SEPT_CYCLE_START = new Date(Date.UTC(2026, 8, 14, 21, 0, 0));

const dueDateFor = (month: number, dueDay: number) => new Date(Date.UTC(YEAR, month - 1, Math.min(dueDay, new Date(YEAR, month, 0).getDate())));

type Action =
  | { kind: "A"; studentId: string; name: string; dueDay: number; octPaymentId: string; amount: string }
  | { kind: "B"; studentId: string; name: string; dueDay: number }
  | { kind: "C"; name: string }
  | { kind: "SKIP"; name: string; reason: string };

async function main() {
  const fee = Number((await prisma.feeSettings.findUnique({ where: { id: 1 } }))?.monthlyFee ?? 3500);

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    include: { payments: { where: { periodYear: YEAR, periodMonth: { in: [SEP, OCT] } } } },
    orderBy: { fullName: "asc" },
  });

  const actions: Action[] = [];
  for (const s of students) {
    const p9 = s.payments.find((p) => p.periodMonth === SEP);
    const p10 = s.payments.find((p) => p.periodMonth === OCT);
    if (!p10) continue; // D
    if (p10.status === "odendi" && !p9) {
      actions.push({ kind: "A", studentId: s.id, name: s.fullName, dueDay: s.paymentDueDay, octPaymentId: p10.id, amount: String(p10.amount) });
    } else if (p10.status === "odenmedi" && !p9) {
      if (s.createdAt >= SEPT_CYCLE_START) actions.push({ kind: "SKIP", name: s.fullName, reason: "15 Eylül'den sonra kayıt olmuş, Eylül borcu yok" });
      else actions.push({ kind: "B", studentId: s.id, name: s.fullName, dueDay: s.paymentDueDay });
    } else if (p10.status === "odendi" && p9) {
      actions.push({ kind: "C", name: s.fullName });
    }
  }

  console.log(APPLY ? "\n=== UYGULANIYOR ===\n" : "\n=== PLAN (hiçbir şey değiştirilmedi; uygulamak için --apply) ===\n");
  for (const a of actions) {
    if (a.kind === "A") {
      console.log(`A  ${a.name}: 10/2026 ÖDENDİ (${a.amount} TL) → 9/2026'ya taşınır${a.dueDay === 15 ? "; yeni 10/2026 ÖDENMEDİ açılır" : "; (ödeme günü 30: Ekim 30'unda cron açar)"}`);
    } else if (a.kind === "B") {
      console.log(`B  ${a.name}: 9/2026 ÖDENMEDİ satırı eklenir (Eylül ödenmemiş)`);
    } else if (a.kind === "C") {
      console.log(`C  ${a.name}: hem 9/2026 hem 10/2026 var, 10/2026 ÖDENDİ → BELİRSİZ, DEĞİŞTİRİLMEZ (elle kontrol edin)`);
    } else {
      console.log(`-  ${a.name}: atlandı (${a.reason})`);
    }
  }
  const count = (k: string) => actions.filter((a) => a.kind === k).length;
  console.log(`\nÖzet: A=${count("A")} taşıma, B=${count("B")} Eylül borcu ekleme, C=${count("C")} belirsiz, atlanan=${count("SKIP")}, toplam aktif öğrenci=${students.length}`);

  if (!APPLY) return;

  await prisma.$transaction(async (tx) => {
    for (const a of actions) {
      if (a.kind === "A") {
        await tx.payment.update({
          where: { id: a.octPaymentId },
          data: { periodMonth: SEP, dueDate: dueDateFor(SEP, a.dueDay) },
        });
        // Gelir kaydı açıklaması da doğru döneme işaret etsin (kayıtlar silinmez, sadece etiket düzelir).
        await tx.financeTransaction.updateMany({
          where: { paymentId: a.octPaymentId },
          data: { description: `${SEP}/${YEAR} dönemi aidat tahsilatı` },
        });
        if (a.dueDay === 15) {
          await tx.payment.create({
            data: { studentId: a.studentId, periodYear: YEAR, periodMonth: OCT, dueDay: a.dueDay, dueDate: dueDateFor(OCT, a.dueDay), amount: fee },
          });
        }
      } else if (a.kind === "B") {
        await tx.payment.create({
          data: { studentId: a.studentId, periodYear: YEAR, periodMonth: SEP, dueDay: a.dueDay, dueDate: dueDateFor(SEP, a.dueDay), amount: fee },
        });
      }
    }
  });
  console.log("\n✅ Uygulandı.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
