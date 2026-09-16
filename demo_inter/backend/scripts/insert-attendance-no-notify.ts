import "dotenv/config";
import { PrismaClient, SessionType } from "@prisma/client";

/**
 * WhatsApp erişim/inceleme sorunu nedeniyle bildirim mekanizması GEÇİCİ olarak devre dışı
 * bırakıldığında, 4 farklı ders için yoklama kaydını doğrudan veritabanına yazar.
 *
 * KRİTİK: Bu script src/modules/attendance/attendance.controller.ts'deki POST /attendance/bulk
 * endpoint'ini HİÇ çağırmaz ve services/whatsappService.js / services/whatsappClient.js
 * dosyalarını import ETMEZ — yani WhatsApp gönderim kod yolu bu script'in çalıştırdığı
 * process'e hiç yüklenmez, tetiklenmesi FİZİKSEL olarak imkansızdır (bypass değil, mevcut değil).
 * `notifiedAt` alanı bilerek null bırakılır: "bildirim gönderildi" hiçbir zaman iddia edilmez.
 *
 * NOT: Panel üzerinden normal "Yoklamayı Kaydet ve Bildir" akışı (attendance.controller.ts)
 * hâlâ WhatsApp bağlantısı yoksa kaydı reddediyor (bkz. WhatsAppUnavailableError) — bu script o
 * korumayı KALDIRMAZ, sadece bu tek seferlik veri girişi için ayrı, DB'ye doğrudan yazan bir yol.
 *
 * Kullanım:
 *   npx tsx scripts/insert-attendance-no-notify.ts
 */

const prisma = new PrismaClient();

// 4 farklı ders: 2 antrenman (saha, farklı tarih/öğrenci), 1 diyetisyen, 1 psikolog.
const LESSON_PLAN: { sessionType: SessionType; status: "var" | "yok"; daysAgo: number }[] = [
  { sessionType: "saha", status: "var", daysAgo: 0 },
  { sessionType: "saha", status: "yok", daysAgo: 1 },
  { sessionType: "diyet", status: "yok", daysAgo: 2 },
  { sessionType: "psikolog", status: "var", daysAgo: 3 },
];

const MANUAL_ENTRY_NOTE =
  "[MANUEL] WhatsApp erişim/inceleme sorunu nedeniyle bildirim mekanizması geçici devre dışıyken, yönetici tarafından doğrudan DB'ye girildi.";

function daysAgoUtc(n: number): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - n));
}

/** İlgili derse ait bir TrainingSession bulur, yoksa öğrencinin grubuna bağlı yenisini açar. */
async function findOrCreateSession(groupId: string, sessionType: SessionType) {
  const existing = await prisma.trainingSession.findFirst({ where: { groupId, sessionType } });
  if (existing) return existing;

  return prisma.trainingSession.create({
    data: {
      groupId,
      sessionType,
      dayOfWeek: new Date().getUTCDay(),
      startTime: new Date("1970-01-01T17:00:00.000Z"),
      description: `[MANUEL] ${sessionType} dersi (WhatsApp devre dışıyken otomatik açıldı)`,
    },
  });
}

async function main() {
  console.log("=== Manuel Yoklama Girişi (WhatsApp bildirimi TETİKLENMEZ) ===\n");

  const students = await prisma.student.findMany({
    take: 4,
    orderBy: { createdAt: "asc" },
    include: { group: true },
  });

  if (students.length < 4) {
    throw new Error(
      `DB'de en az 4 öğrenci gerekiyor, ${students.length} bulundu. Önce öğrenci kaydı oluşturun veya prisma/seed_test_data.ts çalıştırın.`
    );
  }

  const markedByUser = await prisma.user.findFirst({ where: { role: "yonetici" } });

  console.log("Seçilen öğrenciler:");
  for (const s of students) console.log(`  - ${s.fullName} (${s.id})`);
  console.log();

  const results = [];
  for (let i = 0; i < LESSON_PLAN.length; i++) {
    const student = students[i];
    const plan = LESSON_PLAN[i];
    const sessionDate = daysAgoUtc(plan.daysAgo);

    // Öğrencinin bağlı olduğu grubu bulamıyorsak (ör. gruba atanmamış öğrenci) o ders için
    // sessionId null bırakılır — kayıt yine de oluşturulur, sadece ders türü raporda
    // varsayılan "antrenman" etiketiyle görünür (bkz. attendanceReport.service.ts).
    const session = student.groupId ? await findOrCreateSession(student.groupId, plan.sessionType) : null;

    const row = await prisma.attendanceRecord.upsert({
      where: {
        studentId_sessionDate_sessionId: {
          studentId: student.id,
          sessionDate,
          sessionId: session?.id ?? null,
        },
      },
      create: {
        studentId: student.id,
        sessionId: session?.id ?? null,
        sessionDate,
        status: plan.status,
        markedBy: markedByUser?.id ?? null,
        notifiedAt: null, // WhatsApp hiç tetiklenmedi — bildirim gönderildiği asla iddia edilmez.
        notes: MANUAL_ENTRY_NOTE,
      },
      update: {
        status: plan.status,
        markedBy: markedByUser?.id ?? null,
        notifiedAt: null,
        notes: MANUAL_ENTRY_NOTE,
      },
    });

    results.push({ student: student.fullName, sessionType: plan.sessionType, status: plan.status, id: row.id });
    console.log(
      `  ✓ ${student.fullName.padEnd(30)} ${plan.sessionType.padEnd(9)} ${plan.status.padEnd(4)} ${sessionDate
        .toISOString()
        .slice(0, 10)}  (attendance_records.id=${row.id})`
    );
  }

  console.log(`\n${results.length} yoklama kaydı DB'ye yazıldı. WhatsApp servisi hiçbir aşamada çağrılmadı.`);
}

main()
  .catch((e) => {
    console.error("\n❌ Yoklama kaydı oluşturulamadı:\n", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
