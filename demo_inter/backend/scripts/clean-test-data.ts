import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * seed_test_data.ts ile oluşturulan TÜM test verisini (personel, öğrenci, veli hesabı,
 * grup, antrenman programı, yoklama, ödeme, diyetisyen/psikolog notu) güvenle siler.
 * Gerçek üretim verisine dokunmaz — sadece aşağıdaki işaretlerle eşleşen kayıtlar hedeflenir:
 *   - users.username      "qatest_" ile başlayanlar   (6 personel + 20 veli hesabı)
 *   - students.fullName   "[QATEST]" ile bitenler      (20 test öğrencisi)
 *   - groups.name          "QATEST " ile başlayanlar    (2 test grubu)
 *
 * Tüm silme işlemi TEK bir Prisma transaction içinde çalışır: sonundaki doğrulama
 * (hiç QATEST izi kalmamalı) başarısız olursa transaction otomatik geri alınır (rollback),
 * kısmi/eksik bir silme durumu asla commit edilmez.
 *
 * Kullanım:
 *   npx tsx scripts/clean-test-data.ts
 */

const prisma = new PrismaClient();

async function main() {
  const [students, users, groups] = await Promise.all([
    prisma.student.findMany({ where: { fullName: { endsWith: "[QATEST]" } }, select: { id: true } }),
    prisma.user.findMany({ where: { username: { startsWith: "qatest_" } }, select: { id: true } }),
    prisma.group.findMany({ where: { name: { startsWith: "QATEST " } }, select: { id: true } }),
  ]);

  const studentIds = students.map((s) => s.id);
  const userIds = users.map((u) => u.id);
  const groupIds = groups.map((g) => g.id);

  if (studentIds.length === 0 && userIds.length === 0 && groupIds.length === 0) {
    console.log("Temizlenecek QATEST işaretli test verisi bulunamadı — sistem zaten temiz.");
    return;
  }

  console.log("Silinecek test verisi tespit edildi:");
  console.log(`  öğrenci        : ${studentIds.length}`);
  console.log(`  kullanıcı hesabı: ${userIds.length} (personel + veli)`);
  console.log(`  grup           : ${groupIds.length}\n`);

  const summary = await prisma.$transaction(async (tx) => {
    const attendance = await tx.attendanceRecord.deleteMany({
      where: { OR: [{ studentId: { in: studentIds } }, { markedBy: { in: userIds } }] },
    });
    const notes = await tx.studentNote.deleteMany({
      where: { OR: [{ studentId: { in: studentIds } }, { authorId: { in: userIds } }] },
    });
    const payments = await tx.payment.deleteMany({ where: { studentId: { in: studentIds } } });
    const instructorStudents = await tx.instructorStudent.deleteMany({
      where: { OR: [{ studentId: { in: studentIds } }, { instructorUserId: { in: userIds } }] },
    });
    const sessions = await tx.trainingSession.deleteMany({ where: { groupId: { in: groupIds } } });
    const preregUnlinked = await tx.preRegistration.updateMany({
      where: { convertedStudentId: { in: studentIds } },
      data: { convertedStudentId: null },
    });
    const studentsDeleted = await tx.student.deleteMany({ where: { id: { in: studentIds } } });
    const groupsDeleted = await tx.group.deleteMany({ where: { id: { in: groupIds } } });
    const staffProfiles = await tx.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
    const usersDeleted = await tx.user.deleteMany({ where: { id: { in: userIds } } });

    // Güvenlik doğrulaması — hâlâ transaction içindeyiz: tutarsızlık varsa throw ile
    // tüm işlem otomatik rollback olur, kısmi bir silme asla commit edilmez.
    const remainingStudents = await tx.student.count({ where: { fullName: { endsWith: "[QATEST]" } } });
    const remainingUsers = await tx.user.count({ where: { username: { startsWith: "qatest_" } } });
    const remainingGroups = await tx.group.count({ where: { name: { startsWith: "QATEST " } } });
    if (remainingStudents !== 0 || remainingUsers !== 0 || remainingGroups !== 0) {
      throw new Error(
        `Temizlik eksik kaldı (kalan: students=${remainingStudents}, users=${remainingUsers}, groups=${remainingGroups}) — işlem geri alındı.`
      );
    }

    return {
      attendance: attendance.count,
      notes: notes.count,
      payments: payments.count,
      instructorStudents: instructorStudents.count,
      sessions: sessions.count,
      preregUnlinked: preregUnlinked.count,
      students: studentsDeleted.count,
      groups: groupsDeleted.count,
      staffProfiles: staffProfiles.count,
      users: usersDeleted.count,
    };
  });

  console.log("=== QA Test Verisi Temizlik Özeti ===");
  console.log(`  yoklama_kaydi (attendance_records)     : ${summary.attendance}`);
  console.log(`  uzman_notu (student_notes)              : ${summary.notes}`);
  console.log(`  odeme_kaydi (payments)                  : ${summary.payments}`);
  console.log(`  antrenor_atamasi (instructor_students)  : ${summary.instructorStudents}`);
  console.log(`  antrenman_seansi (training_sessions)    : ${summary.sessions}`);
  console.log(`  on_kayit_baglantisi_temizlendi          : ${summary.preregUnlinked}`);
  console.log(`  ogrenci (students)                      : ${summary.students}`);
  console.log(`  grup (groups)                           : ${summary.groups}`);
  console.log(`  staff_profile                           : ${summary.staffProfiles}`);
  console.log(`  kullanici_hesabi (users, personel+veli) : ${summary.users}`);
  console.log("======================================");
  console.log("Doğrulama OK: sistemde hiç QATEST işaretli kayıt kalmadı.\n");
}

main()
  .catch((e) => {
    console.error("\n❌ Temizlik başarısız oldu, hiçbir değişiklik kaydedilmedi:\n", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
