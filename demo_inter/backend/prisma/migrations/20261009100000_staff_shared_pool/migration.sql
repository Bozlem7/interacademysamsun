-- Diyetisyen ve psikolog şubeler arası ortak havuzdadır (branch_id NULL); antrenör şubeye bağlıdır.
ALTER TABLE "staff_profiles" ALTER COLUMN "branch_id" DROP NOT NULL;

-- Mevcut diyetisyen/psikologları ortak havuza al (CHECK eklenmeden ÖNCE çalışmalı).
UPDATE "staff_profiles" SET "branch_id" = NULL WHERE "specialty" IN ('diyetisyen', 'psikolog');

ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_branch_scope_chk" CHECK (
  ("specialty" = 'antrenor' AND "branch_id" IS NOT NULL) OR
  ("specialty" IN ('diyetisyen', 'psikolog') AND "branch_id" IS NULL)
);
