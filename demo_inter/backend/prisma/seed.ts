import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/common/security/password";
import { encryptTc, hashTc } from "../src/common/security/tc";
import { generatePaymentForNewStudent } from "../src/modules/payments/payments.service";
import { env } from "../src/config/env";

const prisma = new PrismaClient();

// ---- deterministic, checksum-valid TC kimlik no generator (for mock/test data only) ----
function generateTc(seed: number): string {
  const base = String(100000000 + (seed * 7919) % 899999999).padStart(9, "0");
  const digits = base.split("").map(Number);
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  const d10 = (((oddSum * 7 - evenSum) % 10) + 10) % 10;
  const d11 = (oddSum + evenSum + d10) % 10;
  return digits.join("") + d10 + d11;
}

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

function randomPhone(seed: number): string {
  const n = String(5000000000 + ((seed * 104729) % 999999999)).slice(0, 9);
  return `05${n}`;
}

const BOY_NAMES = ["Arda", "Kaan", "Emir", "Mert", "Yusuf", "Berat", "Efe", "Kerem", "Alp", "Baran", "Doruk", "Ege", "Tolga", "Onur", "Kayra"];
const GIRL_NAMES = ["Zeynep", "Elif", "Defne", "Asel", "Ece", "Nil", "Mira", "Duru", "Ela", "Azra", "Sude", "Yaren", "İpek", "Nehir", "Cansu"];
const LAST_NAMES = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Aydın", "Öztürk", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Koç", "Kurt"];
const JOBS = ["Öğretmen", "Mühendis", "Esnaf", "Hemşire", "Muhasebeci", "Serbest Meslek", "Memur", "Avukat"];

