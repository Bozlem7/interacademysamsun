import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/common/security/password";
import { encryptTc, hashTc } from "../src/common/security/tc";
import { generatePaymentForNewStudent } from "../src/modules/payments/payments.service";

/**
 * QA Test Verisi Seeder
 * =====================
 * 2 şube (Atakum / Vezirköprü) arasında veri izolasyonunu ve diyetisyen/psikolog için
 * "global personel" (isGlobalStaff, bkz. auth.service.ts) davranışını uçtan uca test etmek
 * için 6 personel + 20 öğrenci + bağlı program/ödeme/seans kaydı oluşturur.
 *
 * Tüm test kayıtları iki işaretle etiketlenir (cleanup_test_data.sql bu işaretleri kullanır):
 *   - users.username  -> "qatest_" öneki (personel + veli hesapları)
 *   - students.full_name -> " [QATEST]" soneki
 *   - groups.name -> "QATEST " öneki
 *
 * Çalıştırma:  npx tsx prisma/seed_test_data.ts   (veya: npm run seed:test)
 *
 * ÖNEMLİ: Sistemde personel/veli girişi şifre olarak TC kimlik numarasını kullanıyor
 * (bkz. auth.service.ts / verifyPassword(hash, tcNo)) — sabit bir "Test1234!" şifresi
 * kabul edilmiyor. Script sonunda her hesabın kullanıcı adı + TC (=şifre) tablo halinde
 * konsola basılır.
 */

const prisma = new PrismaClient();

// ---------------- yardımcılar ----------------

function usernameFromName(fullName: string) {
  return fullName
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z]/g, "");
}

function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function randomPhone(): string {
  return `05${randomDigits(9)}`;
}

/** Standart TCKN checksum algoritmasına uyan, rastgele fakat GEÇERLİ formatta sahte TC üretir. */
function generateValidTc(): string {
  let digits: number[];
  do {
    digits = randomDigits(9).split("").map(Number);
  } while (digits[0] === 0);
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  const d10 = (((oddSum * 7 - evenSum) % 10) + 10) % 10;
  const d11 = (oddSum + evenSum + d10) % 10;
  return digits.join("") + d10 + d11;
}

/** DB'de tc_no_hash çakışmayan, garanti benzersiz bir test TC'si üretir. */
async function generateUniqueTc(checkExists: (hash: string) => Promise<boolean>): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const tc = generateValidTc();
    const hash = hashTc(tc);
    if (!(await checkExists(hash))) return tc;
  }
  throw new Error("Benzersiz test TC'si üretilemedi (20 deneme başarısız oldu)");
}

const BOY_NAMES = ["Arda", "Kaan", "Emir", "Mert", "Yusuf", "Berat", "Efe", "Kerem", "Alp", "Baran"];
const GIRL_NAMES = ["Zeynep", "Elif", "Defne", "Asel", "Ece", "Nil", "Mira", "Duru", "Ela", "Azra"];
const LAST_NAMES = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Aydın", "Öztürk", "Arslan", "Doğan"];
const JOBS = ["Öğretmen", "Mühendis", "Esnaf", "Hemşire", "Muhasebeci", "Serbest Meslek", "Memur", "Avukat"];

type Credential = { role: string; username: string; tcNo: string; note: string };
const credentials: Credential[] = [];

async function createStaff(opts: {
  fullName: string;
  specialty: "antrenor" | "diyetisyen" | "psikolog";
  branchId: string;
  usernameOverride: string;
  note: string;
}) {
  const username = opts.usernameOverride;
  const tcNo = await generateUniqueTc(async (hash) => !!(await prisma.staffProfile.findUnique({ where: { tcNoHash: hash } })));
  const passwordHash = await hashPassword(tcNo);

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: "egitmen",
      staffProfile: {
        create: {
          fullName: opts.fullName,
          phone: randomPhone(),
          specialty: opts.specialty,
          branchId: opts.branchId,
          tcNoEncrypted: encryptTc(tcNo),
          tcNoHash: hashTc(tcNo),
        },
      },
    },
    include: { staffProfile: true },
  });

  credentials.push({ role: opts.specialty, username, tcNo, note: opts.note });
  console.log(`  + ${opts.specialty.padEnd(11)} ${opts.fullName} (kullanıcı adı: ${username})`);
  return user;
}

