import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/common/security/password";

/**
 * Var olan bir yönetici (yonetici) hesabının kullanıcı adını ve/veya şifresini
 * güvenli şekilde değiştirir. Şifre argon2id ile hash'lenip veritabanına yazılır,
 * .env dosyasına HİÇBİR ŞEY yazılmaz (login zaten .env'i okumuyor).
 *
 * Kullanım:
 *   npx tsx scripts/reset-admin.ts <mevcutKullaniciAdi> <yeniKullaniciAdi> <yeniSifre>
 *
 * Örnek:
 *   npx tsx scripts/reset-admin.ts admin1 yonetici_muhammed "GucluBirSifre_2026!"
 */

const prisma = new PrismaClient();

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

async function main() {
  const [, , currentUsername, newUsername, newPassword] = process.argv;

  if (!currentUsername || !newUsername || !newPassword) {
    fail(
      "Eksik argüman.\nKullanım: npx tsx scripts/reset-admin.ts <mevcutKullaniciAdi> <yeniKullaniciAdi> <yeniSifre>"
    );
  }
  if (newPassword.length < 8) {
    fail("Yeni şifre en az 8 karakter olmalıdır.");
  }

  const admin = await prisma.user.findUnique({ where: { username: currentUsername } });
  if (!admin) fail(`"${currentUsername}" kullanıcı adıyla bir hesap bulunamadı.`);
  if (admin.role !== "yonetici") {
    fail(`"${currentUsername}" bir yönetici hesabı değil (role: ${admin.role}) — güvenlik için işlem durduruldu.`);
  }

  if (newUsername !== currentUsername) {
    const taken = await prisma.user.findUnique({ where: { username: newUsername } });
    if (taken) fail(`"${newUsername}" kullanıcı adı zaten başka bir hesap tarafından kullanılıyor.`);
  }

  const passwordHash = await hashPassword(newPassword);

  const updated = await prisma.user.update({
    where: { id: admin.id },
    data: { username: newUsername, passwordHash },
  });

  console.log("\n✅ Yönetici hesabı güncellendi.");
  console.log(`   id            : ${updated.id}`);
  console.log(`   eski kullanıcı: ${currentUsername}`);
  console.log(`   yeni kullanıcı: ${updated.username}`);
  console.log("   şifre         : (güncellendi, burada gösterilmiyor)\n");
  console.log("Şimdi bu terminaldeki komut geçmişini temizlemeyi ve bu dosyayı silmeyi unutma.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
