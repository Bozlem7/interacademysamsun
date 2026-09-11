-- ============================================================================
-- QA Test Verisi Doğrulama Sorguları (Şube İzolasyonu + Global Personel Testi)
-- ============================================================================
-- seed_test_data.ts çalıştırıldıktan SONRA, aşağıdaki sorguları tek tek (psql'de
-- \i prisma/verify_test_data.sql veya kopyala-yapıştır ile) çalıştırın. Her sorgunun
-- yanında "BEKLENEN" satırı, doğru davranışta dönmesi gereken sonucu belirtir.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Şube başına öğrenci sayısı
-- BEKLENEN: Atakum=10, Vezirköprü=10
-- ----------------------------------------------------------------------------
SELECT b.name AS sube, COUNT(s.id) AS ogrenci_sayisi
FROM students s
JOIN branches b ON b.id = s.branch_id
WHERE s.full_name LIKE '%[QATEST]'
GROUP BY b.name
ORDER BY b.name;


-- ----------------------------------------------------------------------------
-- 2) "Atakum hocası Vezirköprü öğrencisini görüyor mu?" — antrenör/öğrenci şube uyuşmazlığı
-- Antrenörler (specialty='antrenor') branch-scoped'tur; instructor_students ataması
-- kesinlikle aynı şubede olmalı (adminInstructors.controller.ts / instructorStudents.controller.ts
-- bunu zaten ValidationError ile engelliyor — burada seed verisinin de bu kurala uyduğunu
-- veritabanı seviyesinde doğruluyoruz).
-- BEKLENEN: 0 satır (hiçbir çapraz-şube ataması olmamalı)
-- ----------------------------------------------------------------------------
SELECT
  u.username AS antrenor,
  sp.branch_id AS antrenor_sube_id,
  st.full_name AS ogrenci,
  st.branch_id AS ogrenci_sube_id
FROM instructor_students ins
JOIN users u ON u.id = ins.instructor_user_id
JOIN staff_profiles sp ON sp.user_id = u.id
JOIN students st ON st.id = ins.student_id
WHERE sp.specialty = 'antrenor'
  AND sp.branch_id <> st.branch_id;


-- ----------------------------------------------------------------------------
-- 3) "Diyetisyen/psikolog her iki şubeyi de listeliyor mu?" — seans notu üzerinden kanıt
-- isGlobalStaff app-katmanında (JWT) hesaplanan bir alan olduğu için doğrudan SQL'den
-- görünmez; ama global uzmanın GERÇEKTEN iki şubeden de öğrenciye not girmiş olması,
-- backend'in bu erişimi kabul ettiğinin (branch filtresini bypass ettiğinin) kanıtıdır.
-- BEKLENEN: qatest_diyetisyen1 ve qatest_psikolog1 için 2 farklı şube adı (Atakum + Vezirköprü)
-- ----------------------------------------------------------------------------
SELECT
  u.username AS uzman,
  sp.specialty,
  sp.branch_id AS ev_subesi,
  COUNT(DISTINCT b.name) AS erisilen_farkli_sube_sayisi,
  STRING_AGG(DISTINCT b.name, ', ') AS erisilen_subeler
FROM student_notes sn
JOIN users u ON u.id = sn.author_id
JOIN staff_profiles sp ON sp.user_id = u.id
JOIN students st ON st.id = sn.student_id
JOIN branches b ON b.id = st.branch_id
WHERE u.username LIKE 'qatest_%'
GROUP BY u.username, sp.specialty, sp.branch_id
ORDER BY u.username;
-- NOT: "erisilen_farkli_sube_sayisi" = 2 ise, bu uzman gerçekten iki şubeden de
-- öğrenciye erişip not girebilmiş demektir (global davranış doğrulanmış olur).


-- ----------------------------------------------------------------------------
-- 4) Diyetisyen/psikolog StaffProfile.branch_id her zaman DOLU mu? (migration YOK, nullable değil)
-- BEKLENEN: 0 satır — global uzmanların branch_id'si NULL değil, sadece "ev şubesi"dir
-- ----------------------------------------------------------------------------
SELECT sp.id, u.username, sp.specialty, sp.branch_id
FROM staff_profiles sp
JOIN users u ON u.id = sp.user_id
WHERE u.username LIKE 'qatest_%'
  AND sp.specialty IN ('diyetisyen', 'psikolog')
  AND sp.branch_id IS NULL;


