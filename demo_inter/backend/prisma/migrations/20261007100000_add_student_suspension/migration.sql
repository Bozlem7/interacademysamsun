-- Öğrenci askıya alma: kayıt silinmeden yoklama, not girişi, aidat takibi ve WhatsApp
-- bildirimlerinden çıkarılır. Mevcut tüm öğrenciler DEFAULT ile ACTIVE olarak kalır.
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

ALTER TABLE "students"
  ADD COLUMN "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspended_at" TIMESTAMP(3),
  ADD COLUMN "suspended_by" TEXT;

CREATE INDEX "students_branch_id_status_idx" ON "students"("branch_id", "status");
