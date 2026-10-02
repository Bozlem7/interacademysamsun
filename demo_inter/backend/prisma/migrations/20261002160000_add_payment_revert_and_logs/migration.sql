-- "Geri Al" (ödeme geri alma) + ödeme hareketleri denetim kaydı.

-- Soft-delete kolonları (is_deleted / deleted_at / deleted_by) 20261002140000_add_finance_edit_delete_audit
-- migration'ında eklendi; geri alınan aidat tahsilatı o mekanizmayla iptal edilir.

-- 1) payment_id artık yalnızca AKTİF kayıtlar arasında tekil: geri alınıp tekrar "Ödendi"
--    yapılan bir dönem için yeni gelir kaydı açılabilmeli, iptal edilmiş eski kayıt ise
--    denetim izi olarak kalmalı. Prisma kısmi (partial) unique index'i modelleyemediği için
--    şemada @unique kaldırıldı, garanti burada veritabanı seviyesinde veriliyor.
DROP INDEX "finance_transactions_payment_id_key";
CREATE UNIQUE INDEX "finance_transactions_payment_id_active_key"
  ON "finance_transactions"("payment_id") WHERE "is_deleted" = false;
CREATE INDEX "finance_transactions_payment_id_idx" ON "finance_transactions"("payment_id");

-- 2) Ödeme hareketleri denetim kaydı (append-only).
CREATE TYPE "PaymentLogAction" AS ENUM ('PAID', 'REVERTED');

CREATE TABLE "student_payment_logs" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "admin_id" TEXT,
    "admin_name" TEXT NOT NULL,
    "action_type" "PaymentLogAction" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_payment_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "student_payment_logs_created_at_idx" ON "student_payment_logs"("created_at");
CREATE INDEX "student_payment_logs_student_id_idx" ON "student_payment_logs"("student_id");
CREATE INDEX "student_payment_logs_action_type_idx" ON "student_payment_logs"("action_type");

ALTER TABLE "student_payment_logs" ADD CONSTRAINT "student_payment_logs_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_payment_logs" ADD CONSTRAINT "student_payment_logs_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_payment_logs" ADD CONSTRAINT "student_payment_logs_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mevcut aidat tahsilatlarını geçmişe "PAID" olarak aktar — widget ilk açılışta boş kalmasın.
INSERT INTO "student_payment_logs" ("id", "student_id", "payment_id", "admin_id", "admin_name", "action_type", "amount", "created_at")
SELECT gen_random_uuid()::text, ft."student_id", ft."payment_id", ft."created_by", u."username", 'PAID', ft."amount", ft."created_at"
FROM "finance_transactions" ft
JOIN "users" u ON u."id" = ft."created_by"
WHERE ft."payment_id" IS NOT NULL AND ft."student_id" IS NOT NULL;

-- 3) Statü kilidi trigger'ı: "Ödendi → Ödenmedi" geçişi artık YALNIZCA geri alma servisinin
--    transaction'ı içinde (SET LOCAL app.allow_payment_revert = 'on') serbest. Diğer her
--    UPDATE yolunda kilit eskisi gibi devrede kalır. (Trigger triggers.sql ile kurulur; burada
--    fonksiyon gövdesi güncelleniyor ki halihazırda kurulu ortamlar da yeni davranışı alsın.)
CREATE OR REPLACE FUNCTION prevent_payment_status_downgrade()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'odendi' AND NEW.status = 'odenmedi'
     AND coalesce(current_setting('app.allow_payment_revert', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Odendi statusu tekrar odenmedi yapilamaz (payment id: %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