-- ----------------------------------------------------------------------------
-- 5) Ödeme kayıtları öğrencinin kendi şubesinden sızıyor mu?
-- BEKLENEN: 0 satır (payments tablosunda branch_id yok, student join'i üzerinden kontrol)
-- ----------------------------------------------------------------------------
SELECT p.id, st.full_name, st.branch_id, p.status, p.paid_at
FROM payments p
JOIN students st ON st.id = p.student_id
WHERE st.full_name LIKE '%[QATEST]'
  AND st.branch_id NOT IN (SELECT id FROM branches WHERE code IN ('atakum', 'vezirkopru'));


-- ----------------------------------------------------------------------------
-- 6) Ödeme durumu dağılımı — "ödendi" ve "ödenmedi" karışık mı test edilmiş?
-- BEKLENEN: her iki durumdan da satır olmalı (0/0 veya tamamı tek statüyse test eksik demektir)
-- ----------------------------------------------------------------------------
SELECT b.name AS sube, p.status, COUNT(*) AS adet
FROM payments p
JOIN students st ON st.id = p.student_id
JOIN branches b ON b.id = st.branch_id
WHERE st.full_name LIKE '%[QATEST]'
GROUP BY b.name, p.status
ORDER BY b.name, p.status;


-- ----------------------------------------------------------------------------
-- 7) Veli iletişim kuralı: her öğrencide en az bir (telefon dolu + notify=true) çifti var mı?
-- BEKLENEN: 0 satır (kuralı ihlal eden öğrenci olmamalı)
-- ----------------------------------------------------------------------------
SELECT id, full_name, mother_phone, notify_mother, father_phone, notify_father, emergency_phone, notify_guardian
FROM students
WHERE full_name LIKE '%[QATEST]'
  AND NOT (
    (notify_mother AND mother_phone IS NOT NULL) OR
    (notify_father AND father_phone IS NOT NULL) OR
    (notify_guardian AND emergency_phone IS NOT NULL)
  );


-- ----------------------------------------------------------------------------
-- 8) Antrenman programı çakışma kontrolü: iki şube aynı gün+saatte mi çakışıyor?
-- BEKLENEN: 0 satır
-- ----------------------------------------------------------------------------
SELECT
  ts1.id AS seans1, b1.name AS sube1, ts1.day_of_week, ts1.start_time,
  ts2.id AS seans2, b2.name AS sube2
FROM training_sessions ts1
JOIN groups g1 ON g1.id = ts1.group_id
JOIN branches b1 ON b1.id = g1.branch_id
JOIN training_sessions ts2 ON ts2.id <> ts1.id
JOIN groups g2 ON g2.id = ts2.group_id
JOIN branches b2 ON b2.id = g2.branch_id
WHERE g1.name LIKE 'QATEST %'
  AND g2.name LIKE 'QATEST %'
  AND b1.id <> b2.id
  AND ts1.day_of_week = ts2.day_of_week
  AND ts1.start_time = ts2.start_time;


-- ----------------------------------------------------------------------------
-- 9) Genel özet — kaç kayıt seed edilmiş, tek bakışta
-- ----------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM users WHERE username LIKE 'qatest_%' AND role = 'egitmen') AS personel,
  (SELECT COUNT(*) FROM users WHERE username LIKE 'qatest_%' AND role = 'veli') AS veli_hesabi,
  (SELECT COUNT(*) FROM students WHERE full_name LIKE '%[QATEST]') AS ogrenci,
  (SELECT COUNT(*) FROM groups WHERE name LIKE 'QATEST %') AS grup,
  (SELECT COUNT(*) FROM training_sessions ts JOIN groups g ON g.id = ts.group_id WHERE g.name LIKE 'QATEST %') AS antrenman_seansi,
  (SELECT COUNT(*) FROM payments p JOIN students s ON s.id = p.student_id WHERE s.full_name LIKE '%[QATEST]') AS odeme_kaydi,
  (SELECT COUNT(*) FROM student_notes sn JOIN users u ON u.id = sn.author_id WHERE u.username LIKE 'qatest_%') AS uzman_notu,
  (SELECT COUNT(*) FROM attendance_records ar JOIN students s ON s.id = ar.student_id WHERE s.full_name LIKE '%[QATEST]') AS yoklama_kaydi;
