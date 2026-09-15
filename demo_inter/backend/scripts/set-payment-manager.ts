import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Bir yönetici hesabına aidat "Ödendi" işaretleme yetkisini (canManagePayments) açar/kapatır.
 *
 * Kullanım:
 *   npx tsx scripts/set-payment-manager.ts <kullaniciAdi> <true|false>
 *
 * Örnek:
 *   npx tsx scripts/set-payment-manager.ts muhammet true
 */

const prisma = new PrismaClient();

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

async function main() {
  const [, , username, flagArg] = process.argv;

  if (!username || (flagArg !== "true" && flagArg !== "false")) {
    fail("Eksik/hatalı argüman.\nKullanım: npx tsx scripts/set-payment-manager.ts <kullaniciAdi> <true|false>");
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) fail(`"${username}" kullanıcı adıyla bir hesap bulunamadı.`);
  if (user.role !== "yonetici") {
    fail(`"${username}" bir yönetici hesabı değil (role: ${user.role}) — güvenlik için işlem durduruldu.`);
  }

  const canManagePayments = flagArg === "true";
  const updated = await prisma.user.update({ where: { id: user.id }, data: { canManagePayments } });

  console.log(`\n✅ "${updated.username}" hesabı için canManagePayments = ${updated.canManagePayments}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
