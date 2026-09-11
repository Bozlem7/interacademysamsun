-- ============================================================================
-- QA Test Verisi Temizleme Scripti
-- ============================================================================
-- seed_test_data.ts ile oluşturulan TÜM test kayıtlarını (6 personel, 20 öğrenci,
-- 20 veli hesabı, 2 grup, antrenman programı, yoklama, ödeme ve diyetisyen/psikolog
-- seans notları) güvenle siler. Gerçek üretim verisine DOKUNMAZ.
--
-- Eşleştirme mantığı (seed_test_data.ts ile birebir aynı işaretler):
--   - users.username  LIKE 'qatest_%'   -> 6 personel + 20 veli hesabı
--   - students.full_name LIKE '%[QATEST]' -> 20 test öğrencisi
--   - groups.name LIKE 'QATEST %'        -> 2 test grubu
--
-- Kullanım:
--   psql "$DATABASE_URL" -f prisma/cleanup_test_data.sql
--
-- Tek transaction içinde çalışır: herhangi bir adım hata verirse hiçbir şey silinmez.
-- ============================================================================

BEGIN;

-- Silinecek öğrenci/personel id'lerini geçici olarak sabitle (aşağıdaki adımlarda tekrar
-- tekrar aynı LIKE taramasını yapmak yerine, tutarlılık için tek seferde hesaplanır).
CREATE TEMP TABLE _qatest_student_ids AS
  SELECT id FROM students WHERE full_name LIKE '%[QATEST]';

CREATE TEMP TABLE _qatest_user_ids AS
  SELECT id FROM users WHERE username LIKE 'qatest_%';

CREATE TEMP TABLE _qatest_group_ids AS
  SELECT id FROM groups WHERE name LIKE 'QATEST %';

-- 1) Yoklama kayıtları (öğrenci VEYA yoklamayı giren personel test verisiyse)
DELETE FROM attendance_records
WHERE student_id IN (SELECT id FROM _qatest_student_ids)
   OR marked_by IN (SELECT id FROM _qatest_user_ids);

-- 2) Diyetisyen/psikolog/antrenör seans notları (öğrenci VEYA yazan personel test verisiyse)
DELETE FROM student_notes
WHERE student_id IN (SELECT id FROM _qatest_student_ids)
   OR author_id IN (SELECT id FROM _qatest_user_ids);

-- 3) Ödeme kayıtları
DELETE FROM payments
WHERE student_id IN (SELECT id FROM _qatest_student_ids);

-- 4) Antrenör-öğrenci atamaları
DELETE FROM instructor_students
WHERE student_id IN (SELECT id FROM _qatest_student_ids)
   OR instructor_user_id IN (SELECT id FROM _qatest_user_ids);

-- 5) Antrenman programı (test gruplarına bağlı seanslar)
DELETE FROM training_sessions
WHERE group_id IN (SELECT id FROM _qatest_group_ids);

-- 6) Ön kayıt (varsa, test öğrencisine dönüştürülmüş bir pre-registration olabilir)
UPDATE pre_registrations
SET converted_student_id = NULL
WHERE converted_student_id IN (SELECT id FROM _qatest_student_ids);

-- 7) Öğrenciler
DELETE FROM students
WHERE id IN (SELECT id FROM _qatest_student_ids);

-- 8) Test grupları
DELETE FROM groups
WHERE id IN (SELECT id FROM _qatest_group_ids);

-- 9) staff_profiles, users.user_id FK'si üzerinden ON DELETE CASCADE ile otomatik silinir;
--    yine de açıkça belirtmek adına önce onu, sonra kullanıcıları siliyoruz.
DELETE FROM staff_profiles
WHERE user_id IN (SELECT id FROM _qatest_user_ids);

-- 10) Personel + veli kullanıcı hesapları (6 personel + 20 veli = 26 kayıt beklenir)
DELETE FROM users
WHERE id IN (SELECT id FROM _qatest_user_ids);

-- ---- özet: kaç kayıt silindiğini doğrulamak için ----
DO $$
DECLARE
  remaining_students INT;
  remaining_users INT;
  remaining_groups INT;
BEGIN
  SELECT COUNT(*) INTO remaining_students FROM students WHERE full_name LIKE '%[QATEST]';
  SELECT COUNT(*) INTO remaining_users FROM users WHERE username LIKE 'qatest_%';
  SELECT COUNT(*) INTO remaining_groups FROM groups WHERE name LIKE 'QATEST %';
  RAISE NOTICE 'Temizlik sonrası kalan QATEST kayıtları -> students: %, users: %, groups: %', remaining_students, remaining_users, remaining_groups;
  IF remaining_students != 0 OR remaining_users != 0 OR remaining_groups != 0 THEN
    RAISE EXCEPTION 'Temizlik eksik kaldı, işlem geri alınıyor (ROLLBACK).';
  END IF;
END $$;

DROP TABLE _qatest_student_ids;
DROP TABLE _qatest_user_ids;
DROP TABLE _qatest_group_ids;

COMMIT;
