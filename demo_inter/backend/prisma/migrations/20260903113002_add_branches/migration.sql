-- Multi-branch (Atakum / Vezirköprü) support.
-- Existing rows (students/staff/groups/pre_registrations) are backfilled to
-- the "atakum" branch by default so nothing breaks; reassign via the admin UI afterwards.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "branches" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

INSERT INTO "branches" ("id", "name", "code") VALUES
  (gen_random_uuid()::text, 'Atakum', 'atakum'),
  (gen_random_uuid()::text, 'Vezirköprü', 'vezirkopru');

-- students.branch_id
ALTER TABLE "students" ADD COLUMN "branch_id" TEXT;
UPDATE "students" SET "branch_id" = (SELECT id FROM "branches" WHERE code = 'atakum');
ALTER TABLE "students" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "students" ADD CONSTRAINT "students_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "students_branch_id_idx" ON "students"("branch_id");

-- staff_profiles.branch_id
ALTER TABLE "staff_profiles" ADD COLUMN "branch_id" TEXT;
UPDATE "staff_profiles" SET "branch_id" = (SELECT id FROM "branches" WHERE code = 'atakum');
ALTER TABLE "staff_profiles" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "staff_profiles_branch_id_idx" ON "staff_profiles"("branch_id");

-- groups.branch_id (+ swap global unique(name) for unique(branch_id, name))
ALTER TABLE "groups" ADD COLUMN "branch_id" TEXT;
UPDATE "groups" SET "branch_id" = (SELECT id FROM "branches" WHERE code = 'atakum');
ALTER TABLE "groups" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "groups" ADD CONSTRAINT "groups_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "groups_branch_id_idx" ON "groups"("branch_id");
ALTER TABLE "groups" DROP CONSTRAINT IF EXISTS "groups_name_key";
CREATE UNIQUE INDEX "groups_branch_id_name_key" ON "groups"("branch_id", "name");

-- pre_registrations.branch_id
ALTER TABLE "pre_registrations" ADD COLUMN "branch_id" TEXT;
UPDATE "pre_registrations" SET "branch_id" = (SELECT id FROM "branches" WHERE code = 'atakum');
ALTER TABLE "pre_registrations" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "pre_registrations" ADD CONSTRAINT "pre_registrations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "pre_registrations_branch_id_idx" ON "pre_registrations"("branch_id");