async function main() {
  console.log("=== QA Test Verisi Seeder ===\n");

  // ---- guard: script daha önce çalıştırıldıysa tekrar veri basma ----
  const already = await prisma.user.findFirst({ where: { username: { startsWith: "qatest_" } } });
  if (already) {
    console.log("Test verisi zaten mevcut (username 'qatest_' ile başlayan kayıt bulundu).");
    console.log("Önce cleanup_test_data.sql çalıştırıp script'i tekrar deneyin.");
    return;
  }

  // ---- şubeler: gerçek sistemde zaten var olmalı, oluşturmuyoruz ----
  const atakum = await prisma.branch.findUnique({ where: { code: "atakum" } });
  const vezirkopru = await prisma.branch.findUnique({ where: { code: "vezirkopru" } });
  if (!atakum || !vezirkopru) {
    throw new Error(
      "Atakum ve/veya Vezirköprü şubesi bulunamadı (branches.code = 'atakum' / 'vezirkopru' bekleniyor). Önce ana seed.ts çalıştırılmalı."
    );
  }
  console.log(`Şubeler doğrulandı: ${atakum.name} (${atakum.id}), ${vezirkopru.name} (${vezirkopru.id})\n`);

  // ---- 1) personel: 2 antrenör (şubeye bağlı) + 2 diyetisyen + 2 psikolog (global) ----
  console.log("Personel oluşturuluyor...");
  const antrenorAtakum = await createStaff({
    fullName: "Murat Kaya [QATEST]",
    specialty: "antrenor",
    branchId: atakum.id,
    usernameOverride: "qatest_antrenor_atakum",
    note: "Sadece Atakum şubesine bağlı antrenör",
  });
  const antrenorVezirkopru = await createStaff({
    fullName: "Hasan Yıldız [QATEST]",
    specialty: "antrenor",
    branchId: vezirkopru.id,
    usernameOverride: "qatest_antrenor_vezirkopru",
    note: "Sadece Vezirköprü şubesine bağlı antrenör",
  });
  // Diyetisyen/psikolog: branch_id şema gereği zorunlu (bir "ev şubesi" alır) ama
  // auth.service.ts login sırasında specialty'ye bakıp isGlobalStaff=true üretir —
  // bu sayede branch_id'den bağımsız olarak HER İKİ şubeyi de görürler. Bunu kanıtlamak
  // için iki uzmanın ev şubesini bilerek FARKLI seçiyoruz.
  const diyetisyen1 = await createStaff({
    fullName: "Elif Demir [QATEST]",
    specialty: "diyetisyen",
    branchId: atakum.id,
    usernameOverride: "qatest_diyetisyen1",
    note: "Global (ev şubesi: Atakum) — her iki şubeyi de görmeli",
  });
  const diyetisyen2 = await createStaff({
    fullName: "Ayşe Şahin [QATEST]",
    specialty: "diyetisyen",
    branchId: vezirkopru.id,
    usernameOverride: "qatest_diyetisyen2",
    note: "Global (ev şubesi: Vezirköprü) — her iki şubeyi de görmeli",
  });
  const psikolog1 = await createStaff({
    fullName: "Canan Öztürk [QATEST]",
    specialty: "psikolog",
    branchId: atakum.id,
    usernameOverride: "qatest_psikolog1",
    note: "Global (ev şubesi: Atakum) — her iki şubeyi de görmeli",
  });
  const psikolog2 = await createStaff({
    fullName: "Serkan Arslan [QATEST]",
    specialty: "psikolog",
    branchId: vezirkopru.id,
    usernameOverride: "qatest_psikolog2",
    note: "Global (ev şubesi: Vezirköprü) — her iki şubeyi de görmeli",
  });

  // ---- 2) her şube için ayrı QATEST grubu (antrenman programı bu gruba bağlanır) ----
  const groupAtakum = await prisma.group.create({
    data: { branchId: atakum.id, name: "QATEST Atakum Grubu", ageRange: "8-14" },
  });
  const groupVezirkopru = await prisma.group.create({
    data: { branchId: vezirkopru.id, name: "QATEST Vezirköprü Grubu", ageRange: "8-14" },
  });
  console.log(`\nGruplar oluşturuldu: "${groupAtakum.name}", "${groupVezirkopru.name}"`);

  // ---- 3) çakışmayan antrenman programı: farklı gün + farklı saat ----
  await prisma.trainingSession.create({
    data: {
      groupId: groupAtakum.id,
      dayOfWeek: 1, // Pazartesi
      startTime: new Date("1970-01-01T17:00:00.000Z"),
      endTime: new Date("1970-01-01T18:30:00.000Z"),
      sessionType: "saha",
      location: "Atakum Sahası",
      description: "[QATEST] Atakum antrenman programı",
    },
  });
  await prisma.trainingSession.create({
    data: {
      groupId: groupVezirkopru.id,
      dayOfWeek: 3, // Çarşamba
      startTime: new Date("1970-01-01T19:00:00.000Z"),
      endTime: new Date("1970-01-01T20:30:00.000Z"),
      sessionType: "saha",
      location: "Vezirköprü Sahası",
      description: "[QATEST] Vezirköprü antrenman programı",
    },
  });
  console.log("Antrenman programı oluşturuldu: Atakum=Pazartesi 17:00, Vezirköprü=Çarşamba 19:00 (çakışmıyor)");

  // ---- 4) 20 öğrenci: 10 Atakum + 10 Vezirköprü ----
  console.log("\nÖğrenciler oluşturuluyor...");
  type StudentDef = { branch: typeof atakum; group: typeof groupAtakum; index: number };
  const defs: StudentDef[] = [
    ...Array.from({ length: 10 }, (_, i) => ({ branch: atakum, group: groupAtakum, index: i })),
    ...Array.from({ length: 10 }, (_, i) => ({ branch: vezirkopru, group: groupVezirkopru, index: 10 + i })),
  ];

  const createdStudents: { id: string; branchCode: string; fullName: string }[] = [];

  for (const def of defs) {
    const i = def.index;
    const isGirl = i % 2 === 0;
    const firstName = isGirl ? GIRL_NAMES[i % GIRL_NAMES.length] : BOY_NAMES[i % BOY_NAMES.length];
    const lastName = LAST_NAMES[(i * 3) % LAST_NAMES.length];
    const fullName = `${firstName} ${lastName} [QATEST]`;

    // Doğum tarihi: 2012-2018 arası, farklı yaş grupları
    const birthYear = 2012 + (i % 7);
    const dob = new Date(Date.UTC(birthYear, i % 12, 1 + (i % 27)));

    const tcNo = await generateUniqueTc(async (hash) => !!(await prisma.student.findUnique({ where: { tcNoHash: hash } })));

    const motherFirst = GIRL_NAMES[(i + 2) % GIRL_NAMES.length];
    const fatherFirst = BOY_NAMES[(i + 5) % BOY_NAMES.length];

    // Veli iletişim mantığı: getNotifyRecipients() sadece notify_* TRUE ve ilgili telefon
    // DOLU olan kayıtlara bildirim yollar — o yüzden 3 senaryoyu dönüşümlü test ediyoruz:
    //   pattern 0: sadece anne (notifyMother=true)
    //   pattern 1: sadece baba (notifyFather=true)
    //   pattern 2: anne + baba + vasi, hepsi bildirimli
    const pattern = i % 3;
    const contact: Record<string, unknown> = {
      motherName: `${motherFirst} ${lastName}`,
      motherJob: JOBS[i % JOBS.length],
      fatherName: `${fatherFirst} ${lastName}`,
      fatherJob: JOBS[(i + 3) % JOBS.length],
      notifyMother: false,
      notifyFather: false,
      notifyGuardian: false,
    };
    if (pattern === 0) {
      contact.motherPhone = randomPhone();
      contact.notifyMother = true;
    } else if (pattern === 1) {
      contact.fatherPhone = randomPhone();
      contact.notifyFather = true;
    } else {
      contact.motherPhone = randomPhone();
      contact.fatherPhone = randomPhone();
      contact.emergencyName = `${motherFirst} ${lastName} (Vasi)`;
      contact.emergencyPhone = randomPhone();
      contact.notifyMother = true;
      contact.notifyFather = true;
      contact.notifyGuardian = true;
    }

    const parentUsername = `qatest_veli_${String(i + 1).padStart(3, "0")}`;
    const parentPasswordHash = await hashPassword(tcNo);
    const parentUser = await prisma.user.create({
      data: { username: parentUsername, passwordHash: parentPasswordHash, role: "veli" },
    });

    const student = await prisma.student.create({
      data: {
        branchId: def.branch.id,
        tcNoEncrypted: encryptTc(tcNo),
        tcNoHash: hashTc(tcNo),
        fullName,
        dob,
        gender: isGirl ? "kiz" : "erkek",
        bloodType: ["A Rh+", "B Rh+", "0 Rh+", "AB Rh-"][i % 4],
        heightCm: 120 + (i % 10) * 4,
        weightKg: 25 + (i % 10) * 3,
        paymentDueDay: [5, 15, 25][i % 3],
        groupId: def.group.id,
        parentUserId: parentUser.id,
        ...contact,
      },
    });

    // Ödeme: mevcut servis fonksiyonuyla (gerçek uygulama akışıyla birebir) cari dönem kaydı açılır.
    await generatePaymentForNewStudent(student.id);
    // Yarısı "Ödendi" (paid_at set), yarısı "Ödenmedi" olarak bırakılıyor.
    if (i % 2 === 0) {
      const now = new Date();
      await prisma.payment.updateMany({
        where: { studentId: student.id, periodYear: now.getUTCFullYear(), periodMonth: now.getUTCMonth() + 1 },
        data: { status: "odendi", paidAt: now },
      });
    }

    // Antrenör ataması: yalnızca kendi şubesindeki antrenöre.
    const instructorUserId = def.branch.code === "atakum" ? antrenorAtakum.id : antrenorVezirkopru.id;
    await prisma.instructorStudent.create({ data: { instructorUserId, studentId: student.id } });

    createdStudents.push({ id: student.id, branchCode: def.branch.code, fullName });
    credentials.push({ role: "veli", username: parentUsername, tcNo, note: `${fullName} velisi (${def.branch.name})` });
  }
  console.log(`${createdStudents.length} öğrenci oluşturuldu (10 Atakum + 10 Vezirköprü).`);

  // ---- 5) yoklama örneği: her şubede birkaç öğrenci için var/yok karışık ----
  console.log("\nÖrnek yoklama kayıtları oluşturuluyor...");
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  for (const s of createdStudents.slice(0, 4).concat(createdStudents.slice(10, 14))) {
    const markedBy = s.branchCode === "atakum" ? antrenorAtakum.id : antrenorVezirkopru.id;
    const idx = createdStudents.indexOf(s);
    await prisma.attendanceRecord.create({
      data: {
        studentId: s.id,
        sessionDate: today,
        status: idx % 3 === 0 ? "yok" : "var",
        markedBy,
      },
    });
  }

  // ---- 6) diyetisyen/psikolog seansları: StudentNote ile her iki şubedeki öğrencilere ortak erişim kanıtı ----
  // (Sistemde "randevu" tablosu yok; diyetisyen/psikolog görüşmeleri student_notes tablosunda
  //  category=diyetisyen_gorusu/psikolog_gorusu olarak tutuluyor — bkz. notes.controller.ts)
  console.log("Diyetisyen/psikolog seans notları oluşturuluyor (her iki şubeden öğrencilere)...");
  const now = new Date();
  const periodMonth = now.getUTCMonth() + 1;
  const periodYear = now.getUTCFullYear();

  const atakumStudents = createdStudents.filter((s) => s.branchCode === "atakum").slice(0, 2);
  const vezirkopruStudents = createdStudents.filter((s) => s.branchCode === "vezirkopru").slice(0, 2);

  for (const [author, category] of [
    [diyetisyen1, "diyetisyen_gorusu"],
    [psikolog1, "psikolog_gorusu"],
  ] as const) {
    for (const s of [...atakumStudents, ...vezirkopruStudents]) {
      await prisma.studentNote.create({
        data: {
          studentId: s.id,
          authorId: author.id,
          category,
          periodMonth,
          periodYear,
          body: `[QATEST] ${category === "diyetisyen_gorusu" ? "Diyet" : "Psikolojik"} değerlendirme görüşmesi notu.`,
        },
      });
    }
  }
  console.log("Seans notları oluşturuldu: qatest_diyetisyen1 ve qatest_psikolog1, her iki şubeden 2'şer öğrenciye not girdi.");

  // ---- özet ----
  console.log("\n=== Test verisi başarıyla oluşturuldu ===");
  console.log("\nGiriş bilgileri (şifre = TC kimlik numarası, sistem TC'yi şifre olarak kullanıyor):\n");
  console.log("rol         | kullanıcı adı               | TC (şifre)  | not");
  console.log("------------|------------------------------|-------------|----------------------------------------");
  for (const c of credentials) {
    if (c.role === "veli") continue; // 20 veli hesabı listeyi kalabalıklaştırmasın
    console.log(`${c.role.padEnd(11)} | ${c.username.padEnd(28)} | ${c.tcNo} | ${c.note}`);
  }
  console.log(`\n(+ 20 veli hesabı: qatest_veli_001 .. qatest_veli_020, şifreleri kendi çocuklarının TC'si)`);
  console.log("\nTemizlemek için: psql ile prisma/cleanup_test_data.sql çalıştırın.");
  console.log("Doğrulama sorguları için: prisma/verify_test_data.sql");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