async function seedMockData() {
  const branchRows = await prisma.branch.findMany();
  const branchByCode = Object.fromEntries(branchRows.map((b) => [b.code, b]));

  // ---- gruplar: her şube için 3 yaş grubu ----
  const groupDefs = [
    { name: "U-8 Akademi", ageRange: "5-8" },
    { name: "U-11 Gelişim", ageRange: "9-11" },
    { name: "U-14 Hazırlık", ageRange: "12-14" },
  ];
  const groupsByBranch: Record<string, { id: string; name: string }[]> = {};
  for (const branch of branchRows) {
    groupsByBranch[branch.code] = [];
    for (const g of groupDefs) {
      const row = await prisma.group.upsert({
        where: { branchId_name: { branchId: branch.id, name: g.name } },
        create: { branchId: branch.id, name: g.name, ageRange: g.ageRange },
        update: {},
      });
      groupsByBranch[branch.code].push(row);
    }
    console.log(`Seeded ${groupDefs.length} groups for branch: ${branch.name}`);
  }

  // ---- eğitmenler: her şube için 1 antrenör + 1 diyetisyen ----
  const instructorNamesByBranch: Record<string, { fullName: string; specialty: "antrenor" | "diyetisyen" }[]> = {
    atakum: [
      { fullName: "Murat Kaya", specialty: "antrenor" },
      { fullName: "Elif Demir", specialty: "diyetisyen" },
    ],
    vezirkopru: [
      { fullName: "Hasan Yıldız", specialty: "antrenor" },
      { fullName: "Ayşe Şahin", specialty: "diyetisyen" },
    ],
  };
  const antrenorIdByBranch: Record<string, string> = {};
  let staffSeedCounter = 900000;
  for (const branch of branchRows) {
    const defs = instructorNamesByBranch[branch.code] ?? [];
    for (const def of defs) {
      const username = usernameFromName(def.fullName);
      const tcNo = generateTc(staffSeedCounter++);
      const existing = await prisma.user.findUnique({ where: { username } });
      let userId: string;
      if (existing) {
        userId = existing.id;
      } else {
        const passwordHash = await hashPassword(tcNo);
        const user = await prisma.user.create({
          data: {
            username,
            passwordHash,
            role: "egitmen",
            staffProfile: {
              create: {
                fullName: def.fullName,
                phone: randomPhone(staffSeedCounter),
                specialty: def.specialty,
                branchId: branch.id,
                tcNoEncrypted: encryptTc(tcNo),
                tcNoHash: hashTc(tcNo),
              },
            },
          },
        });
        userId = user.id;
        console.log(`Seeded instructor: ${def.fullName} (${branch.name}, şifre=TCKN=${tcNo}, kullanıcı adı=${username})`);
      }
      if (def.specialty === "antrenor") antrenorIdByBranch[branch.code] = userId;
    }
  }

  // ---- öğrenciler: idempotency guard ----
  const existingCount = await prisma.student.count({ where: { fullName: { contains: "[seed]" } } });
  if (existingCount > 0) {
    console.log(`Mock student data already present (${existingCount}), skipping student seeding.`);
    return;
  }

  const TOTAL_STUDENTS = 28;
  let tcSeed = 1;
  for (let i = 0; i < TOTAL_STUDENTS; i++) {
    const branch = branchRows[i % branchRows.length];
    const groups = groupsByBranch[branch.code];
    const isGirl = i % 2 === 0;
    const firstName = isGirl ? GIRL_NAMES[i % GIRL_NAMES.length] : BOY_NAMES[i % BOY_NAMES.length];
    const lastName = LAST_NAMES[(i * 3) % LAST_NAMES.length];
    const fullName = `${firstName} ${lastName} [seed]`;

    const age = 5 + (i % 12); // 5..16
    const birthYear = new Date().getFullYear() - age;
    const dob = new Date(Date.UTC(birthYear, i % 12, 1 + (i % 27)));

    const hasGroup = i % 10 !== 0; // ~90% grouplu, birkaçı serbest
    const group = hasGroup ? groups[i % groups.length] : null;

    const tcNo = generateTc(tcSeed++);
    const motherFirst = GIRL_NAMES[(i + 2) % GIRL_NAMES.length];
    const fatherFirst = BOY_NAMES[(i + 5) % BOY_NAMES.length];

    const parentPasswordHash = await hashPassword(tcNo);
    const parentUser = await prisma.user.create({
      data: { username: `veli_seed_${i}_${tcSeed}`, passwordHash: parentPasswordHash, role: "veli" },
    });

    const student = await prisma.student.create({
      data: {
        branchId: branch.id,
        tcNoEncrypted: encryptTc(tcNo),
        tcNoHash: hashTc(tcNo),
        fullName,
        dob,
        gender: isGirl ? "kiz" : "erkek",
        bloodType: ["A Rh+", "B Rh+", "0 Rh+", "AB Rh-"][i % 4],
        heightCm: 100 + age * 5,
        weightKg: 20 + age * 3,
        motherName: `${motherFirst} ${lastName}`,
        motherPhone: randomPhone(tcSeed + 1),
        motherJob: JOBS[i % JOBS.length],
        fatherName: `${fatherFirst} ${lastName}`,
        fatherPhone: randomPhone(tcSeed + 2),
        fatherJob: JOBS[(i + 3) % JOBS.length],
        emergencyName: `${motherFirst} ${lastName}`,
        emergencyPhone: randomPhone(tcSeed + 3),
        paymentDueDay: i % 2 === 0 ? 15 : 30,
        groupId: group?.id,
        parentUserId: parentUser.id,
      },
    });

    await generatePaymentForNewStudent(student.id);

    if (group) {
      const instructorUserId = antrenorIdByBranch[branch.code];
      if (instructorUserId) {
        await prisma.instructorStudent.upsert({
          where: { instructorUserId_studentId: { instructorUserId, studentId: student.id } },
          create: { instructorUserId, studentId: student.id },
          update: {},
        });
      }
    }
  }
  console.log(`Seeded ${TOTAL_STUDENTS} mock students across ${branchRows.length} branches.`);
}

async function main() {
  const branches = [
    { name: "Atakum", code: "atakum" },
    { name: "Vezirköprü", code: "vezirkopru" },
  ];
  for (const branch of branches) {
    await prisma.branch.upsert({ where: { code: branch.code }, create: branch, update: { name: branch.name } });
    console.log(`Seeded branch: ${branch.name}`);
  }

  const admins = [
    { username: "admin1", password: env.seedAdminPasswords.admin1 },
    { username: "admin2", password: env.seedAdminPasswords.admin2 },
    { username: "admin3", password: env.seedAdminPasswords.admin3 },
  ];

  for (const admin of admins) {
    const passwordHash = await hashPassword(admin.password);
    await prisma.user.upsert({
      where: { username: admin.username },
      create: { username: admin.username, passwordHash, role: "yonetici" },
      update: { passwordHash },
    });
    console.log(`Seeded admin user: ${admin.username}`);
  }

  await prisma.feeSettings.upsert({
    where: { id: 1 },
    create: { id: 1, monthlyFee: 3500 },
    update: {},
  });
  console.log("Seeded fee_settings: monthlyFee=3500");

  // Sahte/demo öğrenci-eğitmen verisi production'da istenmediği için kapalı.
  // Yerelde test verisi lazımsa bu satırı geçici olarak aç.
  // await seedMockData();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
