-- Run this once after the initial `prisma migrate dev` (Prisma does not model triggers).
-- Defense-in-depth: blocks any UPDATE that would move a payment from 'odendi' back to 'odenmedi',
-- even if a future bug in the API layer allowed it through.

CREATE OR REPLACE FUNCTION prevent_payment_status_downgrade()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'odendi' AND NEW.status = 'odenmedi' THEN
    RAISE EXCEPTION 'Odendi statusu tekrar odenmedi yapilamaz (payment id: %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_payment_downgrade ON payments;
CREATE TRIGGER trg_prevent_payment_downgrade
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION prevent_payment_status_downgrade();

-- Trigram index for fast ILIKE name search (requires pg_trgm extension).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_students_name_trgm ON students USING gin (full_name gin_trgm_ops);
