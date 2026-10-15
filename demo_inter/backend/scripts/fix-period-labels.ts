import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Tek seferlik düzeltme: eski sistem her ayın 1'inde takvim ayına göre satır açtığı için, 15 Eylül–15 Ekim
 * dönemine (= "Eylül") yapılan ödemeler "10/2026" satırına işlenmişti. Dönem artık 15'inden 15'ine sayılıyor.
 *
 * Varsayım: bugüne kadar yapılan TÜM ödemeler Eylül dönemine aittir; Ekim'i henüz kimse ödemedi.
 * Sonuç: sistemdeki her ACTIVE öğrenci için (kayıt tarihine bakılmaz)
 *   - Eylül (9/2026): ödeme yapılmışsa "Ödendi", yapılmamışsa "Ödenmedi" satırı olur.
 *   - Ekim (10/2026): hepsi "Ödenmedi" olur.
 *
 * Durumlar (öğrencinin 9/2026 ve 10/2026 satırlarına göre):
 *   A) 9 yok,  10 ÖDENDİ          → ödeme Eylül'e taşınır (9/2026), yeni 10/2026 ÖDENMEDİ açılır.
 *   B) 9 yok,  10 ÖDENMEDİ        → 9/2026 ÖDENMEDİ eklenir.
 *   N) 9 yok,  10 yok             → 9/2026 ve 10/2026 ÖDENMEDİ eklenir.
 *   O) 9 var,  10 yok             → 10/2026 ÖDENMEDİ eklenir.
 *   E) 9 ÖDENMEDİ, 10 ÖDENDİ       → ödeme Eylül'e aittir: 9/2026'nın bağlı kayıtları (varsa) ödemeli satıra aktarılır,
 *                                    boş 9/2026 silinir, ödemeli satır 9/2026'ya taşınır, yeni 10/2026 ÖDENMEDİ açılır.
 *   C) 9 ÖDENDİ, 10 ÖDENDİ         → Eylül iki kez ödenmiş görünüyor. Bir ödemeye yalnızca BİR aktif gelir kaydı bağlanabildiği
 *                                    (kısmi unique index) için otomatik birleştirilemez: DEĞİŞTİRİLMEZ, yalnızca raporlanır;
 *                                    kasa kayıtlarını bozmamak için elle karar verilmelidir.
 *   D) Diğer her durum (9 var, 10 ÖDENMEDİ) → zaten doğru; dokunulmaz.
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

const dueDateFor = (month: number, dueDay: number) => new Date(Date.UTC(YEAR, month - 1, Math.min(dueDay, new Date(YEAR, month, 0).getDate())));

type Action =
  | { kind: "A" | "E"; studentId: string; name: string; dueDay: number; paidPaymentId: string; emptySepId?: string; amount: string }
  | { kind: "C"; studentId: string; name: string; dueDay: number; sepId: string; octId: string; sepAmount: string; octAmount: string }
  | { kind: "B" | "N" | "O"; studentId: string; name: string; dueDay: number };

