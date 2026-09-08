-- The previous migration's `DROP CONSTRAINT IF EXISTS "groups_name_key"` was a no-op because
-- Prisma had originally created it as a plain UNIQUE INDEX, not a table CONSTRAINT.
-- Drop the index directly so the composite (branch_id, name) uniqueness actually takes effect.
DROP INDEX IF EXISTS "groups_name_key";
