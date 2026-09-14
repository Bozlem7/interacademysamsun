-- ============================================================================
-- QA Test Verisi Temizleme Scripti
-- ============================================================================
-- seed_test_data.ts ile oluşturulan TÜM test kayıtlarını (6 personel, 20 öğrenci,
-- 20 veli hesabı, 2 grup, antrenman programı, yoklama, ödeme ve diyetisyen/psikolog
-- seans notları) güvenle siler. Gerçek üretim verisine DOKUNMAZ.
--
-- Eşleştirme mantığı (seed_test_data.ts ile birebir aynı işaretler):
--   - users.username      LIKE 'qatest_%'    -> 6 personel + 20 veli hesabı
--   - students.full_name  LIKE '%[QATEST]'   -> 20 test öğrencisi
--   - groups.name         LIKE 'QATEST %'    -> 2 test grubu
-- (Not: sistemde personel/kullanıcılar için email alanı yok, sadece username var —
--  bu yüzden "@test.interacademy.com" gibi bir e-posta deseni kullanılmıyor.)
--
-- Silme sırası, foreign key kısıtlarına takılmamak için alttan yukarıya:
--   yoklama/notlar/ödemeler/atamalar -> antrenman programı -> öğrenciler -> gruplar
--   -> staff_profiles -> users
--
-- Kullanım:
--   psql "$DATABASE_URL" -f prisma/cleanup_test_data.sql
--   (veya sunucuda: sudo -u postgres psql -d inter_academy -f prisma/cleanup_test_data.sql)
--
-- Tek transaction içinde çalışır: herhangi bir adım hata verirse hiçbir şey silinmez.
-- Sonunda her tablodan kaç kayıt silindiğini gösteren bir özet log basar.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  student_ids   uuid[];
  user_ids      uuid[];
  group_ids     uuid[];
  n_attendance  INT;
  n_notes       INT;
  n_payments    INT;
  n_instructor_students INT;
  n_sessions    INT;
  n_prereg_unlinked INT;
  n_students    INT;
  n_groups      INT;
  n_staff_profiles INT;
  n_users       INT;
  remaining_students INT;
  remaining_users    INT;
  remaining_groups   INT;
BEGIN
  SELECT ARRAY(SELECT id FROM students WHERE full_name LIKE '%[QATEST]') INTO student_ids;
  SELECT ARRAY(SELECT id FROM users WHERE username LIKE 'qatest_%') INTO user_ids;
  SELECT ARRAY(SELECT id FROM groups WHERE name LIKE 'QATEST %') INTO group_ids;

  -- 1) Yoklama kayıtları (öğrenci VEYA yoklamayı giren personel test verisiyse)
  DELETE FROM attendance_records
  WHERE student_id = ANY(student_ids) OR marked_by = ANY(user_ids);
  GET DIAGNOSTICS n_attendance = ROW_COUNT;

  -- 2) Diyetisyen/psikolog/antrenör seans notları (öğrenci VEYA yazan personel test verisiyse)
  DELETE FROM student_notes
  WHERE student_id = ANY(student_ids) OR author_id = ANY(user_ids);
  GET DIAGNOSTICS n_notes = ROW_COUNT;

  -- 3) Ödeme kayıtları
  DELETE FROM payments
  WHERE student_id = ANY(student_ids);
  GET DIAGNOSTICS n_payments = ROW_COUNT;

  -- 4) Antrenör-öğrenci atamaları
  DELETE FROM instructor_students
  WHERE student_id = ANY(student_ids) OR instructor_user_id = ANY(user_ids);
  GET DIAGNOSTICS n_instructor_students = ROW_COUNT;

  -- 5) Antrenman programı (test gruplarına bağlı seanslar)
  DELETE FROM training_sessions
  WHERE group_id = ANY(group_ids);
  GET DIAGNOSTICS n_sessions = ROW_COUNT;

  -- 6) Ön kayıt (varsa, test öğrencisine dönüştürülmüş bir pre-registration olabilir)
  UPDATE pre_registrations
  SET converted_student_id = NULL
  WHERE converted_student_id = ANY(student_ids);
  GET DIAGNOSTICS n_prereg_unlinked = ROW_COUNT;

  -- 7) Öğrenciler
  DELETE FROM students WHERE id = ANY(student_ids);
  GET DIAGNOSTICS n_students = ROW_COUNT;

  -- 8) Test grupları
  DELETE FROM groups WHERE id = ANY(group_ids);
  GET DIAGNOSTICS n_groups = ROW_COUNT;

  -- 9) staff_profiles (users.id FK'si CASCADE olsa da açıkça ve ayrı sayılabilir şekilde siliniyor)
  DELETE FROM staff_profiles WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS n_staff_profiles = ROW_COUNT;

  -- 10) Personel + veli kullanıcı hesapları
  DELETE FROM users WHERE id = ANY(user_ids);
  GET DIAGNOSTICS n_users = ROW_COUNT;

  RAISE NOTICE '';
  RAISE NOTICE '=== QA Test Verisi Temizlik Özeti ===';
  RAISE NOTICE '  yoklama_kaydi (attendance_records)     : %', n_attendance;
  RAISE NOTICE '  uzman_notu (student_notes)              : %', n_notes;
  RAISE NOTICE '  odeme_kaydi (payments)                  : %', n_payments;
  RAISE NOTICE '  antrenor_atamasi (instructor_students)  : %', n_instructor_students;
  RAISE NOTICE '  antrenman_seansi (training_sessions)    : %', n_sessions;
  RAISE NOTICE '  on_kayit_baglantisi_temizlendi          : %', n_prereg_unlinked;
  RAISE NOTICE '  ogrenci (students)                      : %', n_students;
  RAISE NOTICE '  grup (groups)                           : %', n_groups;
  RAISE NOTICE '  staff_profile                           : %', n_staff_profiles;
  RAISE NOTICE '  kullanici_hesabi (users, personel+veli) : %', n_users;
  RAISE NOTICE '======================================';

  -- ---- güvenlik doğrulaması: hiç QATEST izi kalmamalı ----
  SELECT COUNT(*) INTO remaining_students FROM students WHERE full_name LIKE '%[QATEST]';
  SELECT COUNT(*) INTO remaining_users FROM users WHERE username LIKE 'qatest_%';
  SELECT COUNT(*) INTO remaining_groups FROM groups WHERE name LIKE 'QATEST %';

  IF remaining_students != 0 OR remaining_users != 0 OR remaining_groups != 0 THEN
    RAISE EXCEPTION 'Temizlik eksik kaldı (kalan: students=%, users=%, groups=%) — işlem geri alınıyor (ROLLBACK).',
      remaining_students, remaining_users, remaining_groups;
  END IF;

  RAISE NOTICE 'Doğrulama OK: sistemde hiç QATEST işaretli kayıt kalmadı.';
END $$;

COMMIT;
