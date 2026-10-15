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
 *   X) --ekim ile belirtilen öğrenci → ödemesi EKİM'e aittir, Eylül kaydı olmaz:
 *        - 10/2026 ÖDENDİ ise olduğu gibi kalır; otomatik eklenmiş boş 9/2026 satırı (ödenmemiş, bağlı kaydı yok) silinir.
 *        - 9/2026 ÖDENDİ ve 10/2026 yok / boş ise ödeme 10/2026'ya taşınır (gelir kaydı açıklaması da güncellenir),
 *          boş 10/2026 varsa silinir. Eylül kaydı kalmaz.
 *        - Ödeme bulunamazsa ya da hem 9 hem 10 ÖDENDİ ise DEĞİŞTİRİLMEZ, raporlanır.
 *
 * Kullanım (önce yedek alın: bash /var/scripts/backup_db.sh):
 *   npx tsx scripts/fix-period-labels.ts                                   # sadece plan yazdırır, hiçbir şeyi değiştirmez
 *   npx tsx scripts/fix-period-labels.ts --apply                           # planı tek transaction'da uygular
 *   npx tsx scripts/fix-period-labels.ts --ekim "Kuzey Alp Kaptan" --apply # belirtilen öğrencinin ödemesini Ekim sayarak uygular
 */

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
// --ekim "Ad Soyad" (birden fazla kez verilebilir): büyük/küçük harf ve [seed] eki gözetmeden ada göre eşleşir.
const norm = (s: string) => s.replace(/\s*\[seed\]\s*$/i, "").trim().toLocaleLowerCase("tr-TR");
const EKIM_NAMES = new Set(process.argv.flatMap((a, i, all) => (a === "--ekim" && all[i + 1] ? [norm(all[i + 1])] : [])));

const YEAR = 2026;
const SEP = 9;
const OCT = 10;

const dueDateFor = (month: number, dueDay: number) => new Date(Date.UTC(YEAR, month - 1, Math.min(dueDay, new Date(YEAR, month, 0).getDate())));

type Action =
  | { kind: "A" | "E"; studentId: string; name: string; dueDay: number; paidPaymentId: string; emptySepId?: string; amount: string }
  | { kind: "C"; studentId: string; name: string; dueDay: number; sepId: string; octId: string; sepAmount: string; octAmount: string }
  | { kind: "B" | "N" | "O"; studentId: string; name: string; dueDay: number }
  | { kind: "X"; studentId: string; name: string; deleteIds: string[]; moveToOctId?: string; note: string };

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

    if (EKIM_NAMES.has(norm(s.fullName))) {
      const isEmpty = (p: typeof p9) => !!p && p.status === "odenmedi" && p._count.financeTransactions === 0 && p._count.paymentLogs === 0;
      const x = { kind: "X" as const, studentId: s.id, name: s.fullName };
      if (p10?.status === "odendi" && p9?.status === "odendi") {
        actions.push({ ...x, deleteIds: [], note: "hem 9/2026 hem 10/2026 ÖDENDİ → DEĞİŞTİRİLMEZ (elle karar verin)" });
      } else if (p10?.status === "odendi") {
        actions.push({ ...x, deleteIds: isEmpty(p9) ? [p9!.id] : [], note: `10/2026 ÖDENDİ (${p10.amount} TL) kalır${isEmpty(p9) ? "; boş 9/2026 silinir" : p9 ? "; 9/2026 (bağlı kaydı olduğu için) silinmez" : "; Eylül kaydı yok"}` });
      } else if (p9?.status === "odendi" && (!p10 || isEmpty(p10))) {
        actions.push({ ...x, deleteIds: p10 ? [p10.id] : [], moveToOctId: p9.id, note: `9/2026 ÖDENDİ (${p9.amount} TL) → 10/2026'ya taşınır, ÖDENDİ olur; Eylül kaydı kalmaz` });
      } else {
        actions.push({ ...x, deleteIds: [], note: "ödenmiş bir kayıt bulunamadı veya 10/2026'da bağlı kayıt var → DEĞİŞTİRİLMEZ (elle kontrol edin)" });
      }
      continue;
    }

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
      case "X":
        console.log(`X  ${a.name}: ${a.note}`);
        break;
      case "C":
        console.log(`C  ${a.name}: 9/2026 ÖDENDİ (${a.sepAmount} TL) + 10/2026 ÖDENDİ (${a.octAmount} TL) → Eylül iki kez ödenmiş görünüyor, DEĞİŞTİRİLMEZ (elle karar verin)`);
        break;
    }
  }
  const count = (k: string) => actions.filter((a) => a.kind === k).length;
  console.log(
    `\nÖzet: A=${count("A")} taşıma, E=${count("E")} boş Eylül'lü taşıma, B=${count("B")} Eylül borcu, N=${count("N")} sıfırdan, O=${count("O")} Ekim ekleme, C=${count("C")} belirsiz (değişmez), X=${count("X")} atlanan; ` +
      `dokunulmayan=${students.length - actions.length}, toplam aktif öğrenci=${students.length}`
  );

  if (!APPLY) return;

  await prisma.$transaction(async (tx) => {
    const addPayment = (studentId: string, month: number, dueDay: number) =>
      tx.payment.create({ data: { studentId, periodYear: YEAR, periodMonth: month, dueDay, dueDate: dueDateFor(month, dueDay), amount: fee } });

    for (const a of actions) {
      if (a.kind === "X") {
        for (const id of a.deleteIds) await tx.payment.delete({ where: { id } });
        if (a.moveToOctId) {
          const moved = await tx.payment.update({ where: { id: a.moveToOctId }, data: { periodMonth: OCT } });
          await tx.payment.update({ where: { id: moved.id }, data: { dueDate: dueDateFor(OCT, moved.dueDay) } });
          await tx.financeTransaction.updateMany({ where: { paymentId: moved.id }, data: { description: `${OCT}/${YEAR} dönemi aidat tahsilatı` } });
        }
      } else if (a.kind === "A" || a.kind === "E") {
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