async function main() {
  const fee = Number((await prisma.feeSettings.findUnique({ where: { id: 1 } }))?.monthlyFee ?? 3500);

  const students = await prisma.student.findMany({
    where: { status: "ACTIVE" },
    include: {
      payments: {
        where: { periodYear: YEAR, periodMonth: { in: [SEP, OCT] } },
        include: { _count: { select: { financeTransactions: true, paymentLogs: true } } },
      },
    },
    orderBy: { fullName: "asc" },
  });

  const actions: Action[] = [];
  for (const s of students) {
    const p9 = s.payments.find((p) => p.periodMonth === SEP);
    const p10 = s.payments.find((p) => p.periodMonth === OCT);
    const base = { studentId: s.id, name: s.fullName, dueDay: s.paymentDueDay };

    if (!p9 && !p10) actions.push({ kind: "N", ...base });
    else if (!p9 && p10!.status === "odendi") actions.push({ kind: "A", ...base, paidPaymentId: p10!.id, amount: String(p10!.amount) });
    else if (!p9) actions.push({ kind: "B", ...base });
    else if (!p10) actions.push({ kind: "O", ...base });
    else if (p10.status === "odendi") {
      if (p9.status === "odenmedi") actions.push({ kind: "E", ...base, paidPaymentId: p10.id, emptySepId: p9.id, amount: String(p10.amount) });
      else actions.push({ kind: "C", ...base, sepId: p9.id, octId: p10.id, sepAmount: String(p9.amount), octAmount: String(p10.amount) });
    }
    // D: 9 var, 10 ÖDENMEDİ → dokunulmaz
  }

  console.log(APPLY ? "\n=== UYGULANIYOR ===\n" : "\n=== PLAN (hiçbir şey değiştirilmedi; uygulamak için --apply) ===\n");
  for (const a of actions) {
    switch (a.kind) {
      case "A":
        console.log(`A  ${a.name}: 10/2026 ÖDENDİ (${a.amount} TL) → 9/2026'ya taşınır; yeni 10/2026 ÖDENMEDİ açılır`);
        break;
      case "E":
        console.log(`E  ${a.name}: 9/2026 ÖDENMEDİ yerine 10/2026 ÖDENDİ (${a.amount} TL) → 9/2026'ya taşınır; yeni 10/2026 ÖDENMEDİ açılır`);
        break;
      case "B":
        console.log(`B  ${a.name}: 9/2026 ÖDENMEDİ eklenir (Eylül ödenmemiş); 10/2026 zaten ÖDENMEDİ`);
        break;
      case "N":
        console.log(`N  ${a.name}: hiç kaydı yok → 9/2026 ve 10/2026 ÖDENMEDİ eklenir`);
        break;
      case "O":
        console.log(`O  ${a.name}: 10/2026 ÖDENMEDİ eklenir`);
        break;
      case "C":
        console.log(`C  ${a.name}: 9/2026 ÖDENDİ (${a.sepAmount} TL) + 10/2026 ÖDENDİ (${a.octAmount} TL) → Eylül iki kez ödenmiş görünüyor, DEĞİŞTİRİLMEZ (elle karar verin)`);
        break;
    }
  }
  const count = (k: string) => actions.filter((a) => a.kind === k).length;
  console.log(
    `\nÖzet: A=${count("A")} taşıma, E=${count("E")} boş Eylül'lü taşıma, B=${count("B")} Eylül borcu, N=${count("N")} sıfırdan, O=${count("O")} Ekim ekleme, C=${count("C")} belirsiz (değişmez); ` +
      `dokunulmayan=${students.length - actions.length}, toplam aktif öğrenci=${students.length}`
  );

  if (!APPLY) return;

  await prisma.$transaction(async (tx) => {
    const addPayment = (studentId: string, month: number, dueDay: number) =>
      tx.payment.create({ data: { studentId, periodYear: YEAR, periodMonth: month, dueDay, dueDate: dueDateFor(month, dueDay), amount: fee } });

    for (const a of actions) {
      if (a.kind === "A" || a.kind === "E") {
        if (a.kind === "E") {
          // Boş (ödenmemiş) 9/2026'nın bağlı kayıtları (ör. geri alınmış eski ödemeler) kaybolmasın.
          await tx.financeTransaction.updateMany({ where: { paymentId: a.emptySepId! }, data: { paymentId: a.paidPaymentId } });
          await tx.studentPaymentLog.updateMany({ where: { paymentId: a.emptySepId! }, data: { paymentId: a.paidPaymentId } });
          await tx.payment.delete({ where: { id: a.emptySepId! } });
        }
        await tx.payment.update({ where: { id: a.paidPaymentId }, data: { periodMonth: SEP, dueDate: dueDateFor(SEP, a.dueDay) } });
        // Gelir kaydı açıklaması da doğru döneme işaret etsin (kayıtlar silinmez, sadece etiket düzelir).
        await tx.financeTransaction.updateMany({ where: { paymentId: a.paidPaymentId }, data: { description: `${SEP}/${YEAR} dönemi aidat tahsilatı` } });
        await addPayment(a.studentId, OCT, a.dueDay);
      } else if (a.kind === "B") {
        await addPayment(a.studentId, SEP, a.dueDay);
      } else if (a.kind === "N") {
        await addPayment(a.studentId, SEP, a.dueDay);
        await addPayment(a.studentId, OCT, a.dueDay);
      } else if (a.kind === "O") {
        await addPayment(a.studentId, OCT, a.dueDay);
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
